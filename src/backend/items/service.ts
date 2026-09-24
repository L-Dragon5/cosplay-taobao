import { existsSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { db } from "@/backend/db"
import {
  duplicatePattern,
  type Item,
  resolveImages,
} from "@/backend/items/model"
import { enqueueItemJobs } from "@/backend/queue"

function withImages(item: Item): Item {
  return { ...item, images: resolveImages(item.image_url) }
}

// Mutations run UPDATE then this SELECT. affectedRows can't signal "not found":
// MariaDB reports 0 when the new values equal the old ones.
async function findItem(id: number): Promise<Item | undefined> {
  const [item] = await db<Item[]>`SELECT * FROM items WHERE id = ${id}`
  return item && withImages(item)
}

function found(item: Item | undefined): { error?: string; item?: Item } {
  return item ? { item } : { error: "Item not found" }
}

export async function retrieveAll(): Promise<Item[]> {
  const items = await db<Item[]>`
    SELECT * FROM items
    ORDER BY created_at DESC
  `
  return items.map(withImages)
}

export async function create(body: {
  json: string
  override?: boolean
}): Promise<{
  error?: string
  duplicate?: boolean
  duplicateId?: number
  item?: Item
}> {
  let info: Record<string, unknown>

  try {
    const parsed: unknown = JSON.parse(body.json)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { error: "JSON must be an object" }
    }
    info = parsed as Record<string, unknown>
  } catch {
    return { error: "Invalid JSON" }
  }

  const listingUrl = typeof info.url === "string" ? info.url : ""
  if (!listingUrl) {
    return { error: "No listing URL found in JSON" }
  }

  const pattern = duplicatePattern(listingUrl)
  if (!body.override && pattern) {
    const dupes = await db<{ id: number }[]>`
      SELECT id FROM items WHERE listing_url REGEXP ${pattern} LIMIT 1
    `
    if (dupes.length > 0) {
      return {
        error: "Item already exists",
        duplicate: true,
        duplicateId: dupes[0]?.id,
      }
    }
  }

  const images: string[] = Array.isArray(info.images)
    ? (info.images as string[])
    : []
  const imageUrl = images.join("||")
  const originalTitle = typeof info.title === "string" ? info.title : ""
  const sellerName = typeof info.seller === "string" ? info.seller : null
  const originalPrice = info.price != null ? String(info.price) : null

  // RETURNING instead of a follow-up SELECT LAST_INSERT_ID(): the pool may run
  // that second query on another connection and get 0 or someone else's id.
  const [item] = await db<Item[]>`
    INSERT INTO items (image_url, original_title, seller_name, listing_url, original_price)
    VALUES (${imageUrl}, ${originalTitle}, ${sellerName}, ${listingUrl}, ${originalPrice})
    RETURNING *
  `
  if (!item) return { error: "Failed to create item" }

  enqueueItemJobs({
    id: item.id,
    image_url: item.image_url,
    original_title: item.original_title,
  })

  return { item: withImages(item) }
}

export async function update(
  id: number,
  body: { custom_title?: string | null; notes?: string | null },
): Promise<{ error?: string; item?: Item }> {
  // Only the keys present in the body change; an explicit null clears the field.
  const fields: Record<string, string | null> = {}
  if ("custom_title" in body) fields.custom_title = body.custom_title ?? null
  if ("notes" in body) fields.notes = body.notes ?? null
  if (Object.keys(fields).length > 0) {
    await db`UPDATE items SET ${db(fields)} WHERE id = ${id}`
  }
  return found(await findItem(id))
}

export async function deleteItem(id: number): Promise<{ error?: string }> {
  const [item] = await db<Item[]>`SELECT * FROM items WHERE id = ${id} LIMIT 1`
  if (!item) return { error: "Item not found" }

  if (item.image_url) {
    for (const image of item.image_url.split("||")) {
      // Only delete local files (not external http URLs)
      if (image && !image.startsWith("http")) {
        const filePath = join(process.cwd(), "public", image)
        if (existsSync(filePath)) {
          unlinkSync(filePath)
        }
      }
    }
  }

  await db`DELETE FROM items WHERE id = ${id}`
  return {}
}

export async function archive(
  id: number,
): Promise<{ error?: string; item?: Item }> {
  await db`
    UPDATE items
    SET is_archived = 1, archived_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
  `
  return found(await findItem(id))
}

export async function unarchive(
  id: number,
): Promise<{ error?: string; item?: Item }> {
  await db`
    UPDATE items
    SET is_archived = 0, archived_at = NULL
    WHERE id = ${id}
  `
  return found(await findItem(id))
}

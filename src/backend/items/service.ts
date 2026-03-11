import { existsSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { db } from "@/backend/db"
import { type Item, resolveImages } from "@/backend/items/model"

function withImages(item: Item): Item {
  return { ...item, images: resolveImages(item.image_url) }
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
}): Promise<{ error?: string; duplicate?: boolean; item?: Item }> {
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

  if (!body.override) {
    // Strip query params after the first & to detect near-duplicate URLs
    const baseUrl = listingUrl.split("&")[0]
    const dupes = await db<{ id: number }[]>`
      SELECT id FROM items WHERE listing_url LIKE ${`%${baseUrl}%`} LIMIT 1
    `
    if (dupes.length > 0) {
      return { error: "Item already exists", duplicate: true }
    }
  }

  const images: string[] = Array.isArray(info.images)
    ? (info.images as string[])
    : []
  const imageUrl = images.join("||")
  const originalTitle = typeof info.title === "string" ? info.title : ""
  const sellerName = typeof info.seller === "string" ? info.seller : null
  const originalPrice = info.price != null ? String(info.price) : null

  await db`
    INSERT INTO items (image_url, original_title, seller_name, listing_url, original_price)
    VALUES (${imageUrl}, ${originalTitle}, ${sellerName}, ${listingUrl}, ${originalPrice})
  `

  const [row] = await db<{ id: number }[]>`SELECT LAST_INSERT_ID() as id`
  const insertedId = row?.id
  if (!insertedId) return { error: "Failed to create item" }

  const [item] = await db<Item[]>`SELECT * FROM items WHERE id = ${insertedId}`
  if (!item) return { error: "Failed to retrieve created item" }

  return { item: withImages(item) }
}

export async function update(
  id: number,
  body: { custom_title?: string | null; notes?: string | null },
): Promise<{ error?: string; item?: Item }> {
  const [existing] = await db<
    Item[]
  >`SELECT * FROM items WHERE id = ${id} LIMIT 1`
  if (!existing) return { error: "Item not found" }

  const customTitle =
    "custom_title" in body ? body.custom_title : existing.custom_title
  const notes = "notes" in body ? body.notes : existing.notes

  await db`
    UPDATE items
    SET custom_title = ${customTitle ?? null},
        notes = ${notes ?? null}
    WHERE id = ${id}
  `

  const [item] = await db<Item[]>`SELECT * FROM items WHERE id = ${id}`
  if (!item) return { error: "Failed to retrieve updated item" }

  return { item: withImages(item) }
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
  const [existing] = await db<
    Item[]
  >`SELECT * FROM items WHERE id = ${id} LIMIT 1`
  if (!existing) return { error: "Item not found" }

  await db`
    UPDATE items
    SET is_archived = 1, archived_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
  `

  const [item] = await db<Item[]>`SELECT * FROM items WHERE id = ${id}`
  if (!item) return { error: "Failed to retrieve item" }

  return { item: withImages(item) }
}

export async function unarchive(
  id: number,
): Promise<{ error?: string; item?: Item }> {
  const [existing] = await db<
    Item[]
  >`SELECT * FROM items WHERE id = ${id} LIMIT 1`
  if (!existing) return { error: "Item not found" }

  await db`
    UPDATE items
    SET is_archived = 0, archived_at = NULL
    WHERE id = ${id}
  `

  const [item] = await db<Item[]>`SELECT * FROM items WHERE id = ${id}`
  if (!item) return { error: "Failed to retrieve item" }

  return { item: withImages(item) }
}

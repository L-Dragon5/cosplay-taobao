import { randomUUID } from "node:crypto"
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import sharp from "sharp"
import { db } from "@/backend/db"

const thumbsDir = join(process.cwd(), "public", "thumbs")
mkdirSync(thumbsDir, { recursive: true })

const items = await db<{ id: number; image_url: string }[]>`
  SELECT id, image_url FROM items WHERE image_url LIKE '%alicdn%'
`

if (items.length === 0) {
  console.log("No items found to process")
  process.exit(0)
}

console.log(`Items found to edit: ${items.length}`)

for (const item of items) {
  const savedUrls: string[] = []
  const urls = item.image_url.split("||")
  console.log(`Current item id: ${item.id}`)

  for (let url of urls) {
    if (url.includes("thumbs")) {
      savedUrls.push(url)
      continue
    }

    if (!url.startsWith("https:")) {
      url = `https:${url}`
    }

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10_000)
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(timeout)

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const buffer = Buffer.from(await res.arrayBuffer())
      const filename = `${randomUUID()}.jpg`
      const filePath = join(thumbsDir, filename)

      await sharp(buffer)
        .resize({ width: 400, withoutEnlargement: true })
        .jpeg({ quality: 100 })
        .toFile(filePath)

      savedUrls.push(`thumbs/${filename}`)
    } catch (err) {
      console.error(`  Failed to download ${url}:`, err)
      savedUrls.push(url)
    }
  }

  if (savedUrls.length > 0) {
    await db`UPDATE items SET image_url = ${savedUrls.join("||")} WHERE id = ${item.id}`
  }
}

console.log("Done!")
process.exit(0)

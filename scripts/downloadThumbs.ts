import { randomUUID } from "node:crypto"
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import mysql from "mysql2/promise"
import sharp from "sharp"

const { DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_DATABASE } = process.env

const conn = await mysql.createConnection({
  host: DB_HOST,
  port: Number(DB_PORT ?? 3306),
  user: DB_USER,
  password: DB_PASS,
  database: DB_DATABASE,
})

const thumbsDir = join(process.cwd(), "public", "thumbs")
mkdirSync(thumbsDir, { recursive: true })

const [rows] = await conn.query<mysql.RowDataPacket[]>(
  "SELECT id, image_url FROM items WHERE image_url LIKE '%alicdn%' ORDER BY created_at DESC",
)
const items = rows as { id: number; image_url: string }[]

if (items.length === 0) {
  console.log("No items found to process")
  await conn.end()
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
    await conn.execute("UPDATE items SET image_url = ? WHERE id = ?", [
      savedUrls.join("||"),
      item.id,
    ])
    console.log(`  Saved ${savedUrls.length} image(s) for id=${item.id}`)
  }
}

await conn.end()

console.log("Done!")
process.exit(0)

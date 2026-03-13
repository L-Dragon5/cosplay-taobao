import { mkdirSync } from "node:fs"
import { join } from "node:path"
import mysql from "mysql2/promise"
import { downloadThumbUrls } from "@/lib/thumbs"

const { DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_DATABASE } = process.env

const conn = await mysql.createConnection({
  host: DB_HOST,
  port: Number(DB_PORT ?? 3306),
  user: DB_USER,
  password: DB_PASS,
  database: DB_DATABASE,
})

mkdirSync(join(process.cwd(), "public", "thumbs"), { recursive: true })

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
  console.log(`Current item id: ${item.id}`)
  const newImageUrl = await downloadThumbUrls(item.image_url)
  await conn.execute("UPDATE items SET image_url = ? WHERE id = ?", [newImageUrl, item.id])
  console.log(`  Updated item ${item.id}`)
}

await conn.end()
console.log("Done!")
process.exit(0)

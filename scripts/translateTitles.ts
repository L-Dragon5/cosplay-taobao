import mysql from "mysql2/promise"
import { translateTitle } from "@/lib/translate"

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err)
  process.exit(1)
})

if (!process.env.GEMINI_KEY) {
  console.error("GEMINI_KEY is not set in environment")
  process.exit(1)
}

const { DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_DATABASE } = process.env

const conn = await mysql.createConnection({
  host: DB_HOST,
  port: Number(DB_PORT ?? 3306),
  user: DB_USER,
  password: DB_PASS,
  database: DB_DATABASE,
})

const [rows] = await conn.query<mysql.RowDataPacket[]>(
  "SELECT id, original_title FROM items WHERE translated_title IS NULL ORDER BY created_at DESC",
)
const items = rows as { id: number; original_title: string }[]

if (items.length === 0) {
  console.log("No untranslated items found.")
  await conn.end()
  process.exit(0)
}

console.log(`Found ${items.length} untranslated item(s).`)

let translated = 0

for (const item of items) {
  const result = await translateTitle(item.original_title)
  if (result !== null) {
    await conn.execute("UPDATE items SET translated_title = ? WHERE id = ?", [
      result,
      item.id,
    ])
    translated++
    console.log(`  [${item.id}] "${item.original_title}" → "${result}"`)
  } else {
    console.error(`  Failed for id=${item.id}`)
  }
}

await conn.end()
console.log(`\nDone. Translated: ${translated}`)
process.exit(0)

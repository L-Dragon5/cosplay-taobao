import mysql from "mysql2/promise"

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err)
  process.exit(1)
})

const { DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_DATABASE, GEMINI_KEY } =
  process.env

if (!GEMINI_KEY) {
  console.error("GEMINI_KEY is not set in environment")
  process.exit(1)
}

const conn = await mysql.createConnection({
  host: DB_HOST,
  port: Number(DB_PORT ?? 3306),
  user: DB_USER,
  password: DB_PASS,
  database: DB_DATABASE,
})

const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_KEY}`

const [rows] = await conn.query<mysql.RowDataPacket[]>(
  "SELECT id, original_title FROM items WHERE translated_title IS NULL ORDER BY created_at DESC LIMIT 1000",
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
  try {
    const res = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Translate this Chinese product title to English. Return only the translated text, nothing else:\n${item.original_title}`,
              },
            ],
          },
        ],
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error(
        `  Gemini error for id=${item.id}: HTTP ${res.status} — ${body}`,
      )
      continue
    }

    const json = (await res.json()) as {
      candidates: { content: { parts: { text: string }[] } }[]
    }
    const translatedText =
      json.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    if (!translatedText) {
      console.error(`  No translation returned for id=${item.id}`)
      continue
    }

    await conn.execute("UPDATE items SET translated_title = ? WHERE id = ?", [
      translatedText,
      item.id,
    ])
    translated++
    console.log(`  [${item.id}] "${item.original_title}" → "${translatedText}"`)
  } catch (err) {
    console.error(`  Failed for id=${item.id}:`, err)
  }
}

await conn.end()

console.log(`\nDone. Translated: ${translated}`)
process.exit(0)

import mysql from "mysql2/promise"

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err)
  process.exit(1)
})

const { DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_DATABASE, DEEPL_KEY } =
  process.env

if (!DEEPL_KEY) {
  console.error("DEEPL_KEY is not set in environment")
  process.exit(1)
}

const conn = await mysql.createConnection({
  host: DB_HOST,
  port: Number(DB_PORT ?? 3306),
  user: DB_USER,
  password: DB_PASS,
  database: DB_DATABASE,
})

const DEEPL_API_URL = "https://api-free.deepl.com/v2/translate"

// Default: translate at most 50,000 chars per run to stay well under 500k/month
const MAX_CHARS = Number(process.env.TRANSLATE_MAX_CHARS ?? 50_000)

const [rows] = await conn.query<mysql.RowDataPacket[]>(
  "SELECT id, original_title FROM items WHERE translated_title IS NULL ORDER BY created_at DESC",
)
const items = rows as { id: number; original_title: string }[]

if (items.length === 0) {
  console.log("No untranslated items found.")
  await conn.end()
  process.exit(0)
}

console.log(
  `Found ${items.length} untranslated item(s). Max chars this run: ${MAX_CHARS}`,
)

let charsUsed = 0
let translated = 0
let skipped = 0

for (const item of items) {
  const titleLen = item.original_title.length
  if (charsUsed + titleLen > MAX_CHARS) {
    skipped++
    continue
  }

  try {
    const res = await fetch(DEEPL_API_URL, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${DEEPL_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: [item.original_title],
        target_lang: "EN",
        source_lang: "ZH",
        ...(process.env.DEEPL_GLOSSARY_ID
          ? { glossary_id: process.env.DEEPL_GLOSSARY_ID }
          : {}),
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error(
        `  DeepL error for id=${item.id}: HTTP ${res.status} — ${body}`,
      )
      continue
    }

    const json = (await res.json()) as {
      translations: { text: string; detected_source_language: string }[]
    }
    const translatedText = json.translations[0]?.text
    if (!translatedText) {
      console.error(`  No translation returned for id=${item.id}`)
      continue
    }

    await conn.execute("UPDATE items SET translated_title = ? WHERE id = ?", [
      translatedText,
      item.id,
    ])
    charsUsed += titleLen
    translated++
    console.log(`  [${item.id}] "${item.original_title}" → "${translatedText}"`)
  } catch (err) {
    console.error(`  Failed for id=${item.id}:`, err)
  }
}

await conn.end()

console.log(
  `\nDone. Translated: ${translated}, skipped (char limit): ${skipped}, chars used: ${charsUsed}`,
)
process.exit(0)

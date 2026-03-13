const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent"

/**
 * Translates a Chinese product title to English via Gemini.
 * Returns the translated string, "Error" for untranslatable titles,
 * or null if the API call fails (so the item can be retried later).
 */
export async function translateTitle(title: string): Promise<string | null> {
  const geminiKey = process.env.GEMINI_KEY
  if (!geminiKey) {
    console.error("[translate] GEMINI_KEY not set")
    return null
  }

  if (title.trim() === "" || (title.match(/\?/g) ?? []).length > 3) {
    return "Error"
  }

  const url = `${GEMINI_API_BASE}?key=${geminiKey}`

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Translate this Chinese product title to English. Return only the translated text, nothing else:\n${title}`,
              },
            ],
          },
        ],
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error(`[translate] Gemini error: HTTP ${res.status} — ${body}`)
      return null
    }

    const json = (await res.json()) as {
      candidates: { content: { parts: { text: string }[] } }[]
    }
    const translated = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    return translated ?? null
  } catch (err) {
    console.error("[translate] Failed:", err)
    return null
  }
}

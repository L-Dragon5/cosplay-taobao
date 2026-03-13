import { randomUUID } from "node:crypto"
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import sharp from "sharp"

const thumbsDir = join(process.cwd(), "public", "thumbs")
mkdirSync(thumbsDir, { recursive: true })

/**
 * Given a ||-delimited image_url string, downloads any alicdn URLs,
 * resizes to 600px wide JPEG, saves to public/thumbs/, and returns
 * the updated ||-delimited string with local paths substituted.
 */
export async function downloadThumbUrls(imageUrl: string): Promise<string> {
  const urls = imageUrl.split("||")
  const savedUrls: string[] = []

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
        .resize({ width: 600, withoutEnlargement: true })
        .jpeg({ quality: 100 })
        .toFile(filePath)

      savedUrls.push(`thumbs/${filename}`)
    } catch (err) {
      console.error(`  Failed to download ${url}:`, err)
      savedUrls.push(url)
    }
  }

  return savedUrls.join("||")
}

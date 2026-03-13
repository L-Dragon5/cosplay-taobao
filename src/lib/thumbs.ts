import { randomUUID } from "node:crypto"
import { mkdirSync } from "node:fs"
import { join } from "node:path"

const thumbsDir = join(process.cwd(), "public", "thumbs")
mkdirSync(thumbsDir, { recursive: true })

/**
 * Given a ||-delimited image_url string, downloads any alicdn URLs,
 * saves to public/thumbs/, and returns the updated ||-delimited string
 * with local paths substituted.
 *
 * alicdn serves JPEG when the .webp suffix is stripped, so we rewrite
 * those URLs before fetching rather than converting after.
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

    // alicdn URLs contain multiple extensions (e.g. filename.jpg_q50.jpg_.webp)
    // truncate at the first .jpg to get a clean JPEG URL
    const jpgIndex = url.indexOf(".jpg")
    if (jpgIndex !== -1) {
      url = url.slice(0, jpgIndex + 4)
    }

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10_000)
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(timeout)

      if (res.status === 404) {
        console.warn(`  404 for ${url} — dropping from image_url`)
        continue
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const filename = `${randomUUID()}.jpg`
      const filePath = join(thumbsDir, filename)

      await Bun.write(filePath, await res.arrayBuffer())

      savedUrls.push(`thumbs/${filename}`)
    } catch (err) {
      console.error(`  Failed to download ${url}:`, err)
      savedUrls.push(url)
    }
  }

  return savedUrls.join("||")
}

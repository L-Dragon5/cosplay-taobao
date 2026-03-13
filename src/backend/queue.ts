import { db } from "@/backend/db"
import { downloadThumbUrls } from "@/lib/thumbs"
import { translateTitle } from "@/lib/translate"

type Job = () => Promise<void>

let tail = Promise.resolve()

function enqueue(job: Job): void {
  tail = tail.then(job).catch((err) => console.error("[queue]", err))
}

export function enqueueItemJobs(item: {
  id: number
  image_url: string | null
  original_title: string
}): void {
  if (item.image_url && item.image_url.includes("alicdn")) {
    const { id, image_url } = item
    enqueue(async () => {
      console.log(`[queue] Downloading thumbs for item ${id}`)
      const newImageUrl = await downloadThumbUrls(image_url)
      await db`UPDATE items SET image_url = ${newImageUrl} WHERE id = ${id}`
      console.log(`[queue] Thumbs done for item ${id}`)
    })
  }

  const { id, original_title } = item
  enqueue(async () => {
    console.log(`[queue] Translating item ${id}`)
    const translated = await translateTitle(original_title)
    if (translated !== null) {
      await db`UPDATE items SET translated_title = ${translated} WHERE id = ${id}`
      console.log(`[queue] Translation done for item ${id}: "${translated}"`)
    }
  })
}

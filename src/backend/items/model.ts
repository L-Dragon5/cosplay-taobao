export interface Item {
  id: number
  image_url: string | null
  original_title: string
  custom_title: string | null
  translated_title: string | null
  seller_name: string | null
  listing_url: string
  notes: string | null
  original_price: string | null
  is_archived: number
  archived_at: string | null
  created_at: string | null
  updated_at: string | null
  images: string[]
}

/** Split image_url by || and resolve local thumbs paths to root-relative URLs. */
export function resolveImages(imageUrl: string | null): string[] {
  if (!imageUrl) return []
  return imageUrl
    .split("||")
    .filter(Boolean)
    .map((img) => {
      if (img.includes("thumbs/")) return `/${img}`
      return img
    })
}

/**
 * MariaDB REGEXP matching the listing's exact Taobao id, or null if the URL
 * has none. A plain LIKE '%id=123%' would also match id=1234.
 */
export function duplicatePattern(listingUrl: string): string | null {
  const id = listingUrl.match(/[?&]id=(\d+)/)?.[1]
  return id ? `[?&]id=${id}([^0-9]|$)` : null
}

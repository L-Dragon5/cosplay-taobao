// Bookmarklet that replaces the CosManage Chrome extension
// (L-Dragon5/cosplay-manager, chrome-extension/taobao-cosmanage): same
// selectors, same JSON. Instead of copying to the clipboard it opens this app
// at /#add=<json>, and IndexPage runs the normal add flow (duplicate modal
// included). A new tab, not fetch(), so CORS and Taobao's CSP never apply.

// Runs on the Taobao page, serialized with toString(): no imports, no closures.
function scrape(origin: string) {
  const text = (sel: string) =>
    document.querySelector(`[class*="${sel}--"]`)?.textContent ?? undefined
  const title = text("mainTitle")
  if (!title) {
    alert("No Taobao listing found on this page")
    return
  }
  const images = new Set<string>()
  document
    .querySelectorAll<HTMLImageElement>('[class*="thumbnailItem--"] img')
    .forEach((img) => {
      images.add(img.src)
    })
  const item = {
    price: text("priceText"),
    images: [...images],
    seller: text("shopName"),
    title,
    url: location.href,
  }
  window.open(`${origin}/#add=${encodeURIComponent(JSON.stringify(item))}`)
}

/** href for the "drag me to your bookmarks bar" link, pointed at `origin`. */
export function bookmarkletHref(origin: string): string {
  const code = `(${scrape.toString()})(${JSON.stringify(origin)})`
  return `javascript:${encodeURIComponent(code)}`
}

/** The JSON a bookmarklet put in the URL hash, or null if there is none. */
export function addJsonFromHash(hash: string): string | null {
  if (!hash.startsWith("#add=")) return null
  try {
    return decodeURIComponent(hash.slice(5)) || null
  } catch {
    return null
  }
}

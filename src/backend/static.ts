import { resolve, sep } from "node:path"

const root = resolve("public")

/**
 * Map a request pathname to a file under public/, or null if it would escape.
 * Decoding runs after URL normalization, so "..%2F" survives into the path;
 * resolving and checking the prefix is what keeps it inside public/.
 */
export function publicPath(pathname: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  if (decoded.includes("\0")) return null
  const full = resolve(root, `.${decoded}`)
  return full.startsWith(root + sep) ? full : null
}

const thumbs = resolve(root, "thumbs") + sep

/**
 * Response headers for a file publicPath() resolved. Thumbs get UUID names and
 * are never rewritten, so the browser may keep them for a year without asking.
 * Checked on the resolved path so "/thumbs/..%2Findex.html" doesn't qualify.
 */
export function staticHeaders(path: string): HeadersInit | undefined {
  return path.startsWith(thumbs)
    ? { "Cache-Control": "public, max-age=31536000, immutable" }
    : undefined
}

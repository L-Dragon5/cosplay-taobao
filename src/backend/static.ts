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

import { expect, test } from "bun:test"
import { resolve } from "node:path"
import { publicPath, staticHeaders } from "@/backend/static"

const root = resolve("public")

// Pathnames as Bun hands them over: new URL() has already collapsed literal
// "../", so only the encoded forms reach publicPath.
const pathnameOf = (raw: string) => new URL(raw, "http://x").pathname

test("serves files inside public/, decoding %20", () => {
  expect(publicPath("/index.html")).toBe(`${root}/index.html`)
  expect(publicPath(pathnameOf("/thumbs/a%20b.jpg"))).toBe(
    `${root}/thumbs/a b.jpg`,
  )
})

test("encoded ../ cannot leave public/", () => {
  for (const raw of [
    "/..%2F.env",
    "/..%2F..%2F..%2Fproc%2Fself%2Fenviron",
    "/thumbs/..%2F..%2Fpackage.json",
    "/%2e%2e%2fsrc%2fbackend%2fdb.ts",
    "/..%5C.env",
  ]) {
    const path = publicPath(pathnameOf(raw))
    expect(path === null || path.startsWith(`${root}/`)).toBe(true)
  }
  expect(publicPath(pathnameOf("/..%2F.env"))).toBeNull()
})

test("a sibling directory sharing the prefix is not inside public/", () => {
  expect(publicPath("/..%2Fpublic-evil%2Fx")).toBeNull()
})

test("malformed escapes and NUL bytes return null instead of throwing", () => {
  expect(publicPath("/%E0%A4%A")).toBeNull()
  expect(publicPath("/index.html%00.png")).toBeNull()
})

test("the root itself is not a file", () => {
  expect(publicPath("/")).toBeNull()
})

test("thumbs are cached as immutable, other files and escapes are not", () => {
  const cc = (raw: string) => {
    const path = publicPath(pathnameOf(raw))
    return path && new Headers(staticHeaders(path)).get("cache-control")
  }
  expect(cc("/thumbs/0b1c.jpg")).toContain("immutable")
  expect(cc("/index.html")).toBeNull()
  expect(cc("/thumbs/..%2Findex.html")).toBeNull()
  expect(cc("/thumbs-evil/x.jpg")).toBeNull()
})

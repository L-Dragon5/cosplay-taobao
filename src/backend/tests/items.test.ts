import { expect, test } from "bun:test"
import { duplicatePattern } from "@/backend/items/model"

// MariaDB REGEXP (PCRE) and JS RegExp agree on this pattern's syntax, so the
// JS check stands in for the DB. items.db.test.ts runs it through MariaDB.
function isDuplicate(newUrl: string, storedUrl: string): boolean {
  const pattern = duplicatePattern(newUrl)
  return pattern !== null && new RegExp(pattern).test(storedUrl)
}

const url = (id: string, extra = "") =>
  `https://item.taobao.com/item.htm?id=${id}${extra}`

test("same id matches regardless of other params or order", () => {
  expect(isDuplicate(url("123"), url("123"))).toBe(true)
  expect(isDuplicate(url("123", "&spm=a1"), url("123"))).toBe(true)
  expect(
    isDuplicate(
      url("123"),
      "https://item.taobao.com/item.htm?spm=a1&id=123&ns=1",
    ),
  ).toBe(true)
  expect(isDuplicate(url("123"), `${url("123")}#detail`)).toBe(true)
})

test("an id that is a prefix of another id is not a duplicate", () => {
  expect(isDuplicate(url("123"), url("1234"))).toBe(false)
  expect(isDuplicate(url("123"), url("123", "4"))).toBe(false)
})

test("id= inside another param name is not the listing id", () => {
  expect(isDuplicate(url("123"), "https://x.com/?skuid=123")).toBe(false)
  expect(isDuplicate(url("123"), "https://x.com/?pid=123")).toBe(false)
  expect(isDuplicate("https://x.com/?skuid=123", url("123"))).toBe(false)
})

test("URLs without a numeric id skip the duplicate check", () => {
  expect(duplicatePattern("https://item.taobao.com/item.htm")).toBeNull()
  expect(duplicatePattern("https://x.com/?id=abc")).toBeNull()
})

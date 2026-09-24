import { expect, test } from "bun:test"
import { addJsonFromHash, bookmarkletHref } from "@/frontend/bookmarklet"

const origin = "https://closet.example.com"
const listing = "https://item.taobao.com/item.htm?id=123&spm=a1"

// Runs the href the way a browser would: strip javascript:, decode, eval with
// a fake Taobao page. Returns the URL it opened and anything it alerted.
function click(page: Record<string, string | string[]>) {
  const code = decodeURIComponent(
    bookmarkletHref(origin).replace(/^javascript:/, ""),
  )
  const opened: string[] = []
  const alerts: string[] = []
  const match = (sel: string) => sel.match(/\[class\*="(\w+)--"\]/)?.[1] ?? ""
  const document = {
    querySelector: (sel: string) => {
      const v = page[match(sel)]
      return typeof v === "string" ? { textContent: v } : null
    },
    querySelectorAll: (sel: string) =>
      ((page[match(sel)] as string[] | undefined) ?? []).map((src) => ({
        src,
      })),
  }
  new Function("document", "location", "window", "alert", code)(
    document,
    { href: listing },
    { open: (u: string) => opened.push(u) },
    (m: string) => alerts.push(m),
  )
  return { opened, alerts }
}

test("scrapes a listing into the JSON the add endpoint takes", () => {
  const { opened, alerts } = click({
    mainTitle: "cos服 测试 & 100%",
    priceText: "199",
    shopName: "某店",
    thumbnailItem: ["https://a/1.jpg", "https://a/2.jpg", "https://a/1.jpg"],
  })
  expect(alerts).toEqual([])
  expect(opened).toHaveLength(1)
  const url = opened[0] as string
  expect(url.startsWith(`${origin}/#add=`)).toBe(true)
  const json = addJsonFromHash(new URL(url).hash)
  expect(JSON.parse(json as string)).toEqual({
    price: "199",
    images: ["https://a/1.jpg", "https://a/2.jpg"],
    seller: "某店",
    title: "cos服 测试 & 100%",
    url: listing,
  })
})

test("alerts and opens nothing off a listing page", () => {
  const { opened, alerts } = click({})
  expect(opened).toEqual([])
  expect(alerts).toHaveLength(1)
})

test("addJsonFromHash ignores other hashes and bad encoding", () => {
  expect(addJsonFromHash("")).toBeNull()
  expect(addJsonFromHash("#detail")).toBeNull()
  expect(addJsonFromHash("#add=")).toBeNull()
  expect(addJsonFromHash("#add=%E0%A4%A")).toBeNull()
  expect(addJsonFromHash("#add=%7B%7D")).toBe("{}")
})

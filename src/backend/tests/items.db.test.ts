// Integration tests for items/service.ts against a real MariaDB. Skipped unless
// TEST_DB_DATABASE is set; the database is created and dropped by this file.
//   TEST_DB_DATABASE=cosplay_taobao_test DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_PASS= bun test items.db
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { SQL } from "bun"

const testDb = process.env.TEST_DB_DATABASE

describe.skipIf(!testDb)("items service (MariaDB)", () => {
  let server: SQL
  let service: typeof import("@/backend/items/service")

  const listing = (id: number, title = "标题") =>
    JSON.stringify({
      url: `https://item.taobao.com/item.htm?id=${id}`,
      title,
      images: [],
    })

  beforeAll(async () => {
    const { DB_HOST, DB_PORT, DB_USER, DB_PASS } = process.env
    server = new SQL(`mysql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}`)
    await server.unsafe(`DROP DATABASE IF EXISTS \`${testDb}\``)
    await server.unsafe(`CREATE DATABASE \`${testDb}\``)
    process.env.DB_DATABASE = testDb
    delete process.env.GEMINI_KEY // the translate job then no-ops instead of calling Gemini
    await (await import("@/backend/db")).initDb()
    service = await import("@/backend/items/service")
  })

  afterAll(async () => {
    await server.unsafe(`DROP DATABASE IF EXISTS \`${testDb}\``)
  })

  test("concurrent creates each get back their own row", async () => {
    const ids = Array.from({ length: 20 }, (_, i) => 900_000 + i)
    const results = await Promise.all(
      ids.map((id) => service.create({ json: listing(id, `title ${id}`) })),
    )
    for (const [i, r] of results.entries()) {
      expect(r.error).toBeUndefined()
      expect(r.item?.listing_url).toBe(
        `https://item.taobao.com/item.htm?id=${ids[i]}`,
      )
      expect(r.item?.original_title).toBe(`title ${ids[i]}`)
    }
    expect(new Set(results.map((r) => r.item?.id)).size).toBe(ids.length)
  })

  test("duplicate check matches the exact id only", async () => {
    await service.create({ json: listing(555) })
    const prefix = await service.create({ json: listing(55) })
    expect(prefix.duplicate).toBeUndefined()
    const longer = await service.create({ json: listing(5555) })
    expect(longer.duplicate).toBeUndefined()
    const same = await service.create({ json: listing(555) })
    expect(same.duplicate).toBe(true)
    const forced = await service.create({ json: listing(555), override: true })
    expect(forced.item).toBeDefined()
  })

  test("update changes only the keys sent, null clears, same values still succeed", async () => {
    const { item } = await service.create({ json: listing(700) })
    const id = item?.id ?? 0
    let r = await service.update(id, { custom_title: "Mine", notes: "n" })
    expect(r.item).toMatchObject({ custom_title: "Mine", notes: "n" })
    r = await service.update(id, { notes: null })
    expect(r.item).toMatchObject({ custom_title: "Mine", notes: null })
    r = await service.update(id, { custom_title: "Mine" })
    expect(r.item?.custom_title).toBe("Mine")
    r = await service.update(id, {})
    expect(r.item?.custom_title).toBe("Mine")
  })

  test("archive and unarchive round-trip, repeat calls are not 404", async () => {
    const { item } = await service.create({ json: listing(800) })
    const id = item?.id ?? 0
    const a = await service.archive(id)
    expect(a.item?.is_archived).toBe(1)
    expect(a.item?.archived_at).not.toBeNull()
    const u = await service.unarchive(id)
    expect(u.item).toMatchObject({ is_archived: 0, archived_at: null })
    expect((await service.unarchive(id)).error).toBeUndefined()
  })

  test("missing ids report not found", async () => {
    expect((await service.update(99_999_999, { notes: "x" })).error).toBe(
      "Item not found",
    )
    expect((await service.archive(99_999_999)).error).toBe("Item not found")
    expect((await service.unarchive(99_999_999)).error).toBe("Item not found")
  })
})

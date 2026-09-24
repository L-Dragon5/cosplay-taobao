import { describe, expect, test } from "bun:test"
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { backupController } from "@/backend/backup"
import {
  connArgs,
  dbName,
  defaultPath,
  dumpArgs,
  looksComplete,
  parseCounts,
  tail,
  toPrune,
} from "@/backend/backup/service"

const env = {
  DB_HOST: "db",
  DB_PORT: "3307",
  DB_USER: "joe",
  DB_PASS: "s3cret",
  DB_DATABASE: "cosplay_taobao",
}

test("every DB_* variable reaches mysqldump", () => {
  const args = dumpArgs(env)
  expect(args).toContain("--host=db")
  expect(args).toContain("--port=3307")
  expect(args).toContain("--user=joe")
  expect(args).toContain("--password=s3cret")
  expect(args).toContain("--single-transaction")
  expect(args.at(-1)).toBe("cosplay_taobao")
})

test("the dump carries no CREATE DATABASE, so it restores under any name", () => {
  expect(dumpArgs(env)).not.toContain("--databases")
})

test("no password means no --password flag at all", () => {
  // `--password=` would mean the empty password and break a passwordless root.
  expect(connArgs({ ...env, DB_PASS: "" }).join(" ")).not.toContain(
    "--password",
  )
})

test("missing host, port and user fall back to local defaults", () => {
  expect(connArgs({ DB_DATABASE: "x" })).toEqual([
    "--host=127.0.0.1",
    "--port=3306",
    "--user=root",
  ])
})

test("underscored and hyphenated names are fine, a name that is not an identifier is refused", () => {
  expect(dbName(env)).toBe("cosplay_taobao")
  expect(dbName({ DB_DATABASE: "cosplay-taobao" })).toBe("cosplay-taobao")
  expect(() => dbName({ DB_DATABASE: "cc;DROP" })).toThrow(/bad database name/)
  expect(() => dbName({})).toThrow(/bad database name/)
})

test("the default filename sorts chronologically and has no colons", () => {
  const p = defaultPath(new Date("2026-03-15T14:30:05.123Z"))
  expect(p).toBe(join("backups", "cosplay-taobao-2026-03-15T14-30-05.tar.gz"))
})

test("a file that is not a finished dump is rejected", () => {
  expect(looksComplete("[object ReadableStream]")).toBe(false)
  expect(looksComplete("CREATE TABLE `items` (...);\n")).toBe(false)
  expect(looksComplete("-- Dump completed on 2026-03-15 14:30:05\n")).toBe(true)
})

test("tail reads the end of a file, and all of a short one", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ct-tail-"))
  try {
    const p = join(dir, "f")
    writeFileSync(p, `${"x".repeat(1000)}-- Dump completed\n`)
    expect(await tail(p)).toEndWith("-- Dump completed\n")
    expect((await tail(p)).length).toBe(200)
    writeFileSync(p, "short")
    expect(await tail(p)).toBe("short")
    expect(readdirSync(dir)).toEqual(["f"])
  } finally {
    rmSync(dir, { recursive: true })
  }
})

describe("toPrune", () => {
  const now = new Date("2026-09-21T12:00:00Z")
  const dump = (daysAgo: number) =>
    defaultPath(new Date(now.getTime() - daysAgo * 86_400_000))
      .split("/")
      .at(-1)!

  test("deletes a backup past 30 days once seven newer ones exist", () => {
    const names = [1, 2, 3, 4, 5, 6, 7, 31, 45].map(dump)
    expect(toPrune(names, now).sort()).toEqual([dump(31), dump(45)].sort())
  })

  test("keeps everything younger than 30 days, however many", () => {
    // A failed deploy retried every five minutes, each retry backing up first.
    const burst = Array.from({ length: 288 }, (_, i) => dump(i / 288))
    expect(toPrune([...burst, dump(10), dump(29)], now)).toEqual([])
  })

  test("keeps the newest seven even when every one is old", () => {
    const names = [100, 101, 102, 103, 104, 105, 106, 107, 108].map(dump)
    expect(toPrune(names, now).sort()).toEqual([dump(107), dump(108)].sort())
  })

  test("never touches a file defaultPath could not have written", () => {
    const names = [
      "before-cutover.tar.gz",
      "cosplay-taobao-2020-01-01.tar.gz",
      "other-2020-01-01T00-00-00.tar.gz",
      "cosplay-taobao-2020-01-01T00-00-00.sql",
      "cosplay-taobao-2020-13-45T00-00-00.tar.gz", // not a real date
      ...[1, 2, 3, 4, 5, 6, 7].map(dump),
    ]
    expect(toPrune(names, now)).toEqual([])
  })

  test("reads the age off the name in UTC; exactly on the cutoff is kept", () => {
    const recent = [1, 2, 3, 4, 5, 6, 7].map(dump)
    const edge = "cosplay-taobao-2026-08-22T12-00-00.tar.gz"
    const past = "cosplay-taobao-2026-08-22T11-59-59.tar.gz"
    expect(toPrune([...recent, edge, past], now)).toEqual([past])
  })
})

test("parseCounts reads the mysql client's tab-separated rows", () => {
  expect(parseCounts("items\t891\n")).toEqual({
    items: 891,
  })
  expect(parseCounts("")).toEqual({})
})

test("POST /backup/restore refuses a file that is not a backup, touching nothing", async () => {
  // tar rejects it before any safety backup or mysql call, so no DB is needed.
  const form = new FormData()
  form.append("file", new File(["not a tarball"], "x.tar.gz"))
  const res = await backupController.handle(
    new Request("http://localhost/backup/restore", {
      method: "POST",
      body: form,
    }),
  )
  expect(res.status).toBe(400)
  expect((await res.json()).error).toMatch(/not a backup/)
})

import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { Elysia, t } from "elysia"
import { backupAndPrune, NotABackup, restore } from "./service"

// ponytail: one process, one flag. Two restores at once would interleave their
// DROP TABLEs; a backup during a restore would dump half of one.
let busy = false

export const backupController = new Elysia({ prefix: "/backup" })
  // A plain link in the UI: the browser downloads the fresh archive, and a
  // copy stays in backups/ on the server like any other backup.
  .get("/", async ({ set }) => {
    if (busy) {
      set.status = 409
      return { error: "A backup or restore is already running" }
    }
    busy = true
    try {
      const { path } = await backupAndPrune()
      return new Response(Bun.file(path), {
        headers: {
          "Content-Type": "application/gzip",
          "Content-Disposition": `attachment; filename="${basename(path)}"`,
        },
      })
    } catch (e) {
      set.status = 500
      return { error: (e as Error).message }
    } finally {
      busy = false
    }
  })
  .post(
    "/restore",
    async ({ body, set }) => {
      if (busy) {
        set.status = 409
        return { error: "A backup or restore is already running" }
      }
      busy = true
      const work = mkdtempSync(join(tmpdir(), "ct-upload-"))
      try {
        const archive = join(work, "backup.tar.gz")
        await Bun.write(archive, body.file)
        return await restore(archive)
      } catch (e) {
        set.status = e instanceof NotABackup ? 400 : 500
        return { error: (e as Error).message }
      } finally {
        rmSync(work, { recursive: true, force: true })
        busy = false
      }
    },
    { body: t.Object({ file: t.File() }) },
  )

#!/usr/bin/env bun
/**
 *   bun run restore backups/cosplay-taobao-<stamp>.tar.gz
 *
 * Replaces the database and thumbs with the archive's, after backing up what
 * is here. The logic is src/backend/backup/service.ts, shared with the web UI.
 */
import { existsSync } from "node:fs"
import { restore } from "@/backend/backup/service"

const archive = process.argv[2]
if (!archive || !existsSync(archive)) {
  console.error("usage: bun run restore <backup.tar.gz>")
  process.exit(1)
}
try {
  const { safety, thumbs, counts } = await restore(archive)
  console.log(`saved what was here first -> ${safety}`)
  console.log(`restored ${thumbs} thumb(s)\n\nrows now:`)
  for (const [table, n] of Object.entries(counts)) console.log(`${table}\t${n}`)
} catch (e) {
  console.error(`restore failed: ${(e as Error).message}`)
  process.exit(1)
}

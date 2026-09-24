#!/usr/bin/env bun
/**
 *   bun run backup            -> backups/cosplay-taobao-<stamp>.tar.gz, then prune
 *   bun run backup out.tar.gz -> that path instead, and nothing is pruned
 *
 * The logic is src/backend/backup/service.ts, shared with the web UI.
 */
import { backup, backupAndPrune } from "@/backend/backup/service"

const named = process.argv[2]
try {
  const out = named ?? (await backupAndPrune()).path
  if (named) await backup(named)
  const mb = (Bun.file(out).size / 1_000_000).toFixed(2)
  console.log(`backed up -> ${out} (${mb} MB)`)
  console.log(`restore with:\n  bun run restore ${out}`)
} catch (e) {
  console.error((e as Error).message)
  console.error("\nbackup failed, nothing written")
  process.exit(1)
}

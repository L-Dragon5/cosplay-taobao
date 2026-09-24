/**
 * Everything the app owns, in one file: a mysqldump of the database plus the
 * cached thumbnails, as a .tar.gz. Used by the /api/backup routes (the header
 * menu in the web UI) and by `bun run backup` / `bun run restore`.
 *
 * Archive layout: `db.sql` (no CREATE DATABASE, so it restores into whatever
 * DB_DATABASE the target uses) and `thumbs/` (the contents of THUMBS_DIR).
 *
 * Reads the same DB_* env as src/backend/db.ts. THUMBS_DIR defaults to
 * public/thumbs, which is where src/lib/thumbs.ts writes; point it elsewhere when the
 * app runs from another directory than this one.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"

// DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_DATABASE, THUMBS_DIR; process.env fits.
export type DbEnv = Record<string, string | undefined>

const PREFIX = "cosplay-taobao"

export function dbName(env: DbEnv): string {
  const db = env.DB_DATABASE ?? ""
  // Passed as an argv entry, never through a shell, but a name that is not an
  // identifier is a typo in .env, and refusing it beats dumping the wrong thing.
  if (!/^[\w-]+$/.test(db)) throw new Error(`bad database name: ${db}`)
  return db
}

/** Connection flags shared by mysqldump and mysql. */
export function connArgs(env: DbEnv): string[] {
  return [
    `--host=${env.DB_HOST || "127.0.0.1"}`,
    `--port=${env.DB_PORT || "3306"}`,
    `--user=${env.DB_USER || "root"}`,
    // Only when there is one: an empty --password= means "the empty password",
    // not "no password", and would break a passwordless local root.
    ...(env.DB_PASS ? [`--password=${env.DB_PASS}`] : []),
  ]
}

export function dumpArgs(env: DbEnv): string[] {
  // --single-transaction: a consistent snapshot without locking the app out.
  // The bare name, not --databases: no CREATE DATABASE / USE in the dump, so
  // it restores into the target's DB_DATABASE even if the name changed.
  return [...connArgs(env), "--single-transaction", dbName(env)]
}

/**
 * mysqldump signs off with "Dump completed"; without it the file is not a
 * backup, whatever its size or exit code.
 */
export const looksComplete = (tail: string): boolean =>
  /Dump completed/i.test(tail)

export const defaultPath = (now = new Date()): string =>
  join(
    "backups",
    `${PREFIX}-${now.toISOString().slice(0, 19).replace(/:/g, "-")}.tar.gz`,
  )

/**
 * Which of `names` to delete: kept while younger than `maxAgeDays`, and the
 * newest `keepAtLeast` are kept whatever their age. Age, not count, so a burst
 * of pre-deploy dumps (Komodo retrying a failed deploy) never pushes out
 * history. Only names defaultPath writes are candidates, and the age comes from
 * the name, because a copy resets mtime.
 */
export function toPrune(
  names: string[],
  now: Date,
  maxAgeDays = 30,
  keepAtLeast = 7,
): string[] {
  const shape = new RegExp(
    `^${PREFIX}-(\\d{4}-\\d{2}-\\d{2})T(\\d{2})-(\\d{2})-(\\d{2})\\.tar\\.gz$`,
  )
  const dated = names.flatMap((name) => {
    const m = shape.exec(name)
    const at = m && Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`)
    return at ? [{ name, at }] : []
  })
  // Names sort chronologically, so newest-first is a string sort.
  dated.sort((a, b) => (a.name < b.name ? 1 : -1))
  const cutoff = now.getTime() - maxAgeDays * 86_400_000
  return dated
    .slice(keepAtLeast)
    .filter((d) => d.at < cutoff)
    .map((d) => d.name)
}

/** Last `n` bytes of a file as text. */
export async function tail(path: string, n = 200): Promise<string> {
  const size = Bun.file(path).size
  // Explicit offsets: BunFile.slice(-n) has returned nothing in some Bun versions.
  return Bun.file(path)
    .slice(Math.max(0, size - n), size)
    .text()
}

export async function backup(out: string, env: DbEnv = process.env) {
  const thumbs = resolve(env.THUMBS_DIR ?? "public/thumbs")
  const work = mkdtempSync(join(tmpdir(), "ct-backup-"))
  try {
    const sql = join(work, "db.sql")
    let proc: ReturnType<typeof Bun.spawn>
    try {
      // Straight into the file: writing the raw stream stringifies it.
      proc = Bun.spawn(["mysqldump", ...dumpArgs(env)], {
        stdout: Bun.file(sql),
        stderr: "pipe",
      })
    } catch {
      throw new Error(
        "mysqldump not found. Install the MariaDB client tools (apt install mariadb-client, brew install mariadb)",
      )
    }
    const code = await proc.exited
    const err = await new Response(proc.stderr as ReadableStream).text()
    if (code !== 0 || !looksComplete(await tail(sql)))
      throw new Error(err.trim() || `mysqldump exited ${code}`)

    // `thumbs` in the archive whatever THUMBS_DIR is called: a symlink that
    // tar -h follows (same flag on GNU and BSD tar). No thumbs yet is an
    // empty folder, not an error: a fresh install has none.
    if (existsSync(thumbs)) symlinkSync(thumbs, join(work, "thumbs"))
    else mkdirSync(join(work, "thumbs"))

    mkdirSync(dirname(resolve(out)), { recursive: true })
    const tar = Bun.spawn(
      ["tar", "-czhf", resolve(out), "-C", work, "db.sql", "thumbs"],
      // macOS tar otherwise adds ._ AppleDouble files for extended attributes.
      { env: { ...process.env, COPYFILE_DISABLE: "1" }, stderr: "pipe" },
    )
    if ((await tar.exited) !== 0)
      throw new Error(await new Response(tar.stderr).text())
  } catch (e) {
    rmSync(out, { force: true })
    throw e
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

/** A backup at the default path, then the folder pruned. Returns the path. */
export async function backupAndPrune(env: DbEnv = process.env) {
  const out = defaultPath()
  await backup(out, env)
  const dir = dirname(out)
  const gone = toPrune(readdirSync(dir), new Date())
  for (const name of gone) unlinkSync(join(dir, name))
  return { path: out, pruned: gone }
}

export const TABLES = ["items"]

async function run(cmd: string[], stdin?: string): Promise<string> {
  const proc = Bun.spawn(cmd, {
    stdin: stdin ? Bun.file(stdin) : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const [code, out, err] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  if (code !== 0) throw new Error(err.trim() || `${cmd[0]} exited ${code}`)
  return out
}

/** The file is not a backup; nothing was touched. */
export class NotABackup extends Error {}

export type RestoreResult = {
  /** Backup of what was here before, the undo for this restore. */
  safety: string
  thumbs: number
  counts: Record<string, number>
}

export function parseCounts(out: string): Record<string, number> {
  return Object.fromEntries(
    out
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [table, n] = line.split("\t")
        return [table, Number(n)]
      }),
  )
}

/**
 * Replaces the database and the thumbs with the archive's. Checks the archive
 * first (NotABackup, nothing touched), then backs up what is here and stops if
 * that fails, then loads the database, then swaps the thumbs.
 */
export async function restore(
  archive: string,
  env: DbEnv = process.env,
): Promise<RestoreResult> {
  const thumbs = resolve(env.THUMBS_DIR ?? "public/thumbs")
  const work = mkdtempSync(join(tmpdir(), "ct-restore-"))
  try {
    const sql = join(work, "db.sql")
    try {
      await run(["tar", "-xzf", resolve(archive), "-C", work])
    } catch {
      throw new NotABackup("not a backup archive (.tar.gz)")
    }
    if (!existsSync(sql) || !looksComplete(await tail(sql)))
      throw new NotABackup("the archive has no complete db.sql")
    // After the archive check, so a bad file is a 400 even with DB_* unset.
    const db = dbName(env)

    const { path: safety } = await backupAndPrune(env)
    try {
      // Database first: if it fails, the thumbs still match what is loaded.
      await run(["mysql", ...connArgs(env), db], sql)

      // THUMBS_DIR is a volume mount in the container: empty it, never remove it.
      mkdirSync(thumbs, { recursive: true })
      for (const entry of readdirSync(thumbs))
        rmSync(join(thumbs, entry), { recursive: true, force: true })
      if (existsSync(join(work, "thumbs")))
        await run(["cp", "-R", `${join(work, "thumbs")}/.`, `${thumbs}/`])
    } catch (e) {
      throw new Error(
        `${(e as Error).message}\nwhat was here before is saved as ${safety}`,
      )
    }
    const files = readdirSync(thumbs, { recursive: true, withFileTypes: true })

    // Through the client, not Bun.sql: no driver state in the loop.
    const counts = await run([
      "mysql",
      ...connArgs(env),
      "-N",
      "-B",
      "-e",
      TABLES.map((t) => `select '${t}', count(*) from ${t}`).join(
        " union all ",
      ),
      db,
    ])
    return {
      safety,
      thumbs: files.filter((f) => f.isFile()).length,
      counts: parseCounts(counts),
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

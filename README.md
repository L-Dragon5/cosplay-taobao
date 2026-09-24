# Cosplay Taobao

A personal web app for saving and browsing Taobao cosplay listings. Paste JSON data copied from a Taobao product page, and the app extracts the title, images, price, and seller info, then displays everything in a searchable card grid.

## Adding items from Taobao

Drag the **Add to Closet** button in the app header to your bookmarks bar
(once per browser, from the deployed site so it points there). On a Taobao
listing, click the bookmark: it opens the app in a new tab and adds the item,
with the usual duplicate prompt. It replaces the CosManage Chrome extension and
reads the same fields (`mainTitle--`, `priceText--`, `shopName--`,
`thumbnailItem--` classes), so a Taobao redesign breaks both the same way; fix
the selectors in `src/frontend/bookmarklet.ts` and drag the button again.
Pasting the extension's JSON into the input still works.

## Requirements

- [Bun](https://bun.sh) v1.3+
- MariaDB 11.8 (or MySQL 8+) for host dev; Docker for the stack

## Setup

1. Install dependencies:

```bash
bun install
```

2. Create a `.env` file in the project root:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASS=
DB_DATABASE=
```

3. Create the database in MySQL:

```sql
CREATE DATABASE <name>;
```

The `items` table is created automatically on first run.

## Development

```bash
bun run dev
```

Starts the server at `http://localhost:3000` with hot module replacement.

## Running with Docker

`compose.yaml` runs the app and MariaDB 11.8 together. Cached thumbnails live in
the `thumbs` volume, the database in `dbdata`, and backups in `./backups` on the
host.

```bash
cp .env.example .env && $EDITOR .env   # MYSQL_ROOT_PASSWORD (alphanumeric), GEMINI_KEY
docker compose up -d --build           # http://<host>:3002
```

`scripts/docker-smoke.sh` proves the image end to end in its own throwaway
project: build, healthcheck, add an item and a thumbnail, back up (CLI and web),
wipe every volume, restore (CLI and web), and get the same rows and bytes back.
Run it after touching the Dockerfile, `compose.yaml` or the backup code.

## Backup and restore

**From the web UI**: the database icon at the right of the header.
**Download backup** builds a fresh archive, keeps a copy in `backups/` on the
server, and downloads it. **Restore from backup…** uploads one and replaces
everything with it, then shows the row count. The app has no login, so anyone
who can open it can restore; keep NPM's Access List on it.

**From a shell** (same code, `src/backend/backup/service.ts`):

```bash
bun run backup                    # -> backups/cosplay-taobao-<stamp>.tar.gz
bun run backup /path/out.tar.gz   # somewhere else, nothing pruned
bun run restore backups/<file>.tar.gz
```

In the stack, prefix with `docker compose exec -T app`. The archive holds
`db.sql` (a mysqldump, no `CREATE DATABASE`, so it restores under any database
name) and `thumbs/` (every cached thumbnail).

- **Backup refuses a dump mysqldump did not sign off** ("Dump completed"), so a
  file on disk is always a usable one.
- **A default-path backup prunes `backups/`**: older than 30 days goes, unless it
  is one of the newest seven. Age is read from the file name. Files you named
  yourself are never touched.
- **Restore replaces, it does not merge.** It checks the archive first (a bad
  file is refused before anything changes), backs up what is there and stops if
  that fails, loads the database, swaps the thumbnails, then reports row counts.
  A bad restore is undone by restoring the safety backup it names.
- **Web uploads go up to 8GB** (`MAX_UPLOAD_BYTES`, Bun's default is 128MB) and
  are held in RAM while parsed, so the host needs about the archive's size free.
  A proxy in front needs its own body limit at least that high (NPM ships 2000m).
- `THUMBS_DIR` overrides where backup/restore read and write thumbnails (default
  `public/thumbs`), for a host that runs the app from another directory.
- The backups sit on the same disk as the data. Copy `backups/` somewhere else
  to survive a dead disk.

## Deploying with Komodo

Komodo clones the repo, writes `.env` from the Stack's Environment field, builds
and runs `docker compose up`. Stack settings:

| Setting | Value | Why |
| --- | --- | --- |
| Repo | this repo, branch `main` | |
| `project_name` | `cosplay-taobao` | volumes are `<project>_dbdata` / `_thumbs`; renaming the Stack without this starts empty |
| Environment | `MYSQL_ROOT_PASSWORD`, `GEMINI_KEY`, optionally `PORT` | `PORT` is what NPM forwards to, default 3002 (cosplay-closet is 3000, lumpy-budget 3001) |
| `run_build` | **on** | the image builds from source; off means a redeploy reuses the old image |
| `reclone` | **off** | on deletes the folder every deploy, and `./backups` with it |
| `pre_deploy` | the backup below | a failed backup stops the deploy |
| `post_deploy` | `docker image prune -f` | every build leaves the old image behind |

```sh
[ -z "$(docker compose -p cosplay-taobao ps --status running -q app)" ] || docker compose -p cosplay-taobao exec -T app bun run backup
```

The guard skips the backup when no app container is running (the first
deploy, or a crash loop). Backups land in
`/etc/komodo/stacks/cosplay-taobao/backups`.

**Deploy on push**, an Action on `Every 5 minutes` (Komodo is LAN-only, so no
webhook). It compares commits because the stack builds from source, and a push
that does not touch `compose.yaml` looks like "no changes" to `DeployStackIfChanged`:

```ts
// Komodo > Actions > deploy-cosplay-taobao
const stack = "cosplay-taobao";
await komodo.write("RefreshStackCache", { stack });
const { info } = await komodo.read("GetStack", { stack });
if (info.latest_hash && info.latest_hash !== info.deployed_hash) {
  console.log(`deploying ${info.deployed_hash} -> ${info.latest_hash}`);
  await komodo.execute_and_poll("DeployStack", { stack });
}
```

**Nightly jobs**, an Action on `Every day at 03:00`, `failure_alert` on. It backs
up, then catches up any thumbnail or translation the in-process queue lost to a
restart (both scripts are idempotent). This replaces the old crontab entries.

```ts
// Komodo > Actions > nightly-cosplay-taobao
for (const command of ["bun run backup", "bun run download-thumbs", "bun run translate-titles"]) {
  let code = "";
  await komodo.execute_stack_service_terminal(
    {
      stack: "cosplay-taobao",
      service: "app",
      terminal: "nightly",
      command,
      init: { command: "sh", recreate: "Always" },
    },
    {
      onLine: (line) => console.log(line),
      onFinish: (c) => { code = c.trim(); },
    },
  );
  if (code !== "0") throw new Error(`${command} exited ${code}`);
}
```

**Change `.env` in the Stack's Environment field, never on the server.** Komodo
rewrites it every deploy, and its pull runs `git checkout -f`, so a hand edit to
`compose.yaml` is also thrown away. A change to that file is a commit.

### Getting at the database

From `/etc/komodo/stacks/cosplay-taobao`, after `export $(grep MYSQL_ROOT_PASSWORD .env)`:

```bash
docker compose -p cosplay-taobao exec db mariadb -uroot -p"$MYSQL_ROOT_PASSWORD" cosplay_taobao
```

For a GUI client, the database publishes `127.0.0.1:3309` on the server only:
`ssh -N -L 3309:127.0.0.1:3309 you@homelab`, then connect to `127.0.0.1:3309`.

## Moving from the old binary install

One time, from the VM running the compiled `server` binary to the Komodo VM. The
old binary has no backup route, so the first archive comes from the CLI; every
one after that is the web UI.

1. **Old VM.** Update the repo and stop the app so nothing changes mid-copy:
   ```bash
   cd <repo> && git pull && bun install
   # stop the binary (systemctl stop ..., or however it runs) and its cron jobs
   THUMBS_DIR=<dir the binary runs from>/public/thumbs bun run backup
   mysql -N -B -e "select count(*) from items" <DB_DATABASE>
   find <dir the binary runs from>/public/thumbs -type f | wc -l
   ```
   Keep both numbers. `THUMBS_DIR` can be left off if the binary runs from the
   repo. Needs `mysqldump` on that VM (it ships with the MariaDB/MySQL server).
2. **Copy the archive** to your laptop:
   `scp <old-vm>:<repo>/backups/cosplay-taobao-*.tar.gz .`
3. **Komodo.** Create the Stack with the settings above and Deploy. The first
   boot creates an empty `items` table.
4. **Restore.** Open `http://<Komodo VM IP>:3002`, database icon ->
   **Restore from backup…**, pick the archive. The item count and thumbnail
   count it shows must match step 1.
5. **Nginx Proxy Manager**: point the proxy host at `<Komodo VM IP>:3002`.
6. Leave the old VM's database and binary stopped, not deleted, until you have
   clicked around the new one.

## Commands

| Command | Description |
|---|---|
| `bun run dev` | Start dev server with HMR |
| `bun run lint` | Biome lint + auto-fix |
| `bun run download-thumbs` | Download & cache Taobao images to `public/thumbs/` |
| `bun run translate-titles` | Translate untranslated titles via Gemini |
| `bun run backup` / `restore` | Archive / restore the database + thumbnails |
| `scripts/docker-smoke.sh` | End-to-end container test, backup -> wipe -> restore |
| `bun run generate-routes` | Regenerate TanStack Router route tree |

## Downloading Thumbnails

The `download-thumbs` script fetches remote Taobao (`alicdn`) images, strips the `.webp` suffix to get the JPEG, saves them under `public/thumbs/`, and updates the database. URLs that already point to a local `thumbs/` file are skipped.

New items get their thumbnail and translation from the in-process queue; the nightly Komodo Action catches up anything a restart dropped.

## Features

- Paste Taobao listing JSON to save an item (duplicate detection by listing URL)
- Image carousel per card (multiple product images)
- Search by title or notes (debounced)
- Archive items with a soft-delete flag; toggle "Show Archived Only"
- Edit custom title and notes per item
- View notes in a quick read-only modal
- Virtualized card grid for performance with large collections

## Tech Stack

- **Runtime**: Bun
- **Backend**: Elysia + `bun:sql` (MySQL)
- **Frontend**: React 19, Mantine v8, TanStack Router, TanStack React Query
- **API client**: Eden Treaty (fully type-safe against the Elysia backend)
- **Linter**: Biome

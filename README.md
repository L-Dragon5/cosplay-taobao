# Cosplay Taobao

A personal web app for saving and browsing Taobao cosplay listings. Paste JSON data copied from a Taobao product page, and the app extracts the title, images, price, and seller info, then displays everything in a searchable card grid.

## Requirements

- [Bun](https://bun.sh) v1.3+
- MySQL 8+

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

## Production

Build a self-contained Linux binary:

```bash
bun run build
```

Then run it on the server:

```bash
./server
```

## Commands

| Command | Description |
|---|---|
| `bun run dev` | Start dev server with HMR |
| `bun run build` | Compile to a single Linux binary (`./server`) |
| `bun run lint` | Biome lint + auto-fix |
| `bun run download-thumbs` | Download & cache Taobao images to `public/thumbs/` |
| `bun run generate-routes` | Regenerate TanStack Router route tree |

## Downloading Thumbnails

The `download-thumbs` script fetches remote Taobao (`alicdn`) images, resizes them to 400px wide JPEGs via `sharp`, saves them under `public/thumbs/`, and updates the database. URLs that already point to a local `thumbs/` file are skipped.

For automated runs via cron (on the server):

```
0 * * * * cd /path/to/cosplay-taobao && /home/user/.bun/bin/bun run download-thumbs >> /var/log/download-thumbs.log 2>&1
```

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

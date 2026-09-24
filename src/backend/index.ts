import { openapi } from "@elysiajs/openapi"
import { Elysia } from "elysia"
import { backupController, MAX_UPLOAD_BYTES } from "@/backend/backup"
import { initDb } from "@/backend/db"
import { itemsController } from "@/backend/items"
import { publicPath } from "@/backend/static"
import indexHtml from "../../public/index.html"

await initDb()

const api = new Elysia({ prefix: "/api" })
  .use(
    openapi({
      path: "/docs",
    }),
  )
  .use(itemsController)
  .use(backupController)

const server = Bun.serve({
  maxRequestBodySize: MAX_UPLOAD_BYTES,
  routes: {
    "/": indexHtml,
  },
  async fetch(req, server) {
    const { pathname } = new URL(req.url)

    // Serve static files from public/ (decode %20 etc. back to literal chars)
    const path = publicPath(pathname)
    if (path) {
      const file = Bun.file(path)
      if (await file.exists()) return new Response(file)
    }

    // Route API requests through Elysia
    if (pathname.startsWith("/api")) {
      // Bun drops a connection that sends nothing for 10s (idleTimeout), and a
      // backup or restore spends longer than that in mysqldump/tar before the
      // first byte. The browser then shows "Site wasn't available".
      if (pathname.startsWith("/api/backup")) server.timeout(req, 0)
      return api.handle(req)
    }

    // Fall back to SPA shell for all other paths
    return new Response(Bun.file("public/index.html"))
  },
  // Off in the container (NODE_ENV=production): a minified bundle, no HMR.
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
})

export type App = typeof api

console.log(`🦊 Server running at ${server.url}`)

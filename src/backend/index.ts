import { openapi } from "@elysiajs/openapi"
import { Elysia } from "elysia"
import { initDb } from "@/backend/db"
import { itemsController } from "@/backend/items"
import indexHtml from "../../public/index.html"

await initDb()

const api = new Elysia({ prefix: "/api" })
  .use(
    openapi({
      path: "/docs",
    }),
  )
  .use(itemsController)

const server = Bun.serve({
  routes: {
    "/": indexHtml,
  },
  async fetch(req) {
    const { pathname } = new URL(req.url)

    // Serve static files from public/ (decode %20 etc. back to literal chars)
    const file = Bun.file(`public${decodeURIComponent(pathname)}`)
    if (await file.exists()) return new Response(file)

    // Route API requests through Elysia
    if (pathname.startsWith("/api")) {
      return api.handle(req)
    }

    // Fall back to SPA shell for all other paths
    return new Response(Bun.file("public/index.html"))
  },
  development: {
    hmr: true,
    console: true,
  },
})

export type App = typeof api

console.log(`🦊 Server running at ${server.url}`)

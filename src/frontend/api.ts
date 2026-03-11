import { treaty } from "@elysiajs/eden"
import type { App } from "@/backend/index"

export const api = treaty<App>(window.location.origin).api

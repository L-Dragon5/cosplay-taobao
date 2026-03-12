import { Elysia, t } from "elysia"
import * as service from "@/backend/items/service"

export const itemsController = new Elysia({ prefix: "/items" })
  .get("/", () => service.retrieveAll())

  .post(
    "/",
    async ({ body, set }) => {
      const result = await service.create(body)
      if (result.error) {
        set.status = result.duplicate ? 409 : 400
        return { error: result.error, duplicateId: result.duplicateId }
      }
      return result.item
    },
    {
      body: t.Object({
        json: t.String({ minLength: 8 }),
        override: t.Optional(t.Boolean()),
      }),
    },
  )

  .patch(
    "/:id",
    async ({ params, body, set }) => {
      const result = await service.update(Number(params.id), body)
      if (result.error) {
        set.status = 404
        return { error: result.error }
      }
      return result.item
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        custom_title: t.Optional(t.Nullable(t.String())),
        notes: t.Optional(t.Nullable(t.String())),
      }),
    },
  )

  .delete(
    "/:id",
    async ({ params, set }) => {
      const result = await service.deleteItem(Number(params.id))
      if (result.error) {
        set.status = 404
        return { error: result.error }
      }
      set.status = 204
    },
    { params: t.Object({ id: t.String() }) },
  )

  .post(
    "/:id/archive",
    async ({ params, set }) => {
      const result = await service.archive(Number(params.id))
      if (result.error) {
        set.status = 404
        return { error: result.error }
      }
      return result.item
    },
    { params: t.Object({ id: t.String() }) },
  )

  .post(
    "/:id/unarchive",
    async ({ params, set }) => {
      const result = await service.unarchive(Number(params.id))
      if (result.error) {
        set.status = 404
        return { error: result.error }
      }
      return result.item
    },
    { params: t.Object({ id: t.String() }) },
  )

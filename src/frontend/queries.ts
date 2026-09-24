import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { Item } from "@/backend/items/model"
import { api } from "@/frontend/api"

export type { Item }

// Mutations write the server's returned row into the cache instead of
// refetching the whole list. The list is newest-first, so a new item goes on top.
function replaceItem(items: Item[], item: Item): Item[] {
  return items.map((i) => (i.id === item.id ? item : i))
}

function setItems(
  queryClient: ReturnType<typeof useQueryClient>,
  fn: (items: Item[]) => Item[],
) {
  queryClient.setQueryData<Item[]>(["items"], (items) => items && fn(items))
}

export function useItemsQuery() {
  return useQuery<Item[]>({
    queryKey: ["items"],
    queryFn: async () => {
      const { data } = await api.items.get()
      return data as Item[]
    },
  })
}

export function useCreateItemMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { json: string; override?: boolean }) => {
      const { data, error } = await api.items.post(payload)
      if (error) throw error
      return data as Item
    },
    onSuccess: (item) => {
      setItems(queryClient, (items) => [item, ...items])
    },
  })
}

export function useUpdateItemMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      id: number
      custom_title?: string | null
      notes?: string | null
    }) => {
      const { id, ...body } = payload
      const { data, error } = await api.items({ id: String(id) }).patch(body)
      if (error) throw error
      return data as Item
    },
    onSuccess: (item) => {
      setItems(queryClient, (items) => replaceItem(items, item))
    },
  })
}

export function useArchiveItemMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await api.items({ id: String(id) }).archive.post()
      if (error) throw error
      return data as Item
    },
    onSuccess: (item) => {
      setItems(queryClient, (items) => replaceItem(items, item))
    },
  })
}

export function useUnarchiveItemMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await api
        .items({ id: String(id) })
        .unarchive.post()
      if (error) throw error
      return data as Item
    },
    onSuccess: (item) => {
      setItems(queryClient, (items) => replaceItem(items, item))
    },
  })
}

export function useDeleteItemMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await api.items({ id: String(id) }).delete()
      if (error) throw error
    },
    onSuccess: (_, id) => {
      setItems(queryClient, (items) => items.filter((i) => i.id !== id))
    },
  })
}

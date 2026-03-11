import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { Item } from "@/backend/items/model"
import { api } from "@/frontend/api"

export type { Item }

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] })
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] })
    },
  })
}

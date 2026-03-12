import { Carousel } from "@mantine/carousel"
import {
  Badge,
  Box,
  Button,
  Card,
  Chip,
  Divider,
  Group,
  Image,
  Modal,
  ScrollArea,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core"
import { useForm } from "@mantine/form"
import { useDebouncedValue } from "@mantine/hooks"
import {
  IconEdit,
  IconExternalLink,
  IconNotes,
  IconPlus,
} from "@tabler/icons-react"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  type VirtualCardGridHandle,
  VirtualCardGrid,
} from "@/frontend/components/VirtualCardGrid"
import {
  type Item,
  useCreateItemMutation,
  useItemsQuery,
  useUpdateItemMutation,
} from "@/frontend/queries"

export const Route = createFileRoute("/")({
  component: IndexPage,
})

function ItemCard({
  item,
  onViewNotes,
  onEdit,
  highlighted,
}: {
  item: Item
  onViewNotes: (item: Item) => void
  onEdit: (item: Item) => void
  highlighted?: boolean
}) {
  const displayTitle = item.custom_title || item.original_title

  return (
    <Card
      shadow="md"
      padding="sm"
      radius="md"
      withBorder
      h="100%"
      style={{
        ...(item.is_archived === 1
          ? { borderColor: "var(--mantine-color-gray-4)" }
          : {}),
        ...(highlighted ? { animation: "cardFlash 1.5s ease-out" } : {}),
      }}
    >
      <Card.Section h={500}>
        {item.images.length > 0 ? (
          <Carousel
            withIndicators={item.images.length > 1}
            withControls={item.images.length > 1}
            height="100%"
            flex={1}
            controlsOffset="sm"
            controlSize={26}
            styles={{
              control: { backgroundColor: "white" },
              indicator: { backgroundColor: "white" },
            }}
          >
            {item.images.map((src) => (
              <Carousel.Slide key={src}>
                <Image src={src} h={500} fit="cover" alt={displayTitle} />
              </Carousel.Slide>
            ))}
          </Carousel>
        ) : (
          <Box
            bg="gray.1"
            h="100%"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text c="dimmed" size="sm">
              No image
            </Text>
          </Box>
        )}
      </Card.Section>

      <Stack gap={4} mt="xs" flex={1} justify="space-between">
        {item.is_archived === 1 && (
          <Group gap={6}>
            <Badge color="gray" size="xs">
              Archived
            </Badge>
            {item.archived_at && (
              <Text size="xs" c="dimmed">
                {new Date(item.archived_at).toLocaleDateString()}
              </Text>
            )}
          </Group>
        )}

        <Text fw={500} size="md" lineClamp={2} title={displayTitle}>
          {displayTitle}
        </Text>

        {item.seller_name && (
          <Text size="xs" c="dimmed" lineClamp={1}>
            {item.seller_name}
          </Text>
        )}

        {item.original_price && (
          <Text size="sm" c="pink" fw={500}>
            ¥{item.original_price}
          </Text>
        )}

        <Group gap="xs">
          <Button
            component="a"
            href={item.listing_url}
            target="_blank"
            rel="noopener noreferrer"
            size="compact-md"
            rightSection={<IconExternalLink size={16} />}
            flex={1}
          >
            View Listing
          </Button>
          {item.notes && (
            <Button
              size="compact-md"
              variant="light"
              color="gray"
              onClick={() => onViewNotes(item)}
              leftSection={<IconNotes size={14} />}
            >
              Notes
            </Button>
          )}
          <Button
            size="compact-md"
            variant="light"
            onClick={() => onEdit(item)}
            leftSection={<IconEdit size={14} />}
          >
            Edit
          </Button>
        </Group>
      </Stack>
    </Card>
  )
}

function IndexPage() {
  const [jsonInput, setJsonInput] = useState("")
  const [addError, setAddError] = useState<string | null>(null)
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false)
  const [duplicateItemId, setDuplicateItemId] = useState<number | null>(null)
  const [pendingScrollId, setPendingScrollId] = useState<number | null>(null)
  const [highlightedItemId, setHighlightedItemId] = useState<number | null>(
    null,
  )
  const [search, setSearch] = useState("")
  const [debouncedSearch] = useDebouncedValue(search, 300)
  const [showArchived, setShowArchived] = useState(false)
  const [notesItem, setNotesItem] = useState<Item | null>(null)
  const [editItem, setEditItem] = useState<Item | null>(null)
  const gridRef = useRef<VirtualCardGridHandle>(null)

  const { data: items = [] } = useItemsQuery()
  const createMutation = useCreateItemMutation()
  const updateMutation = useUpdateItemMutation()

  const editForm = useForm({
    initialValues: { custom_title: "", notes: "" },
  })

  function openEdit(item: Item) {
    editForm.setValues({
      custom_title: item.custom_title ?? "",
      notes: item.notes ?? "",
    })
    setEditItem(item)
  }

  async function handleEditSubmit(values: {
    custom_title: string
    notes: string
  }) {
    if (!editItem) return
    await updateMutation.mutateAsync({
      id: editItem.id,
      custom_title: values.custom_title || null,
      notes: values.notes || null,
    })
    setEditItem(null)
  }

  const filteredItems = useMemo((): Item[] => {
    let result: Item[] = items.filter((item: Item) =>
      showArchived ? item.is_archived === 1 : item.is_archived === 0,
    )

    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase()
      result = result.filter(
        (item) =>
          item.original_title.toLowerCase().includes(q) ||
          (item.custom_title?.toLowerCase().includes(q) ?? false) ||
          (item.notes?.toLowerCase().includes(q) ?? false),
      )
    }

    return result
  }, [items, debouncedSearch, showArchived])

  async function handleAdd(override = false) {
    const trimmed = jsonInput.trim()
    if (!trimmed || createMutation.isPending) return

    setAddError(null)

    try {
      await createMutation.mutateAsync({ json: trimmed, override })
      setJsonInput("")
      setDuplicateModalOpen(false)
    } catch (err: unknown) {
      const e = err as {
        status?: number
        value?: { error?: string; duplicateId?: number }
      }
      if (e.status === 409) {
        setDuplicateItemId(e.value?.duplicateId ?? null)
        setDuplicateModalOpen(true)
      } else {
        setAddError(e.value?.error ?? "Failed to add item")
      }
    }
  }

  useEffect(() => {
    if (pendingScrollId === null) return
    const id = pendingScrollId
    setPendingScrollId(null)
    // Defer so the grid re-renders with the updated filter/search first
    setTimeout(() => {
      gridRef.current?.scrollToItem(id)
      setHighlightedItemId(id)
      setTimeout(() => setHighlightedItemId(null), 1500)
    }, 50)
  }, [pendingScrollId])

  function handleGoToItem() {
    if (duplicateItemId === null) return
    const item = items.find((i) => i.id === duplicateItemId)
    setSearch("")
    setShowArchived(item?.is_archived === 1)
    setDuplicateModalOpen(false)
    setPendingScrollId(duplicateItemId)
  }

  return (
    <Box>
      <style>{`
        @keyframes cardFlash {
          0%   { box-shadow: none; }
          20%  { box-shadow: 0 0 0 3px var(--mantine-color-orange-5); }
          40%  { box-shadow: none; }
          60%  { box-shadow: 0 0 0 3px var(--mantine-color-orange-5); }
          80%  { box-shadow: none; }
          100% { box-shadow: 0 0 0 3px var(--mantine-color-orange-5); }
        }
      `}</style>
      {/* Notes modal */}
      <Modal
        opened={notesItem !== null}
        onClose={() => setNotesItem(null)}
        title="Notes"
        centered
      >
        <ScrollArea.Autosize mah={400}>
          <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
            {notesItem?.notes}
          </Text>
        </ScrollArea.Autosize>
      </Modal>

      {/* Edit modal */}
      <Modal
        opened={editItem !== null}
        onClose={() => setEditItem(null)}
        title="Edit item"
        centered
      >
        <form onSubmit={editForm.onSubmit(handleEditSubmit)}>
          <Stack gap="sm">
            <TextInput
              label="Custom title"
              placeholder="Leave blank to use original title"
              {...editForm.getInputProps("custom_title")}
            />
            <Textarea
              label="Notes"
              placeholder="Add notes…"
              autosize
              minRows={3}
              maxRows={8}
              {...editForm.getInputProps("notes")}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setEditItem(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={updateMutation.isPending}>
                Save
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={duplicateModalOpen}
        onClose={() => setDuplicateModalOpen(false)}
        title="Duplicate item"
        centered
      >
        <Text size="sm">
          This listing already exists in your collection. Add it anyway?
        </Text>
        <Group justify="flex-end" mt="md">
          <Button
            variant="default"
            onClick={() => setDuplicateModalOpen(false)}
          >
            Cancel
          </Button>
          {duplicateItemId !== null && (
            <Button variant="light" onClick={handleGoToItem}>
              Go to item
            </Button>
          )}
          <Button
            color="orange"
            loading={createMutation.isPending}
            onClick={() => handleAdd(true)}
          >
            Add anyway
          </Button>
        </Group>
      </Modal>

      {/* Sticky toolbar */}
      <Box
        style={{
          position: "sticky",
          top: "var(--app-shell-header-height, 60px)",
          zIndex: 100,
          backgroundColor: "var(--mantine-color-body)",
        }}
        py="sm"
      >
        <Group gap="xs" align="flex-start">
          <TextInput
            flex={1}
            placeholder="Paste Taobao item JSON and press Enter…"
            value={jsonInput}
            onChange={(e) => {
              setJsonInput(e.currentTarget.value)
              setAddError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd()
            }}
            error={addError ?? undefined}
            disabled={createMutation.isPending}
          />
          <Button
            color="pink"
            onClick={() => handleAdd()}
            loading={createMutation.isPending}
            leftSection={<IconPlus size={18} />}
            disabled={jsonInput === ""}
            mt={1}
          >
            Add Item
          </Button>
        </Group>

        <Divider my="sm" />

        <Group gap="md" align="center">
          <TextInput
            size="xs"
            placeholder="Search by title or notes…"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            style={{ flex: 1, maxWidth: 320 }}
          />
          <Chip size="xs" checked={showArchived} onChange={setShowArchived}>
            {showArchived ? "Show Archived Only" : "Show Archived Only"}
          </Chip>
          <Text size="sm">{items.length} items collected</Text>
        </Group>
      </Box>

      {/* Item grid */}
      <VirtualCardGrid
        controlRef={gridRef}
        items={filteredItems}
        estimateSize={500}
        renderItem={(item) => (
          <ItemCard
            key={item.id}
            item={item}
            onViewNotes={setNotesItem}
            onEdit={openEdit}
            highlighted={item.id === highlightedItemId}
          />
        )}
      />
    </Box>
  )
}

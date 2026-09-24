import {
  ActionIcon,
  Alert,
  Button,
  FileInput,
  Group,
  Menu,
  Modal,
  Stack,
  Table,
  Text,
} from "@mantine/core"
import {
  IconAlertTriangle,
  IconDatabase,
  IconDownload,
  IconUpload,
} from "@tabler/icons-react"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import type { RestoreResult } from "@/backend/backup/service"

// Download is a plain link: the server builds the archive and the browser
// saves it, no JavaScript involved. Restore uploads one back.
export function BackupMenu() {
  const [opened, setOpened] = useState(false)
  return (
    <>
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <ActionIcon variant="light" color="indigo" aria-label="Backup">
            <IconDatabase size={20} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            component="a"
            href="/api/backup"
            download
            leftSection={<IconDownload size={16} />}
          >
            Download backup
          </Menu.Item>
          <Menu.Item
            leftSection={<IconUpload size={16} />}
            onClick={() => setOpened(true)}
          >
            Restore from backup…
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <RestoreModal opened={opened} onClose={() => setOpened(false)} />
    </>
  )
}

function RestoreModal({
  opened,
  onClose,
}: {
  opened: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RestoreResult | null>(null)

  function close() {
    if (busy) return
    setFile(null)
    setError(null)
    setResult(null)
    onClose()
  }

  async function handleRestore() {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/backup/restore", {
        method: "POST",
        body: form,
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      setResult(body)
      // Every cached list is now stale.
      await queryClient.invalidateQueries()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal opened={opened} onClose={close} title="Restore from backup" centered>
      {result ? (
        <Stack>
          <Alert color="green" title="Restored">
            {result.thumbs} thumbnail(s) restored. What was here before is saved
            on the server as <code>{result.safety}</code>.
          </Alert>
          <Table striped>
            <Table.Tbody>
              {Object.entries(result.counts).map(([table, n]) => (
                <Table.Tr key={table}>
                  <Table.Td>{table}</Table.Td>
                  <Table.Td ta="right">{n}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Group justify="flex-end">
            <Button onClick={close}>Done</Button>
          </Group>
        </Stack>
      ) : (
        <Stack>
          <Alert
            color="orange"
            icon={<IconAlertTriangle size={18} />}
            title="This replaces everything"
          >
            Every item and cached thumbnail becomes what the backup holds. The
            current data is backed up on the server first.
          </Alert>
          <FileInput
            label="Backup file"
            placeholder="cosplay-taobao-….tar.gz"
            accept=".gz,application/gzip"
            value={file}
            onChange={setFile}
            disabled={busy}
          />
          {error && (
            <Alert color="red" title="Restore failed">
              <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                {error}
              </Text>
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button
              color="red"
              onClick={handleRestore}
              disabled={!file}
              loading={busy}
            >
              Restore
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}

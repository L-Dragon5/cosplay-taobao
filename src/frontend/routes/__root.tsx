import { AppShell, Group, Text } from "@mantine/core"
import { createRootRoute, Outlet } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"

const RootLayout = () => (
  <AppShell header={{ height: 60 }} padding="md">
    <AppShell.Header style={{ backgroundColor: "orange" }}>
      <Group h="100%" px="md" justify="space-between">
        <Text fw={700} size="lg">
          Cosplay Taobao
        </Text>
      </Group>
    </AppShell.Header>
    <AppShell.Main>
      <Outlet />
      <TanStackRouterDevtools />
    </AppShell.Main>
  </AppShell>
)

export const Route = createRootRoute({ component: RootLayout })

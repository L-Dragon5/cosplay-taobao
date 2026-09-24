import { Button, Tooltip } from "@mantine/core"
import { IconBookmark } from "@tabler/icons-react"
import { useEffect, useRef } from "react"
import { bookmarkletHref } from "@/frontend/bookmarklet"

// Drag to the bookmarks bar, then click it on a Taobao listing. The href is
// set by hand: React 19 blocks javascript: URLs passed as a prop.
export function BookmarkletLink() {
  const ref = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    ref.current?.setAttribute("href", bookmarkletHref(window.location.origin))
  }, [])
  return (
    <Tooltip label="Drag to your bookmarks bar, then click it on a Taobao listing">
      <Button
        ref={ref}
        component="a"
        onClick={(e) => e.preventDefault()}
        variant="light"
        color="indigo"
        size="xs"
        leftSection={<IconBookmark size={16} />}
      >
        Add to Closet
      </Button>
    </Tooltip>
  )
}

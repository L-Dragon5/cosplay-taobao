import { useWindowVirtualizer } from "@tanstack/react-virtual"
import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react"

const SCROLL_KEY = "vgrid-scroll-y"

function getColumns(width: number): number {
  if (width < 576) return 1
  if (width < 768) return 2
  if (width < 1200) return 3
  if (width < 1900) return 4
  return 5
}

export interface VirtualCardGridHandle {
  scrollToItem: (id: number) => void
}

export function VirtualCardGrid<T extends { id: number }>({
  items,
  renderItem,
  estimateSize = 220,
  controlRef,
  preserveScroll = true,
}: {
  items: T[]
  renderItem: (item: T) => React.ReactNode
  estimateSize?: number
  controlRef?: React.RefObject<VirtualCardGridHandle | null>
  preserveScroll?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [cols, setCols] = useState(() => getColumns(window.innerWidth))
  const [scrollMargin, setScrollMargin] = useState(0)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    setScrollMargin(el.offsetTop)
    const ro = new ResizeObserver(([entry]) => {
      if (entry)
        requestAnimationFrame(() =>
          setCols(getColumns(entry.contentRect.width)),
        )
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Restore scroll position once items first arrive (virtualizer total height is 0 until then)
  const hasRestoredScroll = useRef(false)
  useEffect(() => {
    if (!preserveScroll || hasRestoredScroll.current || items.length === 0)
      return
    hasRestoredScroll.current = true
    const saved = sessionStorage.getItem(SCROLL_KEY)
    if (!saved) return
    const y = parseInt(saved, 10)
    if (y <= 0) return
    // Give the virtualizer one frame to paint its total height before scrolling
    const id = setTimeout(() => window.scrollTo(0, y), 50)
    return () => clearTimeout(id)
  }, [items.length, preserveScroll])

  // Save scroll position continuously (clear saved value when disabled)
  useEffect(() => {
    if (!preserveScroll) {
      sessionStorage.removeItem(SCROLL_KEY)
      return
    }
    const handler = () =>
      sessionStorage.setItem(SCROLL_KEY, String(window.scrollY))
    window.addEventListener("scroll", handler, { passive: true })
    return () => window.removeEventListener("scroll", handler)
  }, [preserveScroll])

  const rows: T[][] = []
  for (let i = 0; i < items.length; i += cols) {
    rows.push(items.slice(i, i + cols))
  }

  const rowsRef = useRef<T[][]>(rows)
  rowsRef.current = rows

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => estimateSize,
    overscan: 3,
    scrollMargin,
  })

  useImperativeHandle(controlRef, () => ({
    scrollToItem: (id: number) => {
      const rowIndex = rowsRef.current.findIndex((row) =>
        row.some((item) => item.id === id),
      )
      if (rowIndex >= 0) {
        virtualizer.scrollToIndex(rowIndex, { align: "start" })
      }
    },
  }))

  const virtualRows = virtualizer.getVirtualItems()

  return (
    <div ref={containerRef}>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualRows.map((vRow) => (
          <div
            key={vRow.key}
            data-index={vRow.index}
            ref={virtualizer.measureElement}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              transform: `translateY(${vRow.start - virtualizer.options.scrollMargin}px)`,
              display: "grid",
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gap: "var(--mantine-spacing-md)",
              paddingBottom: "var(--mantine-spacing-md)",
            }}
          >
            {(rows[vRow.index] ?? []).map((item) => renderItem(item))}
          </div>
        ))}
      </div>
    </div>
  )
}

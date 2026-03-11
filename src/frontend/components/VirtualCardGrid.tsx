import { useWindowVirtualizer } from "@tanstack/react-virtual"
import { useLayoutEffect, useRef, useState } from "react"

function getColumns(width: number): number {
  if (width < 576) return 1
  if (width < 768) return 2
  if (width < 1200) return 3
  if (width < 1900) return 4
  return 5
}

export function VirtualCardGrid<T extends { id: number }>({
  items,
  renderItem,
  estimateSize = 220,
}: {
  items: T[]
  renderItem: (item: T) => React.ReactNode
  estimateSize?: number
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

  const rows: T[][] = []
  for (let i = 0; i < items.length; i += cols) {
    rows.push(items.slice(i, i + cols))
  }

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => estimateSize,
    overscan: 3,
    scrollMargin,
  })

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

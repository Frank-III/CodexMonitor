import { splitProps, type ComponentProps } from "solid-js"

export interface ResizeHandleProps extends Omit<ComponentProps<"div">, "onResize"> {
  direction: "horizontal" | "vertical"
  size: number
  min: number
  max: number
  collapseThreshold?: number
  onResize: (size: number) => void
  onCollapse?: () => void
}

export function ResizeHandle(props: ResizeHandleProps) {
  const [local, others] = splitProps(props, [
    "direction",
    "size",
    "min",
    "max",
    "collapseThreshold",
    "onResize",
    "onCollapse",
  ])

  const handleMouseDown = (e: MouseEvent) => {
    e.preventDefault()
    const start = local.direction === "horizontal" ? e.clientX : e.clientY
    const startSize = local.size
    let current = startSize

    // Disable selection during drag
    document.body.style.userSelect = "none"
    document.body.style.overflow = "hidden"

    const onMouseMove = (moveEvent: MouseEvent) => {
      const pos = local.direction === "horizontal" ? moveEvent.clientX : moveEvent.clientY
      // For vertical, dragging up increases size (negative delta)
      const delta = local.direction === "vertical" ? start - pos : pos - start
      current = startSize + delta

      // Clamp between min/max
      const clamped = Math.min(local.max, Math.max(local.min, current))
      local.onResize(clamped)
    }

    const onMouseUp = () => {
      document.body.style.userSelect = ""
      document.body.style.overflow = ""
      document.removeEventListener("mousemove", onMouseMove)
      document.removeEventListener("mouseup", onMouseUp)

      // Auto-collapse if below threshold
      const threshold = local.collapseThreshold ?? 0
      if (local.onCollapse && threshold > 0 && current < threshold) {
        local.onCollapse()
      }
    }

    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup", onMouseUp)
  }

  return (
    <div
      data-component="resize-handle"
      data-direction={local.direction}
      onMouseDown={handleMouseDown}
      {...others}
    />
  )
}

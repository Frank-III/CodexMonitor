import { For, type JSX } from "solid-js"

export interface SkeletonProps {
  class?: string
  style?: JSX.CSSProperties
}

export function Skeleton(props: SkeletonProps) {
  return <div data-component="skeleton" class={props.class} style={props.style} />
}

export interface SessionSkeletonProps {
  lines?: number
  showTools?: boolean
  class?: string
}

export function SessionSkeleton(props: SessionSkeletonProps) {
  const lineCount = () => props.lines ?? 3

  return (
    <div data-component="session-skeleton" class={props.class}>
      <div data-slot="skeleton-header">
        <Skeleton data-slot="skeleton-title" />
        <Skeleton data-slot="skeleton-subtitle" />
      </div>

      <div data-slot="skeleton-messages">
        {/* User message skeleton */}
        <div data-slot="skeleton-message">
          <Skeleton data-slot="skeleton-avatar" />
          <div data-slot="skeleton-content">
            <Skeleton data-slot="skeleton-line" data-width="large" />
            <Skeleton data-slot="skeleton-line" data-width="medium" />
          </div>
        </div>

        {/* Assistant message skeleton */}
        <div data-slot="skeleton-message">
          <Skeleton data-slot="skeleton-avatar" />
          <div data-slot="skeleton-content">
            <For each={Array(lineCount()).fill(0)}>
              {(_, i) => (
                <Skeleton
                  data-slot="skeleton-line"
                  data-width={i() === lineCount() - 1 ? "medium" : "full"}
                />
              )}
            </For>
          </div>
        </div>

        {/* Tool skeleton if requested */}
        {props.showTools && (
          <>
            <div data-slot="skeleton-tool">
              <Skeleton data-slot="skeleton-tool-icon" />
              <Skeleton data-slot="skeleton-tool-text" />
            </div>
            <div data-slot="skeleton-tool">
              <Skeleton data-slot="skeleton-tool-icon" />
              <Skeleton data-slot="skeleton-tool-text" style={{ width: "160px" }} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

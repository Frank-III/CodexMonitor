import { makePersisted } from "@solid-primitives/storage";
import { createMemo, createSignal, type Accessor } from "solid-js";

export type ThreadPaneId = "left" | "right";

type PaneState = {
  tabs: string[];
  active: string | null;
};

export type WorkspaceThreadLayout = {
  split: boolean;
  activePane: ThreadPaneId;
  left: PaneState;
  right: PaneState;
};

type ThreadLayoutState = Record<string, WorkspaceThreadLayout>;

const createEmptyPane = (): PaneState => ({ tabs: [], active: null });

const createDefaultLayout = (): WorkspaceThreadLayout => ({
  split: false,
  activePane: "left",
  left: createEmptyPane(),
  right: createEmptyPane(),
});

function removeFromArray(values: string[], value: string) {
  const index = values.indexOf(value);
  if (index < 0) {
    return { next: values, index: -1, changed: false };
  }
  const next = values.slice();
  next.splice(index, 1);
  return { next, index, changed: true };
}

function insertAt(values: string[], value: string, index: number) {
  const next = values.slice();
  const clamped = Math.max(0, Math.min(index, next.length));
  next.splice(clamped, 0, value);
  return next;
}

function nextActiveAfterRemoval(values: string[], removedIndex: number) {
  if (values.length === 0) {
    return null;
  }
  const index = Math.max(0, Math.min(removedIndex, values.length - 1));
  return values[index] ?? null;
}

function removeThreadFromPane(pane: PaneState, threadId: string) {
  const { next: tabs, index, changed } = removeFromArray(pane.tabs, threadId);
  if (!changed) {
    return { tabs: pane.tabs, active: pane.active, removedIndex: -1, removed: false };
  }
  const active =
    pane.active === threadId ? nextActiveAfterRemoval(tabs, index) : pane.active;
  return { tabs, active, removedIndex: index, removed: true };
}

export type ThreadLayoutStore = {
  layoutByWorkspaceId: () => ThreadLayoutState;
  layoutForWorkspace: (workspaceId: string) => WorkspaceThreadLayout;
  activeLayout: () => WorkspaceThreadLayout;
  focusedThreadId: () => string | null;
  ensureThreadOpen: (workspaceId: string, threadId: string, pane?: ThreadPaneId) => void;
  closeThread: (workspaceId: string, threadId: string) => void;
  setActivePane: (workspaceId: string, pane: ThreadPaneId) => void;
  openSplit: (workspaceId: string) => void;
  closeSplit: (workspaceId: string) => void;
  moveThread: (
    workspaceId: string,
    threadId: string,
    fromPane: ThreadPaneId,
    toPane: ThreadPaneId,
    targetIndex: number,
  ) => void;
};

export function createThreadLayoutStore(options: {
  activeWorkspaceId: Accessor<string | null>;
}): ThreadLayoutStore {
  const [layoutByWorkspaceId, setLayoutByWorkspaceId] = makePersisted(
    createSignal<ThreadLayoutState>({}),
    { name: "codexmonitor.threadLayout" },
  );

  const layoutForWorkspace = (workspaceId: string): WorkspaceThreadLayout => {
    if (!workspaceId) {
      return createDefaultLayout();
    }
    return layoutByWorkspaceId()[workspaceId] ?? createDefaultLayout();
  };

  const activeLayout = createMemo(() => {
    const workspaceId = options.activeWorkspaceId();
    if (!workspaceId) {
      return createDefaultLayout();
    }
    return layoutForWorkspace(workspaceId);
  });

  const focusedThreadId = createMemo(() => {
    const layout = activeLayout();
    const pane = layout.activePane;
    const state = pane === "right" ? layout.right : layout.left;
    return state.active ?? null;
  });

  const updateWorkspace = (workspaceId: string, update: (prev: WorkspaceThreadLayout) => WorkspaceThreadLayout) => {
    if (!workspaceId) {
      return;
    }
    setLayoutByWorkspaceId((prev) => {
      const existing = prev[workspaceId] ?? createDefaultLayout();
      const next = update(existing);
      if (next === existing) {
        return prev;
      }
      return { ...prev, [workspaceId]: next };
    });
  };

  const setActivePane = (workspaceId: string, pane: ThreadPaneId) => {
    updateWorkspace(workspaceId, (prev) => ({ ...prev, activePane: pane }));
  };

  const openSplit = (workspaceId: string) => {
    updateWorkspace(workspaceId, (prev) => ({ ...prev, split: true }));
  };

  const closeSplit = (workspaceId: string) => {
    updateWorkspace(workspaceId, (prev) => {
      if (!prev.split && prev.right.tabs.length === 0) {
        return prev;
      }
      const merged = [...prev.left.tabs];
      for (const threadId of prev.right.tabs) {
        if (!merged.includes(threadId)) {
          merged.push(threadId);
        }
      }
      const activeThreadId =
        prev.activePane === "right"
          ? prev.right.active ?? prev.left.active ?? null
          : prev.left.active ?? prev.right.active ?? null;
      return {
        split: false,
        activePane: "left",
        left: {
          tabs: merged,
          active: activeThreadId ?? (merged[0] ?? null),
        },
        right: createEmptyPane(),
      };
    });
  };

  const ensureThreadOpen = (workspaceId: string, threadId: string, pane?: ThreadPaneId) => {
    const targetPane = pane ?? layoutForWorkspace(workspaceId).activePane;
    updateWorkspace(workspaceId, (prev) => {
      const isInLeft = prev.left.tabs.includes(threadId);
      const isInRight = prev.right.tabs.includes(threadId);
      const currentPane: ThreadPaneId | null = isInRight
        ? "right"
        : isInLeft
          ? "left"
          : null;

      if (currentPane === targetPane) {
        const split = prev.split || targetPane === "right";
        return {
          ...prev,
          split,
          activePane: targetPane,
          left:
            targetPane === "left" ? { ...prev.left, active: threadId } : prev.left,
          right:
            targetPane === "right"
              ? { ...prev.right, active: threadId }
              : prev.right,
        };
      }

      const leftRemoved = removeThreadFromPane(prev.left, threadId);
      const rightRemoved = removeThreadFromPane(prev.right, threadId);

      let left = { tabs: leftRemoved.tabs, active: leftRemoved.active };
      let right = { tabs: rightRemoved.tabs, active: rightRemoved.active };

      if (targetPane === "left") {
        left = { tabs: [...left.tabs, threadId], active: threadId };
      } else {
        right = { tabs: [...right.tabs, threadId], active: threadId };
      }

      const split = (prev.split || targetPane === "right") && right.tabs.length > 0;

      return {
        split,
        activePane: targetPane,
        left,
        right: split ? right : createEmptyPane(),
      };
    });
  };

  const closeThread = (workspaceId: string, threadId: string) => {
    updateWorkspace(workspaceId, (prev) => {
      const leftRemoved = removeThreadFromPane(prev.left, threadId);
      const rightRemoved = removeThreadFromPane(prev.right, threadId);
      if (!leftRemoved.removed && !rightRemoved.removed) {
        return prev;
      }

      const left = { tabs: leftRemoved.tabs, active: leftRemoved.active };
      const right = { tabs: rightRemoved.tabs, active: rightRemoved.active };

      const split = prev.split && right.tabs.length > 0;
      let activePane: ThreadPaneId = split ? prev.activePane : "left";
      if (split) {
        if (activePane === "left" && !left.active && right.active) {
          activePane = "right";
        } else if (activePane === "right" && !right.active && left.active) {
          activePane = "left";
        }
      }

      return {
        split,
        activePane,
        left,
        right: split ? right : createEmptyPane(),
      };
    });
  };

  const moveThread = (
    workspaceId: string,
    threadId: string,
    fromPane: ThreadPaneId,
    toPane: ThreadPaneId,
    targetIndex: number,
  ) => {
    updateWorkspace(workspaceId, (prev) => {
      const wasActive =
        (fromPane === "right" ? prev.right.active : prev.left.active) === threadId;
      const shouldFocus = fromPane !== toPane || wasActive;

      const leftRemoved = removeThreadFromPane(prev.left, threadId);
      const rightRemoved = removeThreadFromPane(prev.right, threadId);

      let left = { tabs: leftRemoved.tabs, active: leftRemoved.active };
      let right = { tabs: rightRemoved.tabs, active: rightRemoved.active };

      if (toPane === "left") {
        left = {
          tabs: insertAt(left.tabs, threadId, targetIndex),
          active: shouldFocus ? threadId : left.active,
        };
      } else {
        right = {
          tabs: insertAt(right.tabs, threadId, targetIndex),
          active: shouldFocus ? threadId : right.active,
        };
      }

      const split = (prev.split || toPane === "right") && right.tabs.length > 0;

      return {
        split,
        activePane: shouldFocus ? toPane : prev.activePane,
        left,
        right: split ? right : createEmptyPane(),
      };
    });
  };

  return {
    layoutByWorkspaceId,
    layoutForWorkspace,
    activeLayout,
    focusedThreadId,
    ensureThreadOpen,
    closeThread,
    setActivePane,
    openSplit,
    closeSplit,
    moveThread,
  };
}

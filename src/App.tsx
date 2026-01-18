import { createSignal, createEffect, createMemo, on, onCleanup, onMount, Show, ErrorBoundary } from "solid-js";
import {
  Root as ResizableRoot,
  Panel as ResizablePanel,
  Handle as ResizableHandle,
} from "@corvu/resizable";

// Tailwind utilities (includes UI library styles)
import "./styles/tailwind.css";

// UI library components
import { DialogProvider, Toast } from "./ui";

// Legacy styles (to be migrated)
import "./styles/base.css";
import "./styles/buttons.css";
import "./styles/sidebar.css";
import "./styles/home.css";
import "./styles/main.css";
import "./styles/messages.css";
import "./styles/approval-toasts.css";
import "./styles/composer.css";
import "./styles/diff.css";
import "./styles/debug.css";
import "./styles/resizable.css";
import "./styles/plan.css";
import "./styles/about.css";
import "./styles/usage.css";
import "./styles/right-panel.css";
import "./styles/bookmarks.css";
import "./styles/file-viewer.css";
import "./styles/tasks.css";
import "./styles/compact-nav.css";
import "./styles/thread-tabs.css";
import "./styles/multi-terminal.css";
import "./styles/file-viewer-tabs.css";
import { Sidebar } from "./components/Sidebar";
import { Home } from "./components/Home";
import { MainHeader } from "./components/MainHeader";
import { ChatSplitView } from "./components/ChatSplitView";
import { ApprovalToasts } from "./components/ApprovalToasts";
import { Composer } from "./components/Composer";
import { GitDiffPanel } from "./components/GitDiffPanel";
import { GitHubIssuesPanel } from "./components/GitHubIssuesPanel";
import { JjGraphPanel } from "./components/JjGraphPanel";
import { JjBookmarksPanel } from "./components/JjBookmarksPanel";
import { JjInfoPanel } from "./components/JjInfoPanel";
import { JjStackPanel } from "./components/JjStackPanel";
import { TerminalPanel } from "./components/TerminalPanel";
import { MultiTerminalPanel } from "./components/MultiTerminalPanel";
import { FileViewerTabs } from "./components/FileViewerTabs";
import { WorkspaceTasksPanel } from "./components/WorkspaceTasksPanel";
import { RyuStackPanel, type RyuAction, type RyuOptions } from "./components/RyuStackPanel";
import { EditBookmarkPrompt } from "./components/EditBookmarkPrompt";
import { RenameBookmarkPrompt } from "./components/RenameBookmarkPrompt";
import { ConfirmPrompt } from "./components/ConfirmPrompt";
import { DebugPanel } from "./components/DebugPanel";
import { TokenUsage } from "./components/TokenUsage";
import { SettingsView } from "./components/SettingsView";
import { SessionContextTab, type SessionMessage } from "./components/SessionContextTab";
import { PromptsBrowser } from "./components/PromptsBrowser";
import { WorktreePrompt } from "./components/WorktreePrompt";
import { LandWorktreePrompt } from "./components/LandWorktreePrompt";
import { SyncWorktreePrompt } from "./components/SyncWorktreePrompt";
import { EditWorktreeBasePrompt } from "./components/EditWorktreeBasePrompt";
import { EditWorkspaceBasePrompt } from "./components/EditWorkspaceBasePrompt";
import { CloneRepositoryPrompt } from "./components/CloneRepositoryPrompt";
import { ReparentWorktreePrompt } from "./components/ReparentWorktreePrompt";
import { CompactNav, type CompactNavTab } from "./components/CompactNav";
import { AppCommands } from "./components/AppCommands";
import { CommandProvider } from "./context";
import {
  createWorkspacesStore,
  createModelsStore,
  createSkillsStore,
  createPromptsStore,
  createComposerDraftsStore,
  createVcsStatusStore,
  createJjBookmarksStore,
  createGitHubIssuesStore,
  createWorktreeDivergenceStore,
  createJjGraphStore,
  createJjGraphPreviewStore,
  createVcsLogStore,
  createThreadsStore,
  createThreadLayoutStore,
  createUsageStore,
  createQueuedSendStore,
  createResizableSizes,
  createAppSettingsStore,
  createTerminalStore,
  createMultiTerminalStore,
  createFileViewerStore,
  createFileTabsStore,
  createWorkspacePathPreviewStore,
  createWorktreeStackOpsStore,
  createWorkspaceTasksStore,
  setupWindowDrag,
} from "./stores";
import type {
  AccessMode,
  ApprovalPolicy,
  DebugEntry,
  JjBookmarkInfo,
  PromptOption,
  WorkspaceInfo,
  WorktreeMode,
} from "./types";
import { jjWorkspaceUpdateStale, logFrontendError, pickWorkspacePath, runRyu } from "./services/tauri";
import { parseRyuStdout, summarizeRyuMarkers } from "./utils/ryu";

function App() {
  const [debugOpen, setDebugOpen] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [promptsOpen, setPromptsOpen] = createSignal(false);
  const [promptsQuery, setPromptsQuery] = createSignal("");
  const [clonePromptOpen, setClonePromptOpen] = createSignal(false);
  const [worktreePromptOpen, setWorktreePromptOpen] = createSignal(false);
  const [worktreeBaseWorkspaceId, setWorktreeBaseWorkspaceId] = createSignal<string | null>(null);
  const [forkSource, setForkSource] = createSignal<
    { workspaceId: string; threadId: string; threadName: string } | null
  >(null);
  const [landPromptOpen, setLandPromptOpen] = createSignal(false);
  const [landWorkspaceId, setLandWorkspaceId] = createSignal<string | null>(null);
  const [landStackWorkspaceId, setLandStackWorkspaceId] = createSignal<string | null>(null);
  const [syncPromptOpen, setSyncPromptOpen] = createSignal(false);
  const [syncWorkspaceId, setSyncWorkspaceId] = createSignal<string | null>(null);
  const [syncStackWorkspaceId, setSyncStackWorkspaceId] = createSignal<string | null>(null);
  const [spotlightEnableWorkspaceId, setSpotlightEnableWorkspaceId] = createSignal<string | null>(null);
  const [reparentWorkspaceId, setReparentWorkspaceId] = createSignal<string | null>(null);
  const [baseRevsetPromptOpen, setBaseRevsetPromptOpen] = createSignal(false);
  const [baseRevsetWorkspaceId, setBaseRevsetWorkspaceId] = createSignal<string | null>(null);
  const [workspaceBaseRevsetPromptOpen, setWorkspaceBaseRevsetPromptOpen] = createSignal(false);
  const [workspaceBaseRevsetWorkspaceId, setWorkspaceBaseRevsetWorkspaceId] = createSignal<string | null>(null);
  const [bookmarkPromptOpen, setBookmarkPromptOpen] = createSignal(false);
  const [bookmarkPromptTitle, setBookmarkPromptTitle] = createSignal("New Bookmark");
  const [bookmarkPromptName, setBookmarkPromptName] = createSignal("");
  const [bookmarkPromptTargetRevset, setBookmarkPromptTargetRevset] = createSignal("@");
  const [bookmarkPromptNameReadOnly, setBookmarkPromptNameReadOnly] = createSignal(false);
  const [bookmarkRenameTarget, setBookmarkRenameTarget] = createSignal<JjBookmarkInfo | null>(null);
  const [bookmarkDeleteTarget, setBookmarkDeleteTarget] = createSignal<JjBookmarkInfo | null>(null);
  const [debugEntries, setDebugEntries] = createSignal<DebugEntry[]>([]);
  const [approvalPolicy, setApprovalPolicy] =
    createSignal<ApprovalPolicy>("on-request");
  const [accessMode, setAccessMode] = createSignal<AccessMode>("current");
  const [accessModeDirty, setAccessModeDirty] = createSignal(false);
  type RightPanelTab =
    | "info"
    | "stack"
    | "diff"
    | "files"
    | "tasks"
    | "prStack"
    | "issues"
    | "graph"
    | "bookmarks"
    | "terminal"
    | "context";
  const [rightPanelTab, setRightPanelTab] = createSignal<RightPanelTab>("info");
  const [isCompactLayout, setIsCompactLayout] = createSignal(
    typeof window !== "undefined" ? window.matchMedia("(max-width: 960px)").matches : false,
  );
  const [compactTab, setCompactTab] = createSignal<CompactNavTab>("chat");
  let composerTextarea: HTMLTextAreaElement | undefined;

  const rightPanelLabel = createMemo(() => {
    switch (rightPanelTab()) {
      case "info":
        return "Info";
      case "stack":
        return "Stack";
      case "diff":
        return "Diff";
      case "files":
        return "Files";
      case "tasks":
        return "Tasks";
      case "prStack":
        return "PR Stack";
      case "terminal":
        return "Terminal";
      case "graph":
        return "Graph";
      case "bookmarks":
        return "Bookmarks";
      case "issues":
        return "Issues";
      case "context":
        return "Context";
      default:
        return "Panel";
    }
  });

  const openRightPanelTab = (tab: RightPanelTab) => {
    setRightPanelTab(tab);
    if (isCompactLayout()) {
      setCompactTab("panel");
    }
  };

  let lastLoggedUiError: unknown = null;
  const reportUiError = (error: unknown) => {
    if (error === lastLoggedUiError) {
      return;
    }
    lastLoggedUiError = error;

    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    Promise.resolve().then(() => logFrontendError(message, stack));
  };

  const addDebugEntry = (entry: DebugEntry) => {
    setDebugEntries((prev) => [...prev, entry].slice(-300));
  };

  const appSettingsStore = createAppSettingsStore();

  onMount(() => {
    const mediaQuery = window.matchMedia("(max-width: 960px)");

    const update = () => setIsCompactLayout(mediaQuery.matches);
    update();

    mediaQuery.addEventListener("change", update);
    onCleanup(() => mediaQuery.removeEventListener("change", update));
  });

  createEffect(() => {
    const nextMode = appSettingsStore.settings().defaultAccessMode;
    if (!accessModeDirty()) {
      setAccessMode(nextMode);
    }
  });

  const handleCopyDebug = async () => {
    const entries = debugEntries();
    const text = entries
      .map((entry) => {
        const timestamp = new Date(entry.timestamp).toLocaleTimeString();
        const payload =
          entry.payload !== undefined
            ? typeof entry.payload === "string"
              ? entry.payload
              : JSON.stringify(entry.payload, null, 2)
            : "";
        return [entry.source.toUpperCase(), timestamp, entry.label, payload]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n");
    if (text) {
      await navigator.clipboard.writeText(text);
    }
  };

  const workspacesStore = createWorkspacesStore({ onDebug: addDebugEntry });

  createEffect(
    on(
      () => ({ compact: isCompactLayout(), hasWorkspace: !!workspacesStore.activeWorkspaceId() }),
      ({ compact, hasWorkspace }) => {
        if (!compact) {
          return;
        }
        if (!hasWorkspace && compactTab() !== "workspaces") {
          setCompactTab("workspaces");
        }
      },
      { defer: true },
    ),
  );
  const worktreeStackOpsStore = createWorktreeStackOpsStore({ onDebug: addDebugEntry });
  const workspaceTasksStore = createWorkspaceTasksStore({ onDebug: addDebugEntry });
  const terminalStore = createTerminalStore({ onDebug: addDebugEntry });
  const multiTerminalStore = createMultiTerminalStore({ onDebug: addDebugEntry });

  const ryuSummaryByWorkspaceId = createMemo(() => {
    const summaries: Record<
      string,
      {
        title: string | null;
        count: number;
        running: boolean;
        ok: boolean | null;
        needsPush: boolean;
        hasConflict: boolean;
      }
    > = {};

    for (const workspace of workspacesStore.workspaces()) {
      if (workspace.kind !== "main") {
        continue;
      }

      const run = workspaceTasksStore.runForWorkspaceTask(workspace.id, "ryu");
      if (!run) {
        continue;
      }

      const stdoutLines = run.output
        .filter((line) => line.stream === "stdout")
        .map((line) => line.data);
      const parsed = parseRyuStdout(stdoutLines);
      const markers = summarizeRyuMarkers(parsed.items);

      if (!run.running && run.ok !== false && parsed.items.length === 0) {
        continue;
      }

      summaries[workspace.id] = {
        title: parsed.title,
        count: parsed.items.length,
        running: run.running,
        ok: run.ok,
        needsPush: markers.needsPush,
        hasConflict: markers.hasConflict,
      };
    }

    return summaries;
  });
  const fileViewerStore = createFileViewerStore({
    activeWorkspace: workspacesStore.activeWorkspace,
    enabled: () => rightPanelTab() === "files",
  });
  const fileTabsStore = createFileTabsStore();
  const pathPreviewStore = createWorkspacePathPreviewStore({
    activeWorkspace: workspacesStore.activeWorkspace,
  });
  const worktreeBaseWorkspace = () => {
    const id = worktreeBaseWorkspaceId();
    if (!id) return null;
    return workspacesStore.workspaces().find((workspace) => workspace.id === id) ?? null;
  };
  const landWorkspace = () => {
    const id = landWorkspaceId();
    if (!id) return null;
    return workspacesStore.workspaces().find((workspace) => workspace.id === id) ?? null;
  };
  const landStackWorkspace = () => {
    const id = landStackWorkspaceId();
    if (!id) return null;
    return workspacesStore.workspaces().find((workspace) => workspace.id === id) ?? null;
  };
  const landDestinationWorkspace = () => {
    const entry = landWorkspace();
    if (!entry) return null;
    const destinationId = entry.base_id ?? entry.parent_id ?? null;
    if (!destinationId) return null;
    return workspacesStore.workspaces().find((workspace) => workspace.id === destinationId) ?? null;
  };
  const syncWorkspace = () => {
    const id = syncWorkspaceId();
    if (!id) return null;
    return workspacesStore.workspaces().find((workspace) => workspace.id === id) ?? null;
  };
  const syncStackWorkspace = () => {
    const id = syncStackWorkspaceId();
    if (!id) return null;
    return workspacesStore.workspaces().find((workspace) => workspace.id === id) ?? null;
  };
  const syncDestinationWorkspace = () => {
    const entry = syncWorkspace();
    if (!entry) return null;
    const destinationId = entry.base_id ?? entry.parent_id ?? null;
    if (!destinationId) return null;
    return workspacesStore.workspaces().find((workspace) => workspace.id === destinationId) ?? null;
  };
  const baseRevsetWorktree = () => {
    const id = baseRevsetWorkspaceId();
    if (!id) return null;
    return workspacesStore.workspaces().find((workspace) => workspace.id === id) ?? null;
  };
  const workspaceBaseRevsetWorkspace = () => {
    const id = workspaceBaseRevsetWorkspaceId();
    if (!id) return null;
    return workspacesStore.workspaces().find((workspace) => workspace.id === id) ?? null;
  };
  const baseRevsetDestinationWorkspace = () => {
    const entry = baseRevsetWorktree();
    if (!entry) return null;
    const destinationId = entry.base_id ?? entry.parent_id ?? null;
    if (!destinationId) return null;
    return workspacesStore.workspaces().find((workspace) => workspace.id === destinationId) ?? null;
  };
  const bookmarksBaseWorkspace = () => {
    const workspace = workspacesStore.activeWorkspace();
    if (!workspace) {
      return null;
    }
    if (workspace.kind !== "worktree") {
      return workspace;
    }
    const destinationId = workspace.base_id ?? workspace.parent_id ?? null;
    if (!destinationId) {
      return workspace;
    }
    return workspacesStore.workspaces().find((entry) => entry.id === destinationId) ?? workspace;
  };

  const vcsStatusStore = createVcsStatusStore(workspacesStore.activeWorkspace);
  const worktreeDivergenceStore = createWorktreeDivergenceStore({
    workspaces: workspacesStore.workspaces,
    activeWorkspace: workspacesStore.activeWorkspace,
  });
  const resolveGroupMainWorkspace = (workspace: WorkspaceInfo): WorkspaceInfo | null => {
    const workspaces = workspacesStore.workspaces();
    const visited = new Set<string>();
    let current: WorkspaceInfo | undefined = workspace;

    while (current && current.kind === "worktree") {
      if (visited.has(current.id)) {
        break;
      }
      visited.add(current.id);

      const nextId: string | null = current.parent_id ?? current.base_id ?? null;
      if (!nextId) {
        break;
      }
      current = workspaces.find((entry) => entry.id === nextId);
    }

    return current && current.kind === "main" ? current : null;
  };
  const spotlightSettingsWorkspace = createMemo(() => {
    const workspace = workspacesStore.activeWorkspace();
    if (!workspace) {
      return null;
    }
    return resolveGroupMainWorkspace(workspace);
  });
  const worktreeChildrenByBaseId = createMemo(() => {
    const map = new Map<string, WorkspaceInfo[]>();
    for (const workspace of workspacesStore.workspaces()) {
      if (workspace.kind !== "worktree") {
        continue;
      }
      const baseId = workspace.base_id ?? null;
      if (!baseId) {
        continue;
      }
      const list = map.get(baseId) ?? [];
      list.push(workspace);
      map.set(baseId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return map;
  });
  const listWorktreeDescendants = (workspaceId: string): WorkspaceInfo[] => {
    const map = worktreeChildrenByBaseId();
    const result: WorkspaceInfo[] = [];
    const seen = new Set<string>();

    const walk = (id: string) => {
      const children = map.get(id) ?? [];
      for (const child of children) {
        if (seen.has(child.id)) {
          continue;
        }
        seen.add(child.id);
        result.push(child);
        walk(child.id);
      }
    };

    walk(workspaceId);
    return result;
  };
  const listWorktreeDescendantsPostOrder = (workspaceId: string): WorkspaceInfo[] => {
    const map = worktreeChildrenByBaseId();
    const result: WorkspaceInfo[] = [];
    const seen = new Set<string>();

    const walk = (id: string) => {
      const children = map.get(id) ?? [];
      for (const child of children) {
        if (seen.has(child.id)) {
          continue;
        }
        seen.add(child.id);
        walk(child.id);
        result.push(child);
      }
    };

    walk(workspaceId);
    return result;
  };
  const worktreeDescendantCountByWorkspaceId = createMemo(() => {
    const counts: Record<string, number> = {};
    for (const workspace of workspacesStore.workspaces()) {
      if (workspace.kind !== "worktree") {
        continue;
      }
      counts[workspace.id] = listWorktreeDescendants(workspace.id).length;
    }
    return counts;
  });
  const activeSyncStackCount = createMemo(() => {
    const workspace = workspacesStore.activeWorkspace();
    if (!workspace || workspace.kind !== "worktree") {
      return 0;
    }
    return listWorktreeDescendants(workspace.id).length;
  });
  const activeLandStackCount = createMemo(() => activeSyncStackCount());
  const stackRootWorkspace = createMemo(() => {
    const active = workspacesStore.activeWorkspace();
    if (!active) {
      return null;
    }
    return resolveGroupMainWorkspace(active);
  });
  const stackRows = createMemo(() => {
    const root = stackRootWorkspace();
    if (!root) {
      return [] as { workspace: WorkspaceInfo; depth: number }[];
    }

    const map = worktreeChildrenByBaseId();
    const result: { workspace: WorkspaceInfo; depth: number }[] = [];
    const seen = new Set<string>();

    const walk = (id: string, depth: number) => {
      const children = map.get(id) ?? [];
      for (const child of children) {
        if (seen.has(child.id)) {
          continue;
        }
        seen.add(child.id);
        result.push({ workspace: child, depth });
        walk(child.id, depth + 1);
      }
    };

    walk(root.id, 0);
    return result;
  });
  const syncStackTargets = createMemo(() => {
    const workspace = syncStackWorkspace();
    if (!workspace || workspace.kind !== "worktree") {
      return [] as WorkspaceInfo[];
    }
    return [workspace, ...listWorktreeDescendants(workspace.id)];
  });
  const landStackTargets = createMemo(() => {
    const workspace = landStackWorkspace();
    if (!workspace || workspace.kind !== "worktree") {
      return [] as WorkspaceInfo[];
    }
    return [...listWorktreeDescendantsPostOrder(workspace.id), workspace];
  });
  const reparentWorktree = createMemo(() => {
    const id = reparentWorkspaceId();
    if (!id) {
      return null;
    }
    const entry = workspacesStore.workspaces().find((workspace) => workspace.id === id) ?? null;
    if (!entry || entry.kind !== "worktree") {
      return null;
    }
    return entry;
  });
  const reparentDescendants = createMemo(() => {
    const worktree = reparentWorktree();
    if (!worktree) {
      return [] as WorkspaceInfo[];
    }
    return listWorktreeDescendants(worktree.id);
  });
  const reparentBases = createMemo(() => {
    const worktree = reparentWorktree();
    if (!worktree) {
      return [] as WorkspaceInfo[];
    }

    const groupMain = resolveGroupMainWorkspace(worktree);
    const descendants = new Set(reparentDescendants().map((entry) => entry.id));
    descendants.add(worktree.id);

    const candidates: WorkspaceInfo[] = [];
    if (groupMain) {
      candidates.push(groupMain);
    }

    for (const entry of workspacesStore.workspaces()) {
      if (entry.kind !== "worktree") {
        continue;
      }
      if (groupMain && entry.parent_id !== groupMain.id) {
        continue;
      }
      if (descendants.has(entry.id)) {
        continue;
      }
      candidates.push(entry);
    }

    const seen = new Set<string>();
    return candidates.filter((entry) => {
      if (seen.has(entry.id)) {
        return false;
      }
      seen.add(entry.id);
      return true;
    });
  });
  const gitHubIssuesStore = createGitHubIssuesStore({
    activeWorkspace: workspacesStore.activeWorkspace,
    enabled: () => rightPanelTab() === "issues",
  });
  const jjGraphStore = createJjGraphStore({
    activeWorkspace: workspacesStore.activeWorkspace,
    enabled: () => rightPanelTab() === "graph" || rightPanelTab() === "info",
  });
  const jjBookmarksStore = createJjBookmarksStore(
    bookmarksBaseWorkspace,
    () => rightPanelTab() === "bookmarks" || rightPanelTab() === "info",
  );
  const jjGraphPreviewStore = createJjGraphPreviewStore({
    workspaces: workspacesStore.workspaces,
  });
  const worktreeCreateLogStore = createVcsLogStore(
    () => worktreeBaseWorkspace() ?? undefined,
    () => worktreePromptOpen(),
  );
  const worktreeCreateLogState = () => worktreeCreateLogStore.state();
  const baseRevsetLogStore = createVcsLogStore(
    () => baseRevsetDestinationWorkspace() ?? undefined,
    () => baseRevsetPromptOpen(),
  );
  const baseRevsetLogState = () => baseRevsetLogStore.state();
  const workspaceBaseRevsetLogStore = createVcsLogStore(
    () => workspaceBaseRevsetWorkspace() ?? undefined,
    () => workspaceBaseRevsetPromptOpen(),
  );
  const workspaceBaseRevsetLogState = () => workspaceBaseRevsetLogStore.state();

  const bookmarksLogStore = createVcsLogStore(
    () => bookmarksBaseWorkspace() ?? undefined,
    () => rightPanelTab() === "bookmarks",
  );
  const bookmarksLogState = () => bookmarksLogStore.state();

  const infoBaseLogStore = createVcsLogStore(
    () => bookmarksBaseWorkspace() ?? undefined,
    () => rightPanelTab() === "info",
  );
  const infoBaseLogState = () => infoBaseLogStore.state();

  const modelsStore = createModelsStore({
    activeWorkspace: workspacesStore.activeWorkspace,
    onDebug: addDebugEntry,
  });

  const skillsStore = createSkillsStore({
    activeWorkspace: workspacesStore.activeWorkspace,
    onDebug: addDebugEntry,
  });

  const promptsStore = createPromptsStore({
    activeWorkspace: workspacesStore.activeWorkspace,
    enabled: promptsOpen,
    onDebug: addDebugEntry,
  });

  const resolvedModel = () => modelsStore.selectedModel()?.model ?? null;
  const fileStatus = () => {
    const files = vcsStatusStore.status().files;
    return files.length > 0
      ? `${files.length} file${files.length === 1 ? "" : "s"} changed`
      : "Working tree clean";
  };
  const activeWorktreeDivergence = () => {
    const workspace = workspacesStore.activeWorkspace();
    if (!workspace) {
      return null;
    }
    return worktreeDivergenceStore.entryByWorkspaceId()[workspace.id]?.data ?? null;
  };
  const syncStackMessage = createMemo(() => {
    const targets = syncStackTargets();
    if (targets.length === 0) {
      return "No downstream worktrees found.";
    }
    const root = targets[0];
    const children = targets.slice(1);
    const list = targets.map((workspace) => `- ${workspace.name}`).join("\n");
    return `This will sync "${root.name}"${
      children.length ? ` and ${children.length} downstream worktree(s)` : ""
    }.\n\nWorktrees:\n${list}\n\nRuns \`jj rebase -b @ -o <base>\` for each worktree.`;
  });
  const landStackMessage = createMemo(() => {
    const targets = landStackTargets();
    if (targets.length === 0) {
      return "No downstream worktrees found.";
    }

    const root = targets[targets.length - 1];
    const children = targets.slice(0, -1);
    const list = targets.map((workspace) => `- ${workspace.name}`).join("\n");

    return `This will land "${root.name}"${
      children.length ? ` and ${children.length} downstream worktree(s)` : ""
    }.\n\nWorktrees (land order):\n${list}\n\nFor each worktree:\n- Sync against its base\n- Squash changes into the base working copy\n- Delete the worktree directory`;
  });
  const spotlightEnableTarget = createMemo(() => {
    const id = spotlightEnableWorkspaceId();
    if (!id) {
      return null;
    }
    return workspacesStore.workspaces().find((workspace) => workspace.id === id) ?? null;
  });
  const spotlightEnableMessage = createMemo(() => {
    const root = spotlightEnableTarget();
    if (!root) {
      return "";
    }
    return `Spotlight mode makes “Run” execute in the repository root by temporarily switching the root working copy to the active workspace snapshot (via \`jj edit\`), running the configured command, then restoring the root.\n\nEnable Spotlight mode for "${root.name}"?`;
  });

  const handleFetchRemote = async (workspace: WorkspaceInfo) => {
    try {
      const output = await jjBookmarksStore.fetchRemote();
      addDebugEntry({
        id: `${Date.now()}-client-jj-fetch`,
        timestamp: Date.now(),
        source: "client",
        label: "jj git fetch",
        payload: output.trim() ? output : "ok",
      });
      await worktreeDivergenceStore.refresh(workspace.id);
      await bookmarksLogStore.refresh();
      await jjGraphStore.refresh();
    } catch (err) {
      addDebugEntry({
        id: `${Date.now()}-client-jj-fetch-error`,
        timestamp: Date.now(),
        source: "error",
        label: "jj git fetch error",
        payload: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };

  const handlePushTracked = async (workspace: WorkspaceInfo) => {
    try {
      const output = await jjBookmarksStore.pushTracked();
      addDebugEntry({
        id: `${Date.now()}-client-jj-push-tracked`,
        timestamp: Date.now(),
        source: "client",
        label: "jj git push --tracked",
        payload: output.trim() ? output : "ok",
      });
      await worktreeDivergenceStore.refresh(workspace.id);
      await bookmarksLogStore.refresh();
      await jjGraphStore.refresh();
    } catch (err) {
      addDebugEntry({
        id: `${Date.now()}-client-jj-push-tracked-error`,
        timestamp: Date.now(),
        source: "error",
        label: "jj git push --tracked error",
        payload: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };

  const handlePushDeleted = async (workspace: WorkspaceInfo) => {
    try {
      const output = await jjBookmarksStore.pushDeleted();
      addDebugEntry({
        id: `${Date.now()}-client-jj-push-deleted`,
        timestamp: Date.now(),
        source: "client",
        label: "jj git push --deleted",
        payload: output.trim() ? output : "ok",
      });
      await worktreeDivergenceStore.refresh(workspace.id);
      await bookmarksLogStore.refresh();
      await jjGraphStore.refresh();
    } catch (err) {
      addDebugEntry({
        id: `${Date.now()}-client-jj-push-deleted-error`,
        timestamp: Date.now(),
        source: "error",
        label: "jj git push --deleted error",
        payload: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };

  const handleRunRyu = async (workspaceId: string, action: RyuAction, options: RyuOptions) => {
    const args: string[] = [];
    const remote = options.remote.trim();
    const remoteArgs = remote && remote !== "origin" ? ["--remote", remote] : [];

    switch (action) {
      case "status":
        break;
      case "trackAll":
        args.push("track", "--all", ...remoteArgs);
        break;
      case "submit":
        args.push("submit");
        if (options.dryRun) args.push("--dry-run");
        if (options.confirm) args.push("--confirm");
        if (options.draft) args.push("--draft");
        if (options.publish) args.push("--publish");
        if (options.updateOnly) args.push("--update-only");
        args.push(...remoteArgs);
        break;
      case "sync":
        args.push("sync", ...remoteArgs);
        break;
      case "authGithub":
        args.push("auth", "github", "test");
        break;
      case "authGitlab":
        args.push("auth", "gitlab", "test");
        break;
    }

    addDebugEntry({
      id: `${Date.now()}-client-ryu-${action}`,
      timestamp: Date.now(),
      source: "client",
      label: `ryu ${args.join(" ") || "(status)"}`,
      payload: { workspaceId, args },
    });

    try {
      await runRyu(workspaceId, args);
    } catch (err) {
      addDebugEntry({
        id: `${Date.now()}-client-ryu-${action}-error`,
        timestamp: Date.now(),
        source: "error",
        label: `ryu ${action} error`,
        payload: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleEditBaseRevset = (workspace: WorkspaceInfo) => {
    if (workspace.kind === "worktree") {
      setBaseRevsetWorkspaceId(workspace.id);
      setBaseRevsetPromptOpen(true);
      return;
    }
    setWorkspaceBaseRevsetWorkspaceId(workspace.id);
    setWorkspaceBaseRevsetPromptOpen(true);
  };

  const handleSetBaseRevset = async (workspace: WorkspaceInfo, revset: string) => {
    try {
      if (workspace.kind === "worktree") {
        await workspacesStore.updateWorktreeBaseRevset(workspace.id, revset);
        await worktreeDivergenceStore.refresh(workspace.id);
        await jjGraphStore.refresh();
        return;
      }

      await workspacesStore.updateWorkspaceBaseRevset(workspace.id, revset);
      await worktreeDivergenceStore.refresh(workspace.id);
    } catch (err) {
      addDebugEntry({
        id: `${Date.now()}-client-base-revset-error`,
        timestamp: Date.now(),
        source: "error",
        label: "baseRevset/setBaseRevset error",
        payload: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };

  // activeThreadId will be set after threadsStore is created
  let getActiveThreadId: () => string | null = () => null;

  const usageStore = createUsageStore(() => getActiveThreadId());

  const threadsStore = createThreadsStore({
    activeWorkspace: workspacesStore.activeWorkspace,
    activeWorkspaceId: workspacesStore.activeWorkspaceId,
    onWorkspaceConnected: workspacesStore.markWorkspaceConnected,
    onDebug: addDebugEntry,
    model: resolvedModel,
    effort: modelsStore.selectedEffort,
    onMessageActivity: vcsStatusStore.refresh,
    onTurnUsage: (_workspaceId, threadId, usage) => {
      usageStore.recordTurnUsage(threadId, usage);
    },
  });

  const threadLayoutStore = createThreadLayoutStore({
    activeWorkspaceId: workspacesStore.activeWorkspaceId,
  });

  // Connect the reference now that threadsStore exists
  getActiveThreadId = threadsStore.activeThreadId;

  createEffect(
    on(
      () => ({ workspaceId: workspacesStore.activeWorkspaceId(), threadId: threadsStore.activeThreadId() }),
      ({ workspaceId, threadId }) => {
        if (!workspaceId || !threadId) {
          return;
        }
        threadLayoutStore.ensureThreadOpen(workspaceId, threadId);
      },
      { defer: true },
    ),
  );

  createEffect(
    on(
      () => ({ workspaceId: workspacesStore.activeWorkspaceId(), focusedThreadId: threadLayoutStore.focusedThreadId() }),
      ({ workspaceId, focusedThreadId }) => {
        if (!workspaceId) {
          return;
        }

        const currentActive = threadsStore.activeThreadId();
        if (focusedThreadId) {
          if (currentActive !== focusedThreadId) {
            threadsStore.setActiveThreadId(focusedThreadId, workspaceId);
          }
          return;
        }

        if (currentActive) {
          threadsStore.setActiveThreadId(null, workspaceId);
        }
      },
      { defer: true },
    ),
  );

  const composerDraftsStore = createComposerDraftsStore({
    activeThreadId: threadsStore.activeThreadId,
    activeWorkspaceId: workspacesStore.activeWorkspaceId,
  });
  const input = composerDraftsStore.text;
  const setInput = (next: string | ((prev: string) => string)) => {
    composerDraftsStore.setText(next);
  };
  const steerEnabled = () => appSettingsStore.settings().experimentalSteerEnabled;
  const activeThreadStatus = createMemo(() => {
    const threadId = threadsStore.activeThreadId();
    if (!threadId) {
      return null;
    }
    return threadsStore.threadStatusById()[threadId] ?? null;
  });

  const activeThreadNameById = createMemo<Record<string, string>>(() => {
    const workspaceId = workspacesStore.activeWorkspaceId();
    if (!workspaceId) {
      return {};
    }
    const threads = threadsStore.threadsByWorkspace()[workspaceId] ?? [];
    const map: Record<string, string> = {};
    for (const thread of threads) {
      map[thread.id] = thread.name;
    }
    return map;
  });

  const workspaceBusyById = createMemo(() => {
    const threadsByWorkspace = threadsStore.threadsByWorkspace();
    const statusByThreadId = threadsStore.threadStatusById();
    const result: Record<string, boolean> = {};

    for (const [workspaceId, threads] of Object.entries(threadsByWorkspace)) {
      result[workspaceId] = threads.some(
        (thread) => statusByThreadId[thread.id]?.isProcessing ?? false,
      );
    }

    return result;
  });

  const isWorkspaceBusy = (workspaceId: string) =>
    workspaceBusyById()[workspaceId] ?? false;

  const assertWorkspacesIdle = (
    workspaceIds: Array<string | null | undefined>,
    actionLabel: string,
  ) => {
    const unique = Array.from(
      new Set(workspaceIds.filter((id): id is string => !!id)),
    );
    const busy = unique.filter((id) => isWorkspaceBusy(id));
    if (!busy.length) {
      return;
    }
    const busyNames = busy
      .map((id) => workspacesStore.workspaces().find((ws) => ws.id === id)?.name ?? id)
      .join(", ");
    throw new Error(
      `Cannot ${actionLabel} while an agent is running in: ${busyNames}. Stop the running turn(s) first.`,
    );
  };

  const queuedSendStore = createQueuedSendStore({
    activeThreadId: threadsStore.activeThreadId,
    isProcessing: () => activeThreadStatus()?.isProcessing ?? false,
    steerEnabled,
    sendNow: async (text, options) => {
      const workspace = workspacesStore.activeWorkspace();
      if (workspace && !workspace.connected) {
        await workspacesStore.connectWorkspace(workspace);
      }
      await threadsStore.sendUserMessage(text, options);
    },
  });

  setupWindowDrag("titlebar");

  const { sizes, setSizes } = createResizableSizes();
  const resizableSizes = createMemo(() => {
    const current = sizes();
    if (workspacesStore.activeWorkspace()) {
      return current;
    }
    return [current[0], current[1] + current[2]];
  });

  const sizesMatch = (a: number[], b: number[]) => {
    if (a.length !== b.length) return false;
    return a.every((value, index) => Math.abs(value - b[index]) < 0.0005);
  };

  const handleResizableSizesChange = (next: number[]) => {
    // Ensure we have a plain array of numbers (corvu may pass proxy objects)
    const nextArray = [...next].map(Number);

    if (workspacesStore.activeWorkspace()) {
      if (!sizesMatch(sizes(), nextArray)) {
        setSizes(nextArray);
      }
      return;
    }

    if (nextArray.length !== 2) {
      return;
    }

    const current = sizes();
    const sidebar = nextArray[0];
    const right = current[2];
    const main = 1 - sidebar - right;
    const updated = [sidebar, main, right];
    if (!sizesMatch(current, updated)) {
      setSizes(updated);
    }
  };

  const restoredWorkspaces = new Set<string>();

  createEffect(
    on(
      () => [workspacesStore.hasLoaded(), workspacesStore.workspaces()] as const,
      ([hasLoaded, workspaces]) => {
        if (!hasLoaded) {
          return;
        }
        workspaces.forEach((workspace) => {
          if (restoredWorkspaces.has(workspace.id)) {
            return;
          }
          restoredWorkspaces.add(workspace.id);
          (async () => {
            try {
              if (!workspace.connected) {
                await workspacesStore.connectWorkspace(workspace);
              }
              await threadsStore.listThreadsForWorkspace(workspace);
            } catch {
              // Silent: connection errors show in debug panel.
            }
          })();
        });
      }
    )
  );

  let refreshOnFocusInFlight = false;
  createEffect(() => {
    const refresh = () => {
      if (refreshOnFocusInFlight) {
        return;
      }
      refreshOnFocusInFlight = true;
      void (async () => {
        try {
          let latestWorkspaces = workspacesStore.workspaces();
          try {
            latestWorkspaces = await workspacesStore.refreshWorkspaces();
          } catch {
            // Silent: refresh errors show in debug panel.
          }

          const connected = latestWorkspaces.filter((entry) => entry.connected);
          await Promise.allSettled(
            connected.map((workspace) => threadsStore.listThreadsForWorkspace(workspace)),
          );
        } finally {
          refreshOnFocusInFlight = false;
        }
      })();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    onCleanup(() => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    });
  });

  async function handleOpenProject() {
    const workspace = await workspacesStore.addWorkspace();
    if (workspace) {
      threadsStore.setActiveThreadId(null, workspace.id);
    }
  }

  async function handleAddWorkspace() {
    const workspace = await workspacesStore.addWorkspace();
    if (workspace) {
      threadsStore.setActiveThreadId(null, workspace.id);
    }
  }

  async function handleAddAgent(workspace: WorkspaceInfo) {
    workspacesStore.setActiveWorkspaceId(workspace.id);
    if (!workspace.connected) {
      await workspacesStore.connectWorkspace(workspace);
    }
    await threadsStore.startThreadForWorkspace(workspace.id);

    setTimeout(() => {
      composerTextarea?.focus();
    }, 0);
  }

  async function handleSend(attachments: import("./types").Attachment[] = []) {
    const text = input();
    if (!text.trim() && attachments.length === 0) {
      return;
    }

    await queuedSendStore.sendOrQueue(text, {
      attachments,
      approvalPolicy: approvalPolicy(),
      accessMode: accessMode(),
    });

    composerDraftsStore.clear();
  }

  async function handleQueue() {
    const text = input();
    const attachments = composerDraftsStore.attachments();
    if (!text.trim() && attachments.length === 0) {
      return;
    }

    const result = await queuedSendStore.queue(text, {
      attachments,
      approvalPolicy: approvalPolicy(),
      accessMode: accessMode(),
    });

    if (result === "queued") {
      composerDraftsStore.clear();
    }
  }

  async function handleForkThread(workspaceId: string, threadId: string, threadName: string) {
    const workspace = workspacesStore.workspaces().find((entry) => entry.id === workspaceId);
    if (!workspace) {
      return;
    }

    if (isCompactLayout()) {
      setCompactTab("chat");
    }

    workspacesStore.setActiveWorkspaceId(workspaceId);
    if (!workspace.connected) {
      await workspacesStore.connectWorkspace(workspace);
    }

    const forkedThreadId = await threadsStore.forkThreadInWorkspace(
      workspaceId,
      threadId,
      threadName,
    );
    if (!forkedThreadId) {
      return;
    }

    setTimeout(() => {
      composerTextarea?.focus();
    }, 0);
  }

  function closePromptsBrowser() {
    setPromptsOpen(false);
    setPromptsQuery("");
    promptsStore.clearError();
    setTimeout(() => {
      composerTextarea?.focus();
    }, 0);
  }

  function openPromptsBrowser(query: string) {
    setPromptsQuery(query);
    setPromptsOpen(true);
    promptsStore.clearError();
    void promptsStore.refreshPrompts().catch(() => {});
  }

  async function handleInsertPrompt(prompt: PromptOption) {
    const text = (prompt.prompt ?? prompt.name).trim();
    if (!text) {
      closePromptsBrowser();
      return;
    }

    const textarea = composerTextarea;
    const current = input();
    const start = textarea?.selectionStart ?? current.length;
    const end = textarea?.selectionEnd ?? current.length;

    const before = current.slice(0, start);
    const after = current.slice(end);

    const prefix = before && !before.endsWith("\n") ? "\n\n" : "";
    const suffix = after && !after.startsWith("\n") ? "\n\n" : "";

    const next = `${before}${prefix}${text}${suffix}${after}`;
    setInput(next);
    closePromptsBrowser();

    requestAnimationFrame(() => {
      const nextTextarea = composerTextarea;
      if (!nextTextarea) {
        return;
      }
      const cursor = (before + prefix + text).length;
      nextTextarea.focus();
      nextTextarea.setSelectionRange(cursor, cursor);
    });
  }

  function handleSlashCommand(command: string, args: string) {
    // Handle slash commands
    switch (command) {
      case "prompts":
        openPromptsBrowser(args);
        break;
      case "review":
        setInput(`Review recent changes${args ? `: ${args}` : ""}`);
        void handleSend(composerDraftsStore.attachments());
        break;
      case "compact":
        // TODO: Implement conversation compaction
        addDebugEntry({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          source: "client",
          label: "Slash command: /compact",
          payload: { args },
        });
        break;
      case "clear":
        // Clear is handled by starting a new thread
        threadsStore.startThreadForWorkspace(workspacesStore.activeWorkspaceId()!);
        break;
      case "help":
        setInput("What commands and features are available?");
        void handleSend(composerDraftsStore.attachments());
        break;
      default:
        if (command.startsWith("prompts:")) {
          const suffix = command.slice("prompts:".length);
          const query = [suffix, args].filter(Boolean).join(" ").trim();
          openPromptsBrowser(query);
          break;
        }
        // Unknown command, treat as message
        setInput(`/${command} ${args}`.trim());
        void handleSend(composerDraftsStore.attachments());
    }
  }

  async function handleShellCommand(command: string) {
    // Prefix with ! to indicate shell command
    setInput(`Run this shell command: ${command}`);
    await handleSend();
  }

  function handleSelectSkill(name: string) {
    const snippet = `$${name}`;
    setInput((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) {
        return snippet + " ";
      }
      if (trimmed.includes(snippet)) {
        return prev;
      }
      return `${prev.trim()} ${snippet} `;
    });
  }

  createEffect(() => {
    const workspace = workspacesStore.activeWorkspace();
    const enabled =
      !!workspace &&
      !settingsOpen() &&
      !promptsOpen() &&
      !worktreePromptOpen() &&
      !landPromptOpen() &&
      !syncPromptOpen() &&
      !baseRevsetPromptOpen() &&
      !workspaceBaseRevsetPromptOpen() &&
      !clonePromptOpen();

    if (!workspace || !enabled) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const modifierKey = isMac ? event.metaKey : event.ctrlKey;
      if (!modifierKey) {
        return;
      }
      if (event.defaultPrevented) {
        return;
      }
      if (event.key === "n") {
        event.preventDefault();
        void handleAddAgent(workspace);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
  });

  const SidebarView = () => (
    <Sidebar
      workspaces={workspacesStore.workspaces}
      threadsByWorkspace={threadsStore.threadsByWorkspace}
      threadStatusById={threadsStore.threadStatusById}
      activeWorkspaceId={workspacesStore.activeWorkspaceId}
      activeThreadId={threadsStore.activeThreadId}
      worktreeDivergenceByWorkspaceId={worktreeDivergenceStore.entryByWorkspaceId}
      worktreeDescendantCountByWorkspaceId={worktreeDescendantCountByWorkspaceId}
      ryuSummaryByWorkspaceId={ryuSummaryByWorkspaceId}
      jjGraphPreviewByWorkspaceId={jjGraphPreviewStore.entryByWorkspaceId}
      onShowWorkspaceGraphPreview={(workspaceId) => {
        void jjGraphPreviewStore.refresh(workspaceId);
      }}
      onOpenStackTab={() => openRightPanelTab("stack")}
      onOpenPrStackTab={() => openRightPanelTab("prStack")}
      onAddWorkspace={handleAddWorkspace}
      onOpenSettings={() => setSettingsOpen(true)}
      onSelectWorkspace={workspacesStore.setActiveWorkspaceId}
      onConnectWorkspace={workspacesStore.connectWorkspace}
      onAddAgent={(workspace) => {
        void handleAddAgent(workspace);
        if (isCompactLayout()) {
          setCompactTab("chat");
        }
      }}
      onAddWorktreeAgent={(workspace) => {
        setWorktreeBaseWorkspaceId(workspace.id);
        setWorktreePromptOpen(true);
      }}
      onLandWorktree={(workspace) => {
        setLandWorkspaceId(workspace.id);
        setLandPromptOpen(true);
      }}
      onLandWorktreeStack={(workspace) => {
        setLandStackWorkspaceId(workspace.id);
      }}
      onReparentWorktree={(workspace) => {
        setReparentWorkspaceId(workspace.id);
      }}
      onSyncWorktree={(workspace) => {
        setSyncWorkspaceId(workspace.id);
        setSyncPromptOpen(true);
      }}
      onSyncWorktreeStack={(workspace) => {
        setSyncStackWorkspaceId(workspace.id);
      }}
      onEditWorktreeBaseRevset={(workspace) => {
        setBaseRevsetWorkspaceId(workspace.id);
        setBaseRevsetPromptOpen(true);
      }}
      onEditWorkspaceBaseRevset={(workspace) => {
        setWorkspaceBaseRevsetWorkspaceId(workspace.id);
        setWorkspaceBaseRevsetPromptOpen(true);
      }}
      onSelectThread={(workspaceId, threadId) => {
        workspacesStore.setActiveWorkspaceId(workspaceId);
        threadLayoutStore.ensureThreadOpen(workspaceId, threadId);
        threadsStore.setActiveThreadId(threadId, workspaceId);
        if (isCompactLayout()) {
          setCompactTab("chat");
        }
      }}
      onForkThread={(workspaceId, threadId, threadName) => {
        if (isCompactLayout()) {
          setCompactTab("chat");
        }
        void handleForkThread(workspaceId, threadId, threadName);
      }}
      onForkThreadToWorktree={(workspaceId, threadId, threadName) => {
        setForkSource({ workspaceId, threadId, threadName });
        setWorktreeBaseWorkspaceId(workspaceId);
        setWorktreePromptOpen(true);
      }}
      onDeleteThread={(workspaceId, threadId) => {
        threadLayoutStore.closeThread(workspaceId, threadId);
        threadsStore.removeThread(workspaceId, threadId);
      }}
      onDeleteWorkspace={(workspaceId) => {
        workspacesStore.removeWorkspace(workspaceId);
      }}
      onToggleWorkspaceCollapsed={(workspaceId, collapsed) => {
        workspacesStore.setWorkspaceSidebarCollapsed(workspaceId, collapsed);
      }}
      onRenameWorkspace={(workspaceId, newName) => {
        workspacesStore.renameWorkspace(workspaceId, newName);
      }}
      onRenameThread={(workspaceId, threadId, newName) => {
        threadsStore.renameThread(workspaceId, threadId, newName);
      }}
      onReorderWorkspace={(workspaceId, toIndex) => {
        workspacesStore.reorderWorkspace(workspaceId, toIndex);
      }}
    />
  );

  const MainView = (props: { compact: boolean }) => (
    <section class="main" classList={{ "compact-main": props.compact }}>
      <Show
        when={workspacesStore.activeWorkspace()}
        fallback={
          <Home
            onOpenProject={handleOpenProject}
            onAddWorkspace={handleAddWorkspace}
            onCloneRepository={() => setClonePromptOpen(true)}
          />
        }
      >
        {(workspace) => (
          <>
            <div class="main-topbar">
              <MainHeader
                workspace={workspace()}
                branchName={vcsStatusStore.status().branchName || "unknown"}
                divergence={activeWorktreeDivergence()}
              />
              <div class="actions">
                <TokenUsage
                  currentUsage={usageStore.currentTurnUsage}
                  threadUsage={usageStore.activeThreadUsage}
                  sessionTotals={usageStore.totalSessionTokens}
                />
                <button
                  class="ghost icon-button"
                  onClick={() => setDebugOpen((prev) => !prev)}
                  aria-label="Debug"
                >
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M9 7.5V6.5a3 3 0 0 1 6 0v1"
                      stroke="currentColor"
                      stroke-width="1.4"
                      stroke-linecap="round"
                    />
                    <rect
                      x="7"
                      y="7.5"
                      width="10"
                      height="9"
                      rx="3"
                      stroke="currentColor"
                      stroke-width="1.4"
                    />
                    <path
                      d="M4 12h3m10 0h3M6 8l2 2m8-2-2 2M6 16l2-2m8 2-2-2"
                      stroke="currentColor"
                      stroke-width="1.4"
                      stroke-linecap="round"
                    />
                    <circle cx="10" cy="12" r="0.8" fill="currentColor" />
                    <circle cx="14" cy="12" r="0.8" fill="currentColor" />
                  </svg>
                </button>
              </div>
            </div>

            <div class="content">
              <ChatSplitView
                workspaceId={workspacesStore.activeWorkspaceId}
                split={() => threadLayoutStore.activeLayout().split}
                activePane={() => threadLayoutStore.activeLayout().activePane}
                left={() => threadLayoutStore.activeLayout().left}
                right={() => threadLayoutStore.activeLayout().right}
                itemsByThread={threadsStore.itemsByThread}
                threadNameById={activeThreadNameById}
                threadStatusById={threadsStore.threadStatusById}
                onFocusPane={(pane) => {
                  const workspaceId = workspacesStore.activeWorkspaceId();
                  if (!workspaceId) return;
                  threadLayoutStore.setActivePane(workspaceId, pane);
                }}
                onSelectThread={(threadId, pane) => {
                  const workspaceId = workspacesStore.activeWorkspaceId();
                  if (!workspaceId) return;
                  threadLayoutStore.ensureThreadOpen(workspaceId, threadId, pane);
                  threadsStore.setActiveThreadId(threadId, workspaceId);
                }}
                onCloseThread={(threadId) => {
                  const workspaceId = workspacesStore.activeWorkspaceId();
                  if (!workspaceId) return;
                  threadLayoutStore.closeThread(workspaceId, threadId);
                }}
                onMoveThread={(threadId, fromPane, toPane, targetIndex) => {
                  const workspaceId = workspacesStore.activeWorkspaceId();
                  if (!workspaceId) return;
                  threadLayoutStore.moveThread(workspaceId, threadId, fromPane, toPane, targetIndex);
                }}
                onStartThread={async (pane) => {
                  const workspace = workspacesStore.activeWorkspace();
                  if (!workspace) return;
                  if (!workspace.connected) {
                    await workspacesStore.connectWorkspace(workspace);
                  }
                  const threadId = await threadsStore.startThreadForWorkspace(workspace.id);
                  if (!threadId) return;
                  threadLayoutStore.ensureThreadOpen(workspace.id, threadId, pane);
                  setTimeout(() => composerTextarea?.focus(), 0);
                }}
                onOpenSplit={() => {
                  const workspaceId = workspacesStore.activeWorkspaceId();
                  if (!workspaceId) return;
                  threadLayoutStore.openSplit(workspaceId);
                }}
                onCloseSplit={() => {
                  const workspaceId = workspacesStore.activeWorkspaceId();
                  if (!workspaceId) return;
                  threadLayoutStore.closeSplit(workspaceId);
                }}
                onOpenFile={(path) => {
                  openRightPanelTab("files");
                  fileViewerStore.selectFile(path);
                }}
                pathPreview={pathPreviewStore}
              />
            </div>

            <Composer
              value={input}
              onChange={(value) => setInput(value)}
              onSend={() => handleSend(composerDraftsStore.attachments())}
              attachments={composerDraftsStore.attachments}
              onAttachmentsChange={(next) => composerDraftsStore.setAttachments(next)}
              steerEnabled={steerEnabled}
              isProcessing={() => activeThreadStatus()?.isProcessing ?? false}
              onQueue={handleQueue}
              queuedMessages={queuedSendStore.activeQueue}
              onRemoveQueuedMessage={queuedSendStore.removeActiveQueuedMessage}
              onClearQueuedMessages={queuedSendStore.clearActiveQueue}
              onTextareaRef={(el) => {
                composerTextarea = el;
              }}
              onStop={threadsStore.stopActiveThread}
              canStop={threadsStore.canStopActiveThread()}
              workspaceId={workspacesStore.activeWorkspaceId}
              models={modelsStore.models}
              selectedModelId={modelsStore.selectedModelId}
              onSelectModel={modelsStore.setSelectedModelId}
              reasoningOptions={modelsStore.reasoningOptions}
              selectedEffort={modelsStore.selectedEffort}
              onSelectEffort={modelsStore.setSelectedEffort}
              accessMode={accessMode}
              onAccessModeChange={(mode) => {
                setAccessModeDirty(true);
                setAccessMode(mode);
              }}
              approvalPolicy={approvalPolicy}
              onApprovalPolicyChange={setApprovalPolicy}
              skills={skillsStore.skills}
              onSelectSkill={handleSelectSkill}
              onSlashCommand={handleSlashCommand}
              onShellCommand={handleShellCommand}
            />
            <DebugPanel
              entries={debugEntries}
              isOpen={debugOpen}
              onToggle={() => setDebugOpen((prev) => !prev)}
              onClear={() => setDebugEntries([])}
              onCopy={handleCopyDebug}
            />
          </>
        )}
      </Show>
    </section>
  );

	  const RightPanelView = (props: { workspace: () => WorkspaceInfo }) => {
	    const workspace = props.workspace;
	    const prStackWorkspace = createMemo(
	      () => resolveGroupMainWorkspace(workspace()) ?? workspace(),
	    );
	    const prStackSummary = createMemo(
	      () => ryuSummaryByWorkspaceId()[prStackWorkspace().id] ?? null,
	    );
	    const prStackIndicator = createMemo(() => {
	      const summary = prStackSummary();
	      if (!summary) {
	        return null;
	      }
	      if (summary.running) {
	        return "…";
	      }
	      if (summary.ok === false || summary.hasConflict) {
	        return "!";
	      }
	      if (summary.needsPush) {
	        return "↑";
	      }
	      if (summary.count > 0) {
	        return String(summary.count);
	      }
	      return null;
	    });

	    return (
	      <>
      <div class="right-panel-tabs">
        <button
          type="button"
          class="right-panel-tab"
          classList={{ active: rightPanelTab() === "info" }}
          onClick={() => openRightPanelTab("info")}
        >
          Info
        </button>
        <button
          type="button"
          class="right-panel-tab"
          classList={{ active: rightPanelTab() === "stack" }}
          onClick={() => openRightPanelTab("stack")}
        >
          Stack
          <Show when={stackRows().length}>
            <span class="right-panel-tab-count">{stackRows().length}</span>
          </Show>
        </button>
        <button
          type="button"
          class="right-panel-tab"
          classList={{ active: rightPanelTab() === "diff" }}
          onClick={() => openRightPanelTab("diff")}
        >
          Diff
        </button>
        <button
          type="button"
          class="right-panel-tab"
          classList={{ active: rightPanelTab() === "files" }}
          onClick={() => openRightPanelTab("files")}
        >
          Files
        </button>
        <button
          type="button"
          class="right-panel-tab"
          classList={{ active: rightPanelTab() === "tasks" }}
          onClick={() => openRightPanelTab("tasks")}
        >
          Tasks
          <Show
            when={
              Object.values(workspaceTasksStore.runsForWorkspace(workspace().id)).some(
                (run) => run?.running || run?.ok === false,
              )
            }
          >
            <span class="right-panel-tab-count">
              {Object.values(workspaceTasksStore.runsForWorkspace(workspace().id)).some(
                (run) => run?.running,
              )
                ? "…"
                : "!"}
            </span>
          </Show>
        </button>
        <button
          type="button"
          class="right-panel-tab"
          classList={{ active: rightPanelTab() === "terminal" }}
          onClick={() => openRightPanelTab("terminal")}
        >
          Terminal
        </button>
        <button
          type="button"
          class="right-panel-tab"
          classList={{ active: rightPanelTab() === "graph" }}
          onClick={() => openRightPanelTab("graph")}
        >
          Graph
        </button>
	        <button
	          type="button"
	          class="right-panel-tab"
	          classList={{ active: rightPanelTab() === "bookmarks" }}
	          onClick={() => openRightPanelTab("bookmarks")}
	        >
	          Bookmarks
	          <Show when={jjBookmarksStore.state().bookmarks.length}>
	            <span class="right-panel-tab-count">
	              {jjBookmarksStore.state().bookmarks.length}
	            </span>
	          </Show>
	        </button>
		        <button
		          type="button"
		          class="right-panel-tab"
		          classList={{ active: rightPanelTab() === "prStack" }}
		          onClick={() => openRightPanelTab("prStack")}
		        >
		          PR Stack
		          <Show when={prStackIndicator()}>
		            <span class="right-panel-tab-count">{prStackIndicator()}</span>
		          </Show>
		        </button>
	        <button
	          type="button"
	          class="right-panel-tab"
	          classList={{ active: rightPanelTab() === "issues" }}
	          onClick={() => openRightPanelTab("issues")}
        >
          Issues
          <Show when={gitHubIssuesStore.state().total || gitHubIssuesStore.state().issues.length}>
            <span class="right-panel-tab-count">
              {gitHubIssuesStore.state().total || gitHubIssuesStore.state().issues.length}
            </span>
          </Show>
        </button>
        <button
          type="button"
          class="right-panel-tab"
          classList={{ active: rightPanelTab() === "context" }}
          onClick={() => openRightPanelTab("context")}
        >
          Context
        </button>
      </div>

      <Show when={rightPanelTab() === "info"}>
        <JjInfoPanel
          workspace={workspace()}
          divergence={activeWorktreeDivergence()}
          branchName={vcsStatusStore.status().branchName || "unknown"}
          fileStatus={fileStatus()}
          totalAdditions={vcsStatusStore.status().totalAdditions}
          totalDeletions={vcsStatusStore.status().totalDeletions}
          vcsError={vcsStatusStore.status().error}
          graph={jjGraphStore.state().graph}
          graphIsLoading={jjGraphStore.state().isLoading}
          graphError={jjGraphStore.state().error}
          onRefreshGraph={() => {
            void jjGraphStore.refresh();
          }}
          baseRevisions={infoBaseLogState().entries}
          baseRevisionsIsLoading={infoBaseLogState().isLoading}
          baseRevisionsError={infoBaseLogState().error}
          onRefreshBaseRevisions={() => {
            void infoBaseLogStore.refresh();
          }}
          onSetBaseRevset={async (revset) => {
            await handleSetBaseRevset(workspace(), revset);
          }}
          bookmarks={jjBookmarksStore.state().bookmarks}
          bookmarksIsLoading={jjBookmarksStore.state().isLoading}
          bookmarksError={jjBookmarksStore.state().error}
          onOpenGraphTab={() => openRightPanelTab("graph")}
          onOpenBookmarksTab={() => openRightPanelTab("bookmarks")}
          onEditBase={() => handleEditBaseRevset(workspace())}
          onSyncWorktree={() => {
            setSyncWorkspaceId(workspace().id);
            setSyncPromptOpen(true);
          }}
          syncStackCount={activeSyncStackCount()}
          onSyncStack={() => setSyncStackWorkspaceId(workspace().id)}
          landStackCount={activeLandStackCount()}
          onLandStack={() => setLandStackWorkspaceId(workspace().id)}
          onLandWorktree={() => {
            setLandWorkspaceId(workspace().id);
            setLandPromptOpen(true);
          }}
          onFetchRemote={() => handleFetchRemote(workspace())}
          onPushTracked={() => handlePushTracked(workspace())}
          onPushDeleted={() => handlePushDeleted(workspace())}
        />
      </Show>

      <Show when={rightPanelTab() === "stack"}>
        <JjStackPanel
          root={stackRootWorkspace()}
          rows={stackRows()}
          activeWorkspaceId={workspacesStore.activeWorkspaceId()}
          stackOp={worktreeStackOpsStore.state().active}
          onClearStackOp={worktreeStackOpsStore.clear}
          divergenceByWorkspaceId={worktreeDivergenceStore.entryByWorkspaceId()}
          descendantCountByWorkspaceId={worktreeDescendantCountByWorkspaceId()}
          onRefresh={() => {
            void worktreeDivergenceStore.refreshAll();
          }}
          onSelectWorkspace={workspacesStore.setActiveWorkspaceId}
          onEditBaseRevset={(workspaceId) => {
            const target = workspacesStore.workspaces().find((entry) => entry.id === workspaceId);
            if (!target) {
              return;
            }
            handleEditBaseRevset(target);
          }}
          onReparentWorktree={(workspaceId) => {
            setReparentWorkspaceId(workspaceId);
          }}
          onSyncWorktree={(workspaceId) => {
            setSyncWorkspaceId(workspaceId);
            setSyncPromptOpen(true);
          }}
          onSyncWorktreeStack={setSyncStackWorkspaceId}
          onLandWorktree={(workspaceId) => {
            setLandWorkspaceId(workspaceId);
            setLandPromptOpen(true);
          }}
          onLandWorktreeStack={setLandStackWorkspaceId}
        />
      </Show>

      <Show when={rightPanelTab() === "diff"}>
        <GitDiffPanel
          workspaceId={workspace().id}
          branchName={vcsStatusStore.status().branchName || "unknown"}
          totalAdditions={vcsStatusStore.status().totalAdditions}
          totalDeletions={vcsStatusStore.status().totalDeletions}
          fileStatus={fileStatus()}
          error={vcsStatusStore.status().error}
          files={vcsStatusStore.status().files}
          onRecoverStale={async () => {
            try {
              const output = await jjWorkspaceUpdateStale(workspace().id);
              addDebugEntry({
                id: `${Date.now()}-client-jj-update-stale`,
                timestamp: Date.now(),
                source: "client",
                label: "jj workspace update-stale",
                payload: output.trim() ? output : "ok",
              });
              await vcsStatusStore.refresh();
              await jjGraphStore.refresh();
            } catch (err) {
              addDebugEntry({
                id: `${Date.now()}-client-jj-update-stale-error`,
                timestamp: Date.now(),
                source: "error",
                label: "jj workspace update-stale error",
                payload: err instanceof Error ? err.message : String(err),
              });
            }
          }}
        />
      </Show>

      <Show when={rightPanelTab() === "files"}>
        <FileViewerTabs
          workspaceId={workspace().id}
          store={fileTabsStore}
          onOpenFilePicker={() => {
            const path = fileViewerStore.state().selectedPath;
            if (path) {
              fileTabsStore.open(workspace().id, path);
            }
          }}
        />
      </Show>

      <Show when={rightPanelTab() === "tasks"}>
        <WorkspaceTasksPanel
          workspaceName={workspace().name}
          commandsWorkspaceId={(spotlightSettingsWorkspace() ?? workspace()).id}
          commandsWorkspaceName={(spotlightSettingsWorkspace() ?? workspace()).name}
          setupCommandOverride={(spotlightSettingsWorkspace() ?? workspace()).settings.setup_command ?? null}
          runCommandOverride={(spotlightSettingsWorkspace() ?? workspace()).settings.run_command ?? null}
          spotlightEnabled={(spotlightSettingsWorkspace() ?? workspace()).settings.spotlight_enabled ?? false}
          runs={workspaceTasksStore.runsForWorkspace(workspace().id)}
          onRunSetup={() => {
            void workspaceTasksStore.runSetup(workspace().id).catch((err) => {
              addDebugEntry({
                id: `${Date.now()}-client-workspace-setup-error`,
                timestamp: Date.now(),
                source: "error",
                label: "workspace/setup error",
                payload: err instanceof Error ? err.message : String(err),
              });
            });
          }}
          onRun={() => {
            void workspaceTasksStore.runRun(workspace().id).catch((err) => {
              addDebugEntry({
                id: `${Date.now()}-client-workspace-run-error`,
                timestamp: Date.now(),
                source: "error",
                label: "workspace/run error",
                payload: err instanceof Error ? err.message : String(err),
              });
            });
          }}
          onSpotlight={() => {
            void workspaceTasksStore.runSpotlight(workspace().id).catch((err) => {
              addDebugEntry({
                id: `${Date.now()}-client-workspace-spotlight-error`,
                timestamp: Date.now(),
                source: "error",
                label: "workspace/spotlight error",
                payload: err instanceof Error ? err.message : String(err),
              });
            });
          }}
          onToggleSpotlight={(enabled) => {
            const root = spotlightSettingsWorkspace() ?? workspace();
            if (!enabled) {
              void workspacesStore.setWorkspaceSpotlightEnabled(root.id, false);
              return;
            }
            if (root.settings.spotlight_enabled) {
              return;
            }
            setSpotlightEnableWorkspaceId(root.id);
          }}
          onClearTask={(task) => {
            workspaceTasksStore.clearTask(workspace().id, task);
          }}
          onSaveCommands={async ({ setupCommand, runCommand }) => {
            const root = spotlightSettingsWorkspace() ?? workspace();
            await workspacesStore.setWorkspaceTaskCommands(root.id, {
              setupCommand,
              runCommand,
            });
          }}
        />
      </Show>

      <Show when={rightPanelTab() === "terminal"}>
        <MultiTerminalPanel
          workspaceId={workspace().id}
          store={multiTerminalStore}
        />
      </Show>

      <Show when={rightPanelTab() === "graph"}>
        <JjGraphPanel
          graph={jjGraphStore.state().graph}
          isLoading={jjGraphStore.state().isLoading}
          error={jjGraphStore.state().error}
          onRefresh={() => {
            void jjGraphStore.refresh();
          }}
        />
      </Show>

	      <Show when={rightPanelTab() === "bookmarks"}>
	        <JjBookmarksPanel
          contextWorkspaceName={bookmarksBaseWorkspace()?.name ?? null}
          bookmarks={jjBookmarksStore.state().bookmarks}
          isLoading={jjBookmarksStore.state().isLoading}
          error={jjBookmarksStore.state().error}
          currentBaseRevset={activeWorktreeDivergence()?.base_revset ?? null}
          ahead={activeWorktreeDivergence()?.ahead ?? null}
          behind={activeWorktreeDivergence()?.behind ?? null}
          recentRevisions={bookmarksLogState().entries}
          recentIsLoading={bookmarksLogState().isLoading}
          recentError={bookmarksLogState().error}
          onRefreshRecent={() => {
            void bookmarksLogStore.refresh();
          }}
          onNewBookmark={() => {
            setBookmarkPromptTitle("New Bookmark");
            setBookmarkPromptName("");
            setBookmarkPromptTargetRevset("@");
            setBookmarkPromptNameReadOnly(false);
            setBookmarkPromptOpen(true);
          }}
          onMoveBookmark={(bookmark) => {
            setBookmarkPromptTitle(`Move ${bookmark.symbol}`);
            setBookmarkPromptName(bookmark.name);
            setBookmarkPromptTargetRevset("@");
            setBookmarkPromptNameReadOnly(true);
            setBookmarkPromptOpen(true);
          }}
          onRenameBookmark={(bookmark) => {
            setBookmarkRenameTarget(bookmark);
          }}
          onDeleteBookmark={(bookmark) => {
            setBookmarkDeleteTarget(bookmark);
          }}
          onFetchRemote={() => handleFetchRemote(workspace())}
          onPushTracked={() => handlePushTracked(workspace())}
          onPushDeleted={() => handlePushDeleted(workspace())}
          onPushBookmark={async (bookmark) => {
            const ws = workspace();
            try {
              const output = await jjBookmarksStore.pushBookmark(bookmark.name);
              addDebugEntry({
                id: `${Date.now()}-client-jj-push-${bookmark.name}`,
                timestamp: Date.now(),
                source: "client",
                label: `jj git push --bookmark ${bookmark.name}`,
                payload: output.trim() ? output : "ok",
              });
              await worktreeDivergenceStore.refresh(ws.id);
              await bookmarksLogStore.refresh();
              await jjGraphStore.refresh();
            } catch (err) {
              addDebugEntry({
                id: `${Date.now()}-client-jj-push-${bookmark.name}-error`,
                timestamp: Date.now(),
                source: "error",
                label: `jj git push --bookmark ${bookmark.name} error`,
                payload: err instanceof Error ? err.message : String(err),
              });
              throw err;
            }
          }}
          onTrackRemoteBookmark={async (bookmark) => {
            const ws = workspace();
            const remote = bookmark.remote?.trim();
            if (!remote) {
              throw new Error("Remote bookmark is missing a remote name.");
            }
            try {
              await jjBookmarksStore.trackRemoteBookmark(bookmark.name, remote);
              addDebugEntry({
                id: `${Date.now()}-client-jj-track-${bookmark.symbol}`,
                timestamp: Date.now(),
                source: "client",
                label: `jj bookmark track ${bookmark.name}@${remote}`,
                payload: "ok",
              });
              await worktreeDivergenceStore.refresh(ws.id);
              await bookmarksLogStore.refresh();
              await jjGraphStore.refresh();
            } catch (err) {
              addDebugEntry({
                id: `${Date.now()}-client-jj-track-${bookmark.symbol}-error`,
                timestamp: Date.now(),
                source: "error",
                label: `jj bookmark track ${bookmark.name}@${remote} error`,
                payload: err instanceof Error ? err.message : String(err),
              });
              throw err;
            }
          }}
          onUntrackRemoteBookmark={async (bookmark) => {
            const ws = workspace();
            const remote = bookmark.remote?.trim();
            if (!remote) {
              throw new Error("Remote bookmark is missing a remote name.");
            }
            try {
              await jjBookmarksStore.untrackRemoteBookmark(bookmark.name, remote);
              addDebugEntry({
                id: `${Date.now()}-client-jj-untrack-${bookmark.symbol}`,
                timestamp: Date.now(),
                source: "client",
                label: `jj bookmark untrack ${bookmark.name}@${remote}`,
                payload: "ok",
              });
              await worktreeDivergenceStore.refresh(ws.id);
              await bookmarksLogStore.refresh();
              await jjGraphStore.refresh();
            } catch (err) {
              addDebugEntry({
                id: `${Date.now()}-client-jj-untrack-${bookmark.symbol}-error`,
                timestamp: Date.now(),
                source: "error",
                label: `jj bookmark untrack ${bookmark.name}@${remote} error`,
                payload: err instanceof Error ? err.message : String(err),
              });
              throw err;
            }
          }}
          onRefresh={() => {
            void jjBookmarksStore.refresh();
          }}
          onEditBase={() => handleEditBaseRevset(workspace())}
          onSetBaseRevset={async (revset) => {
            await handleSetBaseRevset(workspace(), revset);
          }}
	        />
	      </Show>

	      <Show when={rightPanelTab() === "prStack"}>
	        <RyuStackPanel
	          workspaceName={prStackWorkspace().name}
	          run={() => workspaceTasksStore.runForWorkspaceTask(prStackWorkspace().id, "ryu")}
	          onClear={() => workspaceTasksStore.clearTask(prStackWorkspace().id, "ryu")}
	          onRun={(action, options) => {
	            void handleRunRyu(prStackWorkspace().id, action, options);
	          }}
	        />
	      </Show>

	      <Show when={rightPanelTab() === "issues"}>
	        <GitHubIssuesPanel
	          total={gitHubIssuesStore.state().total}
          issues={gitHubIssuesStore.state().issues}
          isLoading={gitHubIssuesStore.state().isLoading}
          error={gitHubIssuesStore.state().error}
          onRefresh={gitHubIssuesStore.refresh}
        />
      </Show>

      <Show when={rightPanelTab() === "context"}>
        <SessionContextTab
          sessionId={() => threadsStore.activeThreadId()}
          sessionTitle={() => {
            const threadId = threadsStore.activeThreadId();
            if (!threadId) return null;
            const workspaceId = workspacesStore.activeWorkspaceId();
            if (!workspaceId) return null;
            const threads = threadsStore.threadsByWorkspace()[workspaceId] ?? [];
            const thread = threads.find((t) => t.id === threadId);
            return thread?.name ?? null;
          }}
          messages={() => {
            const items = threadsStore.activeItems();
            const messages: SessionMessage[] = [];
            for (const item of items) {
              if (item.kind === "message") {
                messages.push({
                  id: item.id,
                  role: item.role,
                  text: item.text,
                });
              }
            }
            return messages;
          }}
          usage={() => {
            const threadId = threadsStore.activeThreadId();
            if (!threadId) return null;
            const usage = usageStore.threadUsage(threadId);
            if (!usage) return null;
            return {
              inputTokens: usage.totalInputTokens,
              outputTokens: usage.totalOutputTokens,
              reasoningTokens: 0,
            };
          }}
        />
      </Show>
      </>
    );
  };

  const WideLayout = () => (
    <ResizableRoot sizes={resizableSizes()} onSizesChange={handleResizableSizesChange} class="app-resizable">
      <ResizablePanel minSize={0.15} maxSize={0.35} class="sidebar-panel">
        <SidebarView />
      </ResizablePanel>

      <ResizableHandle aria-label="Resize sidebar" class="resize-handle" />

      <ResizablePanel minSize={0.3} class="main-panel">
        <MainView compact={false} />
      </ResizablePanel>

      <Show when={workspacesStore.activeWorkspace()}>
        {(workspace) => (
          <>
            <ResizableHandle aria-label="Resize right panel" class="resize-handle" />
            <ResizablePanel minSize={0.15} maxSize={0.35} class="right-panel">
              <RightPanelView workspace={workspace} />
            </ResizablePanel>
          </>
        )}
      </Show>
    </ResizableRoot>
  );

  const CompactLayout = () => (
    <div class="compact-shell">
      <div class="compact-view">
        <Show when={compactTab() === "workspaces"}>
          <div class="sidebar-panel">
            <SidebarView />
          </div>
        </Show>
        <Show when={compactTab() === "chat"}>
          <MainView compact={true} />
        </Show>
        <Show when={compactTab() === "panel"}>
          <Show when={workspacesStore.activeWorkspace()}>
            {(workspace) => (
              <div class="right-panel compact-right-panel">
                <RightPanelView workspace={workspace} />
              </div>
            )}
          </Show>
        </Show>
      </div>
      <CompactNav
        activeTab={compactTab()}
        panelLabel={rightPanelLabel()}
        hasActiveWorkspace={!!workspacesStore.activeWorkspaceId()}
        onSelectTab={setCompactTab}
      />
    </div>
  );

  return (
    <DialogProvider>
      <CommandProvider>
        <div
          class="app"
          style={{ "--ui-scale": String(appSettingsStore.settings().uiScale) }}
        >
          <div class="drag-strip" id="titlebar" />
          <ErrorBoundary
            fallback={(error) => {
              reportUiError(error);
              const message = error instanceof Error ? error.message : String(error);
              const stack = error instanceof Error ? error.stack : undefined;
              return (
                <div style={{ padding: "24px", "font-size": "12px", color: "rgba(255, 255, 255, 0.85)" }}>
                  <div style={{ "font-weight": "700", "font-size": "14px", "margin-bottom": "8px" }}>
                    UI crashed during render
                  </div>
                  <div style={{ color: "rgba(255, 255, 255, 0.6)", "margin-bottom": "12px" }}>
                    Check the debug panel / terminal output for details.
                  </div>
                  <pre
                    style={{
                      margin: 0,
                      padding: "12px",
                      "border-radius": "8px",
                      background: "rgba(0, 0, 0, 0.35)",
                      "white-space": "pre-wrap",
                      "word-break": "break-word",
                    }}
                  >
                    {(stack ?? message).trim()}
                  </pre>
                </div>
              );
            }}
          >
            <AppCommands
              workspaceId={workspacesStore.activeWorkspaceId}
              models={modelsStore.models}
              selectedModel={modelsStore.selectedModel}
              onSelectModel={(model) => modelsStore.setSelectedModelId(model?.id ?? null)}
              onOpenFile={(path) => {
                openRightPanelTab("files");
                fileTabsStore.open(workspacesStore.activeWorkspaceId() ?? "", path);
              }}
              onNewSession={() => {
                const workspace = workspacesStore.activeWorkspace();
                if (workspace) {
                  void handleAddAgent(workspace);
                }
              }}
              onToggleDebug={() => setDebugOpen((prev) => !prev)}
              onOpenSettings={() => setSettingsOpen(true)}
            />
            <Show when={!isCompactLayout()} fallback={<CompactLayout />}>
              <WideLayout />
            </Show>

        {/* legacy layout removed
        <ResizableRoot
          sizes={resizableSizes()}
          onSizesChange={handleResizableSizesChange}
          class="app-resizable"
        >
          <ResizablePanel minSize={0.15} maxSize={0.35} class="sidebar-panel">
            <Sidebar
              workspaces={workspacesStore.workspaces}
              threadsByWorkspace={threadsStore.threadsByWorkspace}
              threadStatusById={threadsStore.threadStatusById}
              activeWorkspaceId={workspacesStore.activeWorkspaceId}
              activeThreadId={threadsStore.activeThreadId}
              worktreeDivergenceByWorkspaceId={worktreeDivergenceStore.entryByWorkspaceId}
              worktreeDescendantCountByWorkspaceId={worktreeDescendantCountByWorkspaceId}
              jjGraphPreviewByWorkspaceId={jjGraphPreviewStore.entryByWorkspaceId}
              onShowWorkspaceGraphPreview={(workspaceId) => {
                void jjGraphPreviewStore.refresh(workspaceId);
              }}
              onOpenStackTab={() => setRightPanelTab("stack")}
              onAddWorkspace={handleAddWorkspace}
              onOpenSettings={() => setSettingsOpen(true)}
              onSelectWorkspace={workspacesStore.setActiveWorkspaceId}
              onConnectWorkspace={workspacesStore.connectWorkspace}
              onAddAgent={(workspace) => {
                void handleAddAgent(workspace);
              }}
              onAddWorktreeAgent={(workspace) => {
                setWorktreeBaseWorkspaceId(workspace.id);
                setWorktreePromptOpen(true);
              }}
              onLandWorktree={(workspace) => {
                setLandWorkspaceId(workspace.id);
                setLandPromptOpen(true);
              }}
              onLandWorktreeStack={(workspace) => {
                setLandStackWorkspaceId(workspace.id);
              }}
              onReparentWorktree={(workspace) => {
                setReparentWorkspaceId(workspace.id);
              }}
              onSyncWorktree={(workspace) => {
                setSyncWorkspaceId(workspace.id);
                setSyncPromptOpen(true);
              }}
              onSyncWorktreeStack={(workspace) => {
                setSyncStackWorkspaceId(workspace.id);
              }}
              onEditWorktreeBaseRevset={(workspace) => {
                setBaseRevsetWorkspaceId(workspace.id);
                setBaseRevsetPromptOpen(true);
              }}
              onEditWorkspaceBaseRevset={(workspace) => {
                setWorkspaceBaseRevsetWorkspaceId(workspace.id);
                setWorkspaceBaseRevsetPromptOpen(true);
              }}
              onSelectThread={(workspaceId, threadId) => {
                workspacesStore.setActiveWorkspaceId(workspaceId);
                threadsStore.setActiveThreadId(threadId, workspaceId);
              }}
              onForkThread={(workspaceId, threadId, threadName) => {
                void handleForkThread(workspaceId, threadId, threadName);
              }}
              onForkThreadToWorktree={(workspaceId, threadId, threadName) => {
                setForkSource({ workspaceId, threadId, threadName });
                setWorktreeBaseWorkspaceId(workspaceId);
                setWorktreePromptOpen(true);
              }}
              onDeleteThread={(workspaceId, threadId) => {
                threadsStore.removeThread(workspaceId, threadId);
              }}
              onDeleteWorkspace={(workspaceId) => {
                workspacesStore.removeWorkspace(workspaceId);
              }}
              onToggleWorkspaceCollapsed={(workspaceId, collapsed) => {
                workspacesStore.setWorkspaceSidebarCollapsed(workspaceId, collapsed);
              }}
              onRenameWorkspace={(workspaceId, newName) => {
                workspacesStore.renameWorkspace(workspaceId, newName);
              }}
              onRenameThread={(workspaceId, threadId, newName) => {
                threadsStore.renameThread(workspaceId, threadId, newName);
              }}
              onReorderWorkspace={(workspaceId, toIndex) => {
                workspacesStore.reorderWorkspace(workspaceId, toIndex);
              }}
            />
          </ResizablePanel>

          <ResizableHandle aria-label="Resize sidebar" class="resize-handle" />

          <ResizablePanel minSize={0.3} class="main-panel">
            <section class="main">
              <Show
                when={workspacesStore.activeWorkspace()}
                fallback={
                  <Home
                    onOpenProject={handleOpenProject}
                    onAddWorkspace={handleAddWorkspace}
                    onCloneRepository={() => setClonePromptOpen(true)}
                  />
                }
              >
                {(workspace) => (
                  <>
                    <div class="main-topbar">
                      <MainHeader
                        workspace={workspace()}
                        branchName={vcsStatusStore.status().branchName || "unknown"}
                        divergence={activeWorktreeDivergence()}
                      />
                      <div class="actions">
                        <TokenUsage
                          currentUsage={usageStore.currentTurnUsage}
                          threadUsage={usageStore.activeThreadUsage}
                          sessionTotals={usageStore.totalSessionTokens}
                        />
                        <button
                          class="ghost icon-button"
                          onClick={() => setDebugOpen((prev) => !prev)}
                          aria-label="Debug"
                        >
                          <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path
                              d="M9 7.5V6.5a3 3 0 0 1 6 0v1"
                              stroke="currentColor"
                              stroke-width="1.4"
                              stroke-linecap="round"
                            />
                            <rect
                              x="7"
                              y="7.5"
                              width="10"
                              height="9"
                              rx="3"
                              stroke="currentColor"
                              stroke-width="1.4"
                            />
                            <path
                              d="M4 12h3m10 0h3M6 8l2 2m8-2-2 2M6 16l2-2m8 2-2-2"
                              stroke="currentColor"
                              stroke-width="1.4"
                              stroke-linecap="round"
                            />
                            <circle cx="10" cy="12" r="0.8" fill="currentColor" />
                            <circle cx="14" cy="12" r="0.8" fill="currentColor" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div class="content">
                      <Messages
                        items={threadsStore.activeItems}
                        isThinking={() => activeThreadStatus()?.isProcessing ?? false}
                        processingStartedAt={() =>
                          activeThreadStatus()?.processingStartedAt ?? null
                        }
                        lastDurationMs={() => activeThreadStatus()?.lastDurationMs ?? null}
                        onOpenFile={(path) => {
                          setRightPanelTab("files");
                          fileViewerStore.selectFile(path);
                        }}
                        pathPreview={pathPreviewStore}
                      />
                    </div>

	                    <Composer
	                      value={input}
	                      onChange={(value) => setInput(value)}
	                      onSend={() => handleSend(composerDraftsStore.attachments())}
	                      attachments={composerDraftsStore.attachments}
	                      onAttachmentsChange={(next) => composerDraftsStore.setAttachments(next)}
	                      pathPreview={pathPreviewStore}
	                      steerEnabled={steerEnabled}
	                      isProcessing={() => activeThreadStatus()?.isProcessing ?? false}
	                      onQueue={handleQueue}
	                      queuedMessages={queuedSendStore.activeQueue}
	                      onRemoveQueuedMessage={queuedSendStore.removeActiveQueuedMessage}
                      onClearQueuedMessages={queuedSendStore.clearActiveQueue}
                      onTextareaRef={(el) => {
                        composerTextarea = el;
                      }}
                      onStop={threadsStore.stopActiveThread}
                      canStop={threadsStore.canStopActiveThread()}
                      workspaceId={workspacesStore.activeWorkspaceId}
                      models={modelsStore.models}
                      selectedModelId={modelsStore.selectedModelId}
                      onSelectModel={modelsStore.setSelectedModelId}
                      reasoningOptions={modelsStore.reasoningOptions}
                      selectedEffort={modelsStore.selectedEffort}
                      onSelectEffort={modelsStore.setSelectedEffort}
                      accessMode={accessMode}
                      onAccessModeChange={(mode) => {
                        setAccessModeDirty(true);
                        setAccessMode(mode);
                      }}
                      approvalPolicy={approvalPolicy}
                      onApprovalPolicyChange={setApprovalPolicy}
                      skills={skillsStore.skills}
                      onSelectSkill={handleSelectSkill}
                      onSlashCommand={handleSlashCommand}
                      onShellCommand={handleShellCommand}
                    />
                    <DebugPanel
                      entries={debugEntries}
                      isOpen={debugOpen}
                      onToggle={() => setDebugOpen((prev) => !prev)}
                      onClear={() => setDebugEntries([])}
                      onCopy={handleCopyDebug}
                    />
                  </>
                )}
              </Show>
            </section>
          </ResizablePanel>

          <Show when={workspacesStore.activeWorkspace()}>
            {(workspace) => (
              <>
	                <ResizableHandle aria-label="Resize right panel" class="resize-handle" />
	                <ResizablePanel minSize={0.15} maxSize={0.35} class="right-panel">
	                  <div class="right-panel-tabs">
	                    <button
	                      type="button"
	                      class="right-panel-tab"
	                      classList={{ active: rightPanelTab() === "info" }}
	                      onClick={() => setRightPanelTab("info")}
	                    >
	                      Info
	                    </button>
                      <button
                        type="button"
                        class="right-panel-tab"
                        classList={{ active: rightPanelTab() === "stack" }}
                        onClick={() => setRightPanelTab("stack")}
                      >
                        Stack
                        <Show when={stackRows().length}>
                          <span class="right-panel-tab-count">{stackRows().length}</span>
                        </Show>
                      </button>
                    <button
                      type="button"
                      class="right-panel-tab"
                      classList={{ active: rightPanelTab() === "diff" }}
                      onClick={() => setRightPanelTab("diff")}
                    >
                      Diff
                    </button>
	                    <button
	                      type="button"
	                      class="right-panel-tab"
	                      classList={{ active: rightPanelTab() === "files" }}
	                      onClick={() => setRightPanelTab("files")}
	                    >
	                      Files
	                    </button>
	                    <button
	                      type="button"
	                      class="right-panel-tab"
	                      classList={{ active: rightPanelTab() === "tasks" }}
	                      onClick={() => setRightPanelTab("tasks")}
	                    >
	                      Tasks
	                      <Show
	                        when={
	                          Object.values(workspaceTasksStore.runsForWorkspace(workspace().id)).some(
	                            (run) => run?.running || run?.ok === false,
	                          )
	                        }
	                      >
	                        <span class="right-panel-tab-count">
	                          {Object.values(workspaceTasksStore.runsForWorkspace(workspace().id)).some(
	                            (run) => run?.running,
	                          )
	                            ? "…"
	                            : "!"}
	                        </span>
	                      </Show>
	                    </button>
	                    <button
	                      type="button"
	                      class="right-panel-tab"
	                      classList={{ active: rightPanelTab() === "terminal" }}
	                      onClick={() => setRightPanelTab("terminal")}
                    >
                      Terminal
                    </button>
                    <button
                      type="button"
                      class="right-panel-tab"
                      classList={{ active: rightPanelTab() === "graph" }}
                      onClick={() => setRightPanelTab("graph")}
                    >
                      Graph
                    </button>
                    <button
                      type="button"
                      class="right-panel-tab"
                      classList={{ active: rightPanelTab() === "bookmarks" }}
                      onClick={() => setRightPanelTab("bookmarks")}
                    >
                      Bookmarks
                      <Show when={jjBookmarksStore.state().bookmarks.length}>
                        <span class="right-panel-tab-count">
                          {jjBookmarksStore.state().bookmarks.length}
                        </span>
                      </Show>
                    </button>
                    <button
                      type="button"
                      class="right-panel-tab"
                      classList={{ active: rightPanelTab() === "issues" }}
                      onClick={() => setRightPanelTab("issues")}
                    >
                      Issues
                      <Show
                        when={
                          gitHubIssuesStore.state().total ||
                          gitHubIssuesStore.state().issues.length
                        }
                      >
                        <span class="right-panel-tab-count">
                          {gitHubIssuesStore.state().total ||
                            gitHubIssuesStore.state().issues.length}
                        </span>
                      </Show>
	                    </button>
	                  </div>

	                  <Show when={rightPanelTab() === "info"}>
	                    <JjInfoPanel
	                      workspace={workspace()}
	                      divergence={activeWorktreeDivergence()}
	                      branchName={vcsStatusStore.status().branchName || "unknown"}
	                      fileStatus={fileStatus()}
	                      totalAdditions={vcsStatusStore.status().totalAdditions}
	                      totalDeletions={vcsStatusStore.status().totalDeletions}
	                      vcsError={vcsStatusStore.status().error}
	                      graph={jjGraphStore.state().graph}
	                      graphIsLoading={jjGraphStore.state().isLoading}
	                      graphError={jjGraphStore.state().error}
	                      onRefreshGraph={() => {
	                        void jjGraphStore.refresh();
	                      }}
	                      baseRevisions={infoBaseLogState().entries}
	                      baseRevisionsIsLoading={infoBaseLogState().isLoading}
	                      baseRevisionsError={infoBaseLogState().error}
	                      onRefreshBaseRevisions={() => {
	                        void infoBaseLogStore.refresh();
	                      }}
	                      onSetBaseRevset={async (revset) => {
	                        await handleSetBaseRevset(workspace(), revset);
	                      }}
	                      bookmarks={jjBookmarksStore.state().bookmarks}
	                      bookmarksIsLoading={jjBookmarksStore.state().isLoading}
	                      bookmarksError={jjBookmarksStore.state().error}
	                      onOpenGraphTab={() => setRightPanelTab("graph")}
	                      onOpenBookmarksTab={() => setRightPanelTab("bookmarks")}
	                      onEditBase={() => handleEditBaseRevset(workspace())}
	                      onSyncWorktree={() => {
	                        setSyncWorkspaceId(workspace().id);
	                        setSyncPromptOpen(true);
	                      }}
	                      syncStackCount={activeSyncStackCount()}
	                      onSyncStack={() => setSyncStackWorkspaceId(workspace().id)}
	                      landStackCount={activeLandStackCount()}
	                      onLandStack={() => setLandStackWorkspaceId(workspace().id)}
	                      onLandWorktree={() => {
	                        setLandWorkspaceId(workspace().id);
	                        setLandPromptOpen(true);
	                      }}
	                      onFetchRemote={() => handleFetchRemote(workspace())}
	                      onPushTracked={() => handlePushTracked(workspace())}
	                      onPushDeleted={() => handlePushDeleted(workspace())}
	                    />
	                  </Show>

                    <Show when={rightPanelTab() === "stack"}>
	                      <JjStackPanel
	                        root={stackRootWorkspace()}
	                        rows={stackRows()}
	                        activeWorkspaceId={workspacesStore.activeWorkspaceId()}
	                        stackOp={worktreeStackOpsStore.state().active}
	                        onClearStackOp={worktreeStackOpsStore.clear}
	                        divergenceByWorkspaceId={worktreeDivergenceStore.entryByWorkspaceId()}
	                        descendantCountByWorkspaceId={worktreeDescendantCountByWorkspaceId()}
	                        onRefresh={() => {
	                          void worktreeDivergenceStore.refreshAll();
	                        }}
                        onSelectWorkspace={workspacesStore.setActiveWorkspaceId}
                        onEditBaseRevset={(workspaceId) => {
                          const target = workspacesStore
                            .workspaces()
                            .find((entry) => entry.id === workspaceId);
                          if (!target) {
                            return;
                          }
                          handleEditBaseRevset(target);
                        }}
                        onReparentWorktree={(workspaceId) => {
                          setReparentWorkspaceId(workspaceId);
                        }}
                        onSyncWorktree={(workspaceId) => {
                          setSyncWorkspaceId(workspaceId);
                          setSyncPromptOpen(true);
                        }}
                        onSyncWorktreeStack={setSyncStackWorkspaceId}
                        onLandWorktree={(workspaceId) => {
                          setLandWorkspaceId(workspaceId);
                          setLandPromptOpen(true);
                        }}
                        onLandWorktreeStack={setLandStackWorkspaceId}
                      />
                    </Show>

	                  <Show when={rightPanelTab() === "diff"}>
	                    <GitDiffPanel
	                      workspaceId={workspace().id}
	                      branchName={vcsStatusStore.status().branchName || "unknown"}
	                      totalAdditions={vcsStatusStore.status().totalAdditions}
	                      totalDeletions={vcsStatusStore.status().totalDeletions}
	                      fileStatus={fileStatus()}
	                      error={vcsStatusStore.status().error}
	                      files={vcsStatusStore.status().files}
	                      onRecoverStale={async () => {
	                        try {
	                          const output = await jjWorkspaceUpdateStale(workspace().id);
	                          addDebugEntry({
	                            id: `${Date.now()}-client-jj-update-stale`,
	                            timestamp: Date.now(),
	                            source: "client",
	                            label: "jj workspace update-stale",
	                            payload: output.trim() ? output : "ok",
	                          });
	                          await vcsStatusStore.refresh();
	                          await jjGraphStore.refresh();
	                        } catch (err) {
	                          addDebugEntry({
	                            id: `${Date.now()}-client-jj-update-stale-error`,
	                            timestamp: Date.now(),
	                            source: "error",
	                            label: "jj workspace update-stale error",
	                            payload: err instanceof Error ? err.message : String(err),
	                          });
	                        }
	                      }}
	                    />
	                  </Show>

	                  <Show when={rightPanelTab() === "files"}>
	                    <FileViewerTabs
	                      workspaceId={workspace().id}
	                      store={fileTabsStore}
	                      onOpenFilePicker={() => {
	                        const path = fileViewerStore.state().selectedPath;
	                        if (path) {
	                          fileTabsStore.open(workspace().id, path);
	                        }
	                      }}
	                    />
	                  </Show>

		                  <Show when={rightPanelTab() === "tasks"}>
		                    <WorkspaceTasksPanel
		                      workspaceName={workspace().name}
		                      commandsWorkspaceId={(spotlightSettingsWorkspace() ?? workspace()).id}
		                      commandsWorkspaceName={(spotlightSettingsWorkspace() ?? workspace()).name}
		                      setupCommandOverride={(spotlightSettingsWorkspace() ?? workspace()).settings.setup_command ?? null}
		                      runCommandOverride={(spotlightSettingsWorkspace() ?? workspace()).settings.run_command ?? null}
		                      spotlightEnabled={(spotlightSettingsWorkspace() ?? workspace()).settings.spotlight_enabled ?? false}
		                      runs={workspaceTasksStore.runsForWorkspace(workspace().id)}
		                      onRunSetup={() => {
		                        void workspaceTasksStore.runSetup(workspace().id).catch((err) => {
		                          addDebugEntry({
		                            id: `${Date.now()}-client-workspace-setup-error`,
		                            timestamp: Date.now(),
		                            source: "error",
		                            label: "workspace/setup error",
		                            payload: err instanceof Error ? err.message : String(err),
		                          });
		                        });
		                      }}
		                      onRun={() => {
		                        void workspaceTasksStore.runRun(workspace().id).catch((err) => {
		                          addDebugEntry({
		                            id: `${Date.now()}-client-workspace-run-error`,
		                            timestamp: Date.now(),
		                            source: "error",
		                            label: "workspace/run error",
		                            payload: err instanceof Error ? err.message : String(err),
		                          });
		                        });
		                      }}
		                      onSpotlight={() => {
		                        void workspaceTasksStore.runSpotlight(workspace().id).catch((err) => {
		                          addDebugEntry({
		                            id: `${Date.now()}-client-workspace-spotlight-error`,
		                            timestamp: Date.now(),
		                            source: "error",
		                            label: "workspace/spotlight error",
		                            payload: err instanceof Error ? err.message : String(err),
		                          });
		                        });
		                      }}
		                      onToggleSpotlight={(enabled) => {
		                        const root = spotlightSettingsWorkspace() ?? workspace();
		                        if (!enabled) {
		                          void workspacesStore.setWorkspaceSpotlightEnabled(root.id, false);
		                          return;
		                        }
		                        if (root.settings.spotlight_enabled) {
		                          return;
		                        }
		                        setSpotlightEnableWorkspaceId(root.id);
		                      }}
		                      onClearTask={(task) => {
		                        workspaceTasksStore.clearTask(workspace().id, task);
		                      }}
		                      onSaveCommands={async ({ setupCommand, runCommand }) => {
		                        const root = spotlightSettingsWorkspace() ?? workspace();
		                        await workspacesStore.setWorkspaceTaskCommands(root.id, {
		                          setupCommand,
		                          runCommand,
		                        });
		                      }}
		                    />
		                  </Show>

		                  <Show when={rightPanelTab() === "terminal"}>
		                    <TerminalPanel
		                      workspaceId={workspace().id}
	                      initialBuffer={terminalStore.bufferForWorkspace(workspace().id)}
		                      isOpen={terminalStore.sessionForWorkspace(workspace().id)?.isOpen ?? false}
		                      isOpening={terminalStore.sessionForWorkspace(workspace().id)?.isOpening ?? false}
		                      error={terminalStore.sessionForWorkspace(workspace().id)?.error ?? null}
		                      onOpen={async (cols, rows) => {
		                        await terminalStore.ensureOpen(workspace().id, cols, rows);
		                      }}
		                      onClose={() => terminalStore.close(workspace().id)}
	                      onClearBuffer={() => terminalStore.clearBuffer(workspace().id)}
		                      onWrite={(data) => terminalStore.write(workspace().id, data)}
		                      onResize={(cols, rows) => terminalStore.resize(workspace().id, cols, rows)}
		                      onSubscribe={(onData) => terminalStore.subscribe(workspace().id, onData)}
		                    />
		                  </Show>

                  <Show when={rightPanelTab() === "graph"}>
                    <JjGraphPanel
                      graph={jjGraphStore.state().graph}
                      isLoading={jjGraphStore.state().isLoading}
                      error={jjGraphStore.state().error}
                      onRefresh={() => {
                        void jjGraphStore.refresh();
                      }}
                    />
                  </Show>

	                  <Show when={rightPanelTab() === "bookmarks"}>
	                    <JjBookmarksPanel
	                      contextWorkspaceName={bookmarksBaseWorkspace()?.name ?? null}
	                      bookmarks={jjBookmarksStore.state().bookmarks}
                      isLoading={jjBookmarksStore.state().isLoading}
                      error={jjBookmarksStore.state().error}
                      currentBaseRevset={activeWorktreeDivergence()?.base_revset ?? null}
                      ahead={activeWorktreeDivergence()?.ahead ?? null}
                      behind={activeWorktreeDivergence()?.behind ?? null}
                      recentRevisions={bookmarksLogState().entries}
                      recentIsLoading={bookmarksLogState().isLoading}
                      recentError={bookmarksLogState().error}
                      onRefreshRecent={() => {
                        void bookmarksLogStore.refresh();
                      }}
                      onNewBookmark={() => {
                        setBookmarkPromptTitle("New Bookmark");
                        setBookmarkPromptName("");
                        setBookmarkPromptTargetRevset("@");
                        setBookmarkPromptNameReadOnly(false);
                        setBookmarkPromptOpen(true);
                      }}
                      onMoveBookmark={(bookmark) => {
                        setBookmarkPromptTitle(`Move ${bookmark.symbol}`);
                        setBookmarkPromptName(bookmark.name);
                        setBookmarkPromptTargetRevset("@");
                        setBookmarkPromptNameReadOnly(true);
                        setBookmarkPromptOpen(true);
                      }}
                      onRenameBookmark={(bookmark) => {
                        setBookmarkRenameTarget(bookmark);
                      }}
	                      onDeleteBookmark={(bookmark) => {
	                        setBookmarkDeleteTarget(bookmark);
	                      }}
	                      onFetchRemote={() => handleFetchRemote(workspace())}
	                      onPushTracked={() => handlePushTracked(workspace())}
	                      onPushDeleted={() => handlePushDeleted(workspace())}
	                      onPushBookmark={async (bookmark) => {
	                        const ws = workspace();
	                        try {
                          const output = await jjBookmarksStore.pushBookmark(bookmark.name);
                          addDebugEntry({
                            id: `${Date.now()}-client-jj-push-${bookmark.name}`,
                            timestamp: Date.now(),
                            source: "client",
                            label: `jj git push --bookmark ${bookmark.name}`,
                            payload: output.trim() ? output : "ok",
                          });
                          await worktreeDivergenceStore.refresh(ws.id);
                          await bookmarksLogStore.refresh();
                          await jjGraphStore.refresh();
                        } catch (err) {
                          addDebugEntry({
                            id: `${Date.now()}-client-jj-push-${bookmark.name}-error`,
                            timestamp: Date.now(),
                            source: "error",
                            label: `jj git push --bookmark ${bookmark.name} error`,
                            payload: err instanceof Error ? err.message : String(err),
                          });
                          throw err;
                        }
                      }}
                      onTrackRemoteBookmark={async (bookmark) => {
                        const ws = workspace();
                        const remote = bookmark.remote?.trim();
                        if (!remote) {
                          throw new Error("Remote bookmark is missing a remote name.");
                        }
                        try {
                          await jjBookmarksStore.trackRemoteBookmark(bookmark.name, remote);
                          addDebugEntry({
                            id: `${Date.now()}-client-jj-track-${bookmark.symbol}`,
                            timestamp: Date.now(),
                            source: "client",
                            label: `jj bookmark track ${bookmark.name}@${remote}`,
                            payload: "ok",
                          });
                          await worktreeDivergenceStore.refresh(ws.id);
                          await bookmarksLogStore.refresh();
                          await jjGraphStore.refresh();
                        } catch (err) {
                          addDebugEntry({
                            id: `${Date.now()}-client-jj-track-${bookmark.symbol}-error`,
                            timestamp: Date.now(),
                            source: "error",
                            label: `jj bookmark track ${bookmark.name}@${remote} error`,
                            payload: err instanceof Error ? err.message : String(err),
                          });
                          throw err;
                        }
                      }}
                      onUntrackRemoteBookmark={async (bookmark) => {
                        const ws = workspace();
                        const remote = bookmark.remote?.trim();
                        if (!remote) {
                          throw new Error("Remote bookmark is missing a remote name.");
                        }
                        try {
                          await jjBookmarksStore.untrackRemoteBookmark(bookmark.name, remote);
                          addDebugEntry({
                            id: `${Date.now()}-client-jj-untrack-${bookmark.symbol}`,
                            timestamp: Date.now(),
                            source: "client",
                            label: `jj bookmark untrack ${bookmark.name}@${remote}`,
                            payload: "ok",
                          });
                          await worktreeDivergenceStore.refresh(ws.id);
                          await bookmarksLogStore.refresh();
                          await jjGraphStore.refresh();
                        } catch (err) {
                          addDebugEntry({
                            id: `${Date.now()}-client-jj-untrack-${bookmark.symbol}-error`,
                            timestamp: Date.now(),
                            source: "error",
                            label: `jj bookmark untrack ${bookmark.name}@${remote} error`,
                            payload: err instanceof Error ? err.message : String(err),
                          });
                          throw err;
                        }
                      }}
	                      onRefresh={() => {
	                        void jjBookmarksStore.refresh();
	                      }}
	                      onEditBase={() => handleEditBaseRevset(workspace())}
	                      onSetBaseRevset={async (revset) => {
	                        await handleSetBaseRevset(workspace(), revset);
	                      }}
	                    />
	                  </Show>

                  <Show when={rightPanelTab() === "issues"}>
                    <GitHubIssuesPanel
                      total={gitHubIssuesStore.state().total}
                      issues={gitHubIssuesStore.state().issues}
                      isLoading={gitHubIssuesStore.state().isLoading}
                      error={gitHubIssuesStore.state().error}
                      onRefresh={gitHubIssuesStore.refresh}
                    />
                  </Show>
                </ResizablePanel>
              </>
            )}
          </Show>
        </ResizableRoot>
        */}
        <ApprovalToasts
          approvals={threadsStore.approvals()}
          workspaces={workspacesStore.workspaces()}
          onDecision={threadsStore.handleApprovalDecision}
        />
        <PromptsBrowser
          open={promptsOpen()}
          prompts={promptsStore.prompts()}
          isLoading={promptsStore.isLoading()}
          error={promptsStore.error()}
          query={promptsQuery()}
          onQueryChange={setPromptsQuery}
          onRefresh={() => promptsStore.refreshPrompts({ force: true })}
          onClose={closePromptsBrowser}
          onInsert={handleInsertPrompt}
        />
        <SettingsView
          open={settingsOpen()}
          isLoading={appSettingsStore.isLoading()}
          error={appSettingsStore.error()}
          settings={appSettingsStore.settings()}
          doctorResult={appSettingsStore.doctorResult()}
          isDoctorLoading={appSettingsStore.isDoctorLoading()}
          doctorError={appSettingsStore.doctorError()}
          onClose={() => setSettingsOpen(false)}
          onSave={async (settings) => {
            await appSettingsStore.save(settings);
          }}
          onDoctor={async (codexBin) => {
            await appSettingsStore.doctor(codexBin);
          }}
        />
        <WorktreePrompt
          open={worktreePromptOpen()}
          workspace={worktreeBaseWorkspace()}
          logEntries={worktreeCreateLogState().entries}
          logIsLoading={worktreeCreateLogState().isLoading}
          logError={worktreeCreateLogState().error}
          onRefreshLog={() => {
            void worktreeCreateLogStore.refresh();
          }}
          onClose={() => {
            setWorktreePromptOpen(false);
            setForkSource(null);
          }}
          onCreate={async (name: string, mode: WorktreeMode, baseRevset: string | null) => {
            const base = worktreeBaseWorkspace();
            if (!base) {
              return;
            }
            const source = forkSource();
            const created = await workspacesStore.addWorktree(base.id, name, mode, baseRevset);
            if (!created.connected) {
              await workspacesStore.connectWorkspace(created);
            }

            if (source) {
              setForkSource(null);
              await threadsStore.forkThreadToWorkspace(
                source.workspaceId,
                source.threadId,
                source.threadName,
                created.id,
              );
            } else {
              await threadsStore.startThreadForWorkspace(created.id);
            }

            setTimeout(() => {
              composerTextarea?.focus();
            }, 0);
          }}
        />
        <LandWorktreePrompt
          open={landPromptOpen()}
          worktree={landWorkspace()}
          destination={landDestinationWorkspace()}
          onClose={() => setLandPromptOpen(false)}
          onLand={async () => {
            const entry = landWorkspace();
            if (!entry) {
              return;
            }
            assertWorkspacesIdle(
              [entry.id, landDestinationWorkspace()?.id],
              "land this worktree",
            );
            await workspacesStore.landWorktree(entry.id);
            await vcsStatusStore.refresh();
          }}
        />
        <SyncWorktreePrompt
          open={syncPromptOpen()}
          worktree={syncWorkspace()}
          destination={syncDestinationWorkspace()}
          divergence={
            syncWorkspaceId()
              ? worktreeDivergenceStore.entryByWorkspaceId()[syncWorkspaceId()!]?.data ?? null
              : null
          }
          onClose={() => setSyncPromptOpen(false)}
          onSync={async () => {
            const entry = syncWorkspace();
            if (!entry) {
              return;
            }
            assertWorkspacesIdle([entry.id], "sync this worktree");
            await workspacesStore.syncWorktree(entry.id);
            await worktreeDivergenceStore.refresh(entry.id);
            await vcsStatusStore.refresh();
            await jjGraphStore.refresh();
          }}
        />
        <ConfirmPrompt
          open={!!syncStackWorkspaceId()}
          title="Sync Worktree Stack"
          message={syncStackMessage()}
          confirmLabel="Sync stack"
          onClose={() => setSyncStackWorkspaceId(null)}
          onConfirm={async () => {
            const rootId = syncStackWorkspaceId();
            const targets = syncStackTargets();
            setSyncStackWorkspaceId(null);
            worktreeStackOpsStore.clear();
            if (targets.length === 0) {
              return;
            }
            if (!rootId) {
              return;
            }

            assertWorkspacesIdle(
              targets.map((target) => target.id),
              "sync this worktree stack",
            );

            setRightPanelTab("stack");

            try {
              await workspacesStore.syncWorktreeStack(rootId);
              for (const target of targets) {
                await worktreeDivergenceStore.refresh(target.id);
              }
              await vcsStatusStore.refresh();
              await jjGraphStore.refresh();
            } catch (err) {
              addDebugEntry({
                id: `${Date.now()}-client-worktree-sync-stack-error`,
                timestamp: Date.now(),
                source: "error",
                label: "worktree/syncStack error",
                payload: err instanceof Error ? err.message : String(err),
              });
            }
          }}
        />
	        <ConfirmPrompt
	          open={!!landStackWorkspaceId()}
	          title="Land Worktree Stack"
	          message={landStackMessage()}
	          confirmLabel="Land stack"
          confirmVariant="destructive"
          onClose={() => setLandStackWorkspaceId(null)}
          onConfirm={async () => {
            const rootId = landStackWorkspaceId();
            const targets = landStackTargets();
            setLandStackWorkspaceId(null);
            worktreeStackOpsStore.clear();
            if (targets.length === 0) {
              return;
            }
            if (!rootId) {
              return;
            }

            const involved = new Set<string>();
            for (const target of targets) {
              involved.add(target.id);
              involved.add(target.base_id ?? target.parent_id ?? "");
            }
            assertWorkspacesIdle(
              Array.from(involved).filter(Boolean),
              "land this worktree stack",
            );

            setRightPanelTab("stack");

            try {
              await workspacesStore.landWorktreeStack(rootId);
              await worktreeDivergenceStore.refreshAll();
              await vcsStatusStore.refresh();
              await jjGraphStore.refresh();
            } catch (err) {
              addDebugEntry({
                id: `${Date.now()}-client-worktree-land-stack-error`,
                timestamp: Date.now(),
                source: "error",
                label: "worktree/landStack error",
                payload: err instanceof Error ? err.message : String(err),
              });
            }
	          }}
	        />
	        <ConfirmPrompt
	          open={!!spotlightEnableWorkspaceId()}
	          title="Enable Spotlight Mode"
	          message={spotlightEnableMessage()}
	          confirmLabel="Enable"
	          onClose={() => setSpotlightEnableWorkspaceId(null)}
	          onConfirm={async () => {
	            const id = spotlightEnableWorkspaceId();
	            setSpotlightEnableWorkspaceId(null);
	            if (!id) {
	              return;
	            }
	            await workspacesStore.setWorkspaceSpotlightEnabled(id, true);
	          }}
	        />
	        <ReparentWorktreePrompt
	          open={!!reparentWorkspaceId()}
	          worktree={reparentWorktree()}
	          bases={reparentBases()}
          descendantCount={reparentDescendants().length}
          onClose={() => setReparentWorkspaceId(null)}
          onReparent={async ({ baseId, baseRevset, restack }) => {
            const entry = reparentWorktree();
            if (!entry) {
              return;
            }
            assertWorkspacesIdle(
              [
                entry.id,
                ...(restack ? reparentDescendants().map((child) => child.id) : []),
              ],
              restack ? "restack these worktrees" : "reparent this worktree",
            );
            await workspacesStore.reparentWorktree({
              id: entry.id,
              newBaseId: baseId,
              baseRevset,
              restack,
            });
            await worktreeDivergenceStore.refreshAll();
            await vcsStatusStore.refresh();
            await jjGraphStore.refresh();
          }}
        />
        <EditWorktreeBasePrompt
          open={baseRevsetPromptOpen()}
          worktree={baseRevsetWorktree()}
          destination={baseRevsetDestinationWorkspace()}
          logEntries={baseRevsetLogState().entries}
          logIsLoading={baseRevsetLogState().isLoading}
          logError={baseRevsetLogState().error}
          onRefreshLog={() => {
            void baseRevsetLogStore.refresh();
          }}
          onClose={() => setBaseRevsetPromptOpen(false)}
          onSave={async (baseRevset) => {
            const entry = baseRevsetWorktree();
            if (!entry) {
              return;
            }
            await workspacesStore.updateWorktreeBaseRevset(entry.id, baseRevset);
            await worktreeDivergenceStore.refresh(entry.id);
            await jjGraphStore.refresh();
          }}
        />
        <EditWorkspaceBasePrompt
          open={workspaceBaseRevsetPromptOpen()}
          workspace={workspaceBaseRevsetWorkspace()}
          logEntries={workspaceBaseRevsetLogState().entries}
          logIsLoading={workspaceBaseRevsetLogState().isLoading}
          logError={workspaceBaseRevsetLogState().error}
          onRefreshLog={() => {
            void workspaceBaseRevsetLogStore.refresh();
          }}
          onClose={() => setWorkspaceBaseRevsetPromptOpen(false)}
          onSave={async (baseRevset) => {
            const entry = workspaceBaseRevsetWorkspace();
            if (!entry) {
              return;
            }
            await workspacesStore.updateWorkspaceBaseRevset(entry.id, baseRevset);
            await worktreeDivergenceStore.refresh(entry.id);
          }}
        />
        <CloneRepositoryPrompt
          open={clonePromptOpen()}
          onClose={() => setClonePromptOpen(false)}
          onPickParentDirectory={pickWorkspacePath}
          onClone={async ({ url, destinationPath }) => {
            const workspace = await workspacesStore.cloneRepository(url, destinationPath);
            threadsStore.setActiveThreadId(null, workspace.id);
          }}
        />
        <EditBookmarkPrompt
          open={bookmarkPromptOpen()}
          title={bookmarkPromptTitle()}
          workspaceName={bookmarksBaseWorkspace()?.name ?? null}
          name={bookmarkPromptName()}
          targetRevset={bookmarkPromptTargetRevset()}
          nameReadOnly={bookmarkPromptNameReadOnly()}
          onClose={() => setBookmarkPromptOpen(false)}
          onSave={async (name, targetRevset) => {
            await jjBookmarksStore.setBookmark(name, targetRevset);
            const active = workspacesStore.activeWorkspace();
            if (active) {
              await worktreeDivergenceStore.refresh(active.id);
            }
          }}
        />
        <RenameBookmarkPrompt
          open={!!bookmarkRenameTarget()}
          workspaceName={bookmarksBaseWorkspace()?.name ?? null}
          oldName={bookmarkRenameTarget()?.name ?? ""}
          onClose={() => setBookmarkRenameTarget(null)}
          onRename={async (newName) => {
            const target = bookmarkRenameTarget();
            if (!target) {
              return;
            }
            await jjBookmarksStore.renameBookmark(target.name, newName);
            const active = workspacesStore.activeWorkspace();
            if (active) {
              await worktreeDivergenceStore.refresh(active.id);
            }
          }}
        />
        <ConfirmPrompt
          open={!!bookmarkDeleteTarget()}
          title="Delete Bookmark"
          message={`Delete bookmark "${bookmarkDeleteTarget()?.symbol ?? ""}"? This marks the bookmark as deleted. Use “Push deleted bookmarks” to propagate the deletion to tracked remotes.`}
          confirmLabel="Delete"
          confirmVariant="destructive"
          onClose={() => setBookmarkDeleteTarget(null)}
          onConfirm={async () => {
            const target = bookmarkDeleteTarget();
            if (!target) {
              return;
            }
            await jjBookmarksStore.deleteBookmark(target.name);
            const active = workspacesStore.activeWorkspace();
            if (active) {
              await worktreeDivergenceStore.refresh(active.id);
            }
          }}
          />
        </ErrorBoundary>
        <Toast.Region />
      </div>
    </CommandProvider>
  </DialogProvider>
  );
}

export default App;

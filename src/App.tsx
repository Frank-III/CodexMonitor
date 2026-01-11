import { createSignal, createEffect, onMount, Show, For } from "solid-js";
import "./styles/base.css";
import "./styles/buttons.css";
import "./styles/sidebar.css";
import "./styles/home.css";
import "./styles/main.css";
import "./styles/messages.css";
import "./styles/approvals.css";
import "./styles/composer.css";
import "./styles/diff.css";
import "./styles/debug.css";
import { Sidebar } from "./components/Sidebar";
import { Home } from "./components/Home";
import { MainHeader } from "./components/MainHeader";
import { Messages } from "./components/Messages";
import { Approvals } from "./components/Approvals";
import { Composer } from "./components/Composer";
import { GitDiffPanel } from "./components/GitDiffPanel";
import { DebugPanel } from "./components/DebugPanel";
import {
  createWorkspacesStore,
  createModelsStore,
  createSkillsStore,
  createGitStatusStore,
  createThreadsStore,
  setupWindowDrag,
} from "./stores";
import type { DebugEntry } from "./types";

function App() {
  const [input, setInput] = createSignal("");
  const [debugOpen, setDebugOpen] = createSignal(false);
  const [debugEntries, setDebugEntries] = createSignal<DebugEntry[]>([]);

  const addDebugEntry = (entry: DebugEntry) => {
    setDebugEntries((prev) => [...prev, entry].slice(-300));
  };

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

  const gitStatusStore = createGitStatusStore(workspacesStore.activeWorkspace);

  const modelsStore = createModelsStore({
    activeWorkspace: workspacesStore.activeWorkspace,
    onDebug: addDebugEntry,
  });

  const skillsStore = createSkillsStore({
    activeWorkspace: workspacesStore.activeWorkspace,
    onDebug: addDebugEntry,
  });

  const resolvedModel = () => modelsStore.selectedModel()?.model ?? null;
  const fileStatus = () => {
    const files = gitStatusStore.status().files;
    return files.length > 0
      ? `${files.length} file${files.length === 1 ? "" : "s"} changed`
      : "Working tree clean";
  };

  const threadsStore = createThreadsStore({
    activeWorkspace: workspacesStore.activeWorkspace,
    activeWorkspaceId: workspacesStore.activeWorkspaceId,
    onWorkspaceConnected: workspacesStore.markWorkspaceConnected,
    onDebug: addDebugEntry,
    model: resolvedModel,
    effort: modelsStore.selectedEffort,
    onMessageActivity: gitStatusStore.refresh,
  });

  setupWindowDrag("titlebar");

  const restoredWorkspaces = new Set<string>();

  createEffect(() => {
    if (!workspacesStore.hasLoaded()) {
      return;
    }
    workspacesStore.workspaces().forEach((workspace) => {
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

  async function handleNewThread() {
    const workspace = workspacesStore.activeWorkspace();
    if (workspace && !workspace.connected) {
      await workspacesStore.connectWorkspace(workspace);
    }
    await threadsStore.startThread();
  }

  async function handleSend() {
    if (!input().trim()) {
      return;
    }
    const workspace = workspacesStore.activeWorkspace();
    if (workspace && !workspace.connected) {
      await workspacesStore.connectWorkspace(workspace);
    }
    await threadsStore.sendUserMessage(input());
    setInput("");
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

  return (
    <div class="app">
      <div class="drag-strip" id="titlebar" />
      <Sidebar
        workspaces={workspacesStore.workspaces}
        threadsByWorkspace={threadsStore.threadsByWorkspace}
        threadStatusById={threadsStore.threadStatusById}
        activeWorkspaceId={workspacesStore.activeWorkspaceId}
        activeThreadId={threadsStore.activeThreadId}
        onAddWorkspace={handleAddWorkspace}
        onSelectWorkspace={workspacesStore.setActiveWorkspaceId}
        onConnectWorkspace={workspacesStore.connectWorkspace}
        onAddAgent={(workspace) => {
          workspacesStore.setActiveWorkspaceId(workspace.id);
          (async () => {
            if (!workspace.connected) {
              await workspacesStore.connectWorkspace(workspace);
            }
            await threadsStore.startThreadForWorkspace(workspace.id);
          })();
        }}
        onSelectThread={(workspaceId, threadId) => {
          workspacesStore.setActiveWorkspaceId(workspaceId);
          threadsStore.setActiveThreadId(threadId, workspaceId);
        }}
        onDeleteThread={(workspaceId, threadId) => {
          threadsStore.removeThread(workspaceId, threadId);
        }}
      />

      <section class="main">
        <Show
          when={workspacesStore.activeWorkspace()}
          fallback={
            <Home
              onOpenProject={handleOpenProject}
              onAddWorkspace={handleAddWorkspace}
              onCloneRepository={() => {}}
            />
          }
        >
          {(workspace) => (
            <>
              <div class="main-topbar">
                <MainHeader
                  workspace={workspace()}
                  branchName={gitStatusStore.status().branchName || "unknown"}
                />
                <div class="actions">
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
                  isThinking={() => {
                    const threadId = threadsStore.activeThreadId();
                    return threadId
                      ? threadsStore.threadStatusById()[threadId]?.isProcessing ?? false
                      : false;
                  }}
                />
              </div>

              <div class="right-panel">
                <GitDiffPanel
                  branchName={() => gitStatusStore.status().branchName || "unknown"}
                  totalAdditions={() => gitStatusStore.status().totalAdditions}
                  totalDeletions={() => gitStatusStore.status().totalDeletions}
                  fileStatus={fileStatus}
                  error={() => gitStatusStore.status().error}
                  files={() => gitStatusStore.status().files}
                />
                <Approvals
                  approvals={threadsStore.approvals}
                  onDecision={threadsStore.handleApprovalDecision}
                />
              </div>

              <Composer
                value={input}
                onChange={setInput}
                onSend={handleSend}
                models={modelsStore.models}
                selectedModelId={modelsStore.selectedModelId}
                onSelectModel={modelsStore.setSelectedModelId}
                reasoningOptions={modelsStore.reasoningOptions}
                selectedEffort={modelsStore.selectedEffort}
                onSelectEffort={modelsStore.setSelectedEffort}
                skills={skillsStore.skills}
                onSelectSkill={handleSelectSkill}
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
    </div>
  );
}

export default App;

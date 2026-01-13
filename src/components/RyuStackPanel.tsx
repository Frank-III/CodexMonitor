import { createMemo, createSignal, For, Show, type Accessor } from "solid-js";
import type { WorkspaceTaskRun } from "../stores/workspaceTasks";
import { parseRyuStdout, type RyuStackItem } from "../utils/ryu";

type RyuStackPanelProps = {
  workspaceName: string;
  run: Accessor<WorkspaceTaskRun | null>;
  onClear: () => void;
  onRun: (action: RyuAction, options: RyuOptions) => void;
};

export type RyuAction = "status" | "trackAll" | "submit" | "sync" | "authGithub" | "authGitlab";

export type RyuOptions = {
  remote: string;
  dryRun: boolean;
  confirm: boolean;
  draft: boolean;
  publish: boolean;
  updateOnly: boolean;
};

export function RyuStackPanel(props: RyuStackPanelProps) {
  const [remote, setRemote] = createSignal("origin");
  const [dryRun, setDryRun] = createSignal(false);
  const [confirm, setConfirm] = createSignal(false);
  const [draft, setDraft] = createSignal(false);
  const [publish, setPublish] = createSignal(false);
  const [updateOnly, setUpdateOnly] = createSignal(false);

  const options = createMemo<RyuOptions>(() => ({
    remote: remote().trim() || "origin",
    dryRun: dryRun(),
    confirm: confirm(),
    draft: draft(),
    publish: publish(),
    updateOnly: updateOnly(),
  }));

  const isRunning = createMemo(() => props.run()?.running ?? false);

  const stdoutLines = createMemo(() => {
    const run = props.run();
    if (!run) return [];
    return run.output.filter((line) => line.stream === "stdout").map((line) => line.data);
  });

  const parsed = createMemo(() => parseRyuStdout(stdoutLines()));
  const stackTitle = createMemo(() => parsed().title);
  const stackItems = createMemo<RyuStackItem[]>(() => parsed().items);

  const statusClass = createMemo(() => {
    const run = props.run();
    if (!run) return "is-idle";
    if (run.running) return "is-running";
    if (run.ok === true) return "is-success";
    if (run.ok === false) return "is-error";
    return "is-idle";
  });

  const runLabel = createMemo(() => {
    const run = props.run();
    if (!run) return "No runs yet.";
    if (run.running) return "Running…";
    if (run.ok === true) return "Completed.";
    if (run.ok === false) return "Failed.";
    return "Idle.";
  });

  return (
    <aside class="tasks-panel">
      <div class="tasks-header">
        <div class="tasks-header-left">
          <span>PR Stack</span>
          <span class="tasks-header-meta" title={props.workspaceName}>
            {props.workspaceName}
          </span>
        </div>
        <div class="tasks-header-right">
          <span class={`tasks-status ${statusClass()}`}>{runLabel()}</span>
          <button
            type="button"
            class="ghost tasks-clear"
            onClick={props.onClear}
            disabled={!props.run() || isRunning()}
            title="Clear output"
            aria-label="Clear output"
          >
            ×
          </button>
        </div>
      </div>

      <div class="tasks-section">
        <div class="tasks-row">
          <div class="tasks-row-left">
            <div class="tasks-row-title">jj-ryu</div>
            <div class="tasks-row-subtitle">
              Stacked PRs for Jujutsu bookmarks. Requires the <span class="tasks-mono">ryu</span>{" "}
              binary (install via <span class="tasks-mono">npm i -g jj-ryu</span> or{" "}
              <span class="tasks-mono">cargo install jj-ryu</span>).
            </div>
          </div>
        </div>

        <Show when={stackItems().length > 0}>
          <div class="tasks-commands-card">
            <div class="tasks-commands-header">
              <span>Stack</span>
              <span class="tasks-commands-meta">
                {stackTitle() ?? `${stackItems().length} bookmark${stackItems().length === 1 ? "" : "s"}`}
              </span>
            </div>
            <div class="ryu-stack-list">
              <For each={stackItems()}>
                {(item) => (
                  <div class="ryu-stack-item">
                    <div class="ryu-stack-left">
                      <div class="ryu-stack-title tasks-mono">[{item.bookmark}]</div>
                      <Show when={item.summary}>
                        <div class="ryu-stack-summary">{item.summary}</div>
                      </Show>
                      <Show when={item.changeId || item.commitId}>
                        <div class="ryu-stack-ids">
                          <Show when={item.changeId}>
                            <span class="tasks-mono">{item.changeId}</span>
                          </Show>
                          <Show when={item.commitId}>
                            <span class="tasks-mono">{item.commitId}</span>
                          </Show>
                        </div>
                      </Show>
                    </div>
                    <div class="ryu-stack-badges">
                      <Show when={item.isWorkingCopy}>
                        <span class="ryu-badge">wc</span>
                      </Show>
                      <Show when={item.markers.includes("*")}>
                        <span class="ryu-badge ryu-badge--ok">synced</span>
                      </Show>
                      <Show when={item.markers.includes("^")}>
                        <span class="ryu-badge ryu-badge--warn">push</span>
                      </Show>
                      <Show when={item.markers.includes("!")}>
                        <span class="ryu-badge ryu-badge--err">conflict</span>
                      </Show>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>

        <div class="tasks-commands-card">
          <div class="tasks-commands-header">
            <span>Options</span>
            <span class="tasks-commands-meta">Defaults</span>
          </div>
          <div class="tasks-commands-grid">
            <label class="tasks-command-field">
              <span class="tasks-command-label">Remote</span>
              <input
                class="tasks-command-input"
                type="text"
                value={remote()}
                placeholder="origin"
                spellcheck={false}
                onInput={(event) => setRemote(event.currentTarget.value)}
              />
            </label>
            <div class="tasks-command-field">
              <span class="tasks-command-label">Submit flags</span>
              <div class="flex flex-col gap-[8px] pt-[6px] text-[11px] text-white/70">
                <label class="inline-flex items-center gap-[8px]">
                  <input
                    type="checkbox"
                    checked={dryRun()}
                    onChange={(event) => setDryRun(event.currentTarget.checked)}
                  />
                  <span>Dry run</span>
                </label>
                <label class="inline-flex items-center gap-[8px]">
                  <input
                    type="checkbox"
                    checked={confirm()}
                    onChange={(event) => setConfirm(event.currentTarget.checked)}
                  />
                  <span>Confirm</span>
                </label>
                <label class="inline-flex items-center gap-[8px]">
                  <input
                    type="checkbox"
                    checked={draft()}
                    onChange={(event) => setDraft(event.currentTarget.checked)}
                  />
                  <span>Draft new PRs</span>
                </label>
                <label class="inline-flex items-center gap-[8px]">
                  <input
                    type="checkbox"
                    checked={publish()}
                    onChange={(event) => setPublish(event.currentTarget.checked)}
                  />
                  <span>Publish draft PRs</span>
                </label>
                <label class="inline-flex items-center gap-[8px]">
                  <input
                    type="checkbox"
                    checked={updateOnly()}
                    onChange={(event) => setUpdateOnly(event.currentTarget.checked)}
                  />
                  <span>Update only</span>
                </label>
              </div>
            </div>
          </div>

          <div class="tasks-commands-actions">
            <button
              type="button"
              class="secondary"
              disabled={isRunning()}
              onClick={() => props.onRun("status", options())}
              title="View current stack"
            >
              View
            </button>
            <button
              type="button"
              class="secondary"
              disabled={isRunning()}
              onClick={() => props.onRun("trackAll", options())}
              title="Track bookmarks in trunk()..@"
            >
              Track all
            </button>
            <button
              type="button"
              class="primary"
              disabled={isRunning()}
              onClick={() => props.onRun("submit", options())}
              title="Submit tracked bookmarks as stacked PRs"
            >
              Submit
            </button>
            <button
              type="button"
              class="ghost"
              disabled={isRunning()}
              onClick={() => props.onRun("sync", options())}
              title="Sync stack with remote"
            >
              Sync
            </button>
          </div>

          <div class="tasks-commands-actions">
            <button
              type="button"
              class="ghost"
              disabled={isRunning()}
              onClick={() => props.onRun("authGithub", options())}
              title="Test GitHub auth (gh token / GH_TOKEN / GITHUB_TOKEN)"
            >
              Auth: GitHub
            </button>
            <button
              type="button"
              class="ghost"
              disabled={isRunning()}
              onClick={() => props.onRun("authGitlab", options())}
              title="Test GitLab auth (glab token / GL_TOKEN / GITLAB_TOKEN)"
            >
              Auth: GitLab
            </button>
          </div>
        </div>

        <Show when={props.run()}>
          {(run) => (
            <>
              <div class="tasks-details">
                <div>
                  <span class="tasks-label">Command:</span>{" "}
                  <span class="tasks-mono">{run().command}</span>
                </div>
                <div>
                  <span class="tasks-label">CWD:</span>{" "}
                  <span class="tasks-mono">{run().cwd}</span>
                </div>
                <Show when={run().error}>
                  <div class="tasks-error">{run().error}</div>
                </Show>
              </div>

              <div class="tasks-output">
                <Show
                  when={run().output.length > 0}
                  fallback={
                    <div class="tasks-output-line">
                      No output yet. If <span class="tasks-mono">ryu</span> is not installed, you’ll
                      see an error after running.
                    </div>
                  }
                >
                  <For each={run().output}>
                    {(line) => (
                      <div
                        class="tasks-output-line"
                        classList={{ "is-stderr": line.stream === "stderr" }}
                      >
                        {line.data}
                      </div>
                    )}
                  </For>
                </Show>
              </div>
            </>
          )}
        </Show>
      </div>
    </aside>
  );
}

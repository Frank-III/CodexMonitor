import { createEffect, createMemo, createSignal, For, on, Show } from "solid-js";
import { createStore } from "solid-js/store";
import type { WorkspaceTaskRun } from "../stores/workspaceTasks";

type WorkspaceTasksPanelProps = {
  workspaceName: string;
  commandsWorkspaceId: string;
  commandsWorkspaceName: string;
  setupCommandOverride: string | null | undefined;
  runCommandOverride: string | null | undefined;
  spotlightEnabled: boolean;
  runs: Record<string, WorkspaceTaskRun | undefined>;
  onRunSetup: () => void;
  onRun: () => void;
  onSpotlight: () => void;
  onToggleSpotlight: (enabled: boolean) => void;
  onClearTask: (task: string) => void;
  onSaveCommands: (commands: { setupCommand: string; runCommand: string }) => Promise<void>;
};

export function WorkspaceTasksPanel(props: WorkspaceTasksPanelProps) {
  const [activeTask, setActiveTask] = createSignal<"setup" | "run" | "spotlight">("setup");
  const [commands, setCommands] = createStore<{
    setup: string;
    run: string;
    dirty: boolean;
    saving: boolean;
    error: string | null;
  }>({
    setup: props.setupCommandOverride ?? "",
    run: props.runCommandOverride ?? "",
    dirty: false,
    saving: false,
    error: null,
  });

  createEffect(
    on(
      () => [props.commandsWorkspaceId, props.setupCommandOverride, props.runCommandOverride] as const,
      ([, setup, run]) => {
        setCommands({
          setup: setup ?? "",
          run: run ?? "",
          dirty: false,
          saving: false,
          error: null,
        });
      },
    ),
  );

  const resolveRun = (task: "setup" | "run" | "spotlight") => props.runs[task] ?? null;

  const statusLabel = (task: "setup" | "run" | "spotlight") => {
    const run = resolveRun(task);
    if (!run) return "Idle";
    if (run.running) return "Running";
    if (run.ok === true) return "Success";
    if (run.ok === false) return "Failed";
    return "Idle";
  };

  const statusClass = (task: "setup" | "run" | "spotlight") => {
    const run = resolveRun(task);
    if (!run) return "is-idle";
    if (run.running) return "is-running";
    if (run.ok === true) return "is-success";
    if (run.ok === false) return "is-error";
    return "is-idle";
  };

  const activeRun = createMemo(() => resolveRun(activeTask()));
  const primaryRunTask = () => (props.spotlightEnabled ? "spotlight" : "run");
  const primaryRunLabel = () => (props.spotlightEnabled ? "Spotlight" : "Run");
  const secondaryRunTask = () => (props.spotlightEnabled ? "run" : "spotlight");
  const secondaryRunLabel = () => (props.spotlightEnabled ? "Run" : "Spotlight");
  const primaryRunAction = () => (props.spotlightEnabled ? props.onSpotlight : props.onRun);
  const secondaryRunAction = () => (props.spotlightEnabled ? props.onRun : props.onSpotlight);
  const runClearDisabled = () => {
    const run = resolveRun("run");
    const spotlight = resolveRun("spotlight");
    if (!run && !spotlight) {
      return true;
    }
    return Boolean(run?.running || spotlight?.running);
  };

  const handleSaveCommands = async () => {
    if (commands.saving || !commands.dirty) {
      return;
    }
    setCommands({ saving: true, error: null });
    try {
      await props.onSaveCommands({
        setupCommand: commands.setup,
        runCommand: commands.run,
      });
      setCommands({ saving: false, dirty: false });
    } catch (err) {
      setCommands({
        saving: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleResetCommands = () => {
    setCommands({
      setup: props.setupCommandOverride ?? "",
      run: props.runCommandOverride ?? "",
      dirty: false,
      error: null,
    });
  };

  return (
    <aside class="tasks-panel">
      <div class="tasks-header">
        <div class="tasks-header-left">
          <span>Tasks</span>
          <span class="tasks-header-meta" title={props.workspaceName}>
            {props.workspaceName}
          </span>
        </div>
      </div>

      <div class="tasks-section">
        <div class="tasks-row">
          <div class="tasks-row-left">
            <div class="tasks-row-title">Setup</div>
            <div class="tasks-row-subtitle">
              Runs <span class="tasks-mono">codexmonitor.setup.json</span> /{" "}
              <span class="tasks-mono">package.json</span> setup config with{" "}
              <span class="tasks-mono">CONDUCTOR_ROOT_PATH</span> set.
            </div>
          </div>
          <div class="tasks-row-right">
            <span class={`tasks-status ${statusClass("setup")}`}>{statusLabel("setup")}</span>
            <button
              type="button"
              class="secondary"
              onClick={props.onRunSetup}
              disabled={resolveRun("setup")?.running}
              title="Run setup"
            >
              Run
            </button>
            <button
              type="button"
              class="ghost tasks-clear"
              onClick={() => props.onClearTask("setup")}
              disabled={!resolveRun("setup") || resolveRun("setup")?.running}
              title="Clear output"
              aria-label="Clear output"
            >
              ×
            </button>
          </div>
        </div>

        <div class="tasks-row">
          <div class="tasks-row-left">
            <div class="tasks-row-title">Run</div>
            <div class="tasks-row-subtitle">
              <label class="inline-flex items-center gap-[8px]">
                <input
                  type="checkbox"
                  checked={props.spotlightEnabled}
                  onChange={(event) => props.onToggleSpotlight(event.currentTarget.checked)}
                />
                <span>
                  Spotlight mode (run in repo root by temporarily applying this workspace’s commit)
                </span>
              </label>
            </div>
          </div>
          <div class="tasks-row-right">
            <span class={`tasks-status ${statusClass(primaryRunTask())}`}>{statusLabel(primaryRunTask())}</span>
            <button
              type="button"
              class="secondary"
              onClick={() => {
                setActiveTask(primaryRunTask());
                primaryRunAction()();
              }}
              disabled={resolveRun(primaryRunTask())?.running}
              title={primaryRunLabel()}
            >
              {primaryRunLabel()}
            </button>
            <button
              type="button"
              class="ghost"
              onClick={() => {
                setActiveTask(secondaryRunTask());
                secondaryRunAction()();
              }}
              disabled={resolveRun(secondaryRunTask())?.running}
              title={secondaryRunLabel()}
            >
              {secondaryRunLabel()}
            </button>
            <button
              type="button"
              class="ghost tasks-clear"
              onClick={() => {
                props.onClearTask("run");
                props.onClearTask("spotlight");
              }}
              disabled={runClearDisabled()}
              title="Clear output"
              aria-label="Clear output"
            >
              ×
            </button>
          </div>
        </div>

        <div class="tasks-tabs">
          <button
            type="button"
            class="tasks-tab"
            classList={{ active: activeTask() === "setup" }}
            onClick={() => setActiveTask("setup")}
          >
            Setup
          </button>
          <button
            type="button"
            class="tasks-tab"
            classList={{ active: activeTask() === "run" }}
            onClick={() => setActiveTask("run")}
          >
            Run
          </button>
          <button
            type="button"
            class="tasks-tab"
            classList={{ active: activeTask() === "spotlight" }}
            onClick={() => setActiveTask("spotlight")}
          >
            Spotlight
          </button>
        </div>

        <Show when={activeRun()}>
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
                <Show when={run().root_path}>
                  <div>
                    <span class="tasks-label">Root:</span>{" "}
                    <span class="tasks-mono">{run().root_path}</span>
                  </div>
                </Show>
                <Show when={run().error}>
                  <div class="tasks-error">{run().error}</div>
                </Show>
              </div>

              <div class="tasks-output">
                <For each={run().output}>
                  {(line) => (
                    <div
                      class="tasks-output-line"
                      classList={{
                        "is-stderr": line.stream === "stderr",
                      }}
                    >
                      {line.data}
                    </div>
                  )}
                </For>
              </div>
            </>
	          )}
	        </Show>

          <div class="tasks-commands-card">
            <div class="tasks-commands-header">
              <span>Commands</span>
              <span class="tasks-commands-meta" title={props.commandsWorkspaceName}>
                {props.commandsWorkspaceName}
              </span>
            </div>
            <div class="tasks-commands-grid">
              <label class="tasks-command-field">
                <span class="tasks-command-label">Setup override</span>
                <input
                  class="tasks-command-input"
                  type="text"
                  value={commands.setup}
                  placeholder="Auto (package.json scripts.setup/codexMonitor.setupCommand)"
                  spellcheck={false}
                  onInput={(event) =>
                    setCommands({
                      setup: event.currentTarget.value,
                      dirty: true,
                      error: null,
                    })
                  }
                />
              </label>
              <label class="tasks-command-field">
                <span class="tasks-command-label">Run override</span>
                <input
                  class="tasks-command-input"
                  type="text"
                  value={commands.run}
                  placeholder="Auto (package.json scripts.dev/start/test/codexMonitor.runCommand)"
                  spellcheck={false}
                  onInput={(event) =>
                    setCommands({
                      run: event.currentTarget.value,
                      dirty: true,
                      error: null,
                    })
                  }
                />
              </label>
            </div>
            <Show when={commands.error}>
              <div class="tasks-error">{commands.error}</div>
            </Show>
            <div class="tasks-commands-actions">
              <button
                type="button"
                class="secondary"
                onClick={handleSaveCommands}
                disabled={!commands.dirty || commands.saving}
              >
                {commands.saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                class="ghost"
                onClick={handleResetCommands}
                disabled={!commands.dirty || commands.saving}
              >
                Reset
              </button>
            </div>
          </div>
	      </div>
	    </aside>
	  );
}

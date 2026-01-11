import { For, Show, type Accessor } from "solid-js";

type ComposerProps = {
  value: Accessor<string>;
  onChange: (value: string) => void;
  onSend: () => void;
  models: Accessor<{ id: string; displayName: string; model: string }[]>;
  selectedModelId: Accessor<string | null>;
  onSelectModel: (id: string | null) => void;
  reasoningOptions: Accessor<string[]>;
  selectedEffort: Accessor<string | null>;
  onSelectEffort: (effort: string | null) => void;
  skills: Accessor<{ name: string; description?: string }[]>;
  onSelectSkill: (name: string) => void;
};

export function Composer(props: ComposerProps) {
  return (
    <footer class="composer">
      <div class="composer-input">
        <textarea
          placeholder="Ask Codex to do something..."
          value={props.value()}
          onInput={(event) => props.onChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              props.onSend();
            }
          }}
        />
        <button class="composer-send" onClick={props.onSend}>
          Send
        </button>
      </div>
      <div class="composer-bar">
        <div class="composer-meta">
          <div class="composer-select-wrap">
            <span class="composer-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M7 8V6a5 5 0 0 1 10 0v2"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linecap="round"
                />
                <rect
                  x="4.5"
                  y="8"
                  width="15"
                  height="11"
                  rx="3"
                  stroke="currentColor"
                  stroke-width="1.4"
                />
                <circle cx="9" cy="13" r="1" fill="currentColor" />
                <circle cx="15" cy="13" r="1" fill="currentColor" />
                <path
                  d="M9 16h6"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linecap="round"
                />
              </svg>
            </span>
            <select
              class="composer-select composer-select--model"
              aria-label="Model"
              value={props.selectedModelId() ?? ""}
              onChange={(event) => props.onSelectModel(event.currentTarget.value)}
            >
              <Show when={props.models().length === 0}>
                <option value="">No models</option>
              </Show>
              <For each={props.models()}>
                {(model) => (
                  <option value={model.id}>
                    {model.displayName || model.model}
                  </option>
                )}
              </For>
            </select>
          </div>
          <div class="composer-select-wrap">
            <span class="composer-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M8.5 4.5a3.5 3.5 0 0 0-3.46 4.03A4 4 0 0 0 6 16.5h2"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linecap="round"
                />
                <path
                  d="M15.5 4.5a3.5 3.5 0 0 1 3.46 4.03A4 4 0 0 1 18 16.5h-2"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linecap="round"
                />
                <path
                  d="M9 12h6"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linecap="round"
                />
                <path
                  d="M12 12v6"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linecap="round"
                />
              </svg>
            </span>
            <select
              class="composer-select composer-select--effort"
              aria-label="Thinking mode"
              value={props.selectedEffort() ?? ""}
              onChange={(event) => props.onSelectEffort(event.currentTarget.value)}
            >
              <Show when={props.reasoningOptions().length === 0}>
                <option value="">Default</option>
              </Show>
              <For each={props.reasoningOptions()}>
                {(effort) => (
                  <option value={effort}>{effort}</option>
                )}
              </For>
            </select>
          </div>
          <div class="composer-select-wrap">
            <span class="composer-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 4l7 3v5c0 4.5-3 7.5-7 8-4-0.5-7-3.5-7-8V7l7-3z"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linejoin="round"
                />
                <path
                  d="M9.5 12.5l1.8 1.8 3.7-4"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </span>
            <select
              class="composer-select composer-select--approval"
              aria-label="Approval"
            >
              <option>On request</option>
              <option>Never</option>
              <option>Unless trusted</option>
            </select>
          </div>
          <div class="composer-select-wrap">
            <span class="composer-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 4v5m0 6v5M4 12h5m6 0h5"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linecap="round"
                />
                <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.4" />
              </svg>
            </span>
            <select
              class="composer-select composer-select--skill"
              aria-label="Skills"
              onChange={(event) => {
                const value = event.currentTarget.value;
                if (value) {
                  props.onSelectSkill(value);
                  event.currentTarget.value = "";
                }
              }}
            >
              <option value="">Skill</option>
              <For each={props.skills()}>
                {(skill) => (
                  <option value={skill.name}>{skill.name}</option>
                )}
              </For>
            </select>
          </div>
        </div>
      </div>
    </footer>
  );
}

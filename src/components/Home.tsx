type HomeProps = {
  onOpenProject: () => void;
  onAddWorkspace: () => void;
  onCloneRepository: () => void;
};

export function Home(props: HomeProps) {
  return (
    <div class="home">
      <div class="home-title">Codex Monitor</div>
      <div class="home-subtitle">
        Orchestrate agents across your local projects.
      </div>
      <div class="home-actions">
        <button
          class="home-button primary"
          onClick={props.onOpenProject}
          data-tauri-drag-region="false"
        >
          <span class="home-icon" aria-hidden>
            ⌘
          </span>
          Open Project
        </button>
        <button
          class="home-button secondary"
          onClick={props.onAddWorkspace}
          data-tauri-drag-region="false"
        >
          <span class="home-icon" aria-hidden>
            +
          </span>
          Add Workspace
        </button>
        <button
          class="home-button ghost"
          onClick={props.onCloneRepository}
          disabled
          data-tauri-drag-region="false"
        >
          <span class="home-icon" aria-hidden>
            ⤓
          </span>
          Clone Repository
        </button>
      </div>
    </div>
  );
}

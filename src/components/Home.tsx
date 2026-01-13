type HomeProps = {
  onOpenProject: () => void;
  onAddWorkspace: () => void;
  onCloneRepository: () => void;
};

export function Home(props: HomeProps) {
  return (
    <div class="flex h-full flex-col items-center justify-center p-8">
      <div class="flex max-w-sm flex-col items-center gap-2 text-center">
        <h1 class="text-xl font-medium tracking-tight text-text-strong">
          Codex Monitor
        </h1>
        <p class="text-sm text-text-weak">
          Orchestrate agents across your local projects.
        </p>
      </div>

      <div class="mt-6 flex w-full max-w-xs flex-col gap-1.5">
        <Button variant="primary" onClick={props.onOpenProject}>
          <FolderIcon />
          Open Project
        </Button>
        <Button variant="secondary" onClick={props.onAddWorkspace}>
          <PlusIcon />
          Add Workspace
        </Button>
        <Button variant="ghost" onClick={props.onCloneRepository}>
          <DownloadIcon />
          Clone Repository
        </Button>
      </div>
    </div>
  );
}

function Button(props: {
  variant: "primary" | "secondary" | "ghost";
  onClick: () => void;
  children: any;
}) {
  const base =
    "flex h-8 w-full items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors";
  const variants = {
    primary:
      "bg-text-strong text-bg-base hover:bg-smoke-11",
    secondary:
      "bg-surface-raised text-text-strong border border-border-weak hover:bg-surface-raised-hover",
    ghost:
      "text-text-base hover:bg-surface-hover",
  };

  return (
    <button
      type="button"
      class={`${base} ${variants[props.variant]}`}
      onClick={props.onClick}
      data-tauri-drag-region="false"
    >
      {props.children}
    </button>
  );
}

function FolderIcon() {
  return (
    <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none">
      <path
        d="M2.5 4.5v7a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H8L6.5 4H3.5a1 1 0 0 0-1 .5Z"
        stroke="currentColor"
        stroke-width="1.25"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none">
      <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 2v9m0 0L5 8m3 3 3-3M3 12v1.5a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V12"
        stroke="currentColor"
        stroke-width="1.25"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

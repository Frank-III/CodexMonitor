export type WorkspaceInfo = {
  id: string;
  name: string;
  path: string;
  connected: boolean;
  codex_bin?: string | null;
  kind: "main" | "worktree";
  parent_id?: string | null;
  base_id?: string | null;
  base_revset?: string | null;
  jj_branch?: string | null;
  settings: WorkspaceSettings;
};

export type WorkspaceSettings = {
  sidebar_collapsed: boolean;
  sort_order: number;
  spotlight_enabled: boolean;
  setup_command?: string | null;
  run_command?: string | null;
};

export type WorktreeMode = "fork" | "stack";

export type WorktreeDivergence = {
  ahead: number;
  behind: number;
  base_id: string;
  base_name: string;
  base_revset: string;
};

export type WorktreeStackAction = "sync" | "land";

export type WorktreeStackTarget = {
  workspace_id: string;
  name: string;
};

export type WorktreeStackEvent =
  | {
      stage: "start";
      op_id: string;
      action: WorktreeStackAction;
      root_id: string;
      targets: WorktreeStackTarget[];
    }
  | {
      stage: "step_start";
      op_id: string;
      action: WorktreeStackAction;
      root_id: string;
      workspace_id: string;
      name: string;
      index: number;
      total: number;
    }
  | {
      stage: "step_end";
      op_id: string;
      action: WorktreeStackAction;
      root_id: string;
      workspace_id: string;
      name: string;
      index: number;
      total: number;
      ok: boolean;
      message: string | null;
      destination_id: string | null;
    }
  | {
      stage: "end";
      op_id: string;
      action: WorktreeStackAction;
      root_id: string;
      ok: boolean;
      error: string | null;
    };

export type WorkspaceTaskStream = "stdout" | "stderr";

export type WorkspaceTaskEvent =
  | {
      stage: "start";
      op_id: string;
      workspace_id: string;
      task: string;
      command: string;
      cwd: string;
      root_path: string | null;
    }
  | {
      stage: "output";
      op_id: string;
      workspace_id: string;
      task: string;
      stream: WorkspaceTaskStream;
      data: string;
    }
  | {
      stage: "end";
      op_id: string;
      workspace_id: string;
      task: string;
      ok: boolean;
      exit_code: number | null;
      error: string | null;
    };

export type AppServerEvent = {
  workspace_id: string;
  message: Record<string, unknown>;
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

export type TodoItemData = {
  content: string;
  status: "pending" | "in_progress" | "completed";
};

export type ConversationItem =
  | { id: string; kind: "message"; role: "user" | "assistant"; text: string }
  | { id: string; kind: "reasoning"; summary: string; content: string }
  | { id: string; kind: "diff"; title: string; diff: string; status?: string }
  | {
      id: string;
      kind: "tool";
      toolType: string;
      title: string;
      detail: string;
      status?: string;
      output?: string;
      changes?: { path: string; kind?: string; diff?: string }[];
      todos?: TodoItemData[];
    };

export type ThreadSummary = {
  id: string;
  name: string;
};

export type AccessMode = "read-only" | "current" | "full-access";

export type AppSettings = {
  codexBin: string | null;
  defaultAccessMode: AccessMode;
  uiScale: number;
  experimentalSteerEnabled: boolean;
};

export type CodexDoctorResult = {
  ok: boolean;
  codexBin: string | null;
  version: string | null;
  appServerOk: boolean;
  details: string | null;
  path: string | null;
  nodeOk: boolean;
  nodeVersion: string | null;
  nodeDetails: string | null;
};

export type ApprovalRequest = {
  workspace_id: string;
  request_id: number;
  method: string;
  params: Record<string, unknown>;
};

export type VcsFileStatus = {
  path: string;
  status: string;
  additions: number;
  deletions: number;
};

export type VcsLogEntry = {
  sha: string;
  summary: string;
  author: string;
  timestamp: number;
};

export type VcsLogResponse = {
  total: number;
  entries: VcsLogEntry[];
};

export type GitHubIssue = {
  number: number;
  title: string;
  url: string;
  updatedAt: string;
};

export type GitHubIssuesResponse = {
  total: number;
  issues: GitHubIssue[];
};

export type ModelOption = {
  id: string;
  model: string;
  displayName: string;
  description: string;
  supportedReasoningEfforts: { reasoningEffort: string; description: string }[];
  defaultReasoningEffort: string;
  isDefault: boolean;
};

export type SkillOption = {
  name: string;
  path: string;
  description?: string;
};

export type PromptOption = {
  id: string;
  name: string;
  description?: string;
  prompt?: string;
};

export type DebugEntry = {
  id: string;
  timestamp: number;
  source: "client" | "server" | "event" | "stderr" | "error";
  label: string;
  payload?: unknown;
};

export type TurnPlanStepStatus = "pending" | "inProgress" | "completed";

export type TurnPlanStep = {
  step: string;
  status: TurnPlanStepStatus;
};

export type TurnPlan = {
  turnId: string;
  explanation: string | null;
  steps: TurnPlanStep[];
};

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
};

export type ThreadUsage = {
  threadId: string;
  turnCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  lastUpdated: number;
};

export type Attachment = {
  id: string;
  type: "image" | "file";
  name: string;
  path?: string;
  data?: string; // base64 for images
  mimeType?: string;
};

export type ApprovalPolicy = "on-request" | "never" | "unless-allow-listed";

export type QueuedMessage = {
  id: string;
  threadId: string;
  text: string;
  createdAt: number;
  attachments?: Attachment[];
  approvalPolicy?: ApprovalPolicy;
  accessMode?: AccessMode;
};

export type FileEntry = {
  path: string;
  name: string;
  isDirectory: boolean;
};

export type WorkspacePathKind = "file" | "dir";

export type WorkspacePathItem = {
  path: string;
  name: string;
  kind: WorkspacePathKind;
};

export type WorkspaceDirTreeEntry = {
  path: string;
  name: string;
  kind: WorkspacePathKind;
  children?: WorkspaceDirTreeEntry[];
};

export type WorkspaceDirTree = {
  path: string;
  entries: WorkspaceDirTreeEntry[];
  truncated: boolean;
};

export type WorkspaceFileContent =
  | {
      kind: "text";
      content: string;
      byteLength: number;
      truncated: boolean;
    }
  | {
      kind: "binary";
      byteLength: number;
      truncated: boolean;
    };

export type JjBookmarkKind = "local" | "remote";

export type JjBookmarkInfo = {
  kind: JjBookmarkKind;
  symbol: string;
  name: string;
  remote?: string | null;
  tracked: boolean;
  commitId?: string | null;
  changeId?: string | null;
  summary?: string | null;
  author?: string | null;
  timestamp?: number | null;
  conflict: boolean;
};

export type TerminalOutputEvent = {
  workspace_id: string;
  terminal_id: string;
  data: string;
};

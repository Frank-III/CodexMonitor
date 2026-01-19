import { invoke } from "@tauri-apps/api/core";
import type {
  AccessMode,
  AppSettings,
  CodexDoctorResult,
  ConflictInfo,
  GitHubIssuesResponse,
  JjBookmarkInfo,
  JjOperation,
  LandResult,
  SyncResult,
  VcsFileStatus,
  VcsLogResponse,
  WorkspaceDirTree,
  WorkspaceFileContent,
  WorkspaceInfo,
  WorkspacePathItem,
  WorkspaceSettings,
  WorktreeDivergence,
  WorktreeMode,
} from "../types";

export async function logFrontendError(message: string, stack?: string): Promise<void> {
  try {
    await invoke("log_frontend_error", { message, stack: stack ?? null });
  } catch {
    // Ignore: not running in Tauri or command not registered.
  }
}

export async function pickWorkspacePath(): Promise<string | null> {
  return invoke<string | null>("pick_directory");
}

export async function listWorkspaces(): Promise<WorkspaceInfo[]> {
  return invoke<WorkspaceInfo[]>("list_workspaces");
}

export async function addWorkspace(
  path: string,
  codex_bin: string | null,
): Promise<WorkspaceInfo> {
  return invoke<WorkspaceInfo>("add_workspace", { path, codex_bin });
}

export async function cloneRepository(
  url: string,
  destinationPath: string,
): Promise<string> {
  return invoke<string>("clone_repository", { url, destinationPath });
}

export async function addWorktree(
  workspaceId: string,
  name: string,
  mode: WorktreeMode,
  baseRevset?: string | null,
): Promise<WorkspaceInfo> {
  return invoke<WorkspaceInfo>("add_worktree", {
    workspaceId,
    name,
    mode,
    baseRevset: baseRevset ?? null,
  });
}

export async function landWorktree(id: string): Promise<LandResult> {
  return invoke<LandResult>("land_worktree", { id });
}

export async function syncWorktree(id: string): Promise<SyncResult> {
  return invoke<SyncResult>("sync_worktree", { id });
}

export async function syncWorktreeStack(id: string): Promise<void> {
  return invoke("sync_worktree_stack", { id });
}

export async function landWorktreeStack(id: string): Promise<string> {
  return invoke<string>("land_worktree_stack", { id });
}

// JJ Operation History & Undo

export async function getJjOperations(
  workspaceId: string,
  limit?: number,
): Promise<JjOperation[]> {
  return invoke<JjOperation[]>("get_jj_operations", { workspaceId, limit: limit ?? null });
}

export async function restoreJjOperation(
  workspaceId: string,
  opId: string,
): Promise<void> {
  return invoke("restore_jj_operation", { workspaceId, opId });
}

export async function checkConflicts(
  workspaceId: string,
  revset: string,
): Promise<ConflictInfo> {
  return invoke<ConflictInfo>("check_conflicts", { workspaceId, revset });
}

export async function runWorkspaceSetup(workspaceId: string): Promise<string> {
  return invoke<string>("run_workspace_setup", { workspaceId });
}

export async function runWorkspaceRun(workspaceId: string): Promise<string> {
  return invoke<string>("run_workspace_run", { workspaceId });
}

export async function runWorkspaceSpotlight(workspaceId: string): Promise<string> {
  return invoke<string>("run_workspace_spotlight", { workspaceId });
}

export async function runRyu(workspaceId: string, args: string[] = []): Promise<string> {
  return invoke<string>("run_ryu", { workspaceId, args });
}

export async function reparentWorktree(options: {
  id: string;
  newBaseId: string;
  baseRevset: string | null;
  restack: boolean;
}): Promise<WorkspaceInfo> {
  return invoke<WorkspaceInfo>("reparent_worktree", {
    id: options.id,
    newBaseId: options.newBaseId,
    baseRevset: options.baseRevset ?? null,
    restack: options.restack,
  });
}

export async function getWorktreeDivergence(id: string): Promise<WorktreeDivergence> {
  return invoke<WorktreeDivergence>("get_worktree_divergence", { id });
}

export async function getWorkspaceDivergence(id: string): Promise<WorktreeDivergence> {
  return invoke<WorktreeDivergence>("get_workspace_divergence", { id });
}

export async function updateWorktreeBaseRevset(
  id: string,
  baseRevset: string,
): Promise<WorkspaceInfo> {
  return invoke<WorkspaceInfo>("update_worktree_base_revset", { id, baseRevset });
}

export async function updateWorkspaceBaseRevset(
  id: string,
  baseRevset: string,
): Promise<WorkspaceInfo> {
  return invoke<WorkspaceInfo>("update_workspace_base_revset", { id, baseRevset });
}

export async function removeWorkspace(id: string): Promise<void> {
  return invoke("remove_workspace", { id });
}

export async function connectWorkspace(id: string): Promise<void> {
  return invoke("connect_workspace", { id });
}

export async function updateWorkspaceSettings(
  id: string,
  settings: WorkspaceSettings,
): Promise<WorkspaceInfo> {
  return invoke<WorkspaceInfo>("update_workspace_settings", { id, settings });
}

export async function startThread(workspaceId: string) {
  return invoke<any>("start_thread", { workspaceId });
}

export async function sendUserMessage(
  workspaceId: string,
  threadId: string,
  text: string,
  options?: {
    model?: string | null;
    effort?: string | null;
    attachments?: import("../types").Attachment[];
    approvalPolicy?: import("../types").ApprovalPolicy;
    accessMode?: AccessMode;
  },
) {
  // Build input array with text and images
  const input: { type: string; text?: string; data?: string; mimeType?: string }[] = [];
  if (text.trim()) {
    input.push({ type: "text", text });
  }
  for (const attachment of options?.attachments ?? []) {
    if (attachment.type === "image" && attachment.data) {
      input.push({
        type: "image",
        data: attachment.data,
        mimeType: attachment.mimeType,
      });
    }
  }
  return invoke("send_user_message", {
    workspaceId,
    threadId,
    input,
    model: options?.model ?? null,
    effort: options?.effort ?? null,
    approvalPolicy: options?.approvalPolicy ?? null,
    accessMode: options?.accessMode ?? null,
  });
}

export async function respondToServerRequest(
  workspaceId: string,
  requestId: number,
  decision: "accept" | "decline",
) {
  return invoke("respond_to_server_request", {
    workspaceId,
    requestId,
    result: { decision },
  });
}

export async function getVcsStatus(workspace_id: string): Promise<{
  branchName: string;
  files: VcsFileStatus[];
  totalAdditions: number;
  totalDeletions: number;
}> {
  return invoke("get_vcs_status", { workspaceId: workspace_id });
}

export async function jjWorkspaceUpdateStale(workspaceId: string): Promise<string> {
  return invoke<string>("jj_workspace_update_stale", { workspaceId });
}

export async function getModelList(workspaceId: string) {
  return invoke<any>("model_list", { workspaceId });
}

export async function getSkillsList(workspaceId: string) {
  return invoke<any>("skills_list", { workspaceId });
}

export async function getPromptsList(workspaceId: string) {
  return invoke<any>("prompts_list", { workspaceId });
}

export async function listThreads(
  workspaceId: string,
  cursor?: string | null,
  limit?: number | null,
) {
  return invoke<any>("list_threads", { workspaceId, cursor, limit });
}

export async function resumeThread(workspaceId: string, threadId: string) {
  return invoke<any>("resume_thread", { workspaceId, threadId });
}

export async function archiveThread(workspaceId: string, threadId: string) {
  return invoke<any>("archive_thread", { workspaceId, threadId });
}

export async function interruptTurn(
  workspaceId: string,
  threadId: string,
  turnId: string,
) {
  return invoke("turn_interrupt", { workspaceId, threadId, turnId });
}

export type FileDiffResult = {
  old_content: string;
  new_content: string;
};

export async function getFileDiff(
  workspaceId: string,
  filePath: string,
): Promise<FileDiffResult> {
  return invoke<FileDiffResult>("get_file_diff", { workspaceId, filePath });
}

export async function getVcsLog(
  workspaceId: string,
  limit?: number,
): Promise<VcsLogResponse> {
  return invoke<VcsLogResponse>("get_vcs_log", { workspaceId, limit });
}

export async function getJjGraph(workspaceId: string, limit?: number): Promise<string> {
  return invoke<string>("get_jj_graph", { workspaceId, limit });
}

export async function listJjBookmarks(workspaceId: string): Promise<JjBookmarkInfo[]> {
  return invoke<JjBookmarkInfo[]>("list_jj_bookmarks", { workspaceId });
}

export async function setJjBookmark(
  workspaceId: string,
  name: string,
  targetRevset: string,
): Promise<void> {
  return invoke("set_jj_bookmark", { workspaceId, name, targetRevset });
}

export async function deleteJjBookmark(workspaceId: string, name: string): Promise<void> {
  return invoke("delete_jj_bookmark", { workspaceId, name });
}

export async function renameJjBookmark(
  workspaceId: string,
  oldName: string,
  newName: string,
): Promise<void> {
  return invoke("rename_jj_bookmark", { workspaceId, oldName, newName });
}

export async function trackJjRemoteBookmark(
  workspaceId: string,
  name: string,
  remote: string,
): Promise<void> {
  return invoke("track_jj_remote_bookmark", { workspaceId, name, remote });
}

export async function untrackJjRemoteBookmark(
  workspaceId: string,
  name: string,
  remote: string,
): Promise<void> {
  return invoke("untrack_jj_remote_bookmark", { workspaceId, name, remote });
}

export async function jjGitFetch(workspaceId: string, remote?: string): Promise<string> {
  return invoke<string>("jj_git_fetch", { workspaceId, remote });
}

export async function jjGitPushBookmark(
  workspaceId: string,
  bookmark: string,
  remote?: string,
): Promise<string> {
  return invoke<string>("jj_git_push_bookmark", { workspaceId, bookmark, remote });
}

export async function jjGitPushTracked(workspaceId: string, remote?: string): Promise<string> {
  return invoke<string>("jj_git_push_tracked", { workspaceId, remote });
}

export async function jjGitPushDeleted(workspaceId: string, remote?: string): Promise<string> {
  return invoke<string>("jj_git_push_deleted", { workspaceId, remote });
}

export async function getGitRemote(workspaceId: string): Promise<string | null> {
  return invoke<string | null>("get_vcs_remote", { workspaceId });
}

export async function getGitHubIssues(
  workspaceId: string,
): Promise<GitHubIssuesResponse> {
  return invoke<GitHubIssuesResponse>("get_github_issues", { workspaceId });
}

export async function listWorkspaceFiles(
  workspaceId: string,
  query?: string,
  limit?: number,
): Promise<{ path: string; name: string }[]> {
  return invoke<{ path: string; name: string }[]>("list_workspace_files", {
    workspaceId,
    query,
    limit: limit ?? null,
  });
}

export async function listWorkspacePaths(
  workspaceId: string,
  query?: string,
  limit?: number,
): Promise<WorkspacePathItem[]> {
  return invoke<WorkspacePathItem[]>("list_workspace_paths", {
    workspaceId,
    query,
    limit: limit ?? null,
  });
}

export async function listWorkspaceDir(
  workspaceId: string,
  path: string,
  depth?: number,
  limit?: number,
): Promise<WorkspaceDirTree> {
  return invoke<WorkspaceDirTree>("list_workspace_dir", {
    workspaceId,
    dirPath: path,
    depth: depth ?? null,
    limit: limit ?? null,
  });
}

export async function readFileAsBase64(filePath: string): Promise<string> {
  return invoke<string>("read_file_base64", { filePath });
}

export async function readWorkspaceFileText(
  workspaceId: string,
  path: string,
  maxBytes?: number,
): Promise<WorkspaceFileContent> {
  return invoke<WorkspaceFileContent>("read_workspace_file_text", {
    workspaceId,
    path,
    maxBytes: maxBytes ?? null,
  });
}

export type TerminalSessionInfo = {
  id: string;
};

export async function terminalOpen(
  workspaceId: string,
  terminalId: string,
  cols: number,
  rows: number,
): Promise<TerminalSessionInfo> {
  return invoke<TerminalSessionInfo>("terminal_open", { workspaceId, terminalId, cols, rows });
}

export async function terminalWrite(
  workspaceId: string,
  terminalId: string,
  data: string,
): Promise<void> {
  return invoke("terminal_write", { workspaceId, terminalId, data });
}

export async function terminalResize(
  workspaceId: string,
  terminalId: string,
  cols: number,
  rows: number,
): Promise<void> {
  return invoke("terminal_resize", { workspaceId, terminalId, cols, rows });
}

export async function terminalClose(
  workspaceId: string,
  terminalId: string,
): Promise<void> {
  return invoke("terminal_close", { workspaceId, terminalId });
}

export async function getAppSettings(): Promise<AppSettings> {
  return invoke<AppSettings>("get_app_settings");
}

export async function updateAppSettings(settings: AppSettings): Promise<AppSettings> {
  return invoke<AppSettings>("update_app_settings", { settings });
}

export async function runCodexDoctor(codexBin: string | null): Promise<CodexDoctorResult> {
  return invoke<CodexDoctorResult>("codex_doctor", { codexBin });
}

use base64::{engine::general_purpose::STANDARD, Engine as _};
use jj_lib::object_id::ObjectId as _;
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use uuid::Uuid;

use crate::codex::spawn_workspace_session;
use crate::state::AppState;
use crate::storage::write_workspaces;
use crate::types::{WorktreeDivergence, WorkspaceEntry, WorkspaceInfo, WorkspaceKind, WorkspaceSettings};
use crate::utils::{build_default_path_env, normalize_git_path};
use crate::vcs::{count_revset_commits, get_wc_commit, load_jj_workspace, resolve_single_revset_commit_id, snapshot_working_copy};

#[derive(Debug, serde::Deserialize, Clone, Copy)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum WorktreeMode {
    Fork,
    Stack,
}

#[derive(Debug, serde::Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum WorktreeStackAction {
    Sync,
    Land,
}

#[derive(Debug, serde::Serialize, Clone)]
#[serde(rename_all = "snake_case")]
struct WorktreeStackTarget {
    workspace_id: String,
    name: String,
}

#[derive(Debug, serde::Serialize, Clone)]
#[serde(tag = "stage", rename_all = "snake_case")]
enum WorktreeStackEvent {
    Start {
        op_id: String,
        action: WorktreeStackAction,
        root_id: String,
        targets: Vec<WorktreeStackTarget>,
    },
    StepStart {
        op_id: String,
        action: WorktreeStackAction,
        root_id: String,
        workspace_id: String,
        name: String,
        index: usize,
        total: usize,
    },
    StepEnd {
        op_id: String,
        action: WorktreeStackAction,
        root_id: String,
        workspace_id: String,
        name: String,
        index: usize,
        total: usize,
        ok: bool,
        message: Option<String>,
        destination_id: Option<String>,
    },
    End {
        op_id: String,
        action: WorktreeStackAction,
        root_id: String,
        ok: bool,
        error: Option<String>,
    },
}

fn emit_worktree_stack_event(app: &AppHandle, event: WorktreeStackEvent) {
    let _ = app.emit("worktree-stack-event", event);
}

#[derive(Debug, serde::Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum WorkspaceTaskStream {
    Stdout,
    Stderr,
}

#[derive(Debug, serde::Serialize, Clone)]
#[serde(tag = "stage", rename_all = "snake_case")]
enum WorkspaceTaskEvent {
    Start {
        op_id: String,
        workspace_id: String,
        task: String,
        command: String,
        cwd: String,
        root_path: Option<String>,
    },
    Output {
        op_id: String,
        workspace_id: String,
        task: String,
        stream: WorkspaceTaskStream,
        data: String,
    },
    End {
        op_id: String,
        workspace_id: String,
        task: String,
        ok: bool,
        exit_code: Option<i32>,
        error: Option<String>,
    },
}

fn emit_workspace_task_event(app: &AppHandle, event: WorkspaceTaskEvent) {
    let _ = app.emit("workspace-task-event", event);
}

fn shell_path() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
}

fn normalize_command_override(value: Option<&str>) -> Option<String> {
    value
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
}

#[derive(Debug, serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CodexMonitorConfig {
    setup_command: Option<String>,
    run_command: Option<String>,
    scripts: Option<HashMap<String, String>>,
}

fn resolve_codexmonitor_config(root_path: &Path) -> Option<CodexMonitorConfig> {
    for candidate in ["codexmonitor.setup.json", "codexmonitor.json", ".codexmonitor.json"] {
        let path = root_path.join(candidate);
        if !path.is_file() {
            continue;
        }
        let raw = std::fs::read_to_string(&path).ok()?;
        let parsed: CodexMonitorConfig = serde_json::from_str(&raw).ok()?;
        return Some(parsed);
    }
    None
}

fn resolve_setup_command_from_config(config: &CodexMonitorConfig) -> Option<String> {
    normalize_command_override(config.setup_command.as_deref()).or_else(|| {
        config
            .scripts
            .as_ref()
            .and_then(|scripts| scripts.get("setup"))
            .and_then(|value| normalize_command_override(Some(value)))
    })
}

fn resolve_run_command_from_config(config: &CodexMonitorConfig) -> Option<String> {
    normalize_command_override(config.run_command.as_deref()).or_else(|| {
        config
            .scripts
            .as_ref()
            .and_then(|scripts| scripts.get("run"))
            .and_then(|value| normalize_command_override(Some(value)))
    })
}

fn resolve_workspace_setup_command(root_path: &Path) -> Option<String> {
    if let Some(config) = resolve_codexmonitor_config(root_path) {
        if let Some(command) = resolve_setup_command_from_config(&config) {
            return Some(command);
        }
    }

    let raw = std::fs::read_to_string(root_path.join("package.json")).ok()?;
    let value: serde_json::Value = serde_json::from_str(&raw).ok()?;

    if let Some(command) = value
        .get("codexMonitor")
        .and_then(|node| node.get("setupCommand"))
        .and_then(|node| node.as_str())
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        return Some(command.to_string());
    }

    if value
        .get("scripts")
        .and_then(|node| node.get("setup"))
        .and_then(|node| node.as_str())
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .is_some()
    {
        return Some("bun run setup".to_string());
    }

    None
}

fn resolve_workspace_run_command(root_path: &Path) -> Option<String> {
    if let Some(config) = resolve_codexmonitor_config(root_path) {
        if let Some(command) = resolve_run_command_from_config(&config) {
            return Some(command);
        }
    }

    let raw = std::fs::read_to_string(root_path.join("package.json")).ok()?;
    let value: serde_json::Value = serde_json::from_str(&raw).ok()?;

    if let Some(command) = value
        .get("codexMonitor")
        .and_then(|node| node.get("runCommand"))
        .and_then(|node| node.as_str())
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        return Some(command.to_string());
    }

    for script_name in ["dev", "start", "test"] {
        if value
            .get("scripts")
            .and_then(|node| node.get(script_name))
            .and_then(|node| node.as_str())
            .map(|value| value.trim())
            .filter(|value| !value.is_empty())
            .is_some()
        {
            return Some(format!("bun run {script_name}"));
        }
    }

    None
}

fn slugify(value: &str) -> String {
    let mut output = String::new();
    let mut last_was_dash = false;

    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            output.push(ch.to_ascii_lowercase());
            last_was_dash = false;
            continue;
        }
        if matches!(ch, '-' | '_' | ' ' | '.') {
            if !output.is_empty() && !last_was_dash {
                output.push('-');
                last_was_dash = true;
            }
        }
    }

    output.trim_matches('-').to_string()
}

fn resolve_codex_home(entry: &WorkspaceEntry, parent_path: Option<&str>) -> Option<PathBuf> {
    if entry.kind == WorkspaceKind::Worktree {
        if let Some(parent_path) = parent_path {
            let legacy_home = PathBuf::from(parent_path).join(".codexmonitor");
            if legacy_home.is_dir() {
                return Some(legacy_home);
            }
        }
    }
    let legacy_home = PathBuf::from(&entry.path).join(".codexmonitor");
    if legacy_home.is_dir() {
        return Some(legacy_home);
    }
    None
}

fn app_data_dir_from_state(state: &AppState) -> Option<PathBuf> {
    state.storage_path.parent().map(|path| path.to_path_buf())
}

fn worktrees_root_for_group(state: &AppState, group_id: &str) -> Result<PathBuf, String> {
    let data_dir = app_data_dir_from_state(state)
        .ok_or_else(|| "Failed to resolve app data directory.".to_string())?;
    Ok(data_dir.join("worktrees").join(group_id))
}

fn output_detail(output: &std::process::Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let detail = if stderr.trim().is_empty() {
        stdout.trim()
    } else {
        stderr.trim()
    };
    if detail.is_empty() {
        "jj command failed.".to_string()
    } else {
        detail.to_string()
    }
}

fn revset_references_working_copy_commit(revset: &str) -> bool {
    let revset = revset.trim();
    if revset.is_empty() {
        return false;
    }

    let bytes = revset.as_bytes();
    for (idx, byte) in bytes.iter().enumerate() {
        if *byte != b'@' {
            continue;
        }
        match bytes.get(idx + 1) {
            Some(b'-') => {}
            _ => return true,
        }
    }

    false
}

fn is_managed_worktree_path(path: &Path, state: &AppState) -> bool {
    if path
        .components()
        .any(|component| component.as_os_str() == ".codex-worktrees")
    {
        return true;
    }

    let Some(data_dir) = app_data_dir_from_state(state) else {
        return false;
    };
    let root = data_dir.join("worktrees");
    path.starts_with(root)
}

async fn rebase_worktree_onto(
    entry: &WorkspaceEntry,
    destination: &WorkspaceEntry,
    base_revset: &str,
    state: &AppState,
) -> Result<(), String> {
    if entry.kind != WorkspaceKind::Worktree {
        return Err("Not a worktree workspace.".to_string());
    }

    if !is_managed_worktree_path(Path::new(&entry.path), state) {
        return Err("Worktree is not managed by CodexMonitor.".to_string());
    }

    let worktree_path = PathBuf::from(&entry.path);

    // Snapshot the worktree working copy so @ reflects the latest file state.
    {
        let mut workspace = load_jj_workspace(Path::new(&entry.path))?;
        let repo = workspace
            .repo_loader()
            .load_at_head()
            .map_err(|e| e.to_string())?;
        let _repo = snapshot_working_copy(&mut workspace, repo).await?;
    }

    let destination_commit = {
        let mut workspace = load_jj_workspace(Path::new(&destination.path))?;
        let repo = workspace
            .repo_loader()
            .load_at_head()
            .map_err(|e| e.to_string())?;
        let repo = if revset_references_working_copy_commit(base_revset) {
            snapshot_working_copy(&mut workspace, repo).await?
        } else {
            repo
        };
        resolve_single_revset_commit_id(&workspace, repo.as_ref(), base_revset)?.hex()
    };

    run_jj_command(
        &worktree_path,
        &[
            "rebase",
            "-b",
            "@",
            "-o",
            destination_commit.as_str(),
            "--no-pager",
        ],
    )
    .await?;

    Ok(())
}

fn collect_worktree_descendants_preorder(
    root_id: &str,
    workspaces: &HashMap<String, WorkspaceEntry>,
) -> Vec<String> {
    let mut children_by_base: HashMap<String, Vec<(String, String)>> = HashMap::new();

    for entry in workspaces.values() {
        if entry.kind != WorkspaceKind::Worktree {
            continue;
        }
        let Some(base_id) = entry.base_id.clone() else {
            continue;
        };
        children_by_base
            .entry(base_id)
            .or_default()
            .push((entry.id.clone(), entry.name.clone()));
    }

    for children in children_by_base.values_mut() {
        children.sort_by(|a, b| a.1.cmp(&b.1));
    }

    let mut result = Vec::new();
    let mut seen = HashSet::new();

    fn walk(
        current: &str,
        children_by_base: &HashMap<String, Vec<(String, String)>>,
        seen: &mut HashSet<String>,
        out: &mut Vec<String>,
    ) {
        if let Some(children) = children_by_base.get(current) {
            for (child_id, _) in children {
                if !seen.insert(child_id.clone()) {
                    continue;
                }
                out.push(child_id.clone());
                walk(child_id, children_by_base, seen, out);
            }
        }
    }

    walk(root_id, &children_by_base, &mut seen, &mut result);
    result
}

fn collect_worktree_descendants_postorder(
    root_id: &str,
    workspaces: &HashMap<String, WorkspaceEntry>,
) -> Vec<String> {
    let mut children_by_base: HashMap<String, Vec<(String, String)>> = HashMap::new();

    for entry in workspaces.values() {
        if entry.kind != WorkspaceKind::Worktree {
            continue;
        }
        let Some(base_id) = entry.base_id.clone() else {
            continue;
        };
        children_by_base
            .entry(base_id)
            .or_default()
            .push((entry.id.clone(), entry.name.clone()));
    }

    for children in children_by_base.values_mut() {
        children.sort_by(|a, b| a.1.cmp(&b.1));
    }

    let mut result = Vec::new();
    let mut seen = HashSet::new();

    fn walk(
        current: &str,
        children_by_base: &HashMap<String, Vec<(String, String)>>,
        seen: &mut HashSet<String>,
        out: &mut Vec<String>,
    ) {
        if let Some(children) = children_by_base.get(current) {
            for (child_id, _) in children {
                if !seen.insert(child_id.clone()) {
                    continue;
                }
                walk(child_id, children_by_base, seen, out);
                out.push(child_id.clone());
            }
        }
    }

    walk(root_id, &children_by_base, &mut seen, &mut result);
    result
}

async fn run_jj_command(current_dir: &PathBuf, args: &[&str]) -> Result<String, String> {
    let mut command = Command::new("jj");
    command.args(args).current_dir(current_dir);
    if let Some(path_env) = build_default_path_env() {
        command.env("PATH", path_env);
    }

    let output = command
        .output()
        .await
        .map_err(|e| format!("Failed to run jj: {e}"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(output_detail(&output))
    }
}

async fn run_workspace_task(
    app: AppHandle,
    op_id: String,
    workspace_id: String,
    task: String,
    command: String,
    cwd: PathBuf,
    root_path: Option<String>,
) {
    emit_workspace_task_event(
        &app,
        WorkspaceTaskEvent::Start {
            op_id: op_id.clone(),
            workspace_id: workspace_id.clone(),
            task: task.clone(),
            command: command.clone(),
            cwd: cwd.to_string_lossy().to_string(),
            root_path: root_path.clone(),
        },
    );

    let mut cmd = Command::new(shell_path());
    cmd.arg("-lc").arg(&command);
    cmd.current_dir(&cwd);

    if let Some(path_env) = build_default_path_env() {
        cmd.env("PATH", path_env);
    }

    if let Some(root_path) = root_path.clone() {
        cmd.env("CONDUCTOR_ROOT_PATH", &root_path);
        cmd.env("CODEXMONITOR_ROOT_PATH", &root_path);
    }
    cmd.env("CODEXMONITOR_WORKSPACE_ID", &workspace_id);
    cmd.env("CODEXMONITOR_WORKSPACE_PATH", cwd.to_string_lossy().to_string());

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = match cmd.spawn() {
        Ok(child) => child,
        Err(err) => {
            emit_workspace_task_event(
                &app,
                WorkspaceTaskEvent::End {
                    op_id,
                    workspace_id,
                    task,
                    ok: false,
                    exit_code: None,
                    error: Some(err.to_string()),
                },
            );
            return;
        }
    };

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let stdout_handle = if let Some(stdout) = stdout {
        let app = app.clone();
        let op_id = op_id.clone();
        let workspace_id = workspace_id.clone();
        let task = task.clone();
        Some(tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                emit_workspace_task_event(
                    &app,
                    WorkspaceTaskEvent::Output {
                        op_id: op_id.clone(),
                        workspace_id: workspace_id.clone(),
                        task: task.clone(),
                        stream: WorkspaceTaskStream::Stdout,
                        data: line,
                    },
                );
            }
        }))
    } else {
        None
    };

    let stderr_handle = if let Some(stderr) = stderr {
        let app = app.clone();
        let op_id = op_id.clone();
        let workspace_id = workspace_id.clone();
        let task = task.clone();
        Some(tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                emit_workspace_task_event(
                    &app,
                    WorkspaceTaskEvent::Output {
                        op_id: op_id.clone(),
                        workspace_id: workspace_id.clone(),
                        task: task.clone(),
                        stream: WorkspaceTaskStream::Stderr,
                        data: line,
                    },
                );
            }
        }))
    } else {
        None
    };

    let status = child.wait().await;

    if let Some(handle) = stdout_handle {
        let _ = handle.await;
    }
    if let Some(handle) = stderr_handle {
        let _ = handle.await;
    }

    match status {
        Ok(status) => {
            emit_workspace_task_event(
                &app,
                WorkspaceTaskEvent::End {
                    op_id,
                    workspace_id,
                    task,
                    ok: status.success(),
                    exit_code: status.code(),
                    error: None,
                },
            );
        }
        Err(err) => {
            emit_workspace_task_event(
                &app,
                WorkspaceTaskEvent::End {
                    op_id,
                    workspace_id,
                    task,
                    ok: false,
                    exit_code: None,
                    error: Some(err.to_string()),
                },
            );
        }
    }
}

async fn run_workspace_program_task(
    app: AppHandle,
    op_id: String,
    workspace_id: String,
    task: String,
    program: &str,
    args: &[String],
    cwd: PathBuf,
    root_path: Option<String>,
) {
    let command_display = if args.is_empty() {
        program.to_string()
    } else {
        format!("{program} {}", args.join(" "))
    };

    emit_workspace_task_event(
        &app,
        WorkspaceTaskEvent::Start {
            op_id: op_id.clone(),
            workspace_id: workspace_id.clone(),
            task: task.clone(),
            command: command_display,
            cwd: cwd.to_string_lossy().to_string(),
            root_path: root_path.clone(),
        },
    );

    let mut cmd = Command::new(program);
    cmd.args(args);
    cmd.current_dir(&cwd);

    if let Some(path_env) = build_default_path_env() {
        cmd.env("PATH", path_env);
    }

    if let Some(root_path) = root_path.clone() {
        cmd.env("CONDUCTOR_ROOT_PATH", &root_path);
        cmd.env("CODEXMONITOR_ROOT_PATH", &root_path);
    }

    cmd.env("CODEXMONITOR_WORKSPACE_ID", &workspace_id);
    cmd.env("CODEXMONITOR_WORKSPACE_PATH", cwd.to_string_lossy().to_string());

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = match cmd.spawn() {
        Ok(child) => child,
        Err(err) => {
            emit_workspace_task_event(
                &app,
                WorkspaceTaskEvent::End {
                    op_id,
                    workspace_id,
                    task,
                    ok: false,
                    exit_code: None,
                    error: Some(err.to_string()),
                },
            );
            return;
        }
    };

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let stdout_handle = if let Some(stdout) = stdout {
        let app = app.clone();
        let op_id = op_id.clone();
        let workspace_id = workspace_id.clone();
        let task = task.clone();
        Some(tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                emit_workspace_task_event(
                    &app,
                    WorkspaceTaskEvent::Output {
                        op_id: op_id.clone(),
                        workspace_id: workspace_id.clone(),
                        task: task.clone(),
                        stream: WorkspaceTaskStream::Stdout,
                        data: line,
                    },
                );
            }
        }))
    } else {
        None
    };

    let stderr_handle = if let Some(stderr) = stderr {
        let app = app.clone();
        let op_id = op_id.clone();
        let workspace_id = workspace_id.clone();
        let task = task.clone();
        Some(tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                emit_workspace_task_event(
                    &app,
                    WorkspaceTaskEvent::Output {
                        op_id: op_id.clone(),
                        workspace_id: workspace_id.clone(),
                        task: task.clone(),
                        stream: WorkspaceTaskStream::Stderr,
                        data: line,
                    },
                );
            }
        }))
    } else {
        None
    };

    let status = child.wait().await;

    if let Some(handle) = stdout_handle {
        let _ = handle.await;
    }
    if let Some(handle) = stderr_handle {
        let _ = handle.await;
    }

    match status {
        Ok(status) => {
            emit_workspace_task_event(
                &app,
                WorkspaceTaskEvent::End {
                    op_id,
                    workspace_id,
                    task,
                    ok: status.success(),
                    exit_code: status.code(),
                    error: None,
                },
            );
        }
        Err(err) => {
            emit_workspace_task_event(
                &app,
                WorkspaceTaskEvent::End {
                    op_id,
                    workspace_id,
                    task,
                    ok: false,
                    exit_code: None,
                    error: Some(err.to_string()),
                },
            );
        }
    }
}

fn emit_workspace_task_line(
    app: &AppHandle,
    op_id: &str,
    workspace_id: &str,
    task: &str,
    stream: WorkspaceTaskStream,
    data: impl Into<String>,
) {
    emit_workspace_task_event(
        app,
        WorkspaceTaskEvent::Output {
            op_id: op_id.to_string(),
            workspace_id: workspace_id.to_string(),
            task: task.to_string(),
            stream,
            data: data.into(),
        },
    );
}

async fn snapshot_workspace_wc_commit_id(workspace_path: &str) -> Result<String, String> {
    let mut workspace = load_jj_workspace(Path::new(workspace_path))?;
    let repo = workspace
        .repo_loader()
        .load_at_head()
        .map_err(|e| e.to_string())?;
    let repo = snapshot_working_copy(&mut workspace, repo).await?;
    let wc_commit = get_wc_commit(&repo, workspace.workspace_name())?;
    Ok(wc_commit.id().hex())
}

#[tauri::command]
pub(crate) async fn list_workspaces(state: State<'_, AppState>) -> Result<Vec<WorkspaceInfo>, String> {
    let workspaces = state.workspaces.lock().await;
    let sessions = state.sessions.lock().await;
    let mut result = Vec::new();
    for entry in workspaces.values() {
        result.push(WorkspaceInfo {
            id: entry.id.clone(),
            name: entry.name.clone(),
            path: entry.path.clone(),
            codex_bin: entry.codex_bin.clone(),
            connected: sessions.contains_key(&entry.id),
            kind: entry.kind,
            parent_id: entry.parent_id.clone(),
            base_id: entry.base_id.clone(),
            base_revset: entry.base_revset.clone(),
            settings: entry.settings.clone(),
        });
    }
    result.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(result)
}

#[tauri::command]
pub(crate) async fn add_workspace(
    path: String,
    codex_bin: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<WorkspaceInfo, String> {
    let name = PathBuf::from(&path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("Workspace")
        .to_string();
    let entry = WorkspaceEntry {
        id: Uuid::new_v4().to_string(),
        name: name.clone(),
        path: path.clone(),
        codex_bin,
        kind: WorkspaceKind::Main,
        parent_id: None,
        base_id: None,
        base_revset: None,
        settings: WorkspaceSettings::default(),
    };

    let default_codex_bin = {
        let settings = state.app_settings.lock().await;
        settings
            .codex_bin
            .clone()
            .filter(|value| !value.trim().is_empty())
    };

    let codex_home = resolve_codex_home(&entry, None);
    let session =
        spawn_workspace_session(entry.clone(), default_codex_bin, app.clone(), codex_home).await?;

    {
        let mut workspaces = state.workspaces.lock().await;
        workspaces.insert(entry.id.clone(), entry.clone());
        let list: Vec<_> = workspaces.values().cloned().collect();
        write_workspaces(&state.storage_path, &list)?;
    }
    state
        .sessions
        .lock()
        .await
        .insert(entry.id.clone(), session);

    let setup_command =
        normalize_command_override(entry.settings.setup_command.as_deref())
            .or_else(|| resolve_workspace_setup_command(Path::new(entry.path.as_str())));
    if let Some(command) = setup_command {
        let app = app.clone();
        let op_id = Uuid::new_v4().to_string();
        let workspace_id = entry.id.clone();
        let cwd = PathBuf::from(entry.path.clone());
        let root_path = Some(entry.path.clone());
        tokio::spawn(async move {
            run_workspace_task(app, op_id, workspace_id, "setup".to_string(), command, cwd, root_path)
                .await;
        });
    }

    Ok(WorkspaceInfo {
        id: entry.id,
        name: entry.name,
        path: entry.path,
        codex_bin: entry.codex_bin,
        connected: true,
        kind: entry.kind,
        parent_id: entry.parent_id,
        base_id: entry.base_id,
        base_revset: entry.base_revset,
        settings: entry.settings,
    })
}

#[tauri::command]
pub(crate) async fn clone_repository(
    url: String,
    destination_path: String,
) -> Result<String, String> {
    let url = url.trim();
    if url.is_empty() {
        return Err("Repository URL is required.".to_string());
    }

    let destination = PathBuf::from(&destination_path);
    if destination_path.trim().is_empty() {
        return Err("Destination path is required.".to_string());
    }
    if destination.exists() {
        return Err("Destination path already exists.".to_string());
    }

    let Some(parent) = destination.parent() else {
        return Err("Destination path has no parent directory.".to_string());
    };
    if !parent.exists() {
        return Err("Destination parent directory does not exist.".to_string());
    }
    if !parent.is_dir() {
        return Err("Destination parent is not a directory.".to_string());
    }

    run_jj_command(
        &parent.to_path_buf(),
        &["git", "clone", url, destination_path.as_str()],
    )
    .await?;

    Ok(destination_path)
}

#[tauri::command]
pub(crate) async fn remove_workspace(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let removed_entries = {
        let mut workspaces = state.workspaces.lock().await;
        let Some(entry) = workspaces.remove(&id) else {
            return Ok(());
        };

        let mut removed = vec![entry.clone()];
        if entry.kind == WorkspaceKind::Main {
            let child_ids: Vec<String> = workspaces
                .values()
                .filter(|candidate| candidate.parent_id.as_deref() == Some(&entry.id))
                .map(|candidate| candidate.id.clone())
                .collect();

            for child_id in child_ids {
                if let Some(child) = workspaces.remove(&child_id) {
                    removed.push(child);
                }
            }
        }

        let list: Vec<_> = workspaces.values().cloned().collect();
        write_workspaces(&state.storage_path, &list)?;
        removed
    };

    for entry in removed_entries {
        let terminal_sessions_to_close = {
            let mut sessions = state.terminal_sessions.lock().await;
            let prefix = format!("{}:", entry.id);
            let keys: Vec<String> = sessions
                .keys()
                .filter(|key| key.starts_with(&prefix))
                .cloned()
                .collect();
            keys.into_iter()
                .filter_map(|key| sessions.remove(&key))
                .collect::<Vec<_>>()
        };

        for session in terminal_sessions_to_close {
            let mut child = session.child.lock().await;
            let _ = child.kill();
        }

        if let Some(session) = state.sessions.lock().await.remove(&entry.id) {
            let mut child = session.child.lock().await;
            let _ = child.kill().await;
        }

        if entry.kind == WorkspaceKind::Worktree {
            if !is_managed_worktree_path(Path::new(&entry.path), state.inner()) {
                continue;
            }

            let entry_path = PathBuf::from(&entry.path);
            let _ = run_jj_command(&entry_path, &["workspace", "forget", "--no-pager"]).await?;

            std::fs::remove_dir_all(&entry.path).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
pub(crate) async fn connect_workspace(
    id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let (entry, parent_path) = {
        let workspaces = state.workspaces.lock().await;
        let entry = workspaces.get(&id).cloned().ok_or("workspace not found")?;
        let parent_path = entry
            .parent_id
            .as_ref()
            .and_then(|parent_id| workspaces.get(parent_id))
            .map(|parent| parent.path.clone());
        (entry, parent_path)
    };

    let default_codex_bin = {
        let settings = state.app_settings.lock().await;
        settings
            .codex_bin
            .clone()
            .filter(|value| !value.trim().is_empty())
    };

    let codex_home = resolve_codex_home(&entry, parent_path.as_deref());
    let session =
        spawn_workspace_session(entry.clone(), default_codex_bin, app, codex_home).await?;
    state.sessions.lock().await.insert(entry.id, session);
    Ok(())
}

#[tauri::command]
pub(crate) async fn add_worktree(
    workspace_id: String,
    name: String,
    mode: WorktreeMode,
    base_revset: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<WorkspaceInfo, String> {
    let (base_entry, group_parent_id, group_parent_path) = {
        let workspaces = state.workspaces.lock().await;
        let base_entry = workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or("workspace not found")?;

        let parent_id = match base_entry.kind {
            WorkspaceKind::Main => base_entry.id.clone(),
            WorkspaceKind::Worktree => base_entry
                .parent_id
                .clone()
                .unwrap_or_else(|| base_entry.id.clone()),
        };

        let group_parent_path = workspaces
            .get(&parent_id)
            .map(|workspace| workspace.path.clone())
            .unwrap_or_else(|| base_entry.path.clone());

        (base_entry, parent_id, group_parent_path)
    };

    let base_path = PathBuf::from(&base_entry.path);
    if !base_path.join(".jj").is_dir() {
        return Err(format!(
            "No jj workspace found at {} (missing .jj). Run `jj git init` or `jj init` first.",
            base_path.display()
        ));
    }

    let slug_base = slugify(&name);
    let slug_base = if slug_base.is_empty() {
        "agent".to_string()
    } else {
        slug_base
    };

    let root = worktrees_root_for_group(state.inner(), &group_parent_id)?;
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;

    let mut dest = root.join(&slug_base);
    let mut counter = 2;
    while dest.exists() {
        dest = root.join(format!("{slug_base}-{counter}"));
        counter += 1;
    }

    let mut command = Command::new("jj");
    command
        .arg("workspace")
        .arg("add")
        .arg("--no-pager")
        .arg("--name")
        .arg(&name);

    let base_revset = base_revset
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let effective_revset = match (&base_revset, mode) {
        (Some(revset), _) => Some(revset.as_str()),
        (None, WorktreeMode::Stack) => Some("@"),
        (None, WorktreeMode::Fork) => Some("@-"),
    };

    if let Some(revset) = effective_revset {
        command.arg("-r").arg(revset);
    }

    if let Some(path_env) = build_default_path_env() {
        command.env("PATH", path_env);
    }

    let output = command
        .arg(&dest)
        .current_dir(&base_entry.path)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to create jj workspace: {stderr}"));
    }

    let entry = WorkspaceEntry {
        id: Uuid::new_v4().to_string(),
        name: name.clone(),
        path: dest.to_string_lossy().to_string(),
        codex_bin: base_entry.codex_bin.clone(),
        kind: WorkspaceKind::Worktree,
        parent_id: Some(group_parent_id.clone()),
        base_id: Some(base_entry.id.clone()),
        base_revset: Some(
            base_revset.unwrap_or_else(|| match mode {
                WorktreeMode::Stack => "@".to_string(),
                WorktreeMode::Fork => "@-".to_string(),
            }),
        ),
        settings: WorkspaceSettings::default(),
    };

    let default_codex_bin = {
        let settings = state.app_settings.lock().await;
        settings
            .codex_bin
            .clone()
            .filter(|value| !value.trim().is_empty())
    };

    let codex_home = resolve_codex_home(&entry, Some(group_parent_path.as_str()));
    let session =
        spawn_workspace_session(entry.clone(), default_codex_bin, app.clone(), codex_home).await?;

    {
        let mut workspaces = state.workspaces.lock().await;
        workspaces.insert(entry.id.clone(), entry.clone());
        let list: Vec<_> = workspaces.values().cloned().collect();
        write_workspaces(&state.storage_path, &list)?;
    }

    state
        .sessions
        .lock()
        .await
        .insert(entry.id.clone(), session);

    let setup_command_override = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&group_parent_id)
            .and_then(|entry| normalize_command_override(entry.settings.setup_command.as_deref()))
    };
    let setup_command =
        setup_command_override.or_else(|| resolve_workspace_setup_command(Path::new(group_parent_path.as_str())));
    if let Some(command) = setup_command {
        let app = app.clone();
        let op_id = Uuid::new_v4().to_string();
        let workspace_id = entry.id.clone();
        let cwd = PathBuf::from(entry.path.clone());
        let root_path = Some(group_parent_path.clone());
        tokio::spawn(async move {
            run_workspace_task(app, op_id, workspace_id, "setup".to_string(), command, cwd, root_path)
                .await;
        });
    }

    Ok(WorkspaceInfo {
        id: entry.id,
        name: entry.name,
        path: entry.path,
        codex_bin: entry.codex_bin,
        connected: true,
        kind: entry.kind,
        parent_id: entry.parent_id,
        base_id: entry.base_id,
        base_revset: entry.base_revset,
        settings: entry.settings,
    })
}

#[tauri::command]
pub(crate) async fn run_workspace_setup(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<String, String> {
    let (workspace_path, root_path, root_settings) = {
        let workspaces = state.workspaces.lock().await;
        let entry = workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or_else(|| "workspace not found".to_string())?;

        let group_root_entry = match entry.kind {
            WorkspaceKind::Main => Some(entry.clone()),
            WorkspaceKind::Worktree => entry
                .parent_id
                .as_ref()
                .and_then(|parent_id| workspaces.get(parent_id))
                .cloned()
                .or_else(|| entry.base_id.as_ref().and_then(|base_id| workspaces.get(base_id)).cloned())
                .or(Some(entry.clone())),
        };

        (
            entry.path.clone(),
            group_root_entry.as_ref().map(|entry| entry.path.clone()),
            group_root_entry.map(|entry| entry.settings),
        )
    };

    let command_override = root_settings
        .as_ref()
        .and_then(|settings| normalize_command_override(settings.setup_command.as_deref()));

    let command = command_override
        .or_else(|| {
            root_path
                .as_deref()
                .and_then(|root| resolve_workspace_setup_command(Path::new(root)))
        })
        .ok_or_else(|| {
            "No setup command configured (workspace settings override or package.json scripts.setup/codexMonitor.setupCommand)."
                .to_string()
        })?;

    let op_id = Uuid::new_v4().to_string();
    let task_op_id = op_id.clone();
    let cwd = PathBuf::from(workspace_path);
    let app = app.clone();
    let root_path = root_path.clone();

    tokio::spawn(async move {
        run_workspace_task(
            app,
            task_op_id,
            workspace_id,
            "setup".to_string(),
            command,
            cwd,
            root_path,
        )
            .await;
    });

    Ok(op_id)
}

#[tauri::command]
pub(crate) async fn run_workspace_run(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<String, String> {
    let (workspace_path, root_entry) = {
        let workspaces = state.workspaces.lock().await;
        let entry = workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or_else(|| "workspace not found".to_string())?;

        let group_root_entry = match entry.kind {
            WorkspaceKind::Main => Some(entry.clone()),
            WorkspaceKind::Worktree => entry
                .parent_id
                .as_ref()
                .and_then(|parent_id| workspaces.get(parent_id))
                .cloned()
                .or_else(|| entry.base_id.as_ref().and_then(|base_id| workspaces.get(base_id)).cloned())
                .or(Some(entry.clone())),
        };

        (entry.path.clone(), group_root_entry)
    };

    let Some(root_entry) = root_entry.clone() else {
        return Err("Failed to resolve workspace root path.".to_string());
    };
    let root_path = root_entry.path.clone();

    let command_override = normalize_command_override(root_entry.settings.run_command.as_deref());
    let command = command_override.or_else(|| resolve_workspace_run_command(Path::new(&root_path))).ok_or_else(|| {
        "No run command configured (workspace settings override or package.json scripts.dev/start/test/codexMonitor.runCommand)."
            .to_string()
    })?;

    let op_id = Uuid::new_v4().to_string();
    let task_op_id = op_id.clone();
    let cwd = PathBuf::from(workspace_path);
    let app = app.clone();

    tokio::spawn(async move {
        run_workspace_task(
            app,
            task_op_id,
            workspace_id,
            "run".to_string(),
            command,
            cwd,
            Some(root_path),
        )
        .await;
    });

    Ok(op_id)
}

#[tauri::command]
pub(crate) async fn run_workspace_spotlight(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<String, String> {
    let (workspace_path, root_entry, is_main) = {
        let workspaces = state.workspaces.lock().await;
        let entry = workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or_else(|| "workspace not found".to_string())?;

        let group_root_entry = match entry.kind {
            WorkspaceKind::Main => Some(entry.clone()),
            WorkspaceKind::Worktree => entry
                .parent_id
                .as_ref()
                .and_then(|parent_id| workspaces.get(parent_id))
                .cloned()
                .or_else(|| entry.base_id.as_ref().and_then(|base_id| workspaces.get(base_id)).cloned())
                .or(Some(entry.clone())),
        };

        (entry.path.clone(), group_root_entry, entry.kind == WorkspaceKind::Main)
    };

    let Some(root_entry) = root_entry.clone() else {
        return Err("Failed to resolve workspace root path.".to_string());
    };
    let root_path = root_entry.path.clone();

    let command_override = normalize_command_override(root_entry.settings.run_command.as_deref());
    let command = command_override.or_else(|| resolve_workspace_run_command(Path::new(&root_path))).ok_or_else(|| {
        "No run command configured (workspace settings override or package.json scripts.dev/start/test/codexMonitor.runCommand)."
            .to_string()
    })?;

    let op_id = Uuid::new_v4().to_string();
    let task_op_id = op_id.clone();
    let app = app.clone();
    let root_path_for_task = root_path.clone();
    let worktree_path_for_task = workspace_path.clone();

    tokio::spawn(async move {
        let task = "spotlight".to_string();
        let cwd = PathBuf::from(&root_path_for_task);
        let root_env = Some(root_path_for_task.clone());

        emit_workspace_task_event(
            &app,
            WorkspaceTaskEvent::Start {
                op_id: task_op_id.clone(),
                workspace_id: workspace_id.clone(),
                task: task.clone(),
                command: command.clone(),
                cwd: cwd.to_string_lossy().to_string(),
                root_path: root_env.clone(),
            },
        );

        emit_workspace_task_line(
            &app,
            &task_op_id,
            &workspace_id,
            &task,
            WorkspaceTaskStream::Stdout,
            "Spotlight: applying worktree changes to the repo root…",
        );

        let source_commit = match snapshot_workspace_wc_commit_id(&worktree_path_for_task).await {
            Ok(value) => value,
            Err(err) => {
                emit_workspace_task_event(
                    &app,
                    WorkspaceTaskEvent::End {
                        op_id: task_op_id,
                        workspace_id,
                        task,
                        ok: false,
                        exit_code: None,
                        error: Some(err),
                    },
                );
                return;
            }
        };

        if is_main {
            emit_workspace_task_line(
                &app,
                &task_op_id,
                &workspace_id,
                &task,
                WorkspaceTaskStream::Stdout,
                format!("Running in root (already active). @ = {source_commit}"),
            );
        }

        let root_commit_before = if is_main {
            None
        } else {
            match snapshot_workspace_wc_commit_id(&root_path_for_task).await {
                Ok(value) => Some(value),
                Err(err) => {
                    emit_workspace_task_event(
                        &app,
                        WorkspaceTaskEvent::End {
                            op_id: task_op_id,
                            workspace_id,
                            task,
                            ok: false,
                            exit_code: None,
                            error: Some(err),
                        },
                    );
                    return;
                }
            }
        };

        if let Some(root_commit_before) = root_commit_before.as_deref() {
            emit_workspace_task_line(
                &app,
                &task_op_id,
                &workspace_id,
                &task,
                WorkspaceTaskStream::Stdout,
                format!("Root @ = {root_commit_before}"),
            );

            emit_workspace_task_line(
                &app,
                &task_op_id,
                &workspace_id,
                &task,
                WorkspaceTaskStream::Stdout,
                format!("jj edit {source_commit} (in root)…"),
            );

            if let Err(err) = run_jj_command(
                &PathBuf::from(&root_path_for_task),
                &["edit", source_commit.as_str(), "--no-pager"],
            )
            .await
            {
                emit_workspace_task_event(
                    &app,
                    WorkspaceTaskEvent::End {
                        op_id: task_op_id,
                        workspace_id,
                        task,
                        ok: false,
                        exit_code: None,
                        error: Some(err),
                    },
                );
                return;
            }
        }

        let mut cmd = Command::new(shell_path());
        cmd.arg("-lc").arg(&command);
        cmd.current_dir(&cwd);

        if let Some(path_env) = build_default_path_env() {
            cmd.env("PATH", path_env);
        }
        if let Some(root_env) = root_env.clone() {
            cmd.env("CONDUCTOR_ROOT_PATH", &root_env);
            cmd.env("CODEXMONITOR_ROOT_PATH", &root_env);
        }
        cmd.env("CODEXMONITOR_WORKSPACE_ID", &workspace_id);
        cmd.env("CODEXMONITOR_WORKSPACE_PATH", &worktree_path_for_task);

        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let mut child = match cmd.spawn() {
            Ok(child) => child,
            Err(err) => {
                let _ = run_jj_command(
                    &PathBuf::from(&root_path_for_task),
                    &["edit", root_commit_before.as_deref().unwrap_or("@"), "--no-pager"],
                )
                .await;

                emit_workspace_task_event(
                    &app,
                    WorkspaceTaskEvent::End {
                        op_id: task_op_id,
                        workspace_id,
                        task,
                        ok: false,
                        exit_code: None,
                        error: Some(err.to_string()),
                    },
                );
                return;
            }
        };

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let stdout_handle = if let Some(stdout) = stdout {
            let app = app.clone();
            let op_id = task_op_id.clone();
            let workspace_id = workspace_id.clone();
            let task = task.clone();
            Some(tokio::spawn(async move {
                let mut lines = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    emit_workspace_task_event(
                        &app,
                        WorkspaceTaskEvent::Output {
                            op_id: op_id.clone(),
                            workspace_id: workspace_id.clone(),
                            task: task.clone(),
                            stream: WorkspaceTaskStream::Stdout,
                            data: line,
                        },
                    );
                }
            }))
        } else {
            None
        };

        let stderr_handle = if let Some(stderr) = stderr {
            let app = app.clone();
            let op_id = task_op_id.clone();
            let workspace_id = workspace_id.clone();
            let task = task.clone();
            Some(tokio::spawn(async move {
                let mut lines = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    emit_workspace_task_event(
                        &app,
                        WorkspaceTaskEvent::Output {
                            op_id: op_id.clone(),
                            workspace_id: workspace_id.clone(),
                            task: task.clone(),
                            stream: WorkspaceTaskStream::Stderr,
                            data: line,
                        },
                    );
                }
            }))
        } else {
            None
        };

        let status = child.wait().await;

        if let Some(handle) = stdout_handle {
            let _ = handle.await;
        }
        if let Some(handle) = stderr_handle {
            let _ = handle.await;
        }

        let mut ok = false;
        let mut exit_code = None;
        let mut error = None;

        match status {
            Ok(status) => {
                ok = status.success();
                exit_code = status.code();
            }
            Err(err) => {
                error = Some(err.to_string());
            }
        }

        if let Some(root_commit_before) = root_commit_before.as_deref() {
            emit_workspace_task_line(
                &app,
                &task_op_id,
                &workspace_id,
                &task,
                WorkspaceTaskStream::Stdout,
                format!("Restoring root: jj edit {root_commit_before}…"),
            );

            if let Err(err) = run_jj_command(
                &PathBuf::from(&root_path_for_task),
                &["edit", root_commit_before, "--no-pager"],
            )
            .await
            {
                ok = false;
                error = Some(match error {
                    Some(existing) => format!("{existing}\n\nFailed to restore root workspace: {err}"),
                    None => format!("Failed to restore root workspace: {err}"),
                });
            }
        }

        emit_workspace_task_event(
            &app,
            WorkspaceTaskEvent::End {
                op_id: task_op_id,
                workspace_id,
                task,
                ok,
                exit_code,
                error,
            },
        );
    });

    Ok(op_id)
}

#[tauri::command]
pub(crate) async fn run_ryu(
    workspace_id: String,
    args: Vec<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<String, String> {
    let (workspace_path, root_path) = {
        let workspaces = state.workspaces.lock().await;
        let entry = workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or_else(|| "workspace not found".to_string())?;

        let group_root_entry = match entry.kind {
            WorkspaceKind::Main => Some(entry.clone()),
            WorkspaceKind::Worktree => entry
                .parent_id
                .as_ref()
                .and_then(|parent_id| workspaces.get(parent_id))
                .cloned()
                .or_else(|| entry.base_id.as_ref().and_then(|base_id| workspaces.get(base_id)).cloned())
                .or(Some(entry.clone())),
        };

        (entry.path.clone(), group_root_entry.as_ref().map(|entry| entry.path.clone()))
    };

    let op_id = Uuid::new_v4().to_string();
    let task_op_id = op_id.clone();
    let cwd = PathBuf::from(workspace_path);
    let app = app.clone();

    tokio::spawn(async move {
        run_workspace_program_task(
            app,
            task_op_id,
            workspace_id,
            "ryu".to_string(),
            "ryu",
            &args,
            cwd,
            root_path,
        )
        .await;
    });

    Ok(op_id)
}

#[tauri::command]
pub(crate) async fn land_worktree(id: String, state: State<'_, AppState>) -> Result<String, String> {
    let (entry, destination, base_revset) = {
        let workspaces = state.workspaces.lock().await;
        let entry = workspaces.get(&id).cloned().ok_or("workspace not found")?;
        if entry.kind != WorkspaceKind::Worktree {
            return Err("Not a worktree workspace.".to_string());
        }

        let destination_id = entry
            .base_id
            .clone()
            .or_else(|| entry.parent_id.clone())
            .ok_or("worktree parent not found")?;
        let destination = workspaces
            .get(&destination_id)
            .cloned()
            .ok_or("worktree parent not found")?;

        let base_revset = entry
            .base_revset
            .clone()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "@-".to_string());

        (entry, destination, base_revset)
    };

    if !is_managed_worktree_path(Path::new(&entry.path), state.inner()) {
        return Err("Worktree is not managed by CodexMonitor.".to_string());
    }

    let worktree_path = PathBuf::from(&entry.path);
    let destination_path = PathBuf::from(&destination.path);

    // Snapshot the worktree working copy so @ reflects the latest file state.
    let source_commit = {
        let mut workspace = load_jj_workspace(Path::new(&entry.path))?;
        let repo = workspace
            .repo_loader()
            .load_at_head()
            .map_err(|e| e.to_string())?;
        let repo = snapshot_working_copy(&mut workspace, repo).await?;
        let wc_commit = get_wc_commit(&repo, workspace.workspace_name())?;
        wc_commit.id().hex()
    };

    let base_commit = {
        let mut workspace = load_jj_workspace(Path::new(&destination.path))?;
        let repo = workspace
            .repo_loader()
            .load_at_head()
            .map_err(|e| e.to_string())?;

        let repo = if revset_references_working_copy_commit(&base_revset) {
            snapshot_working_copy(&mut workspace, repo).await?
        } else {
            repo
        };

        resolve_single_revset_commit_id(&workspace, repo.as_ref(), &base_revset)?.hex()
    };

    let land_revset = format!("{base_commit}..{source_commit}");

    // Move the worktree changes into the destination workspace's working copy.
    run_jj_command(
        &destination_path,
        &[
            "squash",
            "--from",
            land_revset.as_str(),
            "--into",
            "@",
            "--use-destination-message",
            "--no-pager",
        ],
    )
    .await?;

    // Now forget and delete the worktree agent.
    if let Some(session) = state.sessions.lock().await.remove(&entry.id) {
        let mut child = session.child.lock().await;
        let _ = child.kill().await;
    }

    let _ = run_jj_command(&worktree_path, &["workspace", "forget", "--no-pager"]).await?;
    std::fs::remove_dir_all(&worktree_path).map_err(|e| e.to_string())?;

    {
        let mut workspaces = state.workspaces.lock().await;
        workspaces.remove(&entry.id);
        let list: Vec<_> = workspaces.values().cloned().collect();
        write_workspaces(&state.storage_path, &list)?;
    }

    Ok(destination.id)
}

#[tauri::command]
pub(crate) async fn sync_worktree(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let (entry, destination, base_revset) = {
        let workspaces = state.workspaces.lock().await;
        let entry = workspaces.get(&id).cloned().ok_or("workspace not found")?;
        if entry.kind != WorkspaceKind::Worktree {
            return Err("Not a worktree workspace.".to_string());
        }

        let destination_id = entry
            .base_id
            .clone()
            .or_else(|| entry.parent_id.clone())
            .ok_or("worktree parent not found")?;
        let destination = workspaces
            .get(&destination_id)
            .cloned()
            .ok_or("worktree parent not found")?;

        let base_revset = entry
            .base_revset
            .clone()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "@-".to_string());

        (entry, destination, base_revset)
    };

    rebase_worktree_onto(&entry, &destination, &base_revset, state.inner()).await
}

#[tauri::command]
pub(crate) async fn sync_worktree_stack(
    id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let op_id = Uuid::new_v4().to_string();

    let (root_id, targets) = {
        let workspaces = state.workspaces.lock().await;
        let entry = workspaces.get(&id).cloned().ok_or("workspace not found")?;
        if entry.kind != WorkspaceKind::Worktree {
            return Err("Not a worktree workspace.".to_string());
        }

        let mut ids = Vec::with_capacity(1);
        ids.push(entry.id.clone());
        ids.extend(collect_worktree_descendants_preorder(&entry.id, &workspaces));

        let targets = ids
            .iter()
            .filter_map(|workspace_id| {
                workspaces.get(workspace_id).map(|workspace| WorktreeStackTarget {
                    workspace_id: workspace.id.clone(),
                    name: workspace.name.clone(),
                })
            })
            .collect::<Vec<_>>();

        (entry.id.clone(), targets)
    };

    emit_worktree_stack_event(
        &app,
        WorktreeStackEvent::Start {
            op_id: op_id.clone(),
            action: WorktreeStackAction::Sync,
            root_id: root_id.clone(),
            targets: targets.clone(),
        },
    );

    let total = targets.len();
    for (idx, target) in targets.iter().enumerate() {
        let index = idx + 1;
        emit_worktree_stack_event(
            &app,
            WorktreeStackEvent::StepStart {
                op_id: op_id.clone(),
                action: WorktreeStackAction::Sync,
                root_id: root_id.clone(),
                workspace_id: target.workspace_id.clone(),
                name: target.name.clone(),
                index,
                total,
            },
        );

        match sync_worktree(target.workspace_id.clone(), state.clone()).await {
            Ok(_) => {
                emit_worktree_stack_event(
                    &app,
                    WorktreeStackEvent::StepEnd {
                        op_id: op_id.clone(),
                        action: WorktreeStackAction::Sync,
                        root_id: root_id.clone(),
                        workspace_id: target.workspace_id.clone(),
                        name: target.name.clone(),
                        index,
                        total,
                        ok: true,
                        message: None,
                        destination_id: None,
                    },
                );
            }
            Err(err) => {
                emit_worktree_stack_event(
                    &app,
                    WorktreeStackEvent::StepEnd {
                        op_id: op_id.clone(),
                        action: WorktreeStackAction::Sync,
                        root_id: root_id.clone(),
                        workspace_id: target.workspace_id.clone(),
                        name: target.name.clone(),
                        index,
                        total,
                        ok: false,
                        message: Some(err.clone()),
                        destination_id: None,
                    },
                );
                emit_worktree_stack_event(
                    &app,
                    WorktreeStackEvent::End {
                        op_id,
                        action: WorktreeStackAction::Sync,
                        root_id,
                        ok: false,
                        error: Some(err.clone()),
                    },
                );
                return Err(err);
            }
        }
    }

    emit_worktree_stack_event(
        &app,
        WorktreeStackEvent::End {
            op_id,
            action: WorktreeStackAction::Sync,
            root_id,
            ok: true,
            error: None,
        },
    );

    Ok(())
}

#[tauri::command]
pub(crate) async fn land_worktree_stack(
    id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<String, String> {
    let op_id = Uuid::new_v4().to_string();

    let (root_id, targets) = {
        let workspaces = state.workspaces.lock().await;
        let entry = workspaces.get(&id).cloned().ok_or("workspace not found")?;
        if entry.kind != WorkspaceKind::Worktree {
            return Err("Not a worktree workspace.".to_string());
        }

        let mut ids = collect_worktree_descendants_postorder(&entry.id, &workspaces);
        ids.push(entry.id.clone());

        let targets = ids
            .iter()
            .filter_map(|workspace_id| {
                workspaces.get(workspace_id).map(|workspace| WorktreeStackTarget {
                    workspace_id: workspace.id.clone(),
                    name: workspace.name.clone(),
                })
            })
            .collect::<Vec<_>>();

        (entry.id.clone(), targets)
    };

    emit_worktree_stack_event(
        &app,
        WorktreeStackEvent::Start {
            op_id: op_id.clone(),
            action: WorktreeStackAction::Land,
            root_id: root_id.clone(),
            targets: targets.clone(),
        },
    );

    let total = targets.len();
    let mut final_destination_id: Option<String> = None;

    for (idx, target) in targets.iter().enumerate() {
        let index = idx + 1;
        emit_worktree_stack_event(
            &app,
            WorktreeStackEvent::StepStart {
                op_id: op_id.clone(),
                action: WorktreeStackAction::Land,
                root_id: root_id.clone(),
                workspace_id: target.workspace_id.clone(),
                name: target.name.clone(),
                index,
                total,
            },
        );

        if let Err(err) = sync_worktree(target.workspace_id.clone(), state.clone()).await {
            emit_worktree_stack_event(
                &app,
                WorktreeStackEvent::StepEnd {
                    op_id: op_id.clone(),
                    action: WorktreeStackAction::Land,
                    root_id: root_id.clone(),
                    workspace_id: target.workspace_id.clone(),
                    name: target.name.clone(),
                    index,
                    total,
                    ok: false,
                    message: Some(err.clone()),
                    destination_id: None,
                },
            );
            emit_worktree_stack_event(
                &app,
                WorktreeStackEvent::End {
                    op_id,
                    action: WorktreeStackAction::Land,
                    root_id,
                    ok: false,
                    error: Some(err.clone()),
                },
            );
            return Err(err);
        }

        match land_worktree(target.workspace_id.clone(), state.clone()).await {
            Ok(destination_id) => {
                if target.workspace_id == root_id {
                    final_destination_id = Some(destination_id.clone());
                }
                emit_worktree_stack_event(
                    &app,
                    WorktreeStackEvent::StepEnd {
                        op_id: op_id.clone(),
                        action: WorktreeStackAction::Land,
                        root_id: root_id.clone(),
                        workspace_id: target.workspace_id.clone(),
                        name: target.name.clone(),
                        index,
                        total,
                        ok: true,
                        message: None,
                        destination_id: Some(destination_id),
                    },
                );
            }
            Err(err) => {
                emit_worktree_stack_event(
                    &app,
                    WorktreeStackEvent::StepEnd {
                        op_id: op_id.clone(),
                        action: WorktreeStackAction::Land,
                        root_id: root_id.clone(),
                        workspace_id: target.workspace_id.clone(),
                        name: target.name.clone(),
                        index,
                        total,
                        ok: false,
                        message: Some(err.clone()),
                        destination_id: None,
                    },
                );
                emit_worktree_stack_event(
                    &app,
                    WorktreeStackEvent::End {
                        op_id,
                        action: WorktreeStackAction::Land,
                        root_id,
                        ok: false,
                        error: Some(err.clone()),
                    },
                );
                return Err(err);
            }
        }
    }

    emit_worktree_stack_event(
        &app,
        WorktreeStackEvent::End {
            op_id,
            action: WorktreeStackAction::Land,
            root_id,
            ok: true,
            error: None,
        },
    );

    final_destination_id.ok_or_else(|| "Destination workspace not found.".to_string())
}

#[tauri::command]
pub(crate) async fn reparent_worktree(
    id: String,
    new_base_id: String,
    base_revset: Option<String>,
    restack: bool,
    state: State<'_, AppState>,
) -> Result<WorkspaceInfo, String> {
    if id == new_base_id {
        return Err("New base must be different from the worktree.".to_string());
    }

    let (entry, destination, descendants) = {
        let workspaces = state.workspaces.lock().await;
        let entry = workspaces.get(&id).cloned().ok_or("workspace not found")?;
        if entry.kind != WorkspaceKind::Worktree {
            return Err("Not a worktree workspace.".to_string());
        }

        let destination = workspaces
            .get(&new_base_id)
            .cloned()
            .ok_or("New base workspace not found.")?;

        // Ensure we don't introduce cycles by reparenting onto a descendant.
        let descendants = collect_worktree_descendants_preorder(&id, &workspaces);
        if descendants.iter().any(|child| child == &new_base_id) {
            return Err("Cannot reparent a worktree onto one of its descendants.".to_string());
        }

        // Best-effort group guard: worktrees should stay within their main workspace group.
        if let Some(parent_id) = entry.parent_id.clone() {
            match destination.kind {
                WorkspaceKind::Main => {
                    if destination.id != parent_id {
                        return Err("New base must be within the same main workspace.".to_string());
                    }
                }
                WorkspaceKind::Worktree => {
                    if destination.parent_id.as_deref() != Some(parent_id.as_str()) {
                        return Err("New base must be within the same main workspace.".to_string());
                    }
                }
            }
        }

        (entry, destination, descendants)
    };

    let effective_revset = base_revset
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| match destination.kind {
            WorkspaceKind::Worktree => "@".to_string(),
            WorkspaceKind::Main => "@-".to_string(),
        });

    rebase_worktree_onto(&entry, &destination, &effective_revset, state.inner()).await?;

    let updated = {
        let mut workspaces = state.workspaces.lock().await;
        let target = workspaces.get_mut(&id).ok_or("workspace not found")?;
        if target.kind != WorkspaceKind::Worktree {
            return Err("Not a worktree workspace.".to_string());
        }

        let group_parent_id = match destination.kind {
            WorkspaceKind::Main => destination.id.clone(),
            WorkspaceKind::Worktree => destination
                .parent_id
                .clone()
                .unwrap_or_else(|| destination.id.clone()),
        };

        target.parent_id = Some(group_parent_id);
        target.base_id = Some(destination.id.clone());
        target.base_revset = Some(effective_revset.clone());

        let entry = target.clone();
        let list: Vec<_> = workspaces.values().cloned().collect();
        write_workspaces(&state.storage_path, &list)?;
        entry
    };

    if restack && !descendants.is_empty() {
        for descendant_id in descendants {
            let (child, child_destination, child_revset) = {
                let workspaces = state.workspaces.lock().await;
                let child = workspaces
                    .get(&descendant_id)
                    .cloned()
                    .ok_or("workspace not found")?;
                if child.kind != WorkspaceKind::Worktree {
                    continue;
                }

                let destination_id = child
                    .base_id
                    .clone()
                    .or_else(|| child.parent_id.clone())
                    .ok_or("worktree parent not found")?;
                let child_destination = workspaces
                    .get(&destination_id)
                    .cloned()
                    .ok_or("worktree parent not found")?;

                let child_revset = child
                    .base_revset
                    .clone()
                    .map(|value| value.trim().to_string())
                    .filter(|value| !value.is_empty())
                    .unwrap_or_else(|| "@-".to_string());

                (child, child_destination, child_revset)
            };

            rebase_worktree_onto(&child, &child_destination, &child_revset, state.inner()).await?;
        }
    }

    let sessions = state.sessions.lock().await;
    let connected = sessions.contains_key(&id);

    Ok(WorkspaceInfo {
        id: updated.id,
        name: updated.name,
        path: updated.path,
        codex_bin: updated.codex_bin,
        connected,
        kind: updated.kind,
        parent_id: updated.parent_id,
        base_id: updated.base_id,
        base_revset: updated.base_revset,
        settings: updated.settings,
    })
}

#[tauri::command]
pub(crate) async fn get_worktree_divergence(
    id: String,
    state: State<'_, AppState>,
) -> Result<WorktreeDivergence, String> {
    let (entry, destination, base_revset) = {
        let workspaces = state.workspaces.lock().await;
        let entry = workspaces.get(&id).cloned().ok_or("workspace not found")?;
        if entry.kind != WorkspaceKind::Worktree {
            return Err("Not a worktree workspace.".to_string());
        }

        let destination_id = entry
            .base_id
            .clone()
            .or_else(|| entry.parent_id.clone())
            .ok_or("worktree parent not found")?;
        let destination = workspaces
            .get(&destination_id)
            .cloned()
            .ok_or("worktree parent not found")?;

        let base_revset = entry
            .base_revset
            .clone()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "@-".to_string());

        (entry, destination, base_revset)
    };

    let destination_commit = {
        let mut workspace = load_jj_workspace(Path::new(&destination.path))?;
        let repo = workspace
            .repo_loader()
            .load_at_head()
            .map_err(|e| e.to_string())?;
        let repo = if revset_references_working_copy_commit(&base_revset) {
            snapshot_working_copy(&mut workspace, repo).await?
        } else {
            repo
        };
        resolve_single_revset_commit_id(&workspace, repo.as_ref(), &base_revset)?.hex()
    };

    let workspace = load_jj_workspace(Path::new(&entry.path))?;
    let repo = workspace
        .repo_loader()
        .load_at_head()
        .map_err(|e| e.to_string())?;

    // Use @- so we don't count the always-present working-copy commit (@) as "ahead".
    let ahead = count_revset_commits(&workspace, repo.as_ref(), &format!("{destination_commit}..@-"))?;
    let behind = count_revset_commits(&workspace, repo.as_ref(), &format!("@-..{destination_commit}"))?;

    Ok(WorktreeDivergence {
        ahead,
        behind,
        base_id: destination.id,
        base_name: destination.name,
        base_revset,
    })
}

#[tauri::command]
pub(crate) async fn get_workspace_divergence(
    id: String,
    state: State<'_, AppState>,
) -> Result<WorktreeDivergence, String> {
    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces.get(&id).cloned().ok_or("workspace not found")?
    };

    if entry.kind != WorkspaceKind::Main {
        return Err("Not a main workspace.".to_string());
    }

    let workspace_path = PathBuf::from(&entry.path);
    if !workspace_path.join(".jj").is_dir() {
        return Err(format!(
            "No jj workspace found at {} (missing .jj). Run `jj git init` or `jj init` first.",
            workspace_path.display()
        ));
    }

    let mut workspace = load_jj_workspace(Path::new(&entry.path))?;
    let repo = workspace
        .repo_loader()
        .load_at_head()
        .map_err(|e| e.to_string())?;

    let repo = if entry
        .base_revset
        .as_deref()
        .is_some_and(revset_references_working_copy_commit)
    {
        snapshot_working_copy(&mut workspace, repo).await?
    } else {
        repo
    };

    let mut candidates = Vec::new();
    if let Some(custom) = entry
        .base_revset
        .clone()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    {
        candidates.push(custom);
    }
    candidates.extend([
        "trunk()".to_string(),
        "main".to_string(),
        "master".to_string(),
        "@-".to_string(),
    ]);

    let mut base_revset = "@-".to_string();
    let mut base_commit = "@-".to_string();
    for candidate in candidates {
        if let Ok(commit_id) = resolve_single_revset_commit_id(&workspace, repo.as_ref(), candidate.as_str()) {
            base_revset = candidate;
            base_commit = commit_id.hex();
            break;
        }
    }

    let ahead = count_revset_commits(&workspace, repo.as_ref(), &format!("{base_commit}..@-"))?;
    let behind = count_revset_commits(&workspace, repo.as_ref(), &format!("@-..{base_commit}"))?;

    Ok(WorktreeDivergence {
        ahead,
        behind,
        base_id: entry.id,
        base_name: base_revset.clone(),
        base_revset,
    })
}

#[tauri::command]
pub(crate) async fn update_workspace_base_revset(
    id: String,
    base_revset: String,
    state: State<'_, AppState>,
) -> Result<WorkspaceInfo, String> {
    let trimmed = base_revset.trim().to_string();
    if trimmed.is_empty() {
        return Err("Base revset is required.".to_string());
    }

    let workspace_path = {
        let workspaces = state.workspaces.lock().await;
        let entry = workspaces.get(&id).cloned().ok_or("workspace not found")?;
        if entry.kind != WorkspaceKind::Main {
            return Err("Not a main workspace.".to_string());
        }
        PathBuf::from(&entry.path)
    };

    // Validate revset by resolving it in the workspace context.
    let mut workspace = load_jj_workspace(Path::new(&workspace_path))?;
    let repo = workspace
        .repo_loader()
        .load_at_head()
        .map_err(|e| e.to_string())?;
    let repo = if revset_references_working_copy_commit(&trimmed) {
        snapshot_working_copy(&mut workspace, repo).await?
    } else {
        repo
    };
    let _ = resolve_single_revset_commit_id(&workspace, repo.as_ref(), &trimmed)?;

    let (entry, connected) = {
        let mut workspaces = state.workspaces.lock().await;
        let target = workspaces.get_mut(&id).ok_or("workspace not found")?;
        if target.kind != WorkspaceKind::Main {
            return Err("Not a main workspace.".to_string());
        }

        target.base_revset = Some(trimmed);
        let entry = target.clone();
        let list: Vec<_> = workspaces.values().cloned().collect();
        write_workspaces(&state.storage_path, &list)?;

        let sessions = state.sessions.lock().await;
        let connected = sessions.contains_key(&id);
        (entry, connected)
    };

    Ok(WorkspaceInfo {
        id: entry.id,
        name: entry.name,
        path: entry.path,
        codex_bin: entry.codex_bin,
        connected,
        kind: entry.kind,
        parent_id: entry.parent_id,
        base_id: entry.base_id,
        base_revset: entry.base_revset,
        settings: entry.settings,
    })
}

#[tauri::command]
pub(crate) async fn update_worktree_base_revset(
    id: String,
    base_revset: String,
    state: State<'_, AppState>,
) -> Result<WorkspaceInfo, String> {
    let trimmed = base_revset.trim().to_string();
    if trimmed.is_empty() {
        return Err("Base revset is required.".to_string());
    }

    let destination_path = {
        let workspaces = state.workspaces.lock().await;
        let entry = workspaces.get(&id).cloned().ok_or("workspace not found")?;
        if entry.kind != WorkspaceKind::Worktree {
            return Err("Not a worktree workspace.".to_string());
        }

        let destination_id = entry
            .base_id
            .clone()
            .or_else(|| entry.parent_id.clone())
            .ok_or("worktree parent not found")?;
        let destination = workspaces
            .get(&destination_id)
            .cloned()
            .ok_or("worktree parent not found")?;
        PathBuf::from(&destination.path)
    };

    // Validate revset by resolving it in the base workspace context.
    let mut workspace = load_jj_workspace(Path::new(&destination_path))?;
    let repo = workspace
        .repo_loader()
        .load_at_head()
        .map_err(|e| e.to_string())?;
    let repo = if revset_references_working_copy_commit(&trimmed) {
        snapshot_working_copy(&mut workspace, repo).await?
    } else {
        repo
    };
    let _ = resolve_single_revset_commit_id(&workspace, repo.as_ref(), &trimmed)?;

    let (entry, connected) = {
        let mut workspaces = state.workspaces.lock().await;
        let target = workspaces.get_mut(&id).ok_or("workspace not found")?;
        if target.kind != WorkspaceKind::Worktree {
            return Err("Not a worktree workspace.".to_string());
        }

        target.base_revset = Some(trimmed);
        let entry = target.clone();
        let list: Vec<_> = workspaces.values().cloned().collect();
        write_workspaces(&state.storage_path, &list)?;

        let sessions = state.sessions.lock().await;
        let connected = sessions.contains_key(&id);
        (entry, connected)
    };

    Ok(WorkspaceInfo {
        id: entry.id,
        name: entry.name,
        path: entry.path,
        codex_bin: entry.codex_bin,
        connected,
        kind: entry.kind,
        parent_id: entry.parent_id,
        base_id: entry.base_id,
        base_revset: entry.base_revset,
        settings: entry.settings,
    })
}

#[tauri::command]
pub(crate) async fn update_workspace_settings(
    id: String,
    settings: WorkspaceSettings,
    state: State<'_, AppState>,
) -> Result<WorkspaceInfo, String> {
    let (entry, connected) = {
        let mut workspaces = state.workspaces.lock().await;
        let target = workspaces
            .get_mut(&id)
            .ok_or("workspace not found")?;
        target.settings = settings.clone();

        let entry = target.clone();
        let list: Vec<_> = workspaces.values().cloned().collect();
        write_workspaces(&state.storage_path, &list)?;

        let sessions = state.sessions.lock().await;
        let connected = sessions.contains_key(&id);
        (entry, connected)
    };

    Ok(WorkspaceInfo {
        id: entry.id,
        name: entry.name,
        path: entry.path,
        codex_bin: entry.codex_bin,
        connected,
        kind: entry.kind,
        parent_id: entry.parent_id,
        base_id: entry.base_id,
        base_revset: entry.base_revset,
        settings: entry.settings,
    })
}

#[tauri::command]
pub(crate) async fn list_workspace_files(
    workspace_id: String,
    query: Option<String>,
    limit: Option<usize>,
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or("workspace not found")?
    };

    let workspace_path = PathBuf::from(&entry.path);
    let query_lower = query.map(|q| q.to_lowercase());
    let limit = limit.unwrap_or(100).clamp(1, 2000);
    let mut results = Vec::new();

    fn walk_dir(
        dir: &std::path::Path,
        base: &std::path::Path,
        query: &Option<String>,
        limit: usize,
        results: &mut Vec<serde_json::Value>,
        depth: usize,
    ) {
        if results.len() >= limit {
            return;
        }
        if depth > 8 {
            return;
        }
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            let is_dir = file_type.is_dir();

            if name.starts_with('.')
                || name == "node_modules"
                || name == "target"
                || name == "dist"
                || name == "build"
            {
                continue;
            }

            let rel_path = path.strip_prefix(base).unwrap_or(&path);
            let rel_str = rel_path.to_string_lossy().to_string();

            let matches = query
                .as_ref()
                .map(|q| rel_str.to_lowercase().contains(q) || name.to_lowercase().contains(q))
                .unwrap_or(true);

            if matches && !is_dir {
                results.push(json!({
                    "path": normalize_git_path(&rel_str),
                    "name": name,
                }));
                if results.len() >= limit {
                    return;
                }
            }

            if is_dir && results.len() < limit {
                walk_dir(&path, base, query, limit, results, depth + 1);
            }
        }
    }

    walk_dir(
        &workspace_path,
        &workspace_path,
        &query_lower,
        limit,
        &mut results,
        0,
    );
    results.sort_by(|a, b| {
        let a_path = a["path"].as_str().unwrap_or("");
        let b_path = b["path"].as_str().unwrap_or("");
        a_path.cmp(b_path)
    });

    Ok(results)
}

#[tauri::command]
pub(crate) async fn list_workspace_paths(
    workspace_id: String,
    query: Option<String>,
    limit: Option<usize>,
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or("workspace not found")?
    };

    let workspace_path = PathBuf::from(&entry.path);
    let query_lower = query.map(|q| q.to_lowercase());
    let limit = limit.unwrap_or(100).clamp(1, 2000);
    let mut results = Vec::new();

    fn walk_dir(
        dir: &std::path::Path,
        base: &std::path::Path,
        query: &Option<String>,
        limit: usize,
        results: &mut Vec<serde_json::Value>,
        depth: usize,
    ) {
        if results.len() >= limit {
            return;
        }
        if depth > 8 {
            return;
        }
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            let is_dir = file_type.is_dir();

            if name.starts_with('.')
                || name == "node_modules"
                || name == "target"
                || name == "dist"
                || name == "build"
            {
                continue;
            }

            let rel_path = path.strip_prefix(base).unwrap_or(&path);
            let rel_str = rel_path.to_string_lossy().to_string();

            let matches = query
                .as_ref()
                .map(|q| rel_str.to_lowercase().contains(q) || name.to_lowercase().contains(q))
                .unwrap_or(true);

            if matches {
                results.push(json!({
                    "path": normalize_git_path(&rel_str),
                    "name": name,
                    "kind": if is_dir { "dir" } else { "file" },
                }));
                if results.len() >= limit {
                    return;
                }
            }

            if is_dir && results.len() < limit {
                walk_dir(&path, base, query, limit, results, depth + 1);
            }
        }
    }

    walk_dir(
        &workspace_path,
        &workspace_path,
        &query_lower,
        limit,
        &mut results,
        0,
    );
    results.sort_by(|a, b| {
        let a_path = a["path"].as_str().unwrap_or("");
        let b_path = b["path"].as_str().unwrap_or("");
        a_path.cmp(b_path)
    });

    Ok(results)
}

#[tauri::command]
pub(crate) async fn list_workspace_dir(
    workspace_id: String,
    dir_path: String,
    depth: Option<usize>,
    limit: Option<usize>,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or("workspace not found")?
    };

    let workspace_root = PathBuf::from(&entry.path);
    let root_canon = std::fs::canonicalize(&workspace_root).map_err(|e| e.to_string())?;

    let rel = dir_path
        .trim()
        .trim_start_matches('/')
        .trim_end_matches('/');
    let joined = if rel.is_empty() {
        workspace_root.clone()
    } else {
        workspace_root.join(rel)
    };

    let dir_canon = std::fs::canonicalize(&joined).map_err(|e| e.to_string())?;
    if !dir_canon.starts_with(&root_canon) {
        return Err("Directory path is outside the workspace.".to_string());
    }

    let metadata = std::fs::metadata(&dir_canon).map_err(|e| e.to_string())?;
    if !metadata.is_dir() {
        return Err("Path is not a directory.".to_string());
    }

    let max_depth = depth.unwrap_or(2).clamp(1, 5);
    let max_entries = limit.unwrap_or(200).clamp(1, 2000);
    let mut remaining = max_entries;
    let mut truncated = false;

    fn walk_tree(
        dir: &std::path::Path,
        base: &std::path::Path,
        depth: usize,
        remaining: &mut usize,
        truncated: &mut bool,
    ) -> Vec<serde_json::Value> {
        if *remaining == 0 || depth == 0 {
            return Vec::new();
        }

        let Ok(entries) = std::fs::read_dir(dir) else {
            return Vec::new();
        };

        let mut collected: Vec<(bool, String, PathBuf)> = Vec::new();
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let Ok(file_type) = entry.file_type() else {
                continue;
            };

            if name.starts_with('.')
                || name == "node_modules"
                || name == "target"
                || name == "dist"
                || name == "build"
            {
                continue;
            }

            collected.push((file_type.is_dir(), name, path));
        }

        collected.sort_by(|(a_dir, a_name, _), (b_dir, b_name, _)| {
            match b_dir.cmp(a_dir) {
                std::cmp::Ordering::Equal => a_name.cmp(b_name),
                other => other,
            }
        });

        let mut out = Vec::new();
        for (is_dir, name, path) in collected {
            if *remaining == 0 {
                *truncated = true;
                break;
            }
            *remaining -= 1;

            let rel_path = path.strip_prefix(base).unwrap_or(&path);
            let rel_str = rel_path.to_string_lossy().to_string();

            if is_dir {
                let children = if depth > 1 && *remaining > 0 {
                    walk_tree(&path, base, depth - 1, remaining, truncated)
                } else {
                    Vec::new()
                };
                out.push(json!({
                    "path": normalize_git_path(&rel_str),
                    "name": name,
                    "kind": "dir",
                    "children": children,
                }));
            } else {
                out.push(json!({
                    "path": normalize_git_path(&rel_str),
                    "name": name,
                    "kind": "file",
                }));
            }

            if *truncated {
                break;
            }
        }

        out
    }

    let entries = walk_tree(
        &dir_canon,
        &workspace_root,
        max_depth,
        &mut remaining,
        &mut truncated,
    );

    Ok(json!({
        "path": normalize_git_path(rel),
        "entries": entries,
        "truncated": truncated,
    }))
}

fn looks_like_binary(bytes: &[u8]) -> bool {
    if bytes.is_empty() {
        return false;
    }
    let sample = &bytes[..bytes.len().min(4096)];
    if sample.iter().any(|&b| b == 0) {
        return true;
    }

    let mut control = 0usize;
    for &b in sample {
        if b < 0x09 || (b > 0x0D && b < 0x20) {
            control += 1;
        }
    }
    control * 100 / sample.len().max(1) > 30
}

#[tauri::command]
pub(crate) async fn read_workspace_file_text(
    workspace_id: String,
    path: String,
    max_bytes: Option<usize>,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    use tokio::io::AsyncReadExt;

    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or("workspace not found")?
    };

    let workspace_root = PathBuf::from(&entry.path);
    let root_canon = std::fs::canonicalize(&workspace_root).map_err(|e| e.to_string())?;

    let rel = path.trim().trim_start_matches('/');
    if rel.is_empty() {
        return Err("File path is required.".to_string());
    }

    let joined = workspace_root.join(rel);
    let file_canon = std::fs::canonicalize(&joined).map_err(|e| e.to_string())?;
    if !file_canon.starts_with(&root_canon) {
        return Err("File path is outside the workspace.".to_string());
    }

    let metadata = std::fs::metadata(&file_canon).map_err(|e| e.to_string())?;
    if metadata.is_dir() {
        return Err("Cannot read a directory.".to_string());
    }

    let limit = max_bytes.unwrap_or(512 * 1024).clamp(1, 5 * 1024 * 1024);
    let file = tokio::fs::File::open(&file_canon)
        .await
        .map_err(|e| e.to_string())?;
    let mut buf = Vec::new();
    file.take((limit + 1) as u64)
        .read_to_end(&mut buf)
        .await
        .map_err(|e| e.to_string())?;

    let truncated = buf.len() > limit;
    if truncated {
        buf.truncate(limit);
    }

    if looks_like_binary(&buf) {
        return Ok(json!({
            "kind": "binary",
            "byteLength": metadata.len(),
            "truncated": truncated,
        }));
    }

    let content = match String::from_utf8(buf) {
        Ok(text) => text,
        Err(err) => String::from_utf8_lossy(err.as_bytes()).to_string(),
    };

    Ok(json!({
        "kind": "text",
        "byteLength": metadata.len(),
        "truncated": truncated,
        "content": content,
    }))
}

#[tauri::command]
pub(crate) async fn read_file_base64(file_path: String) -> Result<String, String> {
    let data = std::fs::read(&file_path).map_err(|e| e.to_string())?;
    Ok(STANDARD.encode(&data))
}

#[tauri::command]
pub(crate) async fn pick_directory(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog().file().pick_folder(move |path| {
        let _ = tx.send(path.map(|p| p.to_string()));
    });
    rx.recv()
        .map_err(|e| e.to_string())?
        .map(|s| Ok(Some(s)))
        .unwrap_or(Ok(None))
}

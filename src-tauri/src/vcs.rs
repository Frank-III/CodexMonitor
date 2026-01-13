use futures::StreamExt;
use gix::bstr::ByteSlice;
use jj_lib::backend::TreeValue;
use jj_lib::config::StackedConfig;
use jj_lib::gitignore::GitIgnoreFile;
use jj_lib::matchers::{EverythingMatcher, NothingMatcher};
use jj_lib::merge::Diff as JjDiff;
use jj_lib::object_id::ObjectId as _;
use jj_lib::op_store::RefTarget;
use jj_lib::repo::ReadonlyRepo;
use jj_lib::repo::Repo as _;
use jj_lib::repo::StoreFactories;
use jj_lib::repo_path::{RepoPath, RepoPathBuf};
use jj_lib::repo_path::RepoPathUiConverter;
use jj_lib::ref_name::{RefNameBuf, RemoteNameBuf, RemoteRefSymbolBuf};
use jj_lib::revset::RevsetAliasesMap;
use jj_lib::revset::RevsetDiagnostics;
use jj_lib::revset::RevsetExtensions;
use jj_lib::revset::RevsetParseContext;
use jj_lib::revset::RevsetWorkspaceContext;
use jj_lib::revset::SymbolResolver;
use jj_lib::settings::UserSettings;
use jj_lib::workspace::{default_working_copy_factories, Workspace};
use jj_lib::working_copy::{SnapshotOptions, WorkingCopyFreshness};
use serde_json::json;
use std::path::{Path, PathBuf};
use std::collections::{HashMap, HashSet};
use tauri::State;
use tokio::process::Command;

use crate::state::AppState;
use crate::types::{
    FileDiffResult, GitHubIssue, GitHubIssuesResponse, GitLogEntry, GitLogResponse, JjBookmarkInfo,
    JjBookmarkKind, VcsFileStatus,
};
use crate::utils::{build_default_path_env, normalize_git_path};
use jj_lib::backend::CommitId;

fn read_file_lossy(path: &Path) -> String {
    match std::fs::read(path) {
        Ok(bytes) => String::from_utf8_lossy(&bytes).to_string(),
        Err(_) => String::new(),
    }
}

fn short_hash(hash: &str) -> String {
    hash.chars().take(12).collect()
}

fn resolve_jj_workspace_path(workspace_root: &Path) -> Result<PathBuf, String> {
    if workspace_root.join(".jj").is_dir() {
        Ok(workspace_root.to_path_buf())
    } else {
        Err(format!(
            "No jj workspace found at {} (missing .jj). Run `jj git init` or `jj init` first.",
            workspace_root.display()
        ))
    }
}

pub(crate) fn load_jj_workspace(workspace_root: &Path) -> Result<Workspace, String> {
    let workspace_root = resolve_jj_workspace_path(workspace_root)?;

    let settings =
        UserSettings::from_config(StackedConfig::with_defaults()).map_err(|e| e.to_string())?;

    let store_factories = StoreFactories::default();
    let working_copy_factories = default_working_copy_factories();
    Workspace::load(
        &settings,
        &workspace_root,
        &store_factories,
        &working_copy_factories,
    )
    .map_err(|e| e.to_string())
}

fn jj_base_ignores(
    repo: &ReadonlyRepo,
    workspace_root: &Path,
) -> Result<std::sync::Arc<GitIgnoreFile>, String> {
    use jj_lib::file_util::expand_home_path;

    let get_excludes_file_path = |config: &gix::config::File| -> Option<PathBuf> {
        if let Some(value) = config.string("core.excludesFile") {
            let path = std::str::from_utf8(&value).ok().map(expand_home_path)?;
            Some(workspace_root.join(path))
        } else {
            let xdg_config_home = match std::env::var("XDG_CONFIG_HOME") {
                Ok(x) if !x.is_empty() => Some(PathBuf::from(x)),
                _ => std::env::var("HOME").ok().map(|x| Path::new(&x).join(".config")),
            };
            xdg_config_home.map(|x| x.join("git").join("ignore"))
        }
    };

    let mut git_ignores = GitIgnoreFile::empty();

    if let Ok(git_backend) = jj_lib::git::get_git_backend(repo.store()) {
        let git_repo = git_backend.git_repo();
        if let Some(excludes_file_path) = get_excludes_file_path(&git_repo.config_snapshot()) {
            git_ignores = git_ignores
                .chain_with_file("", excludes_file_path)
                .map_err(|e| e.to_string())?;
        }
        git_ignores = git_ignores
            .chain_with_file("", git_backend.git_repo_path().join("info").join("exclude"))
            .map_err(|e| e.to_string())?;
    } else {
        if let Ok(git_config) = gix::config::File::from_globals() {
            if let Some(excludes_file_path) = get_excludes_file_path(&git_config) {
                git_ignores = git_ignores
                    .chain_with_file("", excludes_file_path)
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    Ok(git_ignores)
}

pub(crate) fn get_wc_commit(
    repo: &ReadonlyRepo,
    workspace_name: &jj_lib::ref_name::WorkspaceName,
) -> Result<jj_lib::commit::Commit, String> {
    let commit_id = repo
        .view()
        .get_wc_commit_id(workspace_name)
        .ok_or_else(|| {
            format!(
                "Workspace \"{}\" doesn't have a working-copy commit",
                workspace_name.as_symbol()
            )
        })?;
    repo.store()
        .get_commit(commit_id)
        .map_err(|e| e.to_string())
}

fn handle_stale_working_copy(
    locked_wc: &mut dyn jj_lib::working_copy::LockedWorkingCopy,
    repo: std::sync::Arc<ReadonlyRepo>,
    workspace_name: &jj_lib::ref_name::WorkspaceName,
) -> Result<(std::sync::Arc<ReadonlyRepo>, jj_lib::commit::Commit), String> {
    let wc_commit = get_wc_commit(&repo, workspace_name)?;
    let old_op_id = locked_wc.old_operation_id().clone();
    match WorkingCopyFreshness::check_stale(locked_wc, &wc_commit, &repo) {
        Ok(WorkingCopyFreshness::Fresh) => Ok((repo, wc_commit)),
        Ok(WorkingCopyFreshness::Updated(wc_operation)) => {
            let repo = repo.reload_at(&wc_operation).map_err(|e| e.to_string())?;
            let wc_commit = get_wc_commit(&repo, workspace_name)?;
            Ok((repo, wc_commit))
        }
        Ok(WorkingCopyFreshness::WorkingCopyStale) => Err(format!(
            "The working copy is stale (not updated since operation {}). Run `jj workspace update-stale` to update it.",
            short_hash(&old_op_id.hex())
        )),
        Ok(WorkingCopyFreshness::SiblingOperation) => Err(format!(
            "The repo was loaded at operation {}, which seems to be a sibling of the working copy's operation {}. Run `jj workspace update-stale` to recover.",
            short_hash(&repo.op_id().hex()),
            short_hash(&old_op_id.hex())
        )),
        Err(jj_lib::op_store::OpStoreError::ObjectNotFound { .. }) => Err(
            "Could not read working copy's operation. Run `jj workspace update-stale` to recover."
                .to_string(),
        ),
        Err(e) => Err(e.to_string()),
    }
}

pub(crate) async fn snapshot_working_copy(
    workspace: &mut Workspace,
    repo: std::sync::Arc<ReadonlyRepo>,
) -> Result<std::sync::Arc<ReadonlyRepo>, String> {
    let workspace_root = workspace.workspace_root().to_path_buf();
    let workspace_name = workspace.workspace_name().to_owned();
    let mut locked_ws = workspace
        .start_working_copy_mutation()
        .map_err(|e| e.to_string())?;

    let (mut repo, wc_commit) = handle_stale_working_copy(
        locked_ws.locked_wc(),
        repo,
        &workspace_name,
    )?;

    let base_ignores = jj_base_ignores(&repo, &workspace_root)?;
    let start_tracking_matcher = EverythingMatcher;
    let force_tracking_matcher = NothingMatcher;
    let options = SnapshotOptions {
        base_ignores,
        progress: None,
        start_tracking_matcher: &start_tracking_matcher,
        force_tracking_matcher: &force_tracking_matcher,
        max_new_file_size: 1024 * 1024,
    };

    let (new_tree, _stats) = locked_ws
        .locked_wc()
        .snapshot(&options)
        .await
        .map_err(|e| e.to_string())?;

    if new_tree.tree_ids_and_labels() != wc_commit.tree().tree_ids_and_labels() {
        let mut tx = repo.start_transaction();
        let mut_repo = tx.repo_mut();
        let new_commit = mut_repo
            .rewrite_commit(&wc_commit)
            .set_tree(new_tree)
            .write()
            .map_err(|e| e.to_string())?;
        mut_repo
            .set_wc_commit(workspace_name.clone(), new_commit.id().clone())
            .map_err(|e| e.to_string())?;
        mut_repo.rebase_descendants().map_err(|e| e.to_string())?;
        repo = tx
            .commit("snapshot working copy")
            .map_err(|e| e.to_string())?;
    }

    locked_ws
        .finish(repo.op_id().clone())
        .map_err(|e| e.to_string())?;

    Ok(repo)
}

fn evaluate_revset<'repo>(
    workspace: &Workspace,
    repo: &'repo ReadonlyRepo,
    revset: &str,
) -> Result<Box<dyn jj_lib::revset::Revset + 'repo>, String> {
    let revset_str = revset.trim();
    if revset_str.is_empty() {
        return Err("Revset is required.".to_string());
    }

    let aliases_map = RevsetAliasesMap::new();
    let workspace_root = workspace.workspace_root().to_path_buf();
    let path_converter = RepoPathUiConverter::Fs {
        cwd: workspace_root.clone(),
        base: workspace_root,
    };
    let workspace_ctx = RevsetWorkspaceContext {
        path_converter: &path_converter,
        workspace_name: workspace.workspace_name(),
    };
    let extensions = RevsetExtensions::default();
    let context = RevsetParseContext {
        aliases_map: &aliases_map,
        local_variables: HashMap::new(),
        user_email: workspace.settings().user_email(),
        date_pattern_context: chrono::Utc::now().fixed_offset().into(),
        default_ignored_remote: None,
        use_glob_by_default: true,
        extensions: &extensions,
        workspace: Some(workspace_ctx),
    };

    let mut diagnostics = RevsetDiagnostics::new();
    let expression = jj_lib::revset::parse(&mut diagnostics, revset_str, &context)
        .map_err(|e| e.to_string())?;
    let symbol_resolver = SymbolResolver::new(repo, context.extensions.symbol_resolvers());
    let resolved = expression
        .resolve_user_expression(repo, &symbol_resolver)
        .map_err(|e| e.to_string())?;
    resolved.evaluate(repo).map_err(|e| e.to_string())
}

pub(crate) fn resolve_single_revset_commit_id(
    workspace: &Workspace,
    repo: &ReadonlyRepo,
    revset: &str,
) -> Result<CommitId, String> {
    let revset_str = revset.trim();
    let revset = evaluate_revset(workspace, repo, revset_str)?;

    let mut iter = revset.iter();
    let first = iter
        .next()
        .transpose()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Revset \"{revset_str}\" did not match any revisions."))?;
    if iter.next().is_some() {
        return Err(format!(
            "Revset \"{revset_str}\" matched multiple revisions. Specify a single revision."
        ));
    }

    Ok(first)
}

pub(crate) fn count_revset_commits(
    workspace: &Workspace,
    repo: &ReadonlyRepo,
    revset: &str,
) -> Result<i64, String> {
    let revset_str = revset.trim();
    let revset = evaluate_revset(workspace, repo, revset_str)?;

    let mut count = 0i64;
    for commit in revset.iter() {
        commit.map_err(|e| e.to_string())?;
        count += 1;
    }

    Ok(count)
}

async fn read_store_file_bytes(
    repo: &ReadonlyRepo,
    path: &RepoPath,
    value: &Option<TreeValue>,
) -> Result<Option<Vec<u8>>, String> {
    use tokio::io::AsyncReadExt;

    let Some(TreeValue::File { id, .. }) = value else {
        return Ok(None);
    };

    let mut reader = repo
        .store()
        .read_file(path, id)
        .await
        .map_err(|e| e.to_string())?;
    let mut content = Vec::new();
    reader
        .read_to_end(&mut content)
        .await
        .map_err(|e| e.to_string())?;
    Ok(Some(content))
}

fn count_lines_bytes(bytes: &[u8]) -> i64 {
    if bytes.is_empty() {
        return 0;
    }
    let mut count = bytes.iter().filter(|&&b| b == b'\n').count() as i64;
    if !bytes.ends_with(b"\n") {
        count += 1;
    }
    count
}

fn diff_line_stats(before: &[u8], after: &[u8]) -> (i64, i64) {
    let diff = jj_lib::diff::ContentDiff::by_line([before, after]);
    let mut additions = 0i64;
    let mut deletions = 0i64;
    for hunk in diff.hunks() {
        if hunk.kind == jj_lib::diff::DiffHunkKind::Different {
            deletions += count_lines_bytes(hunk.contents[0].as_ref());
            additions += count_lines_bytes(hunk.contents[1].as_ref());
        }
    }
    (additions, deletions)
}

#[tauri::command]
pub(crate) async fn get_file_diff(
    workspace_id: String,
    file_path: String,
    state: State<'_, AppState>,
) -> Result<FileDiffResult, String> {
    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or("workspace not found")?
    };

    let workspace = load_jj_workspace(Path::new(&entry.path))?;
    let repo = workspace
        .repo_loader()
        .load_at_head()
        .map_err(|e| e.to_string())?;
    let wc_commit = get_wc_commit(&repo, workspace.workspace_name())?;
    let parent_tree = wc_commit
        .parent_tree(repo.as_ref())
        .map_err(|e| e.to_string())?;

    let repo_path =
        RepoPathBuf::from_internal_string(file_path.clone()).map_err(|e| e.to_string())?;
    let old_bytes = match parent_tree
        .path_value(&repo_path)
        .map_err(|e| e.to_string())?
    {
        value => {
            let resolved = value
                .as_resolved()
                .ok_or("File is conflicted; resolve it before viewing a diff.")?;
            read_store_file_bytes(&repo, &repo_path, resolved).await?
        }
    }
    .unwrap_or_default();

    let full_path = PathBuf::from(&entry.path).join(&file_path);
    let new_content = read_file_lossy(&full_path);
    let old_content = String::from_utf8_lossy(&old_bytes).to_string();

    Ok(FileDiffResult {
        old_content,
        new_content,
    })
}

async fn vcs_log_impl(
    workspace_id: String,
    limit: Option<usize>,
    state: &AppState,
) -> Result<GitLogResponse, String> {
    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or("workspace not found")?
    };

    let workspace = load_jj_workspace(Path::new(&entry.path))?;
    let repo = workspace
        .repo_loader()
        .load_at_head()
        .map_err(|e| e.to_string())?;

    let max_items = limit.unwrap_or(40);
    let mut entries = Vec::new();

    let mut commit = get_wc_commit(&repo, workspace.workspace_name())?;
    let mut total = 0usize;
    loop {
        total += 1;
        if entries.len() < max_items {
            let summary = commit
                .description()
                .lines()
                .next()
                .unwrap_or("")
                .trim()
                .to_string();
            entries.push(GitLogEntry {
                sha: commit.id().hex(),
                summary,
                author: commit.author().name.clone(),
                timestamp: commit.author().timestamp.timestamp.0 / 1000,
            });
        }

        let Some(parent_id) = commit.parent_ids().first().cloned() else {
            break;
        };
        commit = repo
            .store()
            .get_commit(&parent_id)
            .map_err(|e| e.to_string())?;
    }

    Ok(GitLogResponse { total, entries })
}

#[tauri::command]
pub(crate) async fn get_git_log(
    workspace_id: String,
    limit: Option<usize>,
    state: State<'_, AppState>,
) -> Result<GitLogResponse, String> {
    vcs_log_impl(workspace_id, limit, state.inner()).await
}

#[tauri::command]
pub(crate) async fn get_vcs_log(
    workspace_id: String,
    limit: Option<usize>,
    state: State<'_, AppState>,
) -> Result<GitLogResponse, String> {
    vcs_log_impl(workspace_id, limit, state.inner()).await
}

#[tauri::command]
pub(crate) async fn get_jj_graph(
    workspace_id: String,
    limit: Option<usize>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or("workspace not found")?
    };

    let workspace_root = resolve_jj_workspace_path(Path::new(&entry.path))?;
    let limit = limit.unwrap_or(40).clamp(1, 200);
    let limit_str = limit.to_string();

    let mut command = Command::new("jj");
    command
        .current_dir(&workspace_root)
        .args([
            "log",
            "--no-pager",
            "--color",
            "never",
            "-n",
            &limit_str,
            "-T",
            r#"concat(change_id.short(), " ", description.first_line())"#,
        ]);

    if let Some(path_env) = build_default_path_env() {
        command.env("PATH", path_env);
    }

    let output = command
        .output()
        .await
        .map_err(|e| format!("Failed to run jj log: {e}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim_end().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if stderr.trim().is_empty() {
            stdout.trim()
        } else {
            stderr.trim()
        };
        Err(if detail.is_empty() {
            "jj log failed.".to_string()
        } else {
            detail.to_string()
        })
    }
}

async fn vcs_status_impl(
    workspace_id: String,
    state: &AppState,
) -> Result<serde_json::Value, String> {
    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or("workspace not found")?
    };

    let mut workspace = load_jj_workspace(Path::new(&entry.path))?;
    let repo = workspace
        .repo_loader()
        .load_at_head()
        .map_err(|e| e.to_string())?;

    let repo = snapshot_working_copy(&mut workspace, repo).await?;

    let wc_commit = get_wc_commit(&repo, workspace.workspace_name())?;
    let parent_tree = wc_commit
        .parent_tree(repo.as_ref())
        .map_err(|e| e.to_string())?;
    let wc_tree = wc_commit.tree();

    let branch_name = format!("@ {}", short_hash(&wc_commit.id().hex()));

    let mut files = Vec::new();
    let mut total_additions = 0i64;
    let mut total_deletions = 0i64;

    let matcher = EverythingMatcher;
    let mut stream = parent_tree.diff_stream(&wc_tree, &matcher);
    while let Some(entry) = stream.next().await {
        let JjDiff { before, after } = entry.values.map_err(|e| e.to_string())?;

        let Some(before_resolved) = before.as_resolved() else {
            files.push(VcsFileStatus {
                path: normalize_git_path(entry.path.as_internal_file_string()),
                status: "C".to_string(),
                additions: 0,
                deletions: 0,
            });
            continue;
        };
        let Some(after_resolved) = after.as_resolved() else {
            files.push(VcsFileStatus {
                path: normalize_git_path(entry.path.as_internal_file_string()),
                status: "C".to_string(),
                additions: 0,
                deletions: 0,
            });
            continue;
        };

        let before_value = before_resolved.as_ref();
        let after_value = after_resolved.as_ref();

        let status = match (before_value, after_value) {
            (None, Some(_)) => "A",
            (Some(_), None) => "D",
            (Some(b), Some(a)) => {
                if std::mem::discriminant(b) != std::mem::discriminant(a) {
                    "T"
                } else {
                    "M"
                }
            }
            (None, None) => "--",
        };

        let (additions, deletions) = match (before_value, after_value) {
            (None, Some(_)) => {
                let after_bytes = read_store_file_bytes(&repo, &entry.path, after_resolved).await?;
                let additions = after_bytes
                    .as_deref()
                    .map(count_lines_bytes)
                    .unwrap_or(0);
                (additions, 0)
            }
            (Some(_), None) => {
                let before_bytes =
                    read_store_file_bytes(&repo, &entry.path, before_resolved).await?;
                let deletions = before_bytes
                    .as_deref()
                    .map(count_lines_bytes)
                    .unwrap_or(0);
                (0, deletions)
            }
            (Some(_), Some(_)) => {
                let before_bytes =
                    read_store_file_bytes(&repo, &entry.path, before_resolved).await?;
                let after_bytes = read_store_file_bytes(&repo, &entry.path, after_resolved).await?;
                match (before_bytes.as_deref(), after_bytes.as_deref()) {
                    (Some(b), Some(a)) => diff_line_stats(b, a),
                    _ => (0, 0),
                }
            }
            _ => (0, 0),
        };

        total_additions += additions;
        total_deletions += deletions;
        files.push(VcsFileStatus {
            path: normalize_git_path(entry.path.as_internal_file_string()),
            status: status.to_string(),
            additions,
            deletions,
        });
    }

    files.sort_by(|a, b| a.path.cmp(&b.path));

    Ok(json!({
        "branchName": branch_name,
        "files": files,
        "totalAdditions": total_additions,
        "totalDeletions": total_deletions,
    }))
}

#[tauri::command]
pub(crate) async fn get_git_status(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    vcs_status_impl(workspace_id, state.inner()).await
}

#[tauri::command]
pub(crate) async fn get_vcs_status(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    vcs_status_impl(workspace_id, state.inner()).await
}

#[tauri::command]
pub(crate) async fn jj_workspace_update_stale(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or("workspace not found")?
    };

    let workspace_root = resolve_jj_workspace_path(Path::new(&entry.path))?;

    let mut command = Command::new("jj");
    command
        .current_dir(&workspace_root)
        .args(["workspace", "update-stale", "--no-pager"]);

    if let Some(path_env) = build_default_path_env() {
        command.env("PATH", path_env);
    }

    let output = command
        .output()
        .await
        .map_err(|e| format!("Failed to run jj workspace update-stale: {e}"))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).trim_end().to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).trim_end().to_string();
        let combined = match (stdout.trim().is_empty(), stderr.trim().is_empty()) {
            (true, true) => "ok".to_string(),
            (false, true) => stdout,
            (true, false) => stderr,
            (false, false) => format!("{stdout}\n{stderr}"),
        };
        return Ok(combined);
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let detail = if stderr.trim().is_empty() {
        stdout.trim()
    } else {
        stderr.trim()
    };

    Err(if detail.is_empty() {
        "jj workspace update-stale failed.".to_string()
    } else {
        detail.to_string()
    })
}

#[tauri::command]
pub(crate) async fn list_jj_bookmarks(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<JjBookmarkInfo>, String> {
    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or("workspace not found")?
    };

    let workspace = load_jj_workspace(Path::new(&entry.path))?;
    let repo = workspace
        .repo_loader()
        .load_at_head()
        .map_err(|e| e.to_string())?;

    let mut tracked_local_bookmarks: HashSet<String> = HashSet::new();
    for (symbol, remote_ref) in repo.view().all_remote_bookmarks() {
        if remote_ref.is_tracked() {
            tracked_local_bookmarks.insert(symbol.name.as_str().to_string());
        }
    }

    let mut output: Vec<JjBookmarkInfo> = Vec::new();

    let load_commit_meta = |repo: &ReadonlyRepo, commit_id: &CommitId| {
        repo.store()
            .get_commit(commit_id)
            .map(|commit| {
                let summary = commit
                    .description()
                    .lines()
                    .next()
                    .unwrap_or("")
                    .trim()
                    .to_string();
                let author = commit.author().name.clone();
                let timestamp = commit.author().timestamp.timestamp.0 / 1000;
                (commit.change_id().hex(), summary, author, timestamp)
            })
            .map_err(|e| e.to_string())
    };

    for (name, target) in repo.view().local_bookmarks() {
        if !target.is_present() {
            continue;
        }

        let conflict = target.has_conflict();
        let commit_id = target
            .as_normal()
            .cloned()
            .or_else(|| target.added_ids().next().cloned());
        let (change_id, summary, author, timestamp) = if let Some(commit_id) = &commit_id {
            match load_commit_meta(&repo, commit_id) {
                Ok(value) => (Some(value.0), Some(value.1), Some(value.2), Some(value.3)),
                Err(_) => (None, None, None, None),
            }
        } else {
            (None, None, None, None)
        };

        output.push(JjBookmarkInfo {
            kind: JjBookmarkKind::Local,
            symbol: name.as_symbol().to_string(),
            name: name.as_str().to_string(),
            remote: None,
            tracked: tracked_local_bookmarks.contains(name.as_str()),
            commit_id: commit_id.as_ref().map(|id| id.hex()),
            change_id,
            summary,
            author,
            timestamp,
            conflict,
        });
    }

    for (symbol, remote_ref) in repo.view().all_remote_bookmarks() {
        if !remote_ref.is_present() {
            continue;
        }

        let target = &remote_ref.target;
        let conflict = target.has_conflict();
        let commit_id = target
            .as_normal()
            .cloned()
            .or_else(|| target.added_ids().next().cloned());
        let (change_id, summary, author, timestamp) = if let Some(commit_id) = &commit_id {
            match load_commit_meta(&repo, commit_id) {
                Ok(value) => (Some(value.0), Some(value.1), Some(value.2), Some(value.3)),
                Err(_) => (None, None, None, None),
            }
        } else {
            (None, None, None, None)
        };

        output.push(JjBookmarkInfo {
            kind: JjBookmarkKind::Remote,
            symbol: symbol.to_string(),
            name: symbol.name.as_str().to_string(),
            remote: Some(symbol.remote.as_str().to_string()),
            tracked: remote_ref.is_tracked(),
            commit_id: commit_id.as_ref().map(|id| id.hex()),
            change_id,
            summary,
            author,
            timestamp,
            conflict,
        });
    }

    output.sort_by(|a, b| a.symbol.cmp(&b.symbol));

    Ok(output)
}

#[tauri::command]
pub(crate) async fn track_jj_remote_bookmark(
    workspace_id: String,
    name: String,
    remote: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or("workspace not found")?
    };

    let name = name.trim();
    if name.is_empty() {
        return Err("Bookmark name is required.".to_string());
    }
    let remote = remote.trim();
    if remote.is_empty() {
        return Err("Remote name is required.".to_string());
    }

    let workspace = load_jj_workspace(Path::new(&entry.path))?;
    let repo = workspace
        .repo_loader()
        .load_at_head()
        .map_err(|e| e.to_string())?;

    let symbol = RemoteRefSymbolBuf {
        name: RefNameBuf::from(name),
        remote: RemoteNameBuf::from(remote),
    };

    let remote_ref = repo.view().get_remote_bookmark(symbol.as_ref());
    if remote_ref.is_absent() {
        return Err(format!("Remote bookmark \"{symbol}\" does not exist."));
    }

    let mut tx = repo.start_transaction();
    tx.repo_mut()
        .track_remote_bookmark(symbol.as_ref())
        .map_err(|e| e.to_string())?;
    let _repo = tx
        .commit(format!("track remote bookmark {symbol}"))
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub(crate) async fn untrack_jj_remote_bookmark(
    workspace_id: String,
    name: String,
    remote: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or("workspace not found")?
    };

    let name = name.trim();
    if name.is_empty() {
        return Err("Bookmark name is required.".to_string());
    }
    let remote = remote.trim();
    if remote.is_empty() {
        return Err("Remote name is required.".to_string());
    }

    let workspace = load_jj_workspace(Path::new(&entry.path))?;
    let repo = workspace
        .repo_loader()
        .load_at_head()
        .map_err(|e| e.to_string())?;

    let symbol = RemoteRefSymbolBuf {
        name: RefNameBuf::from(name),
        remote: RemoteNameBuf::from(remote),
    };

    let remote_ref = repo.view().get_remote_bookmark(symbol.as_ref());
    if remote_ref.is_absent() {
        return Err(format!("Remote bookmark \"{symbol}\" does not exist."));
    }

    let mut tx = repo.start_transaction();
    tx.repo_mut().untrack_remote_bookmark(symbol.as_ref());
    let _repo = tx
        .commit(format!("untrack remote bookmark {symbol}"))
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub(crate) async fn set_jj_bookmark(
    workspace_id: String,
    name: String,
    target_revset: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or("workspace not found")?
    };

    let trimmed_name = name.trim();
    if trimmed_name.is_empty() {
        return Err("Bookmark name is required.".to_string());
    }

    let mut workspace = load_jj_workspace(Path::new(&entry.path))?;
    let repo = workspace
        .repo_loader()
        .load_at_head()
        .map_err(|e| e.to_string())?;
    let repo = snapshot_working_copy(&mut workspace, repo).await?;

    let commit_id = resolve_single_revset_commit_id(&workspace, repo.as_ref(), &target_revset)?;

    let mut tx = repo.start_transaction();
    tx.repo_mut().set_local_bookmark_target(
        trimmed_name.as_ref(),
        RefTarget::normal(commit_id),
    );
    let _repo = tx
        .commit(format!("set bookmark {}", trimmed_name))
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub(crate) async fn delete_jj_bookmark(
    workspace_id: String,
    name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or("workspace not found")?
    };

    let trimmed_name = name.trim();
    if trimmed_name.is_empty() {
        return Err("Bookmark name is required.".to_string());
    }

    let workspace = load_jj_workspace(Path::new(&entry.path))?;
    let repo = workspace
        .repo_loader()
        .load_at_head()
        .map_err(|e| e.to_string())?;

    let mut tx = repo.start_transaction();
    tx.repo_mut()
        .set_local_bookmark_target(trimmed_name.as_ref(), RefTarget::absent());
    let _repo = tx
        .commit(format!("delete bookmark {}", trimmed_name))
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub(crate) async fn rename_jj_bookmark(
    workspace_id: String,
    old_name: String,
    new_name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or("workspace not found")?
    };

    let old_name = old_name.trim();
    if old_name.is_empty() {
        return Err("Bookmark name is required.".to_string());
    }
    let new_name = new_name.trim();
    if new_name.is_empty() {
        return Err("New bookmark name is required.".to_string());
    }
    if old_name == new_name {
        return Ok(());
    }

    let workspace = load_jj_workspace(Path::new(&entry.path))?;
    let repo = workspace
        .repo_loader()
        .load_at_head()
        .map_err(|e| e.to_string())?;

    let old_target = repo.view().get_local_bookmark(old_name.as_ref());
    if !old_target.is_present() {
        return Err(format!("Bookmark \"{old_name}\" does not exist."));
    }

    let new_target = repo.view().get_local_bookmark(new_name.as_ref());
    if new_target.is_present() {
        return Err(format!("Bookmark \"{new_name}\" already exists."));
    }

    let mut tx = repo.start_transaction();
    tx.repo_mut()
        .set_local_bookmark_target(new_name.as_ref(), old_target.clone());
    tx.repo_mut()
        .set_local_bookmark_target(old_name.as_ref(), RefTarget::absent());
    let _repo = tx
        .commit(format!("rename bookmark {old_name} -> {new_name}"))
        .map_err(|e| e.to_string())?;

    Ok(())
}

async fn run_jj_command(workdir: &Path, args: Vec<String>) -> Result<String, String> {
    let mut command = Command::new("jj");
    command.current_dir(workdir).args(args);

    if let Some(path_env) = build_default_path_env() {
        command.env("PATH", path_env);
    }

    let output = command
        .output()
        .await
        .map_err(|e| format!("Failed to run jj command: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    let detail = match (stdout.trim(), stderr.trim()) {
        ("", "") => String::new(),
        ("", stderr) => stderr.to_string(),
        (stdout, "") => stdout.to_string(),
        (stdout, stderr) => format!("{stdout}\n{stderr}"),
    };

    if output.status.success() {
        Ok(detail.trim_end().to_string())
    } else if detail.trim().is_empty() {
        Err("jj command failed.".to_string())
    } else {
        Err(detail.trim().to_string())
    }
}

#[tauri::command]
pub(crate) async fn jj_git_fetch(
    workspace_id: String,
    remote: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or("workspace not found")?
    };

    let workspace_root = resolve_jj_workspace_path(Path::new(&entry.path))?;

    let mut args = vec![
        "--ignore-working-copy".to_string(),
        "--color".to_string(),
        "never".to_string(),
        "git".to_string(),
        "fetch".to_string(),
    ];

    if let Some(remote) = remote.as_deref().map(str::trim).filter(|x| !x.is_empty()) {
        args.push("--remote".to_string());
        args.push(remote.to_string());
    }

    run_jj_command(&workspace_root, args).await
}

#[tauri::command]
pub(crate) async fn jj_git_push_bookmark(
    workspace_id: String,
    bookmark: String,
    remote: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or("workspace not found")?
    };

    let bookmark = bookmark.trim();
    if bookmark.is_empty() {
        return Err("Bookmark name is required.".to_string());
    }

    let workspace_root = resolve_jj_workspace_path(Path::new(&entry.path))?;

    let mut args = vec![
        "--ignore-working-copy".to_string(),
        "--color".to_string(),
        "never".to_string(),
        "git".to_string(),
        "push".to_string(),
    ];

    if let Some(remote) = remote.as_deref().map(str::trim).filter(|x| !x.is_empty()) {
        args.push("--remote".to_string());
        args.push(remote.to_string());
    }

    args.push("--bookmark".to_string());
    args.push(bookmark.to_string());

    run_jj_command(&workspace_root, args).await
}

#[tauri::command]
pub(crate) async fn jj_git_push_tracked(
    workspace_id: String,
    remote: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or("workspace not found")?
    };

    let workspace_root = resolve_jj_workspace_path(Path::new(&entry.path))?;

    let mut args = vec![
        "--ignore-working-copy".to_string(),
        "--color".to_string(),
        "never".to_string(),
        "git".to_string(),
        "push".to_string(),
        "--tracked".to_string(),
    ];

    if let Some(remote) = remote.as_deref().map(str::trim).filter(|x| !x.is_empty()) {
        args.push("--remote".to_string());
        args.push(remote.to_string());
    }

    run_jj_command(&workspace_root, args).await
}

#[tauri::command]
pub(crate) async fn jj_git_push_deleted(
    workspace_id: String,
    remote: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or("workspace not found")?
    };

    let workspace_root = resolve_jj_workspace_path(Path::new(&entry.path))?;

    let mut args = vec![
        "--ignore-working-copy".to_string(),
        "--color".to_string(),
        "never".to_string(),
        "git".to_string(),
        "push".to_string(),
        "--deleted".to_string(),
    ];

    if let Some(remote) = remote.as_deref().map(str::trim).filter(|x| !x.is_empty()) {
        args.push("--remote".to_string());
        args.push(remote.to_string());
    }

    run_jj_command(&workspace_root, args).await
}

fn parse_github_repo(remote_url: &str) -> Option<String> {
    let url = remote_url.trim().trim_end_matches(".git");
    let idx = url.find("github.com")?;
    let after = &url[idx + "github.com".len()..];
    let after = after.strip_prefix(':').or_else(|| after.strip_prefix('/'))?;
    let mut parts = after.split('/');
    let owner = parts.next()?.trim();
    let repo = parts.next()?.trim();
    if owner.is_empty() || repo.is_empty() {
        return None;
    }
    Some(format!("{owner}/{repo}"))
}

fn preferred_git_remote_url(workspace_path: &Path) -> Result<Option<String>, String> {
    let repo = gix::discover(workspace_path).map_err(|e| e.to_string())?;

    let origin = repo
        .try_find_remote("origin".as_bytes().as_bstr())
        .and_then(Result::ok);

    let remote = if let Some(remote) = origin {
        Some(remote)
    } else {
        repo.remote_names()
            .into_iter()
            .find_map(|name| repo.try_find_remote(name.as_ref()).and_then(Result::ok))
    };

    let Some(remote) = remote else {
        return Ok(None);
    };

    Ok(remote
        .url(gix::remote::Direction::Push)
        .or_else(|| remote.url(gix::remote::Direction::Fetch))
        .map(|url| url.to_string()))
}

async fn run_gh_json(workdir: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
    let mut command = Command::new("gh");
    command.args(args).current_dir(workdir);
    if let Some(path_env) = build_default_path_env() {
        command.env("PATH", path_env);
    }
    let output = command
        .output()
        .await
        .map_err(|e| format!("Failed to run gh: {e}"))?;
    if output.status.success() {
        return Ok(output.stdout);
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let detail = if stderr.trim().is_empty() {
        stdout.trim()
    } else {
        stderr.trim()
    };
    if detail.is_empty() {
        Err("GitHub CLI command failed.".to_string())
    } else {
        Err(detail.to_string())
    }
}

#[tauri::command]
pub(crate) async fn get_git_remote(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or("workspace not found")?
    };
    preferred_git_remote_url(Path::new(&entry.path))
}

#[tauri::command]
pub(crate) async fn get_vcs_remote(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    get_git_remote(workspace_id, state).await
}

#[tauri::command]
pub(crate) async fn get_github_issues(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<GitHubIssuesResponse, String> {
    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or("workspace not found")?
    };

    let remote_url = preferred_git_remote_url(Path::new(&entry.path))?
        .ok_or("No git remote configured.")?;
    let repo_name =
        parse_github_repo(&remote_url).ok_or("Remote is not a GitHub repository.")?;

    let issues_bytes = run_gh_json(
        Path::new(&entry.path),
        &[
            "issue",
            "list",
            "--repo",
            &repo_name,
            "--limit",
            "50",
            "--json",
            "number,title,url,updatedAt",
        ],
    )
    .await?;
    let issues: Vec<GitHubIssue> =
        serde_json::from_slice(&issues_bytes).map_err(|e| e.to_string())?;

    let search_query = format!("repo:{repo_name} is:issue is:open").replace(' ', "+");
    let mut total_command = Command::new("gh");
    total_command.args([
        "api",
        &format!("/search/issues?q={search_query}"),
        "--jq",
        ".total_count",
    ]);
    total_command.current_dir(&entry.path);
    if let Some(path_env) = build_default_path_env() {
        total_command.env("PATH", path_env);
    }

    let total = match total_command.output().await {
        Ok(output) if output.status.success() => String::from_utf8_lossy(&output.stdout)
            .trim()
            .parse::<usize>()
            .unwrap_or(issues.len()),
        _ => issues.len(),
    };

    Ok(GitHubIssuesResponse { total, issues })
}

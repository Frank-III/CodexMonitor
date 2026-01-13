use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum WorkspaceKind {
    Main,
    Worktree,
}

fn default_workspace_kind() -> WorkspaceKind {
    WorkspaceKind::Main
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct WorkspaceSettings {
    #[serde(default)]
    pub(crate) sidebar_collapsed: bool,
    #[serde(default)]
    pub(crate) sort_order: i64,
    #[serde(default)]
    pub(crate) spotlight_enabled: bool,
    #[serde(default)]
    pub(crate) setup_command: Option<String>,
    #[serde(default)]
    pub(crate) run_command: Option<String>,
}

impl Default for WorkspaceSettings {
    fn default() -> Self {
        Self {
            sidebar_collapsed: false,
            sort_order: 0,
            spotlight_enabled: false,
            setup_command: None,
            run_command: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct AppSettings {
    #[serde(default, rename = "codexBin")]
    pub(crate) codex_bin: Option<String>,
    #[serde(default = "default_access_mode", rename = "defaultAccessMode")]
    pub(crate) default_access_mode: String,
    #[serde(default = "default_ui_scale", rename = "uiScale")]
    pub(crate) ui_scale: f64,
    #[serde(default, rename = "experimentalSteerEnabled")]
    pub(crate) experimental_steer_enabled: bool,
}

fn default_access_mode() -> String {
    "current".to_string()
}

fn default_ui_scale() -> f64 {
    1.0
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            codex_bin: None,
            default_access_mode: default_access_mode(),
            ui_scale: default_ui_scale(),
            experimental_steer_enabled: false,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct WorkspaceEntry {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) path: String,
    pub(crate) codex_bin: Option<String>,
    #[serde(default = "default_workspace_kind")]
    pub(crate) kind: WorkspaceKind,
    #[serde(default)]
    pub(crate) parent_id: Option<String>,
    #[serde(default)]
    pub(crate) base_id: Option<String>,
    #[serde(default)]
    pub(crate) base_revset: Option<String>,
    #[serde(default)]
    pub(crate) settings: WorkspaceSettings,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct WorkspaceInfo {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) path: String,
    pub(crate) connected: bool,
    pub(crate) codex_bin: Option<String>,
    pub(crate) kind: WorkspaceKind,
    pub(crate) parent_id: Option<String>,
    pub(crate) base_id: Option<String>,
    pub(crate) base_revset: Option<String>,
    pub(crate) settings: WorkspaceSettings,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct WorktreeDivergence {
    pub(crate) ahead: i64,
    pub(crate) behind: i64,
    pub(crate) base_id: String,
    pub(crate) base_name: String,
    pub(crate) base_revset: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct VcsFileStatus {
    pub(crate) path: String,
    pub(crate) status: String,
    pub(crate) additions: i64,
    pub(crate) deletions: i64,
}

#[derive(Debug, Serialize)]
pub(crate) struct FileDiffResult {
    pub(crate) old_content: String,
    pub(crate) new_content: String,
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct GitLogEntry {
    pub(crate) sha: String,
    pub(crate) summary: String,
    pub(crate) author: String,
    pub(crate) timestamp: i64,
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct GitLogResponse {
    pub(crate) total: usize,
    pub(crate) entries: Vec<GitLogEntry>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct GitHubIssue {
    pub(crate) number: u64,
    pub(crate) title: String,
    pub(crate) url: String,
    #[serde(rename = "updatedAt")]
    pub(crate) updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct GitHubIssuesResponse {
    pub(crate) total: usize,
    pub(crate) issues: Vec<GitHubIssue>,
}

#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum JjBookmarkKind {
    Local,
    Remote,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct JjBookmarkInfo {
    pub(crate) kind: JjBookmarkKind,
    pub(crate) symbol: String,
    pub(crate) name: String,
    pub(crate) remote: Option<String>,
    pub(crate) tracked: bool,
    pub(crate) commit_id: Option<String>,
    pub(crate) change_id: Option<String>,
    pub(crate) summary: Option<String>,
    pub(crate) author: Option<String>,
    pub(crate) timestamp: Option<i64>,
    pub(crate) conflict: bool,
}

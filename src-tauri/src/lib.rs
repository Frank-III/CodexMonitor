mod backend;
mod codex;
mod event_sink;
mod prompts;
mod settings;
mod state;
mod storage;
mod terminal;
mod types;
mod utils;
mod vcs;
mod workspaces;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .enable_macos_default_menu(false)
        .setup(|app| {
            let state = state::AppState::load(&app.handle());
            app.manage(state);
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            workspaces::list_workspaces,
            workspaces::add_workspace,
            workspaces::clone_repository,
            workspaces::add_worktree,
            workspaces::remove_workspace,
            workspaces::land_worktree,
            workspaces::sync_worktree,
            workspaces::land_worktree_stack,
            workspaces::sync_worktree_stack,
            workspaces::reparent_worktree,
            workspaces::get_workspace_divergence,
            workspaces::get_worktree_divergence,
            workspaces::update_workspace_base_revset,
            workspaces::update_worktree_base_revset,
            codex::start_thread,
            codex::codex_doctor,
            codex::send_user_message,
            codex::turn_interrupt,
            codex::respond_to_server_request,
            codex::resume_thread,
            codex::list_threads,
            codex::archive_thread,
            workspaces::connect_workspace,
            vcs::get_git_status,
            vcs::get_vcs_status,
            vcs::get_git_log,
            vcs::get_vcs_log,
            vcs::get_jj_graph,
            vcs::get_file_diff,
            vcs::get_git_remote,
            vcs::get_vcs_remote,
            vcs::get_github_issues,
            vcs::jj_workspace_update_stale,
            vcs::list_jj_bookmarks,
            vcs::set_jj_bookmark,
            vcs::delete_jj_bookmark,
            vcs::rename_jj_bookmark,
            vcs::track_jj_remote_bookmark,
            vcs::untrack_jj_remote_bookmark,
            vcs::jj_git_fetch,
            vcs::jj_git_push_bookmark,
            vcs::jj_git_push_tracked,
            vcs::jj_git_push_deleted,
            codex::model_list,
            codex::skills_list,
            prompts::prompts_list,
            workspaces::list_workspace_files,
            workspaces::list_workspace_paths,
            workspaces::list_workspace_dir,
            workspaces::read_workspace_file_text,
            workspaces::read_file_base64,
            workspaces::pick_directory,
            workspaces::update_workspace_settings,
            workspaces::run_workspace_setup,
            workspaces::run_workspace_run,
            workspaces::run_workspace_spotlight,
            workspaces::run_ryu,
            utils::log_frontend_error,
            settings::get_app_settings,
            settings::update_app_settings,
            terminal::terminal_open,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_close,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

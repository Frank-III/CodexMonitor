pub(crate) fn normalize_git_path(path: &str) -> String {
    path.replace('\\', "/")
}

pub(crate) fn build_default_path_env() -> Option<String> {
    use std::env;
    use std::path::Path;

    let mut paths: Vec<String> = env::var("PATH")
        .unwrap_or_default()
        .split(':')
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
        .collect();

    let mut extras = vec![
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
    ]
    .into_iter()
    .map(|value| value.to_string())
    .collect::<Vec<String>>();

    if let Ok(home) = env::var("HOME") {
        extras.push(format!("{home}/.local/bin"));
        extras.push(format!("{home}/.local/share/mise/shims"));
        extras.push(format!("{home}/.cargo/bin"));
        extras.push(format!("{home}/.bun/bin"));

        let nvm_root = Path::new(&home).join(".nvm/versions/node");
        if let Ok(entries) = std::fs::read_dir(nvm_root) {
            for entry in entries.flatten() {
                let bin_path = entry.path().join("bin");
                if bin_path.is_dir() {
                    extras.push(bin_path.to_string_lossy().to_string());
                }
            }
        }
    }

    for extra in extras {
        if !paths.contains(&extra) {
            paths.push(extra);
        }
    }

    if paths.is_empty() {
        None
    } else {
        Some(paths.join(":"))
    }
}

#[tauri::command]
pub(crate) fn log_frontend_error(message: String, stack: Option<String>) {
    eprintln!("[frontend error] {message}");
    if let Some(stack) = stack {
        eprintln!("{stack}");
    }
}

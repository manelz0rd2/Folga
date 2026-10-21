use serde::Serialize;
use std::{collections::{HashMap, HashSet}, path::{Path, PathBuf}, process::Command, time::UNIX_EPOCH};
use sysinfo::{Disks, System};
use walkdir::WalkDir;

#[cfg(target_os = "windows")]
use winreg::{enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_32KEY, KEY_WOW64_64KEY}, RegKey};
#[cfg(target_os = "windows")]
use base64::Engine;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PlatformInfo {
    os: &'static str,
    computer_label: &'static str,
    trash_label: &'static str,
    default_scan_root: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DiskInfo {
    name: String,
    mount_path: String,
    total_bytes: u64,
    available_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileEntry {
    name: String,
    path: String,
    size_bytes: u64,
    modified_at: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderEntry {
    name: String,
    path: String,
    is_dir: bool,
    size_bytes: u64,
    file_count: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CleanupLocation {
    id: &'static str,
    title: &'static str,
    path: String,
    risk: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ScannedCleanupLocation {
    id: &'static str,
    title: &'static str,
    path: String,
    risk: &'static str,
    size_bytes: u64,
    file_count: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanReport {
    root: String,
    folders: Vec<FolderEntry>,
    large_files: Vec<FileEntry>,
    treemap_files: Vec<FileEntry>,
    scanned_bytes: u64,
    scanned_files: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProcessMetric {
    name: String,
    cpu_percent: f32,
    memory_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemMetrics {
    cpu_percent: f32,
    total_memory_bytes: u64,
    used_memory_bytes: u64,
    processes: Vec<ProcessMetric>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AiToolInfo {
    name: &'static str,
    path: String,
    size_bytes: u64,
    file_count: u64,
    running: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct InstalledAppInfo {
    name: String,
    publisher: String,
    install_location: String,
    size_bytes: u64,
    icon_data_url: String,
}

#[tauri::command]
fn platform_info() -> PlatformInfo {
    #[cfg(target_os = "windows")]
    let info = ("windows", "PC", "Lixeira", std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\Users".into()));
    #[cfg(target_os = "macos")]
    let info = ("macos", "Mac", "Lixo", std::env::var("HOME").unwrap_or_else(|_| "/Users".into()));
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let info = ("other", "computador", "Lixeira", std::env::var("HOME").unwrap_or_else(|_| "/".into()));

    PlatformInfo {
        os: info.0,
        computer_label: info.1,
        trash_label: info.2,
        default_scan_root: info.3,
    }
}

#[tauri::command]
fn cleanup_locations() -> Vec<CleanupLocation> {
    cleanup_locations_for_platform().into_iter().filter(|item| !item.path.is_empty()).collect()
}

#[cfg(target_os = "windows")]
fn cleanup_locations_for_platform() -> Vec<CleanupLocation> {
    let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let roaming = std::env::var("APPDATA").unwrap_or_default();
    let temp = std::env::var("TEMP").unwrap_or_default();
    vec![
        CleanupLocation { id: "temp", title: "Arquivos temporários", path: temp, risk: "safe" },
        CleanupLocation { id: "edge", title: "Cache do Microsoft Edge", path: format!("{local}\\Microsoft\\Edge\\User Data\\Default\\Cache"), risk: "safe" },
        CleanupLocation { id: "chrome", title: "Cache do Google Chrome", path: format!("{local}\\Google\\Chrome\\User Data\\Default\\Cache"), risk: "safe" },
        CleanupLocation { id: "crash", title: "Relatórios de falha", path: format!("{local}\\CrashDumps"), risk: "safe" },
        CleanupLocation { id: "inet", title: "Cache de internet do Windows", path: format!("{local}\\Microsoft\\Windows\\INetCache"), risk: "safe" },
        CleanupLocation { id: "teams", title: "Cache do Microsoft Teams", path: format!("{roaming}\\Microsoft\\Teams\\Cache"), risk: "safe" },
    ]
}

#[cfg(target_os = "macos")]
fn cleanup_locations_for_platform() -> Vec<CleanupLocation> {
    let home = std::env::var("HOME").unwrap_or_default();
    vec![
        CleanupLocation { id: "cache", title: "Caches de usuário", path: format!("{home}/Library/Caches"), risk: "safe" },
        CleanupLocation { id: "logs", title: "Logs antigos", path: format!("{home}/Library/Logs"), risk: "safe" },
        CleanupLocation { id: "trash", title: "Lixo", path: format!("{home}/.Trash"), risk: "review" },
        CleanupLocation { id: "ios", title: "Backups de iPhone e iPad", path: format!("{home}/Library/Application Support/MobileSync/Backup"), risk: "care" },
        CleanupLocation { id: "xcode", title: "Dados do Xcode", path: format!("{home}/Library/Developer/Xcode/DerivedData"), risk: "review" },
    ]
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn cleanup_locations_for_platform() -> Vec<CleanupLocation> { Vec::new() }

fn measure_path(path: &Path) -> (u64, u64) {
    let mut size = 0_u64;
    let mut count = 0_u64;
    for entry in WalkDir::new(path).follow_links(false).into_iter().filter_map(Result::ok) {
        if let Ok(metadata) = entry.metadata() {
            if metadata.is_file() {
                size = size.saturating_add(metadata.len());
                count += 1;
            }
        }
    }
    (size, count)
}

#[tauri::command]
async fn scan_cleanup_locations() -> Vec<ScannedCleanupLocation> {
    cleanup_locations().into_iter().map(|location| {
        let (size_bytes, file_count) = measure_path(Path::new(&location.path));
        ScannedCleanupLocation {
            id: location.id,
            title: location.title,
            path: location.path,
            risk: location.risk,
            size_bytes,
            file_count,
        }
    }).collect()
}

#[tauri::command]
async fn scan_home(root: String, minimum_bytes: Option<u64>) -> Result<ScanReport, String> {
    let root_path = PathBuf::from(&root);
    if !root_path.is_dir() { return Err("A pasta inicial de análise não existe.".into()); }
    let minimum = minimum_bytes.unwrap_or(500 * 1024 * 1024);
    let mut grouped: HashMap<String, (PathBuf, u64, u64)> = HashMap::new();
    let mut large_files = Vec::new();
    let mut treemap_files = Vec::new();
    let mut scanned_bytes = 0_u64;
    let mut scanned_files = 0_u64;

    for entry in WalkDir::new(&root_path).follow_links(false).into_iter().filter_map(Result::ok) {
        let Ok(metadata) = entry.metadata() else { continue };
        if !metadata.is_file() { continue; }
        let size = metadata.len();
        scanned_bytes = scanned_bytes.saturating_add(size);
        scanned_files += 1;

        if let Ok(relative) = entry.path().strip_prefix(&root_path) {
            if let Some(first) = relative.components().next() {
                let name = first.as_os_str().to_string_lossy().into_owned();
                let group_path = root_path.join(first.as_os_str());
                let group = grouped.entry(name).or_insert((group_path, 0, 0));
                group.1 = group.1.saturating_add(size);
                group.2 += 1;
            }
        }

        if size >= minimum {
            let modified_at = metadata.modified().ok()
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_secs())
                .unwrap_or_default();
            large_files.push(FileEntry {
                name: entry.file_name().to_string_lossy().into_owned(),
                path: entry.path().to_string_lossy().into_owned(),
                size_bytes: size,
                modified_at,
            });
        }
        if size >= 1024 * 1024 {
            let modified_at = metadata.modified().ok()
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_secs())
                .unwrap_or_default();
            treemap_files.push(FileEntry {
                name: entry.file_name().to_string_lossy().into_owned(),
                path: entry.path().to_string_lossy().into_owned(),
                size_bytes: size,
                modified_at,
            });
        }
    }

    let mut folders: Vec<FolderEntry> = grouped.into_iter().map(|(name, (path, size_bytes, file_count))| FolderEntry {
        name,
        is_dir: path.is_dir(),
        path: path.to_string_lossy().into_owned(),
        size_bytes,
        file_count,
    }).collect();
    folders.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
    large_files.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
    large_files.truncate(500);
    treemap_files.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
    treemap_files.truncate(1800);

    Ok(ScanReport { root, folders, large_files, treemap_files, scanned_bytes, scanned_files })
}

#[tauri::command]
fn cleanup_selected(ids: Vec<String>) -> Result<usize, String> {
    let requested: HashSet<String> = ids.into_iter().collect();
    if requested.is_empty() { return Ok(0); }
    let allowed: Vec<CleanupLocation> = cleanup_locations().into_iter()
        .filter(|location| requested.contains(location.id))
        .collect();
    if allowed.len() != requested.len() {
        return Err("A seleção contém uma categoria de limpeza inválida.".into());
    }

    let mut moved = 0_usize;
    for location in allowed {
        let path = PathBuf::from(location.path);
        if !path.is_dir() { continue; }
        let children: Vec<PathBuf> = std::fs::read_dir(&path)
            .map_err(|error| format!("Não foi possível abrir {}: {error}", path.display()))?
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .collect();
        for child in children {
            if trash::delete(&child).is_ok() { moved += 1; }
        }
    }
    Ok(moved)
}

#[tauri::command]
fn disks() -> Vec<DiskInfo> {
    let disks = Disks::new_with_refreshed_list();
    disks.list().iter().map(|disk| DiskInfo {
        name: disk.name().to_string_lossy().into_owned(),
        mount_path: disk.mount_point().to_string_lossy().into_owned(),
        total_bytes: disk.total_space(),
        available_bytes: disk.available_space(),
    }).collect()
}

#[tauri::command]
fn system_metrics() -> SystemMetrics {
    let mut system = System::new_all();
    system.refresh_all();
    let mut processes: Vec<ProcessMetric> = system.processes().values().map(|process| ProcessMetric {
        name: process.name().to_string_lossy().into_owned(),
        cpu_percent: process.cpu_usage(),
        memory_bytes: process.memory(),
    }).collect();
    processes.sort_by(|a, b| b.memory_bytes.cmp(&a.memory_bytes));
    processes.truncate(9);
    SystemMetrics {
        cpu_percent: system.global_cpu_usage(),
        total_memory_bytes: system.total_memory(),
        used_memory_bytes: system.used_memory(),
        processes,
    }
}

#[tauri::command]
async fn scan_large_files(root: String, minimum_bytes: Option<u64>) -> Result<Vec<FileEntry>, String> {
    let root = PathBuf::from(root);
    if !root.exists() { return Err("A pasta escolhida não existe.".into()); }
    let minimum = minimum_bytes.unwrap_or(500 * 1024 * 1024);
    let mut files: Vec<FileEntry> = WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let meta = entry.metadata().ok()?;
            if !meta.is_file() || meta.len() < minimum { return None; }
            let modified_at = meta.modified().ok()?.duration_since(UNIX_EPOCH).ok()?.as_secs();
            Some(FileEntry {
                name: entry.file_name().to_string_lossy().into_owned(),
                path: entry.path().to_string_lossy().into_owned(),
                size_bytes: meta.len(),
                modified_at,
            })
        })
        .collect();
    files.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
    files.truncate(500);
    Ok(files)
}

#[tauri::command]
async fn scan_folder_children(root: String) -> Result<Vec<FolderEntry>, String> {
    let root = PathBuf::from(root);
    if !root.is_dir() { return Err("Escolha uma pasta válida para analisar.".into()); }
    let mut folders = Vec::new();
    let children = std::fs::read_dir(&root).map_err(|error| format!("Não foi possível abrir a pasta: {error}"))?;

    for child in children.filter_map(Result::ok) {
        let path = child.path();
        let (mut size_bytes, mut file_count) = (0_u64, 0_u64);
        if path.is_file() {
            if let Ok(metadata) = path.metadata() {
                size_bytes = metadata.len();
                file_count = 1;
            }
        } else if path.is_dir() {
            for entry in WalkDir::new(&path).follow_links(false).into_iter().filter_map(Result::ok) {
                if let Ok(metadata) = entry.metadata() {
                    if metadata.is_file() {
                        size_bytes = size_bytes.saturating_add(metadata.len());
                        file_count += 1;
                    }
                }
            }
        }
        folders.push(FolderEntry {
            name: child.file_name().to_string_lossy().into_owned(),
            path: path.to_string_lossy().into_owned(),
            is_dir: path.is_dir(),
            size_bytes,
            file_count,
        });
    }
    folders.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
    Ok(folders)
}

#[tauri::command]
fn move_to_trash(paths: Vec<String>) -> Result<usize, String> {
    if paths.is_empty() { return Ok(0); }
    let resolved: Vec<PathBuf> = paths.into_iter().map(PathBuf::from).collect();
    if let Some(missing) = resolved.iter().find(|path| !path.exists()) {
        return Err(format!("O item não existe mais: {}", missing.display()));
    }
    trash::delete_all(&resolved).map_err(|error| format!("Não foi possível mover para o Lixo: {error}"))?;
    Ok(resolved.len())
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn scan_ai_tools() -> Vec<AiToolInfo> {
    let home = std::env::var("USERPROFILE").unwrap_or_default();
    let roaming = std::env::var("APPDATA").unwrap_or_default();
    let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let system = System::new_all();
    let running: Vec<String> = system.processes().values()
        .map(|process| process.name().to_string_lossy().to_lowercase())
        .collect();
    let definitions = [
        ("Ollama", vec![format!("{home}\\.ollama")], vec!["ollama"]),
        ("LM Studio", vec![format!("{home}\\.cache\\lm-studio"), format!("{home}\\.lmstudio")], vec!["lm studio", "lm-studio"]),
        ("Cursor", vec![format!("{roaming}\\Cursor")], vec!["cursor"]),
        ("Claude", vec![format!("{roaming}\\Claude"), format!("{local}\\AnthropicClaude")], vec!["claude"]),
    ];
    definitions.into_iter().filter_map(|(name, candidates, process_names)| {
        let existing: Vec<PathBuf> = candidates.into_iter().map(PathBuf::from).filter(|path| path.exists()).collect();
        let is_running = running.iter().any(|process| process_names.iter().any(|needle| process.contains(needle)));
        if existing.is_empty() && !is_running { return None; }
        let (size_bytes, file_count) = existing.iter().fold((0_u64, 0_u64), |(size, count), path| {
            let measured = measure_path(path);
            (size.saturating_add(measured.0), count.saturating_add(measured.1))
        });
        Some(AiToolInfo {
            name,
            path: existing.first().map(|path| path.to_string_lossy().into_owned()).unwrap_or_default(),
            size_bytes,
            file_count,
            running: is_running,
        })
    }).collect()
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn scan_ai_tools() -> Vec<AiToolInfo> {
    let home = std::env::var("HOME").unwrap_or_default();
    let system = System::new_all();
    let running: Vec<String> = system.processes().values()
        .map(|process| process.name().to_string_lossy().to_lowercase())
        .collect();
    let definitions = [
        ("Ollama", vec![format!("{home}/.ollama")], vec!["ollama"]),
        ("LM Studio", vec![format!("{home}/.cache/lm-studio"), format!("{home}/.lmstudio")], vec!["lm studio", "lm-studio"]),
        ("Cursor", vec![format!("{home}/Library/Application Support/Cursor"), format!("{home}/.cursor")], vec!["cursor"]),
        ("Claude", vec![format!("{home}/Library/Application Support/Claude")], vec!["claude"]),
    ];
    definitions.into_iter().filter_map(|(name, candidates, process_names)| {
        let existing: Vec<PathBuf> = candidates.into_iter().map(PathBuf::from).filter(|path| path.exists()).collect();
        let is_running = running.iter().any(|process| process_names.iter().any(|needle| process.contains(needle)));
        if existing.is_empty() && !is_running { return None; }
        let (size_bytes, file_count) = existing.iter().fold((0_u64, 0_u64), |(size, count), path| {
            let measured = measure_path(path);
            (size.saturating_add(measured.0), count.saturating_add(measured.1))
        });
        Some(AiToolInfo { name, path: existing.first().map(|path| path.to_string_lossy().into_owned()).unwrap_or_default(), size_bytes, file_count, running: is_running })
    }).collect()
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
#[tauri::command]
fn scan_ai_tools() -> Vec<AiToolInfo> { Vec::new() }

#[cfg(target_os = "windows")]
fn collect_apps(root: RegKey, flags: u32, apps: &mut HashMap<String, InstalledAppInfo>) {
    let Ok(uninstall) = root.open_subkey_with_flags("Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall", KEY_READ | flags) else { return };
    for key_name in uninstall.enum_keys().filter_map(Result::ok) {
        let Ok(key) = uninstall.open_subkey_with_flags(&key_name, KEY_READ | flags) else { continue };
        let name: String = match key.get_value::<String, _>("DisplayName") { Ok(value) if !value.trim().is_empty() => value, _ => continue };
        let system_component: u32 = key.get_value("SystemComponent").unwrap_or(0);
        if system_component == 1 { continue; }
        let publisher: String = key.get_value("Publisher").unwrap_or_default();
        let install_location: String = key.get_value("InstallLocation").unwrap_or_default();
        let display_icon: String = key.get_value("DisplayIcon").unwrap_or_default();
        let estimated_kb: u64 = key.get_value::<u32, _>("EstimatedSize").map(u64::from).unwrap_or(0);
        let icon_path = display_icon.trim().trim_matches('"').split(',').next().unwrap_or("").trim_matches('"');
        let icon_data_url = if Path::new(icon_path).is_file() {
            win_icon_extractor::extract_icon_best(icon_path, 48).ok()
                .and_then(|icon| win_icon_extractor::encode_png(&icon.rgba, icon.width, icon.height).ok())
                .map(|png| format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(png)))
                .unwrap_or_default()
        } else { String::new() };
        let app = InstalledAppInfo { name: name.clone(), publisher, install_location, size_bytes: estimated_kb.saturating_mul(1024), icon_data_url };
        let dedupe = name.to_lowercase();
        if apps.get(&dedupe).map(|current| current.size_bytes).unwrap_or(0) <= app.size_bytes { apps.insert(dedupe, app); }
    }
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn installed_apps() -> Vec<InstalledAppInfo> {
    let mut found = HashMap::new();
    collect_apps(RegKey::predef(HKEY_CURRENT_USER), KEY_WOW64_64KEY, &mut found);
    collect_apps(RegKey::predef(HKEY_CURRENT_USER), KEY_WOW64_32KEY, &mut found);
    collect_apps(RegKey::predef(HKEY_LOCAL_MACHINE), KEY_WOW64_64KEY, &mut found);
    collect_apps(RegKey::predef(HKEY_LOCAL_MACHINE), KEY_WOW64_32KEY, &mut found);
    let mut apps: Vec<InstalledAppInfo> = found.into_values().collect();
    apps.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes).then_with(|| a.name.cmp(&b.name)));
    apps
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn installed_apps() -> Vec<InstalledAppInfo> {
    let home = std::env::var("HOME").unwrap_or_default();
    let roots = [PathBuf::from("/Applications"), PathBuf::from(format!("{home}/Applications"))];
    let mut seen = HashSet::new();
    let mut apps = Vec::new();
    for root in roots {
        let Ok(entries) = std::fs::read_dir(root) else { continue };
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("app") { continue; }
            let name = path.file_stem().map(|value| value.to_string_lossy().into_owned()).unwrap_or_default();
            if name.is_empty() || !seen.insert(name.to_lowercase()) { continue; }
            apps.push(InstalledAppInfo { name, publisher: String::new(), install_location: path.to_string_lossy().into_owned(), size_bytes: 0, icon_data_url: String::new() });
        }
    }
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
#[tauri::command]
fn installed_apps() -> Vec<InstalledAppInfo> { Vec::new() }

#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    let target = PathBuf::from(path);
    if !target.exists() {
        return Err("O item não existe mais ou não pode ser acessado.".into());
    }
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("explorer.exe");
        if target.is_file() { command.arg(format!("/select,{}", target.display())); }
        else { command.arg(&target); }
        command
    };
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        if target.is_file() { command.arg("-R"); }
        command.arg(&target);
        command
    };
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(&target);
        command
    };
    command.spawn().map_err(|error| format!("Não foi possível abrir a pasta: {error}"))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            platform_info,
            disks,
            system_metrics,
            cleanup_locations,
            scan_cleanup_locations,
            scan_home,
            scan_folder_children,
            scan_large_files,
            cleanup_selected,
            move_to_trash,
            scan_ai_tools,
            installed_apps,
            open_folder
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Folga");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cleanup_ids_are_unique_and_paths_are_scoped() {
        let locations = cleanup_locations();
        let mut ids = HashSet::new();
        assert!(!locations.is_empty());
        for location in locations {
            assert!(ids.insert(location.id));
            assert!(!location.path.trim().is_empty());
            assert!(Path::new(&location.path).is_absolute());
            assert!(matches!(location.risk, "safe" | "review" | "care"));
        }
    }

    #[test]
    fn measure_missing_path_is_empty() {
        let result = measure_path(Path::new("Z:\\folga-path-that-does-not-exist"));
        assert_eq!(result, (0, 0));
    }
}

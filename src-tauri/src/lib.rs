use std::fs;
use std::io::Write;
use std::path::Path;
use tauri::command;

#[derive(serde::Serialize)]
pub struct IoResult {
    success: bool,
    message: String,
}

#[command]
fn save_database_atomic(filepath: String, content: String) -> IoResult {
    let path = Path::new(&filepath);
    let tmp_path = path.with_extension("tmp");
    let backup_path = path.with_extension("bak");

    if path.exists() {
        let _ = fs::copy(path, &backup_path);
    }

    let mut file = match fs::File::create(&tmp_path) {
        Ok(f) => f,
        Err(e) => return IoResult { success: false, message: format!("Erro criar tmp: {}", e) },
    };

    if let Err(e) = file.write_all(content.as_bytes()) {
        return IoResult { success: false, message: format!("Erro escrita: {}", e) };
    }

    if let Err(e) = file.sync_all() {
        return IoResult { success: false, message: format!("Erro sync: {}", e) };
    }

    if let Err(e) = fs::rename(&tmp_path, path) {
        return IoResult { success: false, message: format!("Erro rename: {}", e) };
    }

    IoResult { success: true, message: "Salvo com sucesso.".into() }
}

#[command]
fn load_database(filepath: String) -> String {
    fs::read_to_string(filepath).unwrap_or_else(|_| "{}".to_string())
}

#[command]
fn export_report(target_folder: String, filename: String, content: String) -> IoResult {
    let export_dir = Path::new(&target_folder);
    
    if !export_dir.exists() {
        if let Err(e) = fs::create_dir_all(export_dir) {
            return IoResult { success: false, message: format!("Erro ao criar pasta: {}", e) };
        }
    }

    let file_path = export_dir.join(filename);
    
    let mut file = match fs::File::create(&file_path) {
        Ok(f) => f,
        Err(e) => return IoResult { success: false, message: format!("Erro criar arquivo: {}", e) },
    };

    let content_with_bom = format!("\u{FEFF}{}", content);
    
    if let Err(e) = file.write_all(content_with_bom.as_bytes()) {
        return IoResult { success: false, message: format!("Erro escrita: {}", e) };
    }
    
    if let Err(e) = file.sync_all() {
        return IoResult { success: false, message: format!("Erro sync: {}", e) };
    }

    IoResult { 
        success: true, 
        message: format!("Relatório salvo em: {}", file_path.display()) 
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            save_database_atomic, 
            load_database,
            export_report
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
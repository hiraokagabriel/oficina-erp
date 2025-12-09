use std::fs;
use std::io::Write;
use std::path::Path;
use tauri::command;

// Estrutura de resposta para o Frontend
#[derive(serde::Serialize)]
pub struct IoResult {
    success: bool,
    message: String,
}

#[command]
pub fn save_database_atomic(filepath: String, content: String) -> IoResult {
    let path = Path::new(&filepath);
    let tmp_path = path.with_extension("tmp");
    let backup_path = path.with_extension("bak");

    // 1. Criação do Backup de Segurança (Rotação Simples)
    if path.exists() {
        if let Err(e) = fs::copy(path, &backup_path) {
            println!("Aviso: Falha ao criar backup: {}", e);
        }
    }

    // 2. Escrita no arquivo temporário (.tmp)
    // Usamos 'create' que sobrescreve se existir
    let mut file = match fs::File::create(&tmp_path) {
        Ok(f) => f,
        Err(e) => return IoResult { success: false, message: format!("Erro ao criar temporário: {}", e) },
    };

    if let Err(e) = file.write_all(content.as_bytes()) {
        return IoResult { success: false, message: format!("Erro ao escrever dados: {}", e) };
    }

    // 3. FLUSH (Sync) - Passo Crítico para evitar corrupção por queda de energia
    if let Err(e) = file.sync_all() {
        return IoResult { success: false, message: format!("Erro ao sincronizar disco: {}", e) };
    }

    // 4. Atomic Rename - O SO garante que esta operação é atômica
    if let Err(e) = fs::rename(&tmp_path, path) {
        return IoResult { success: false, message: format!("Erro ao renomear final: {}", e) };
    }

    IoResult { success: true, message: "Dados salvos com segurança.".into() }
}

#[command]
pub fn load_database(filepath: String) -> String {
    fs::read_to_string(filepath).unwrap_or_else(|_| "{}".to_string())
}

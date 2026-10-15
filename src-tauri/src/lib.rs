use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{command, AppHandle, Manager};

#[derive(serde::Serialize)]
pub struct IoResult {
    success: bool,
    message: String,
}

#[derive(serde::Serialize, Debug)]
pub struct LoadResult {
    /// "ok" | "not_found"
    status: String,
    content: String,
}

// ---------------------------------------------------------------------------
// Backups rotativos (fora da pasta sincronizada do banco)
// ---------------------------------------------------------------------------

const BACKUP_PREFIX: &str = "database-";
const BACKUP_SUFFIX: &str = ".json";
const BACKUP_INTERVAL_SECS: u64 = 30 * 60;
const KEEP_RECENT: usize = 20;
const KEEP_DAILY_WINDOW_DAYS: i64 = 30;

/// Já houve backup (ou tentativa) na primeira gravação da sessão?
static BACKUP_DONE_THIS_SESSION: AtomicBool = AtomicBool::new(false);

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

// Algoritmo de datas civis (Howard Hinnant), sem crates externos.
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// Nome do backup para um instante (UTC): database-AAAAMMDD-HHmmss.json
fn backup_file_name(secs: u64) -> String {
    let days = (secs / 86400) as i64;
    let rem = secs % 86400;
    let (y, m, d) = civil_from_days(days);
    format!(
        "{}{:04}{:02}{:02}-{:02}{:02}{:02}{}",
        BACKUP_PREFIX,
        y,
        m,
        d,
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60,
        BACKUP_SUFFIX
    )
}

/// Lê o instante (segundos UTC) a partir do nome. None se não for um backup nosso.
fn parse_backup_name(name: &str) -> Option<u64> {
    let core = name.strip_prefix(BACKUP_PREFIX)?.strip_suffix(BACKUP_SUFFIX)?;
    let (date, time) = core.split_once('-')?;
    if date.len() != 8 || time.len() != 6 {
        return None;
    }
    if !date.bytes().all(|b| b.is_ascii_digit()) || !time.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let y: i64 = date[0..4].parse().ok()?;
    let m: i64 = date[4..6].parse().ok()?;
    let d: i64 = date[6..8].parse().ok()?;
    let hh: i64 = time[0..2].parse().ok()?;
    let mm: i64 = time[2..4].parse().ok()?;
    let ss: i64 = time[4..6].parse().ok()?;
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) || hh > 23 || mm > 59 || ss > 59 {
        return None;
    }
    let total = days_from_civil(y, m, d) * 86400 + hh * 3600 + mm * 60 + ss;
    if total < 0 {
        return None;
    }
    Some(total as u64)
}

/// Retenção (função pura): devolve os nomes a apagar.
/// Mantém os 20 mais recentes e o primeiro backup de cada dia dos últimos 30 dias.
/// Nomes fora do padrão são ignorados (nunca apagados).
fn backups_to_delete(names: &[String], now: u64) -> Vec<String> {
    let mut parsed: Vec<(u64, &String)> = names
        .iter()
        .filter_map(|n| parse_backup_name(n).map(|t| (t, n)))
        .collect();
    // mais recentes primeiro
    parsed.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| b.1.cmp(a.1)));

    let mut keep: std::collections::HashSet<String> = std::collections::HashSet::new();
    for (_, n) in parsed.iter().take(KEEP_RECENT) {
        keep.insert((*n).clone());
    }

    // primeiro de cada dia (menor horário), dentro da janela de 30 dias
    let today = (now / 86400) as i64;
    let mut first_of_day: std::collections::BTreeMap<i64, (u64, &String)> =
        std::collections::BTreeMap::new();
    for (t, n) in parsed.iter() {
        let day = (*t / 86400) as i64;
        if today - day > KEEP_DAILY_WINDOW_DAYS {
            continue;
        }
        let entry = first_of_day.entry(day).or_insert((*t, *n));
        if *t < entry.0 || (*t == entry.0 && *n < entry.1) {
            *entry = (*t, *n);
        }
    }
    for (_, (_, n)) in first_of_day {
        keep.insert(n.clone());
    }

    parsed
        .into_iter()
        .filter(|(_, n)| !keep.contains(*n))
        .map(|(_, n)| n.clone())
        .collect()
}

/// Faz o backup (se devido) e aplica a retenção. O erro serve só para registro:
/// o chamador NUNCA aborta o salvamento por causa disto.
fn backup_current(
    db_path: &Path,
    backup_dir: &Path,
    now: u64,
    first_in_session: bool,
) -> Result<(), String> {
    fs::create_dir_all(backup_dir).map_err(|e| format!("criar pasta de backup: {}", e))?;

    let mut names: Vec<String> = Vec::new();
    for entry in fs::read_dir(backup_dir).map_err(|e| format!("listar backups: {}", e))? {
        if let Ok(entry) = entry {
            if let Some(n) = entry.file_name().to_str() {
                names.push(n.to_string());
            }
        }
    }
    let latest = names.iter().filter_map(|n| parse_backup_name(n)).max();
    let due = first_in_session
        || match latest {
            None => true,
            Some(t) => now.saturating_sub(t) > BACKUP_INTERVAL_SECS,
        };

    if due {
        let name = backup_file_name(now);
        let target = backup_dir.join(&name);
        if !target.exists() {
            fs::copy(db_path, &target).map_err(|e| format!("copiar backup: {}", e))?;
            names.push(name);
        }
    }

    for old in backups_to_delete(&names, now) {
        if let Err(e) = fs::remove_file(backup_dir.join(&old)) {
            eprintln!("Aviso: não foi possível apagar backup antigo {}: {}", old, e);
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Salvar / carregar
// ---------------------------------------------------------------------------

fn write_tmp(tmp_path: &Path, content: &str) -> Result<(), String> {
    let mut file = fs::File::create(tmp_path).map_err(|e| format!("Erro criar tmp: {}", e))?;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("Erro escrita: {}", e))?;
    file.sync_all().map_err(|e| format!("Erro sync: {}", e))?;
    Ok(())
}

fn save_database_impl(
    path: &Path,
    content: &str,
    backup_dir: Option<&Path>,
    now: u64,
    first_in_session: bool,
) -> IoResult {
    let tmp_path = path.with_extension("tmp");

    // Primeira gravação ("Criar banco novo aqui"): cria a pasta se ainda não existir.
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            if let Err(e) = fs::create_dir_all(parent) {
                return IoResult { success: false, message: format!("Erro criar pasta: {}", e) };
            }
        }
    }

    if let Err(message) = write_tmp(&tmp_path, content) {
        let _ = fs::remove_file(&tmp_path);
        return IoResult { success: false, message };
    }

    // Backup do arquivo atual do disco, antes de ser substituído. Falha não impede o save.
    if let Some(dir) = backup_dir {
        if path.exists() {
            if let Err(e) = backup_current(path, dir, now, first_in_session) {
                eprintln!("Aviso: backup local falhou: {}", e);
            }
        }
    }

    if let Err(e) = fs::rename(&tmp_path, path) {
        let _ = fs::remove_file(&tmp_path);
        return IoResult { success: false, message: format!("Erro rename: {}", e) };
    }

    IoResult { success: true, message: "Salvo com sucesso.".into() }
}

#[command]
fn save_database_atomic(app: AppHandle, filepath: String, content: String) -> IoResult {
    let backup_dir: Option<PathBuf> = match app.path().app_local_data_dir() {
        Ok(d) => Some(d.join("backups")),
        Err(e) => {
            eprintln!("Aviso: pasta de dados local indisponível: {}", e);
            None
        }
    };
    let path = Path::new(&filepath);
    let first = !BACKUP_DONE_THIS_SESSION.load(Ordering::SeqCst);
    let existed = path.exists();
    let result = save_database_impl(path, &content, backup_dir.as_deref(), now_secs(), first);
    if result.success && existed {
        BACKUP_DONE_THIS_SESSION.store(true, Ordering::SeqCst);
    }
    result
}

fn load_database_impl(path: &Path) -> Result<LoadResult, String> {
    match fs::read_to_string(path) {
        Ok(content) => Ok(LoadResult { status: "ok".into(), content }),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            Ok(LoadResult { status: "not_found".into(), content: String::new() })
        }
        Err(e) => Err(format!("Erro ao ler o banco: {}", e)),
    }
}

#[command]
fn load_database(filepath: String) -> Result<LoadResult, String> {
    load_database_impl(Path::new(&filepath))
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;

    static COUNTER: AtomicUsize = AtomicUsize::new(0);

    fn temp_dir(tag: &str) -> PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let d = std::env::temp_dir().join(format!(
            "oficinapro-test-{}-{}-{}-{}",
            tag,
            std::process::id(),
            now_secs(),
            n
        ));
        fs::create_dir_all(&d).unwrap();
        d
    }

    fn ts(y: i64, m: i64, d: i64, hh: u64, mm: u64, ss: u64) -> u64 {
        (days_from_civil(y, m, d) as u64) * 86400 + hh * 3600 + mm * 60 + ss
    }

    #[test]
    fn nome_e_parse_sao_inversos() {
        let t = ts(2026, 10, 15, 13, 5, 9);
        let n = backup_file_name(t);
        assert_eq!(n, "database-20261015-130509.json");
        assert_eq!(parse_backup_name(&n), Some(t));
        assert_eq!(
            parse_backup_name("database-20240229-235959.json"),
            Some(ts(2024, 2, 29, 23, 59, 59))
        );
    }

    #[test]
    fn parse_rejeita_nomes_invalidos() {
        assert_eq!(parse_backup_name("database.json"), None);
        assert_eq!(parse_backup_name("database-20261315-000000.json"), None);
        assert_eq!(parse_backup_name("database-20261015-250000.json"), None);
        assert_eq!(parse_backup_name("outro-20261015-000000.json"), None);
        assert_eq!(parse_backup_name("database-2026101-0000000.json"), None);
    }

    #[test]
    fn retencao_sem_excesso_nao_apaga_nada() {
        let now = ts(2026, 10, 15, 12, 0, 0);
        let names: Vec<String> = (0..5).map(|i| backup_file_name(now - i * 3600)).collect();
        assert!(backups_to_delete(&names, now).is_empty());
    }

    #[test]
    fn retencao_20_recentes_mais_primeiro_do_dia() {
        let now = ts(2026, 10, 15, 12, 0, 0);
        // 30 backups no mesmo dia, de 2 em 2 minutos a partir de 00:00:10
        let mut names: Vec<String> = (0..30)
            .map(|i| backup_file_name(ts(2026, 10, 15, 0, 0, 10) + i * 120))
            .collect();
        // dia antigo (20 dias atrás) com dois backups
        let old1 = backup_file_name(ts(2026, 9, 25, 8, 0, 0));
        let old2 = backup_file_name(ts(2026, 9, 25, 18, 0, 0));
        // dia fora da janela (60 dias atrás)
        let ancient = backup_file_name(ts(2026, 8, 16, 8, 0, 0));
        names.push(old1.clone());
        names.push(old2.clone());
        names.push(ancient.clone());
        names.push("lixo.txt".into());

        let del = backups_to_delete(&names, now);
        // dos 30 do dia: ficam os 20 mais recentes e o primeiro do dia, apaga 9
        let primeiro_do_dia = backup_file_name(ts(2026, 10, 15, 0, 0, 10));
        assert!(!del.contains(&primeiro_do_dia));
        let do_dia_apagados = del.iter().filter(|n| n.starts_with("database-20261015")).count();
        assert_eq!(do_dia_apagados, 9);
        // dia antigo: o primeiro fica, o segundo sai
        assert!(!del.contains(&old1));
        assert!(del.contains(&old2));
        // fora da janela some; nome fora do padrão nunca é apagado
        assert!(del.contains(&ancient));
        assert!(!del.contains(&"lixo.txt".to_string()));
        assert_eq!(del.len(), 9 + 1 + 1);
    }

    #[test]
    fn load_inexistente_e_not_found() {
        let d = temp_dir("load-nf");
        let r = load_database_impl(&d.join("nao-existe.json")).unwrap();
        assert_eq!(r.status, "not_found");
        assert_eq!(r.content, "");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn load_existente_e_ok() {
        let d = temp_dir("load-ok");
        let f = d.join("db.json");
        fs::write(&f, "{\"a\":1}").unwrap();
        let r = load_database_impl(&f).unwrap();
        assert_eq!(r.status, "ok");
        assert_eq!(r.content, "{\"a\":1}");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn load_erro_de_io_vira_err() {
        let d = temp_dir("load-err");
        // ler uma pasta como arquivo: erro que não é NotFound
        assert!(load_database_impl(&d).is_err());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn save_grava_sem_gerar_bak_nem_tmp() {
        let d = temp_dir("save");
        let db = d.join("db.json");
        let bk = d.join("backups");
        let r = save_database_impl(&db, "{\"v\":1}", Some(&bk), ts(2026, 10, 15, 10, 0, 0), true);
        assert!(r.success);
        assert_eq!(fs::read_to_string(&db).unwrap(), "{\"v\":1}");
        assert!(!d.join("db.tmp").exists());
        assert!(!d.join("db.bak").exists());
        assert!(!bk.exists(), "sem arquivo anterior não há o que copiar");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn save_cria_pasta_ausente() {
        let d = temp_dir("save-mkdir");
        let db = d.join("sub").join("db.json");
        assert!(save_database_impl(&db, "{}", None, ts(2026, 10, 15, 10, 0, 0), true).success);
        assert_eq!(fs::read_to_string(&db).unwrap(), "{}");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn save_faz_backup_do_arquivo_anterior_e_respeita_intervalo() {
        let d = temp_dir("backup");
        let db = d.join("db.json");
        let bk = d.join("backups");
        let t0 = ts(2026, 10, 15, 10, 0, 0);
        fs::write(&db, "antigo").unwrap();

        // primeira gravação da sessão: sempre faz backup
        assert!(save_database_impl(&db, "v1", Some(&bk), t0, true).success);
        let b0 = bk.join(backup_file_name(t0));
        assert_eq!(fs::read_to_string(&b0).unwrap(), "antigo");

        // 10 min depois: sem novo backup
        assert!(save_database_impl(&db, "v2", Some(&bk), t0 + 600, false).success);
        assert_eq!(fs::read_dir(&bk).unwrap().count(), 1);

        // 31 min depois: novo backup com o conteúdo então no disco (v2)
        assert!(save_database_impl(&db, "v3", Some(&bk), t0 + 31 * 60, false).success);
        assert_eq!(fs::read_dir(&bk).unwrap().count(), 2);
        let b1 = bk.join(backup_file_name(t0 + 31 * 60));
        assert_eq!(fs::read_to_string(&b1).unwrap(), "v2");
        assert_eq!(fs::read_to_string(&db).unwrap(), "v3");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn falha_de_backup_nao_impede_save() {
        let d = temp_dir("backup-fail");
        let db = d.join("db.json");
        fs::write(&db, "antigo").unwrap();
        // a "pasta" de backup é um arquivo: create_dir_all falha
        let bk = d.join("bloqueio");
        fs::write(&bk, "x").unwrap();
        let r = save_database_impl(&db, "novo", Some(&bk), ts(2026, 10, 15, 10, 0, 0), true);
        assert!(r.success);
        assert_eq!(fs::read_to_string(&db).unwrap(), "novo");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn erro_de_save_apaga_tmp_e_preserva_destino() {
        let d = temp_dir("save-err");
        // destino é uma pasta: o rename do .tmp falha
        let db = d.join("db.json");
        fs::create_dir_all(&db).unwrap();
        let r = save_database_impl(&db, "x", None, ts(2026, 10, 15, 10, 0, 0), true);
        assert!(!r.success);
        assert!(!d.join("db.tmp").exists());
        assert!(db.is_dir());
        let _ = fs::remove_dir_all(&d);
    }
}

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
    /// Nome desta máquina (vai para meta.savedBy nos salvamentos).
    machine: String,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConflictInfo {
    saved_by: Option<String>,
    saved_at: Option<String>,
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    /// "ok" | "conflict" | "io_error"
    status: String,
    message: String,
    /// revision gravada (só em "ok")
    revision: Option<String>,
    /// dados do salvamento que está no disco (só em "conflict"; pode vir vazio)
    conflict: Option<ConflictInfo>,
    machine: String,
}

impl SaveResult {
    fn ok(revision: Option<String>) -> Self {
        SaveResult {
            status: "ok".into(),
            message: "Salvo com sucesso.".into(),
            revision,
            conflict: None,
            machine: machine_name(),
        }
    }
    fn io_error(message: String) -> Self {
        SaveResult { status: "io_error".into(), message, revision: None, conflict: None, machine: machine_name() }
    }
    fn conflict(info: ConflictInfo) -> Self {
        SaveResult {
            status: "conflict".into(),
            message: "O arquivo do banco foi alterado por outro computador. Nada foi gravado.".into(),
            revision: None,
            conflict: Some(info),
            machine: machine_name(),
        }
    }
}

/// Nome da máquina, sem crates: variável de ambiente do Windows (ou HOSTNAME).
fn machine_name() -> String {
    for key in ["COMPUTERNAME", "HOSTNAME"] {
        if let Ok(v) = std::env::var(key) {
            let v = v.trim();
            if !v.is_empty() {
                return v.to_string();
            }
        }
    }
    "desconhecido".into()
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

/// AAAAMMDD-HHmmss (UTC)
fn stamp(secs: u64) -> String {
    let days = (secs / 86400) as i64;
    let rem = secs % 86400;
    let (y, m, d) = civil_from_days(days);
    format!("{:04}{:02}{:02}-{:02}{:02}{:02}", y, m, d, rem / 3600, (rem % 3600) / 60, rem % 60)
}

/// Nome do backup para um instante (UTC): database-AAAAMMDD-HHmmss.json
fn backup_file_name(secs: u64) -> String {
    format!("{}{}{}", BACKUP_PREFIX, stamp(secs), BACKUP_SUFFIX)
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

#[derive(serde::Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct DiskMeta {
    revision: Option<String>,
    saved_by: Option<String>,
    saved_at: Option<String>,
    /// Aceita qualquer JSON; só as strings são aproveitadas (ver `read_disk_meta`).
    history: Option<Vec<serde_json::Value>>,
}

/// Só o `meta` do arquivo; o resto do JSON é ignorado.
#[derive(serde::Deserialize, Default)]
#[serde(default)]
struct DiskDoc {
    meta: Option<DiskMeta>,
}

/// Compara a revision esperada com a do disco. Err = conflito (nada deve ser gravado).
fn check_conflict(path: &Path, expected: Option<&str>) -> Result<(), ConflictInfo> {
    let unknown = || ConflictInfo { saved_by: None, saved_at: None };
    let bytes = match fs::read(path) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            // sem arquivo: ok só se também não esperávamos nenhum (primeira gravação)
            return if expected.is_none() { Ok(()) } else { Err(unknown()) };
        }
        Err(_) => return Err(unknown()), // existe mas não dá para ler
    };
    let doc: DiskDoc = match serde_json::from_slice(&bytes) {
        Ok(d) => d,
        Err(_) => return Err(unknown()), // ilegível: não sobrescrever
    };
    match doc.meta {
        // banco v0 (sem meta): só a primeira gravação da versão nova pode substituí-lo
        None | Some(DiskMeta { revision: None, .. }) => {
            if expected.is_none() { Ok(()) } else { Err(unknown()) }
        }
        Some(m) => {
            if expected.is_some() && m.revision.as_deref() == expected {
                Ok(())
            } else {
                Err(ConflictInfo { saved_by: m.saved_by, saved_at: m.saved_at })
            }
        }
    }
}

/// revision do meta de um conteúdo que estamos gravando (só para devolver ao front).
fn revision_of(content: &str) -> Option<String> {
    serde_json::from_str::<DiskDoc>(content).ok()?.meta?.revision
}

fn save_database_impl(
    path: &Path,
    content: &str,
    expected_revision: Option<&str>,
    backup_dir: Option<&Path>,
    now: u64,
    first_in_session: bool,
) -> SaveResult {
    let tmp_path = path.with_extension("tmp");

    // Primeira gravação ("Criar banco novo aqui"): cria a pasta se ainda não existir.
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            if let Err(e) = fs::create_dir_all(parent) {
                return SaveResult::io_error(format!("Erro criar pasta: {}", e));
            }
        }
    }

    if let Err(message) = write_tmp(&tmp_path, content) {
        let _ = fs::remove_file(&tmp_path);
        return SaveResult::io_error(message);
    }

    // Conflito: lido logo antes do rename (janela mínima; não é um lock entre máquinas).
    if let Err(info) = check_conflict(path, expected_revision) {
        let _ = fs::remove_file(&tmp_path);
        return SaveResult::conflict(info);
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
        return SaveResult::io_error(format!("Erro rename: {}", e));
    }

    SaveResult::ok(revision_of(content))
}

/// Resultado de `read_db_meta`: só o meta do arquivo no disco, sem o resto do JSON.
#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MetaResult {
    /// "ok" (meta com revision) | "no_meta" (banco v0, sem meta/revision) | "not_found" | "unreadable"
    status: String,
    revision: Option<String>,
    history: Vec<String>,
    saved_by: Option<String>,
    saved_at: Option<String>,
}

impl MetaResult {
    fn bare(status: &str) -> Self {
        MetaResult { status: status.into(), revision: None, history: Vec::new(), saved_by: None, saved_at: None }
    }
}

/// Lê só o `meta` do arquivo. Ausente/ilegível não é erro: vira um status próprio.
fn read_disk_meta(path: &Path) -> MetaResult {
    let bytes = match fs::read(path) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return MetaResult::bare("not_found"),
        Err(_) => return MetaResult::bare("unreadable"),
    };
    let doc: DiskDoc = match serde_json::from_slice(&bytes) {
        Ok(d) => d,
        Err(_) => return MetaResult::bare("unreadable"),
    };
    match doc.meta {
        Some(DiskMeta { revision: Some(revision), saved_by, saved_at, history }) => MetaResult {
            status: "ok".into(),
            revision: Some(revision),
            history: history
                .unwrap_or_default()
                .into_iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect(),
            saved_by,
            saved_at,
        },
        _ => MetaResult::bare("no_meta"),
    }
}

#[command]
fn read_db_meta(filepath: String) -> MetaResult {
    read_disk_meta(Path::new(&filepath))
}

fn local_dir(app: &AppHandle, sub: &str) -> Option<PathBuf> {
    match app.path().app_local_data_dir() {
        Ok(d) => Some(d.join(sub)),
        Err(e) => {
            eprintln!("Aviso: pasta de dados local indisponível: {}", e);
            None
        }
    }
}

#[command]
fn save_database_atomic(
    app: AppHandle,
    filepath: String,
    content: String,
    expected_revision: Option<String>,
) -> SaveResult {
    let backup_dir = local_dir(&app, "backups");
    let path = Path::new(&filepath);
    let first = !BACKUP_DONE_THIS_SESSION.load(Ordering::SeqCst);
    let existed = path.exists();
    let result = save_database_impl(
        path,
        &content,
        expected_revision.as_deref(),
        backup_dir.as_deref(),
        now_secs(),
        first,
    );
    if result.status == "ok" && existed {
        BACKUP_DONE_THIS_SESSION.store(true, Ordering::SeqCst);
    }
    result
}

/// Grava `content` em dir/<prefix><AAAAMMDD-HHmmss>[-n].json sem sobrescrever nada.
/// Devolve o caminho gravado.
fn write_stamped_file(dir: &Path, prefix: &str, now: u64, content: &str) -> Result<PathBuf, String> {
    fs::create_dir_all(dir).map_err(|e| format!("criar pasta: {}", e))?;
    for n in 0..100 {
        let name = if n == 0 {
            format!("{}{}.json", prefix, stamp(now))
        } else {
            format!("{}{}-{}.json", prefix, stamp(now), n)
        };
        let target = dir.join(name);
        match fs::OpenOptions::new().write(true).create_new(true).open(&target) {
            Ok(mut f) => {
                f.write_all(content.as_bytes()).map_err(|e| format!("escrever: {}", e))?;
                f.sync_all().map_err(|e| format!("sync: {}", e))?;
                return Ok(target);
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(format!("criar arquivo: {}", e)),
        }
    }
    Err("nomes de arquivo esgotados".into())
}

/// Backup do banco lido (antes de migrar): database-pre-v<from>-AAAAMMDD-HHmmss.json.
/// O nome não segue o padrão da rotação, então a retenção nunca o apaga.
#[command]
fn backup_pre_migration(app: AppHandle, content: String, from_version: u32) -> IoResult {
    let Some(dir) = local_dir(&app, "backups") else {
        return IoResult { success: false, message: "Pasta de dados local indisponível.".into() };
    };
    let prefix = format!("{}pre-v{}-", BACKUP_PREFIX, from_version);
    match write_stamped_file(&dir, &prefix, now_secs(), &content) {
        Ok(p) => IoResult { success: true, message: p.display().to_string() },
        Err(e) => IoResult { success: false, message: format!("Erro no backup pré-migração: {}", e) },
    }
}

/// Estado local não gravado por causa de conflito: recuperacao/database-conflito-AAAAMMDD-HHmmss.json
#[command]
fn save_recovery_copy(app: AppHandle, content: String) -> IoResult {
    let Some(dir) = local_dir(&app, "recuperacao") else {
        return IoResult { success: false, message: "Pasta de dados local indisponível.".into() };
    };
    match write_stamped_file(&dir, "database-conflito-", now_secs(), &content) {
        Ok(p) => IoResult { success: true, message: p.display().to_string() },
        Err(e) => IoResult { success: false, message: format!("Erro ao guardar a cópia de recuperação: {}", e) },
    }
}

fn load_database_impl(path: &Path) -> Result<LoadResult, String> {
    match fs::read_to_string(path) {
        Ok(content) => Ok(LoadResult { status: "ok".into(), content, machine: machine_name() }),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            Ok(LoadResult { status: "not_found".into(), content: String::new(), machine: machine_name() })
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

// ----- fotos da OS: fotos/<os_id>/<photo_id>.jpg (+ .t.jpg), lixeira em fotos/_lixeira/<os_id>/ -----

const MAX_PHOTO_BYTES: usize = 3 * 1024 * 1024;
const MAX_THUMB_BYTES: usize = 200 * 1024;
const PHOTOS_DIR: &str = "fotos";
const TRASH_DIR: &str = "_lixeira";

/// Id seguro para nome de pasta/arquivo: ^[A-Za-z0-9-]{1,64}$ (sem `..`, `/`, `\`, `:`).
fn valid_photo_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
}

fn is_jpeg(bytes: &[u8]) -> bool {
    bytes.len() >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF
}

/// Pasta `fotos` ao lado do banco.
fn photos_root(db_path: &str) -> Result<PathBuf, String> {
    let parent = Path::new(db_path)
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .ok_or_else(|| "caminho do banco inválido".to_string())?;
    Ok(parent.join(PHOTOS_DIR))
}

fn photo_file_name(photo_id: &str, thumb: bool) -> String {
    if thumb { format!("{}.t.jpg", photo_id) } else { format!("{}.jpg", photo_id) }
}

/// Grava `bytes` em dir/name via .tmp + rename, sem sobrescrever arquivo existente.
fn write_new_file(dir: &Path, name: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    let target = dir.join(name);
    if target.exists() {
        return Err(format!("arquivo já existe: {}", name));
    }
    let tmp = dir.join(format!("{}.tmp", name));
    let _ = fs::remove_file(&tmp); // sobra de queda anterior
    {
        let mut f = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&tmp)
            .map_err(|e| format!("criar arquivo: {}", e))?;
        let r = f.write_all(bytes).and_then(|_| f.sync_all());
        if let Err(e) = r {
            drop(f);
            let _ = fs::remove_file(&tmp);
            return Err(format!("escrever: {}", e));
        }
    }
    if let Err(e) = fs::rename(&tmp, &target) {
        let _ = fs::remove_file(&tmp);
        return Err(format!("renomear: {}", e));
    }
    Ok(target)
}

fn save_photo_impl(db_path: &str, os_id: &str, photo_id: &str, full: &[u8], thumb: &[u8]) -> Result<PathBuf, String> {
    if !valid_photo_id(os_id) {
        return Err("id da OS inválido".into());
    }
    if !valid_photo_id(photo_id) {
        return Err("id da foto inválido".into());
    }
    if full.len() > MAX_PHOTO_BYTES {
        return Err("foto maior que 3 MB".into());
    }
    if thumb.len() > MAX_THUMB_BYTES {
        return Err("miniatura maior que 200 KB".into());
    }
    if !is_jpeg(full) || !is_jpeg(thumb) {
        return Err("arquivo não é JPEG".into());
    }
    let dir = photos_root(db_path)?.join(os_id);
    fs::create_dir_all(&dir).map_err(|e| format!("criar pasta: {}", e))?;
    let full_path = write_new_file(&dir, &photo_file_name(photo_id, false), full)?;
    if let Err(e) = write_new_file(&dir, &photo_file_name(photo_id, true), thumb) {
        let _ = fs::remove_file(&full_path); // não deixa foto sem miniatura
        return Err(e);
    }
    Ok(full_path)
}

/// Salva foto e miniatura da OS. Nunca sobrescreve arquivo existente.
#[command]
fn save_photo(db_path: String, os_id: String, photo_id: String, full: Vec<u8>, thumb: Vec<u8>) -> IoResult {
    match save_photo_impl(&db_path, &os_id, &photo_id, &full, &thumb) {
        Ok(p) => IoResult { success: true, message: p.display().to_string() },
        Err(e) => IoResult { success: false, message: format!("Erro ao salvar a foto: {}", e) },
    }
}

fn read_photo_impl(db_path: &str, os_id: &str, photo_id: &str, thumb: bool) -> Result<Vec<u8>, String> {
    if !valid_photo_id(os_id) || !valid_photo_id(photo_id) {
        return Err("id inválido".into());
    }
    let root = photos_root(db_path)?;
    let name = photo_file_name(photo_id, thumb);
    for dir in [root.join(os_id), root.join(TRASH_DIR).join(os_id)] {
        match fs::read(dir.join(&name)) {
            Ok(b) => return Ok(b),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
            Err(e) => return Err(format!("ler foto: {}", e)),
        }
    }
    Err("not_found".into())
}

/// Bytes crus da foto (ou miniatura); cai na lixeira se não estiver na pasta normal.
/// Erro exatamente "not_found" quando não existe em nenhuma.
#[command]
fn read_photo(db_path: String, os_id: String, photo_id: String, thumb: bool) -> Result<tauri::ipc::Response, String> {
    read_photo_impl(&db_path, &os_id, &photo_id, thumb).map(tauri::ipc::Response::new)
}

/// Move `src` para dir/<name>, com sufixo `-n` antes da extensão se o destino já existir.
fn move_no_overwrite(src: &Path, dir: &Path, name: &str) -> Result<(), String> {
    let (stem, ext) = match name.find('.') {
        Some(i) => (&name[..i], &name[i..]),
        None => (name, ""),
    };
    for n in 0..1000 {
        let candidate = if n == 0 { name.to_string() } else { format!("{}-{}{}", stem, n, ext) };
        let target = dir.join(candidate);
        if target.exists() {
            continue;
        }
        return fs::rename(src, &target).map_err(|e| format!("mover: {}", e));
    }
    Err("nomes de arquivo esgotados".into())
}

fn trash_photos_impl(db_path: &str, os_id: &str, photo_id: Option<&str>) -> Result<usize, String> {
    if !valid_photo_id(os_id) {
        return Err("id da OS inválido".into());
    }
    if let Some(p) = photo_id {
        if !valid_photo_id(p) {
            return Err("id da foto inválido".into());
        }
    }
    let root = photos_root(db_path)?;
    let src_dir = root.join(os_id);
    if !src_dir.is_dir() {
        return Ok(0);
    }
    let names: Vec<String> = match photo_id {
        Some(p) => vec![photo_file_name(p, false), photo_file_name(p, true)],
        None => fs::read_dir(&src_dir)
            .map_err(|e| format!("listar pasta: {}", e))?
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_file())
            .filter_map(|e| e.file_name().to_str().map(String::from))
            .collect(),
    };
    let trash = root.join(TRASH_DIR).join(os_id);
    let mut moved = 0;
    for name in names {
        let src = src_dir.join(&name);
        if !src.is_file() {
            continue;
        }
        fs::create_dir_all(&trash).map_err(|e| format!("criar lixeira: {}", e))?;
        move_no_overwrite(&src, &trash, &name)?;
        moved += 1;
    }
    if photo_id.is_none() {
        let _ = fs::remove_dir(&src_dir); // só remove se vazia
    }
    Ok(moved)
}

/// Move uma foto (e miniatura) ou a pasta toda da OS para fotos/_lixeira/<os_id>/. Nunca apaga.
#[command]
fn trash_photos(db_path: String, os_id: String, photo_id: Option<String>) -> IoResult {
    match trash_photos_impl(&db_path, &os_id, photo_id.as_deref()) {
        Ok(n) => IoResult { success: true, message: format!("{} arquivo(s) movido(s) para a lixeira", n) },
        Err(e) => IoResult { success: false, message: format!("Erro ao mover para a lixeira: {}", e) },
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            save_database_atomic,
            backup_pre_migration,
            save_recovery_copy,
            read_db_meta,
            load_database,
            export_report,
            save_photo,
            read_photo,
            trash_photos
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
        let r = save_database_impl(&db, "{\"v\":1}", None, Some(&bk), ts(2026, 10, 15, 10, 0, 0), true);
        assert_eq!(r.status, "ok");
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
        assert!(save_database_impl(&db, "{}", None, None, ts(2026, 10, 15, 10, 0, 0), true).status == "ok");
        assert_eq!(fs::read_to_string(&db).unwrap(), "{}");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn save_faz_backup_do_arquivo_anterior_e_respeita_intervalo() {
        let d = temp_dir("backup");
        let db = d.join("db.json");
        let bk = d.join("backups");
        let t0 = ts(2026, 10, 15, 10, 0, 0);
        fs::write(&db, "{\"antigo\":1}").unwrap();

        // primeira gravação da sessão: sempre faz backup
        assert!(save_database_impl(&db, "{\"v1\":1}", None, Some(&bk), t0, true).status == "ok");
        let b0 = bk.join(backup_file_name(t0));
        assert_eq!(fs::read_to_string(&b0).unwrap(), "{\"antigo\":1}");

        // 10 min depois: sem novo backup
        assert!(save_database_impl(&db, "{\"v2\":1}", None, Some(&bk), t0 + 600, false).status == "ok");
        assert_eq!(fs::read_dir(&bk).unwrap().count(), 1);

        // 31 min depois: novo backup com o conteúdo então no disco (v2)
        assert!(save_database_impl(&db, "{\"v3\":1}", None, Some(&bk), t0 + 31 * 60, false).status == "ok");
        assert_eq!(fs::read_dir(&bk).unwrap().count(), 2);
        let b1 = bk.join(backup_file_name(t0 + 31 * 60));
        assert_eq!(fs::read_to_string(&b1).unwrap(), "{\"v2\":1}");
        assert_eq!(fs::read_to_string(&db).unwrap(), "{\"v3\":1}");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn falha_de_backup_nao_impede_save() {
        let d = temp_dir("backup-fail");
        let db = d.join("db.json");
        fs::write(&db, "{\"antigo\":1}").unwrap();
        // a "pasta" de backup é um arquivo: create_dir_all falha
        let bk = d.join("bloqueio");
        fs::write(&bk, "x").unwrap();
        let r = save_database_impl(&db, "novo", None, Some(&bk), ts(2026, 10, 15, 10, 0, 0), true);
        assert_eq!(r.status, "ok");
        assert_eq!(fs::read_to_string(&db).unwrap(), "novo");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn erro_de_save_apaga_tmp_e_preserva_destino() {
        let d = temp_dir("save-err");
        // destino é uma pasta: existe mas é ilegível, então vira conflito (o rename nem é tentado)
        let db = d.join("db.json");
        fs::create_dir_all(&db).unwrap();
        let r = save_database_impl(&db, "x", None, None, ts(2026, 10, 15, 10, 0, 0), true);
        assert_eq!(r.status, "conflict");
        assert!(!d.join("db.tmp").exists());
        assert!(db.is_dir());
        let _ = fs::remove_dir_all(&d);
    }

    // ----- conflito de revision -----

    fn doc(rev: &str, by: &str, at: &str) -> String {
        format!(
            "{{\"ledger\":[],\"meta\":{{\"schemaVersion\":1,\"revision\":\"{}\",\"history\":[],\"savedAt\":\"{}\",\"savedBy\":\"{}\"}}}}",
            rev, at, by
        )
    }

    fn save_exp(db: &Path, content: &str, expected: Option<&str>) -> SaveResult {
        save_database_impl(db, content, expected, None, ts(2026, 10, 15, 10, 0, 0), true)
    }

    #[test]
    fn conflito_disco_inexistente_sem_expected_grava() {
        let d = temp_dir("cf-new");
        let db = d.join("db.json");
        let r = save_exp(&db, &doc("r1", "PC-A", "t"), None);
        assert_eq!(r.status, "ok");
        assert_eq!(r.revision.as_deref(), Some("r1"));
        assert_eq!(fs::read_to_string(&db).unwrap(), doc("r1", "PC-A", "t"));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn conflito_disco_inexistente_com_expected_nao_grava() {
        let d = temp_dir("cf-gone");
        let db = d.join("db.json");
        let r = save_exp(&db, &doc("r2", "PC-A", "t"), Some("r1"));
        assert_eq!(r.status, "conflict");
        assert!(!db.exists());
        assert!(!d.join("db.tmp").exists());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn conflito_revision_igual_grava() {
        let d = temp_dir("cf-eq");
        let db = d.join("db.json");
        fs::write(&db, doc("r1", "PC-A", "t1")).unwrap();
        let novo = doc("r2", "PC-A", "t2");
        let r = save_exp(&db, &novo, Some("r1"));
        assert_eq!(r.status, "ok");
        assert_eq!(r.revision.as_deref(), Some("r2"));
        assert_eq!(fs::read_to_string(&db).unwrap(), novo);
        assert!(!d.join("db.tmp").exists());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn conflito_revision_diferente_nao_grava_e_informa_quem_salvou() {
        let d = temp_dir("cf-diff");
        let db = d.join("db.json");
        let no_disco = doc("rX", "PC-B", "2026-10-15T14:30:00.000Z");
        fs::write(&db, &no_disco).unwrap();
        let r = save_exp(&db, &doc("r2", "PC-A", "t2"), Some("r1"));
        assert_eq!(r.status, "conflict");
        assert_eq!(
            r.conflict,
            Some(ConflictInfo {
                saved_by: Some("PC-B".into()),
                saved_at: Some("2026-10-15T14:30:00.000Z".into())
            })
        );
        assert_eq!(fs::read_to_string(&db).unwrap(), no_disco, "disco intacto");
        assert!(!d.join("db.tmp").exists());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn conflito_disco_com_revision_e_expected_none_nao_grava() {
        let d = temp_dir("cf-none");
        let db = d.join("db.json");
        fs::write(&db, doc("rX", "PC-B", "t")).unwrap();
        assert_eq!(save_exp(&db, &doc("r2", "PC-A", "t2"), None).status, "conflict");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn conflito_meta_sumiu_com_expected_some_nao_grava() {
        let d = temp_dir("cf-nometa");
        let db = d.join("db.json");
        fs::write(&db, "{\"ledger\":[]}").unwrap();
        let r = save_exp(&db, &doc("r2", "PC-A", "t2"), Some("r1"));
        assert_eq!(r.status, "conflict");
        assert_eq!(r.conflict, Some(ConflictInfo { saved_by: None, saved_at: None }));
        assert_eq!(fs::read_to_string(&db).unwrap(), "{\"ledger\":[]}");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn conflito_disco_v0_com_expected_none_grava() {
        let d = temp_dir("cf-v0");
        let db = d.join("db.json");
        fs::write(&db, "{\"ledger\":[],\"workOrders\":[]}").unwrap();
        let novo = doc("r1", "PC-A", "t");
        assert_eq!(save_exp(&db, &novo, None).status, "ok");
        assert_eq!(fs::read_to_string(&db).unwrap(), novo);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn conflito_arquivo_ilegivel_nao_grava() {
        let d = temp_dir("cf-bad");
        let db = d.join("db.json");
        for conteudo in ["{ isto nao e json", "", "[1,2]"] {
            fs::write(&db, conteudo).unwrap();
            for exp in [None, Some("r1")] {
                let r = save_exp(&db, &doc("r2", "PC-A", "t2"), exp);
                assert_eq!(r.status, "conflict", "conteudo {:?} exp {:?}", conteudo, exp);
                assert_eq!(fs::read_to_string(&db).unwrap(), conteudo);
            }
        }
        // existe mas não é lido como arquivo (pasta): também conflito
        let sub = d.join("pasta.json");
        fs::create_dir_all(&sub).unwrap();
        assert_eq!(save_exp(&sub, &doc("r2", "PC-A", "t2"), Some("r1")).status, "conflict");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn conflito_ignora_o_resto_do_json_e_meta_parcial() {
        let d = temp_dir("cf-partial");
        let db = d.join("db.json");
        // meta sem savedBy/savedAt: revision igual ainda libera
        fs::write(&db, "{\"x\":[1,{\"a\":2}],\"meta\":{\"revision\":\"r1\"}}").unwrap();
        assert_eq!(save_exp(&db, &doc("r2", "PC-A", "t"), Some("r1")).status, "ok");
        let _ = fs::remove_dir_all(&d);
    }

    // ----- read_db_meta -----

    #[test]
    fn meta_presente_devolve_revision_history_e_quem_salvou() {
        let d = temp_dir("meta-ok");
        let db = d.join("db.json");
        fs::write(
            &db,
            "{\"ledger\":[{\"x\":1}],\"meta\":{\"schemaVersion\":1,\"revision\":\"r3\",\"history\":[\"r2\",5,\"r1\"],\"savedAt\":\"2026-10-15T14:30:00.000Z\",\"savedBy\":\"PC-B\"}}",
        )
        .unwrap();
        let m = read_disk_meta(&db);
        assert_eq!(m.status, "ok");
        assert_eq!(m.revision.as_deref(), Some("r3"));
        assert_eq!(m.history, vec!["r2".to_string(), "r1".to_string()]);
        assert_eq!(m.saved_by.as_deref(), Some("PC-B"));
        assert_eq!(m.saved_at.as_deref(), Some("2026-10-15T14:30:00.000Z"));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn meta_sem_meta_ou_sem_revision_e_no_meta() {
        let d = temp_dir("meta-none");
        let db = d.join("db.json");
        fs::write(&db, "{\"ledger\":[]}").unwrap();
        assert_eq!(read_disk_meta(&db), MetaResult::bare("no_meta"));
        fs::write(&db, "{\"meta\":{\"schemaVersion\":1}}").unwrap();
        assert_eq!(read_disk_meta(&db).status, "no_meta");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn meta_arquivo_ausente_e_not_found() {
        let d = temp_dir("meta-nf");
        assert_eq!(read_disk_meta(&d.join("nao-existe.json")), MetaResult::bare("not_found"));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn meta_arquivo_ilegivel_e_unreadable() {
        let d = temp_dir("meta-bad");
        let db = d.join("db.json");
        for conteudo in ["{ isto nao e json", "", "[1,2]"] {
            fs::write(&db, conteudo).unwrap();
            assert_eq!(read_disk_meta(&db).status, "unreadable", "conteudo {:?}", conteudo);
        }
        // pasta no lugar do arquivo
        let sub = d.join("pasta.json");
        fs::create_dir_all(&sub).unwrap();
        assert_eq!(read_disk_meta(&sub).status, "unreadable");
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn nome_da_maquina_nunca_vazio() {
        assert!(!machine_name().trim().is_empty());
    }

    // ----- backup pré-migração e cópia de recuperação -----

    #[test]
    fn backup_pre_migracao_nao_entra_na_retencao() {
        let now = ts(2026, 10, 15, 12, 0, 0);
        let pre = format!("database-pre-v0-{}.json", stamp(now));
        assert_eq!(pre, "database-pre-v0-20261015-120000.json");
        assert_eq!(parse_backup_name(&pre), None);
        // mesmo com excesso de backups normais, o pré-migração nunca é apagado
        let mut names: Vec<String> = (0..40).map(|i| backup_file_name(now - i * 120)).collect();
        names.push(pre.clone());
        let del = backups_to_delete(&names, now);
        assert!(!del.contains(&pre));
        assert!(!del.is_empty());
    }

    #[test]
    fn write_stamped_file_nao_sobrescreve() {
        let d = temp_dir("stamped");
        let dir = d.join("recuperacao");
        let t = ts(2026, 10, 15, 12, 0, 0);
        let a = write_stamped_file(&dir, "database-conflito-", t, "um").unwrap();
        let b = write_stamped_file(&dir, "database-conflito-", t, "dois").unwrap();
        assert_ne!(a, b);
        assert_eq!(a.file_name().unwrap().to_str().unwrap(), "database-conflito-20261015-120000.json");
        assert_eq!(fs::read_to_string(&a).unwrap(), "um");
        assert_eq!(fs::read_to_string(&b).unwrap(), "dois");
        let _ = fs::remove_dir_all(&d);
    }

    // ----- fotos da OS -----

    fn jpeg(n: usize) -> Vec<u8> {
        let mut v = vec![0xFF, 0xD8, 0xFF];
        v.resize(n.max(3), 7);
        v
    }

    fn db_in(d: &Path) -> String {
        d.join("database.json").to_string_lossy().into_owned()
    }

    #[test]
    fn foto_id_rejeita_path_traversal() {
        for bad in ["", "..", "a/b", "a\\b", "c:", "a.b", "../x", "a b", &"x".repeat(65)] {
            assert!(!valid_photo_id(bad), "{:?}", bad);
        }
        assert!(valid_photo_id("abc-123-DEF"));
        assert!(valid_photo_id(&"x".repeat(64)));
        let d = temp_dir("foto-id");
        let db = db_in(&d);
        assert!(save_photo_impl(&db, "..", "p1", &jpeg(10), &jpeg(10)).is_err());
        assert!(save_photo_impl(&db, "os1", "..\\x", &jpeg(10), &jpeg(10)).is_err());
        assert!(read_photo_impl(&db, "os1", "a/b", false).is_err());
        assert!(trash_photos_impl(&db, "a/b", None).is_err());
        assert!(!d.join("fotos").exists());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn foto_limites_e_jpeg() {
        let d = temp_dir("foto-lim");
        let db = db_in(&d);
        assert!(save_photo_impl(&db, "os1", "p1", &jpeg(MAX_PHOTO_BYTES + 1), &jpeg(10)).is_err());
        assert!(save_photo_impl(&db, "os1", "p1", &jpeg(10), &jpeg(MAX_THUMB_BYTES + 1)).is_err());
        assert!(save_photo_impl(&db, "os1", "p1", b"PNG....", &jpeg(10)).is_err());
        assert!(save_photo_impl(&db, "os1", "p1", &jpeg(10), &[0xFF, 0xD8]).is_err());
        assert!(!d.join("fotos").exists());
        // nos limites exatos passa
        save_photo_impl(&db, "os1", "p1", &jpeg(MAX_PHOTO_BYTES), &jpeg(MAX_THUMB_BYTES)).unwrap();
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn foto_nunca_sobrescreve() {
        let d = temp_dir("foto-over");
        let db = db_in(&d);
        let a = save_photo_impl(&db, "os1", "p1", &jpeg(10), &jpeg(5)).unwrap();
        assert_eq!(a, d.join("fotos").join("os1").join("p1.jpg"));
        assert!(d.join("fotos").join("os1").join("p1.t.jpg").is_file());
        let mut outra = jpeg(20);
        outra[3] = 9;
        assert!(save_photo_impl(&db, "os1", "p1", &outra, &jpeg(5)).is_err());
        assert_eq!(fs::read(&a).unwrap(), jpeg(10));
        // sem sobra de .tmp
        assert!(!d.join("fotos").join("os1").join("p1.jpg.tmp").exists());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn foto_leitura_cai_na_lixeira() {
        let d = temp_dir("foto-lix");
        let db = db_in(&d);
        assert_eq!(read_photo_impl(&db, "os1", "p1", false), Err("not_found".to_string()));
        save_photo_impl(&db, "os1", "p1", &jpeg(10), &jpeg(5)).unwrap();
        assert_eq!(read_photo_impl(&db, "os1", "p1", false).unwrap(), jpeg(10));
        assert_eq!(read_photo_impl(&db, "os1", "p1", true).unwrap(), jpeg(5));
        assert_eq!(trash_photos_impl(&db, "os1", Some("p1")).unwrap(), 2);
        assert!(!d.join("fotos").join("os1").join("p1.jpg").exists());
        assert!(d.join("fotos").join("_lixeira").join("os1").join("p1.jpg").is_file());
        assert_eq!(read_photo_impl(&db, "os1", "p1", false).unwrap(), jpeg(10));
        assert_eq!(read_photo_impl(&db, "os1", "p1", true).unwrap(), jpeg(5));
        assert_eq!(read_photo_impl(&db, "os1", "zz", false), Err("not_found".to_string()));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn lixeira_sufixo_n_e_pasta_inteira() {
        let d = temp_dir("foto-suf");
        let db = db_in(&d);
        let trash = d.join("fotos").join("_lixeira").join("os1");
        save_photo_impl(&db, "os1", "p1", &jpeg(10), &jpeg(5)).unwrap();
        trash_photos_impl(&db, "os1", Some("p1")).unwrap();
        // mesma foto de novo (id reaproveitado) e mais uma
        save_photo_impl(&db, "os1", "p1", &jpeg(11), &jpeg(6)).unwrap();
        save_photo_impl(&db, "os1", "p2", &jpeg(12), &jpeg(7)).unwrap();
        assert_eq!(trash_photos_impl(&db, "os1", None).unwrap(), 4);
        assert_eq!(fs::read(trash.join("p1.jpg")).unwrap(), jpeg(10)); // original intacto
        assert_eq!(fs::read(trash.join("p1-1.jpg")).unwrap(), jpeg(11));
        assert_eq!(fs::read(trash.join("p1-1.t.jpg")).unwrap(), jpeg(6));
        assert!(trash.join("p2.jpg").is_file());
        assert!(!d.join("fotos").join("os1").exists()); // pasta vazia removida
        // OS sem fotos: nada a mover, sem erro
        assert_eq!(trash_photos_impl(&db, "os9", None).unwrap(), 0);
        let _ = fs::remove_dir_all(&d);
    }
}

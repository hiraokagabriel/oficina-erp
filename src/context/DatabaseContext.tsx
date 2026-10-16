import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LedgerEntry, WorkOrder, Client, CatalogItem, Technician, WorkshopSettings, DatabaseSchema, DatabaseMeta } from '../types';
import { CURRENT_SCHEMA_VERSION, countUnresolvedLinks, migrate } from '../utils/migrations';
import { diffLocalChanges, LocalChange } from '../utils/conflictDiff';
import { generateId } from '../utils/helpers';
import { adoptSecrets, hasSecrets, persistSecrets, stripDbSecrets } from '../utils/secrets';
import { decideExternalChange, DiskMetaInfo } from '../utils/externalChange';
import { ToastContainer, ToastMessage, ToastType } from '../components/ui/ToastContainer';

export type LoadStatus = 'loading' | 'ok' | 'not_found' | 'error';

interface LoadResult {
  status: 'ok' | 'not_found';
  content: string;
  machine: string;
}

interface SaveResult {
  status: 'ok' | 'conflict' | 'io_error';
  message: string;
  revision?: string | null;
  conflict?: { savedBy?: string | null; savedAt?: string | null } | null;
  machine: string;
}

interface IoResult {
  success: boolean;
  message: string;
}

// Conflito aberto: dados do outro salvamento, o que mudou localmente e onde ficou a cópia.
// kind 'save' = o salvamento foi recusado; 'diverged' = a verificação periódica achou um arquivo
// que não descende do que este PC abriu.
interface ConflictState {
  kind: 'save' | 'diverged';
  savedBy: string | null;
  savedAt: string | null;
  changes: LocalChange[];
  recoveryPath: string | null;
  recoveryError: string | null;
}

// Banco já lido, validado e migrado, pronto para entrar no estado.
interface PreparedDb {
  db: DatabaseSchema;
  revision: string | null;
  history: string[];
  readOnly: boolean;
  migratedFrom: number | null;
}

const MAX_HISTORY = 50;
const MAX_CHANGES_SHOWN = 100;

interface DatabaseContextData {
  ledger: LedgerEntry[];
  setLedger: React.Dispatch<React.SetStateAction<LedgerEntry[]>>;
  workOrders: WorkOrder[];
  setWorkOrders: React.Dispatch<React.SetStateAction<WorkOrder[]>>;
  clients: Client[];
  setClients: React.Dispatch<React.SetStateAction<Client[]>>;
  catalogParts: CatalogItem[];
  setCatalogParts: React.Dispatch<React.SetStateAction<CatalogItem[]>>;
  catalogServices: CatalogItem[];
  setCatalogServices: React.Dispatch<React.SetStateAction<CatalogItem[]>>;
  catalogTechnicians: Technician[];
  setCatalogTechnicians: React.Dispatch<React.SetStateAction<Technician[]>>;
  settings: WorkshopSettings;
  setSettings: React.Dispatch<React.SetStateAction<WorkshopSettings>>;
  isLoading: boolean;
  isSaving: boolean;
  readOnly: boolean;
  loadStatus: LoadStatus;
  saveError: string | null;
  dbPath: string;
  setDbPath: React.Dispatch<React.SetStateAction<string>>;
}

const DatabaseContext = createContext<DatabaseContextData>({} as DatabaseContextData);

const DEFAULT_SETTINGS: WorkshopSettings = {
  name: "OFICINA",
  cnpj: "",
  address: "",
  exportPath: "",
  googleDriveToken: "",
  googleApiKey: ""
};

const SAVE_DEBOUNCE_MS = 3000;
const EXTERNAL_CHECK_MS = 30000;
const RETRY_DELAYS_MS = [5000, 15000, 60000];

// Snapshot único: o que é comparado e guardado como "último gravado/lido". Não inclui o `meta`
// (que muda a cada salvamento); o JSON gravado é este mesmo mais o `meta` no fim.
// Também não inclui os segredos do Google (ficam só no localStorage): trocar o token não suja o banco.
const buildSnapshot = (db: DatabaseSchema): string => {
  const { meta: _meta, ...data } = stripDbSecrets(db);
  return JSON.stringify(data);
};

// Conteúdo gravado no arquivo: o snapshot (sem segredos) mais o `meta`.
const serializeDb = (db: DatabaseSchema, meta: DatabaseMeta): string =>
  JSON.stringify({ ...stripDbSecrets(db), meta });

const formatTime = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const COLLECTION_KEYS = ['ledger', 'workOrders', 'clients', 'catalogParts', 'catalogServices', 'catalogTechnicians'] as const;

// Valida o conteúdo lido. Campos ausentes (bancos antigos) viram []/padrão;
// JSON inválido ou tipos errados são erro (nunca mascarados com `|| []`).
function normalizeMeta(m: Record<string, unknown>): DatabaseMeta {
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    schemaVersion: typeof m.schemaVersion === 'number' && Number.isFinite(m.schemaVersion) ? m.schemaVersion : 0,
    revision: str(m.revision),
    history: Array.isArray(m.history) ? m.history.filter((h): h is string => typeof h === 'string') : [],
    savedAt: str(m.savedAt),
    savedBy: str(m.savedBy),
  };
}

export function parseDatabase(content: string, fallbackSettings: WorkshopSettings): DatabaseSchema {
  if (!content.trim()) throw new Error('O arquivo do banco está vazio.');

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (e) {
    throw new Error('O arquivo do banco não é um JSON válido (pode estar corrompido).');
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('O arquivo do banco tem formato inesperado.');
  }
  const obj = raw as Record<string, unknown>;

  if (!COLLECTION_KEYS.some(k => k in obj)) {
    throw new Error('O arquivo não parece ser um banco do OficinaPro (nenhuma coleção reconhecida).');
  }
  for (const key of COLLECTION_KEYS) {
    const v = obj[key];
    if (v !== undefined && v !== null && !Array.isArray(v)) {
      throw new Error(`O campo "${key}" do banco deveria ser uma lista.`);
    }
  }
  const s = obj.settings;
  if (s !== undefined && s !== null && (typeof s !== 'object' || Array.isArray(s))) {
    throw new Error('O campo "settings" do banco tem formato inesperado.');
  }

  const m = obj.meta;
  if (m !== undefined && m !== null && (typeof m !== 'object' || Array.isArray(m))) {
    throw new Error('O campo "meta" do banco tem formato inesperado.');
  }

  const list = <T,>(key: string): T[] => (Array.isArray(obj[key]) ? (obj[key] as T[]) : []);
  return {
    ledger: list<LedgerEntry>('ledger'),
    workOrders: list<WorkOrder>('workOrders'),
    clients: list<Client>('clients'),
    catalogParts: list<CatalogItem>('catalogParts'),
    catalogServices: list<CatalogItem>('catalogServices'),
    catalogTechnicians: list<Technician>('catalogTechnicians'),
    settings: (s as WorkshopSettings | undefined | null) || fallbackSettings,
    // Sem meta = banco v0. Meta sem versão válida também conta como v0.
    ...(m ? { meta: normalizeMeta(m as Record<string, unknown>) } : {}),
  };
}

export const DatabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dbPath, setDbPath] = useState(() => localStorage.getItem("oficina_db_path") || "C:\\OficinaData\\database.json");

  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [catalogParts, setCatalogParts] = useState<CatalogItem[]>([]);
  const [catalogServices, setCatalogServices] = useState<CatalogItem[]>([]);
  const [catalogTechnicians, setCatalogTechnicians] = useState<Technician[]>([]);
  const [settings, setSettingsRaw] = useState<WorkshopSettings>(() => adoptSecrets(DEFAULT_SETTINGS));
  // Quem edita as configurações (ConfigPage) também grava os segredos no localStorage deste PC.
  const setSettings: React.Dispatch<React.SetStateAction<WorkshopSettings>> = (action) => {
    setSettingsRaw(prev => {
      const next = typeof action === 'function' ? action(prev) : action;
      persistSecrets(next); // idempotente
      return next;
    });
  };

  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [loadError, setLoadError] = useState<string>('');
  const [reloadKey, setReloadKey] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [pathDraft, setPathDraft] = useState(dbPath);
  const [readOnly, setReadOnly] = useState(false);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState<string | null>(null);

  const isLoading = loadStatus === 'loading';

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const lastSavedRef = useRef<string | null>(null);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  // Controle de versão/conflito (passos 4 e 5).
  const revisionRef = useRef<string | null>(null);   // revision do arquivo que lemos/gravamos por último
  const historyRef = useRef<string[]>([]);
  const machineRef = useRef('desconhecido');
  const dirtyRef = useRef(false);                    // banco migrado: gravar mesmo sem edição
  const readOnlyRef = useRef(false);
  const conflictOpenRef = useRef(false);

  // Valores mais recentes para quem roda fora do ciclo de render (retentativa, fechar janela).
  const latestRef = useRef({ dbPath, loadStatus, db: null as unknown as DatabaseSchema });
  latestRef.current = {
    dbPath,
    loadStatus,
    db: { ledger, workOrders, clients, catalogParts, catalogServices, catalogTechnicians, settings },
  };

  const addToast = (message: string, type: ToastType = 'info') => {
    setToasts(prev => [...prev, { id: crypto.randomUUID(), message, type }]);
  };
  const removeToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  const clearTimers = () => {
    if (saveTimeoutRef.current) { clearTimeout(saveTimeoutRef.current); saveTimeoutRef.current = null; }
    if (retryTimeoutRef.current) { clearTimeout(retryTimeoutRef.current); retryTimeoutRef.current = null; }
  };

  useEffect(() => {
    try {
      localStorage.setItem("oficina_db_path", dbPath);
    } catch (e) {
      console.error("Erro ao salvar dbPath no localStorage:", e);
    }
    setPathDraft(dbPath);
  }, [dbPath]);

  // ---------------------------------------------------------------- carga
  // Valida, migra e (se migrou) guarda o backup pré-migração. Não mexe no estado.
  const prepareLoaded = async (content: string): Promise<PreparedDb> => {
    const parsed = parseDatabase(content, DEFAULT_SETTINGS);
    const revision = parsed.meta?.revision || null;
    const history = parsed.meta?.history ?? [];
    const { db, from, changed } = migrate(parsed);

    // Versão futura: abre só para leitura, sem migrar nem gravar.
    if (from > CURRENT_SCHEMA_VERSION) return { db, revision, history, readOnly: true, migratedFrom: null };

    if (changed) {
      const bk = await invoke<IoResult>('backup_pre_migration', { content, fromVersion: from });
      if (!bk || !bk.success) {
        throw new Error(`Não foi possível guardar o backup antes de atualizar o formato do banco (${bk?.message || 'sem resposta'}). Nada foi alterado.`);
      }
    }
    return { db, revision, history, readOnly: false, migratedFrom: changed ? from : null };
  };

  // Troca só os dados do contexto (não mexe em loadStatus nem em modais abertos).
  const commitLoaded = (p: PreparedDb, machine: string) => {
    revisionRef.current = p.revision;
    historyRef.current = p.history;
    machineRef.current = machine || 'desconhecido';
    readOnlyRef.current = p.readOnly;
    setReadOnly(p.readOnly);
    // O que acabou de ser lido não precisa ser regravado, exceto se foi migrado.
    lastSavedRef.current = buildSnapshot(p.db);
    // Arquivo com segredos antigos: regrava uma vez para que o disco fique sem eles.
    dirtyRef.current = p.migratedFrom !== null || hasSecrets(p.db.settings);
    setLedger(p.db.ledger);
    setWorkOrders(p.db.workOrders);
    setClients(p.db.clients);
    setCatalogParts(p.db.catalogParts);
    setCatalogServices(p.db.catalogServices);
    setCatalogTechnicians(p.db.catalogTechnicians);
    // Segredos do arquivo entram no localStorage só se estiver vazio; em memória vale o valor local.
    setSettingsRaw(adoptSecrets(p.db.settings));
    if (p.migratedFrom !== null) {
      const semCliente = countUnresolvedLinks(p.db).osSemCliente;
      const aviso = semCliente > 0
        ? ` ${semCliente} ${semCliente === 1 ? 'OS ficou sem cliente vinculado e segue' : 'OS ficaram sem cliente vinculado e seguem'} funcionando pelo nome.`
        : '';
      addToast(`Banco atualizado para o formato v${CURRENT_SCHEMA_VERSION}. Uma cópia do original foi guardada em backups.${aviso}`, 'info');
    }
  };

  useEffect(() => {
    let cancelled = false;
    clearTimers();
    retryCountRef.current = 0;
    lastSavedRef.current = null;
    revisionRef.current = null;
    historyRef.current = [];
    dirtyRef.current = false;
    readOnlyRef.current = false;
    conflictOpenRef.current = false;
    setReadOnly(false);
    setConflict(null);
    setReloadError(null);
    setSaveError(null);

    const resetData = () => {
      setLedger([]);
      setWorkOrders([]);
      setClients([]);
      setCatalogParts([]);
      setCatalogServices([]);
      setCatalogTechnicians([]);
      setSettingsRaw(adoptSecrets(DEFAULT_SETTINGS));
    };

    async function load() {
      setLoadStatus('loading');
      setLoadError('');
      try {
        const res = await invoke<LoadResult>('load_database', { filepath: dbPath });
        if (cancelled) return;

        machineRef.current = res.machine || 'desconhecido';

        if (res.status === 'not_found') {
          resetData();
          setLoadStatus('not_found');
          return;
        }

        const prepared = await prepareLoaded(res.content);
        if (cancelled) return;
        commitLoaded(prepared, res.machine);
        setLoadStatus('ok');
      } catch (e) {
        if (cancelled) return;
        console.error("Erro ao carregar banco:", e);
        resetData();
        setLoadError(e instanceof Error ? e.message : String(e));
        setLoadStatus('error');
      }
    }
    load();
    return () => { cancelled = true; };
  }, [dbPath, reloadKey]);

  // -------------------------------------------------------------- salvar
  const scheduleRetry = () => {
    const delay = RETRY_DELAYS_MS[Math.min(retryCountRef.current, RETRY_DELAYS_MS.length - 1)];
    retryCountRef.current += 1;
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    retryTimeoutRef.current = setTimeout(() => { void saveNow(); }, delay);
  };

  // Conflito: outro computador gravou desde a nossa base. Não grava; guarda cópia e abre o diálogo.
  const handleConflict = async (
    res: { conflict?: SaveResult['conflict'] },
    db: DatabaseSchema,
    attemptedContent: string,
    kind: ConflictState['kind'] = 'save',
  ) => {
    conflictOpenRef.current = true;
    clearTimers();
    retryCountRef.current = 0;
    setSaveError(null);

    const changes = diffLocalChanges(lastSavedRef.current, db);
    let recoveryPath: string | null = null;
    let recoveryError: string | null = null;
    try {
      const r = await invoke<IoResult>('save_recovery_copy', { content: attemptedContent });
      if (r?.success) recoveryPath = r.message;
      else recoveryError = r?.message || 'Falha desconhecida.';
    } catch (e) {
      recoveryError = e instanceof Error ? e.message : String(e);
    }
    setReloadError(null);
    setConflict({
      kind,
      savedBy: res.conflict?.savedBy || null,
      savedAt: res.conflict?.savedAt || null,
      changes,
      recoveryPath,
      recoveryError,
    });
  };

  // "Recarregar dados do arquivo": relê o disco como na carga, trocando só os dados do contexto.
  const reloadFromDisk = async () => {
    if (reloading) return;
    setReloading(true);
    setReloadError(null);
    try {
      const res = await invoke<LoadResult>('load_database', { filepath: latestRef.current.dbPath });
      if (res.status === 'not_found') {
        throw new Error('O arquivo do banco não foi encontrado. Verifique a pasta sincronizada e tente de novo.');
      }
      const prepared = await prepareLoaded(res.content);
      commitLoaded(prepared, res.machine);
      retryCountRef.current = 0;
      conflictOpenRef.current = false;
      setConflict(null);
      setSaveError(null);
    } catch (e) {
      setReloadError(e instanceof Error ? e.message : String(e));
    } finally {
      setReloading(false);
    }
  };

  // Grava o snapshot atual. true = nada pendente (gravou ou já estava igual).
  const saveNow = async (): Promise<boolean> => {
    if (inFlightRef.current) await inFlightRef.current;

    const { dbPath: path, loadStatus: status, db } = latestRef.current;
    if (status !== 'ok') return true;
    if (readOnlyRef.current) return true;          // banco de versão futura: nunca grava
    if (conflictOpenRef.current) return false;     // conflito aberto: nada de gravar nem retentar

    const snapshot = buildSnapshot(db);
    if (!dirtyRef.current && snapshot === lastSavedRef.current) {
      setSaveError(null);
      return true;
    }

    if (retryTimeoutRef.current) { clearTimeout(retryTimeoutRef.current); retryTimeoutRef.current = null; }

    const run = async (): Promise<boolean> => {
      setIsSaving(true);
      try {
        const meta: DatabaseMeta = {
          schemaVersion: CURRENT_SCHEMA_VERSION,
          revision: generateId(),
          history: [revisionRef.current, ...historyRef.current].filter((r): r is string => !!r).slice(0, MAX_HISTORY),
          savedAt: new Date().toISOString(),
          savedBy: machineRef.current,
        };
        const content = serializeDb(db, meta);
        const res = await invoke<SaveResult>('save_database_atomic', {
          filepath: path,
          content,
          expectedRevision: revisionRef.current,
        });
        if (res?.machine) machineRef.current = res.machine;

        if (res?.status === 'conflict') {
          await handleConflict(res, db, content);
          return false;
        }
        if (!res || res.status !== 'ok') throw new Error(res?.message || 'Falha desconhecida ao gravar.');

        lastSavedRef.current = snapshot;
        revisionRef.current = meta.revision;
        historyRef.current = meta.history;
        dirtyRef.current = false;
        retryCountRef.current = 0;
        setSaveError(null);
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("Erro ao salvar:", e);
        setSaveError(msg);
        addToast(`Não foi possível salvar: ${msg}`, 'error');
        scheduleRetry();
        return false;
      } finally {
        setIsSaving(false);
      }
    };

    inFlightRef.current = run();
    try {
      return await inFlightRef.current;
    } finally {
      inFlightRef.current = null;
    }
  };
  const saveNowRef = useRef(saveNow);
  saveNowRef.current = saveNow;

  useEffect(() => {
    if (loadStatus !== 'ok' || readOnly || conflict) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    // A ref só indica "gravação armada" enquanto o timer está pendente: zere-a ao disparar e ao cancelar,
    // senão hasPendingEdits() fica sempre verdadeiro e a verificação periódica descarta toda decisão.
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      void saveNowRef.current();
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimeoutRef.current) { clearTimeout(saveTimeoutRef.current); saveTimeoutRef.current = null; }
    };
  }, [ledger, workOrders, clients, catalogParts, catalogServices, catalogTechnicians, settings, dbPath, loadStatus, readOnly, conflict]);

  useEffect(() => () => clearTimers(), []);

  // ------------------------------- verificação periódica de mudança externa
  // Há alteração local não gravada (ou gravação armada/em andamento)?
  const hasPendingEdits = (): boolean => {
    const { db } = latestRef.current;
    return dirtyRef.current
      || !!saveTimeoutRef.current
      || !!retryTimeoutRef.current
      || !!inFlightRef.current
      || buildSnapshot(db) !== lastSavedRef.current;
  };

  const checkingRef = useRef(false);
  const checkExternalChange = async () => {
    if (checkingRef.current) return;
    const canCheck = () => latestRef.current.loadStatus === 'ok' && !readOnlyRef.current && !conflictOpenRef.current && !inFlightRef.current;
    if (!canCheck()) return;

    checkingRef.current = true;
    try {
      const path = latestRef.current.dbPath;
      const myRevision = revisionRef.current;
      const disk = await invoke<DiskMetaInfo>('read_db_meta', { filepath: path });

      // Corrida: se algo mudou durante a leitura, descarta (a próxima rodada reavalia).
      const stale = () =>
        !canCheck() || latestRef.current.dbPath !== path || revisionRef.current !== myRevision || hasPendingEdits();
      if (stale()) return;

      const decision = decideExternalChange({ myRevision, disk, hasPendingEdits: false });
      if (decision === 'reload') {
        await silentReload(path, myRevision, stale, disk);
      } else if (decision === 'diverged') {
        await openDivergence(disk);
      }
    } catch (e) {
      console.error('Verificação de mudança externa falhou (tenta de novo no próximo ciclo):', e);
    } finally {
      checkingRef.current = false;
    }
  };

  // O disco descende do que temos e não há edição local: troca só os arrays, sem gravar.
  const silentReload = async (path: string, myRevision: string | null, stale: () => boolean, disk: DiskMetaInfo) => {
    const res = await invoke<LoadResult>('load_database', { filepath: path });
    if (stale() || res.status !== 'ok') return;
    const prepared = await prepareLoaded(res.content);
    if (stale()) return;
    // O arquivo pode ter mudado entre o meta e a leitura: reavalia com o meta do que foi lido.
    const again = decideExternalChange({
      myRevision,
      disk: { status: prepared.revision ? 'ok' : 'no_meta', revision: prepared.revision, history: prepared.history },
      hasPendingEdits: false,
    });
    if (again === 'none') return;
    if (again === 'diverged') { await openDivergence({ ...disk, status: prepared.revision ? 'ok' : 'no_meta' }); return; }
    commitLoaded(prepared, res.machine);
    retryCountRef.current = 0;
    setSaveError(null);
    const who = [disk.savedBy, formatTime(disk.savedAt ?? null)].filter(Boolean).join(', ');
    addToast(who ? `Dados atualizados (${who})` : 'Dados atualizados', 'info');
  };

  // Arquivo que não parte do que abrimos: guarda cópia do nosso estado e bloqueia com o diálogo.
  const openDivergence = async (disk: DiskMetaInfo) => {
    const { db } = latestRef.current;
    const meta: DatabaseMeta = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      revision: revisionRef.current || '',
      history: historyRef.current,
      savedAt: new Date().toISOString(),
      savedBy: machineRef.current,
    };
    await handleConflict(
      { conflict: { savedBy: disk.savedBy ?? null, savedAt: disk.savedAt ?? null } },
      db,
      serializeDb(db, meta),
      'diverged',
    );
  };

  const checkExternalRef = useRef(checkExternalChange);
  checkExternalRef.current = checkExternalChange;

  useEffect(() => {
    if (loadStatus !== 'ok') return;
    const tick = () => { void checkExternalRef.current(); };
    const id = setInterval(tick, EXTERNAL_CHECK_MS);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', tick);
    };
  }, [loadStatus]);

  // ------------------------------------------------- gravar ao fechar a janela
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    try {
      const win = getCurrentWindow();
      win.onCloseRequested(async (event) => {
        event.preventDefault();
        let safe = true;
        try {
          clearTimers();
          safe = await saveNowRef.current();
        } catch (e) {
          safe = false;
        }
        if (!safe && !window.confirm('Não foi possível salvar as últimas alterações. Fechar mesmo assim e perder o que não foi salvo?')) {
          return;
        }
        await win.destroy();
      }).then(fn => { if (disposed) fn(); else unlisten = fn; })
        .catch(e => console.error("Não foi possível registrar o fechamento da janela:", e));
    } catch (e) {
      // Fora do Tauri (npm run dev no navegador): sem janela nativa.
    }
    return () => { disposed = true; if (unlisten) unlisten(); };
  }, []);

  // ------------------------------------------------- tela de carga bloqueante
  const applyPath = () => {
    const next = pathDraft.trim();
    if (!next) return;
    if (next === dbPath) setReloadKey(k => k + 1);
    else setDbPath(next);
  };

  const createNewDatabase = () => {
    if (!window.confirm(`Criar um banco novo e vazio em:\n${dbPath}\n\nNenhum dado existente será usado. Continuar?`)) return;
    lastSavedRef.current = null;
    revisionRef.current = null;
    historyRef.current = [];
    dirtyRef.current = false;
    setLoadError('');
    setLoadStatus('ok'); // o efeito de salvamento grava o banco vazio
  };

  const blocked = loadStatus === 'not_found' || loadStatus === 'error';

  const blockingScreen = (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-primary)', color: 'var(--text-main, inherit)', padding: 24, zIndex: 10000,
    }}>
      <div style={{
        maxWidth: 560, width: '100%', padding: 28, borderRadius: 12,
        background: 'var(--bg-surface)', border: '1px solid var(--danger, #ef4444)',
      }}>
        <h2 style={{ marginTop: 0 }}>
          {loadStatus === 'not_found' ? 'Banco de dados não encontrado' : 'Não foi possível abrir o banco de dados'}
        </h2>
        <p style={{ color: 'var(--text-muted)' }}>
          {loadStatus === 'not_found'
            ? 'Não existe arquivo de dados neste caminho. Se a pasta sincronizada ou o disco ainda não estão disponíveis, corrija o caminho ou tente de novo. Nada foi alterado.'
            : loadError}
        </p>
        {loadStatus === 'error' && (
          <p style={{ color: 'var(--text-muted)' }}>
            Por segurança o app não vai gravar nada até o banco ser lido corretamente.
          </p>
        )}
        <div className="form-group" style={{ marginTop: 12 }}>
          <label className="form-label">Local do arquivo de dados (database.json)</label>
          <input
            className="form-input"
            value={pathDraft}
            onChange={(e) => setPathDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applyPath(); }}
            placeholder="Ex: C:\OficinaData\database.json"
          />
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
          <button className="btn" onClick={applyPath}>
            {pathDraft.trim() === dbPath ? 'Tentar de novo' : 'Usar este caminho'}
          </button>
          {pathDraft.trim() !== dbPath && (
            <button className="btn btn-secondary" onClick={() => setReloadKey(k => k + 1)}>
              Tentar de novo
            </button>
          )}
          {loadStatus === 'not_found' && (
            <button className="btn btn-danger" onClick={createNewDatabase}>
              Criar banco novo aqui
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const conflictTime = conflict ? formatTime(conflict.savedAt) : null;
  const conflictDialog = conflict && (
    <div
      style={{
        position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.7)', padding: 24, zIndex: 10002,
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="conflito-titulo"
        style={{
          maxWidth: 600, width: '100%', maxHeight: '90vh', overflow: 'auto', padding: 28, borderRadius: 12,
          background: 'var(--bg-surface)', color: 'var(--text-main, inherit)', border: '1px solid var(--danger, #ef4444)',
        }}
      >
        <h2 id="conflito-titulo" style={{ marginTop: 0 }}>
          {conflict.kind === 'diverged' ? 'Arquivo alterado por outro computador' : 'Conflito ao salvar'}
        </h2>
        {conflict.kind === 'diverged' ? (
          <p>
            O arquivo foi alterado por {conflict.savedBy || 'outro computador ou programa'}
            {conflictTime ? ` (às ${conflictTime})` : ''} e não parte do que você tinha aberto.{' '}
            {conflict.recoveryPath ? 'Uma cópia do seu estado foi guardada.' : ''}
          </p>
        ) : (
          <p>
            {conflict.savedBy
              ? `O computador ${conflict.savedBy} salvou${conflictTime ? ` às ${conflictTime}` : ''}.`
              : `O arquivo do banco foi alterado por outro computador ou programa${conflictTime ? ` (último salvamento às ${conflictTime})` : ''}.`}
            {' '}Suas últimas alterações não foram gravadas no arquivo.{' '}
            {conflict.recoveryPath ? 'Uma cópia delas foi guardada.' : ''}
          </p>
        )}
        {conflict.recoveryPath && (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, wordBreak: 'break-all' }}>Cópia: {conflict.recoveryPath}</p>
        )}
        {conflict.recoveryError && (
          <p style={{ color: 'var(--danger, #ef4444)' }}>
            <strong>Atenção:</strong> não foi possível guardar a cópia ({conflict.recoveryError}). Anote as alterações abaixo antes de recarregar.
          </p>
        )}
        {conflict.kind === 'save' && <p style={{ marginBottom: 6 }}><strong>Alterado neste computador desde a última leitura/gravação:</strong></p>}
        {conflict.kind === 'diverged' ? null : conflict.changes.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>Nenhuma diferença encontrada em OS, lançamentos ou clientes (pode ter mudado outro dado, como catálogo ou configurações).</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 20, maxHeight: 220, overflow: 'auto' }}>
            {conflict.changes.slice(0, MAX_CHANGES_SHOWN).map(c => (
              <li key={`${c.group}-${c.id}-${c.kind}`}>
                {c.group} {c.kind}: {c.label} <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>({c.id})</span>
              </li>
            ))}
            {conflict.changes.length > MAX_CHANGES_SHOWN && (
              <li>e mais {conflict.changes.length - MAX_CHANGES_SHOWN} item(ns)</li>
            )}
          </ul>
        )}
        {reloadError && <p style={{ color: 'var(--danger, #ef4444)', marginTop: 12 }}>{reloadError}</p>}
        <div style={{ marginTop: 20 }}>
          <button className="btn" onClick={() => { void reloadFromDisk(); }} disabled={reloading} autoFocus>
            {reloading ? 'Recarregando...' : 'Recarregar dados do arquivo'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <DatabaseContext.Provider value={{
      ledger, setLedger,
      workOrders, setWorkOrders,
      clients, setClients,
      catalogParts, setCatalogParts,
      catalogServices, setCatalogServices,
      catalogTechnicians, setCatalogTechnicians,
      settings, setSettings,
      isLoading, isSaving, readOnly,
      loadStatus, saveError,
      dbPath, setDbPath,
    }}>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      {blocked ? blockingScreen : children}
      {readOnly && !blocked && (
        <div
          role="alert"
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10001, padding: '10px 16px', textAlign: 'center',
            background: 'var(--warning, #f59e0b)', color: '#1a1a1a', fontWeight: 600,
          }}
        >
          Este banco foi salvo por uma versão mais nova. Atualize o OficinaPro neste computador.
          <span style={{ fontWeight: 400 }}> Modo somente leitura: nenhuma alteração será gravada.</span>
        </div>
      )}
      {conflict && !blocked && conflictDialog}
      {saveError && !blocked && !conflict && (
        <div
          role="alert"
          style={{
            position: 'fixed', left: 16, bottom: 16, zIndex: 10001, display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 14px', borderRadius: 8, background: 'var(--danger, #ef4444)', color: '#fff',
            boxShadow: '0 4px 14px rgba(0,0,0,0.4)', maxWidth: 420,
          }}
        >
          <span><strong>Não salvo.</strong> As alterações ainda não foram gravadas; o app tenta de novo sozinho.</span>
          <button className="btn btn-secondary" onClick={() => { void saveNow(); }} disabled={isSaving}>
            Tentar agora
          </button>
        </div>
      )}
    </DatabaseContext.Provider>
  );
};

export const useDatabase = () => useContext(DatabaseContext);

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LedgerEntry, WorkOrder, Client, CatalogItem, Technician, WorkshopSettings, DatabaseSchema } from '../types';
import { ToastContainer, ToastMessage, ToastType } from '../components/ui/ToastContainer';

export type LoadStatus = 'loading' | 'ok' | 'not_found' | 'error';

interface LoadResult {
  status: 'ok' | 'not_found';
  content: string;
}

interface SaveResult {
  success: boolean;
  message: string;
}

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
const RETRY_DELAYS_MS = [5000, 15000, 60000];

// Snapshot único: o que é comparado, gravado e guardado como "último gravado".
// O formato (chaves e ordem) é o mesmo de sempre; o JSON em disco não muda.
const buildSnapshot = (db: DatabaseSchema): string => JSON.stringify(db);

const COLLECTION_KEYS = ['ledger', 'workOrders', 'clients', 'catalogParts', 'catalogServices', 'catalogTechnicians'] as const;

// Valida o conteúdo lido. Campos ausentes (bancos antigos) viram []/padrão;
// JSON inválido ou tipos errados são erro (nunca mascarados com `|| []`).
function parseDatabase(content: string, fallbackSettings: WorkshopSettings): DatabaseSchema {
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

  const list = <T,>(key: string): T[] => (Array.isArray(obj[key]) ? (obj[key] as T[]) : []);
  return {
    ledger: list<LedgerEntry>('ledger'),
    workOrders: list<WorkOrder>('workOrders'),
    clients: list<Client>('clients'),
    catalogParts: list<CatalogItem>('catalogParts'),
    catalogServices: list<CatalogItem>('catalogServices'),
    catalogTechnicians: list<Technician>('catalogTechnicians'),
    settings: (s as WorkshopSettings | undefined | null) || fallbackSettings,
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
  const [settings, setSettings] = useState<WorkshopSettings>(DEFAULT_SETTINGS);

  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [loadError, setLoadError] = useState<string>('');
  const [reloadKey, setReloadKey] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [pathDraft, setPathDraft] = useState(dbPath);

  const isLoading = loadStatus === 'loading';

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const lastSavedRef = useRef<string | null>(null);
  const inFlightRef = useRef<Promise<boolean> | null>(null);

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
  useEffect(() => {
    let cancelled = false;
    clearTimers();
    retryCountRef.current = 0;
    lastSavedRef.current = null;
    setSaveError(null);

    const resetData = () => {
      setLedger([]);
      setWorkOrders([]);
      setClients([]);
      setCatalogParts([]);
      setCatalogServices([]);
      setCatalogTechnicians([]);
      setSettings(DEFAULT_SETTINGS);
    };

    async function load() {
      setLoadStatus('loading');
      setLoadError('');
      try {
        const res = await invoke<LoadResult>('load_database', { filepath: dbPath });
        if (cancelled) return;

        if (res.status === 'not_found') {
          resetData();
          setLoadStatus('not_found');
          return;
        }

        const parsed = parseDatabase(res.content, DEFAULT_SETTINGS);
        // O que acabou de ser lido não precisa ser regravado.
        lastSavedRef.current = buildSnapshot(parsed);
        setLedger(parsed.ledger);
        setWorkOrders(parsed.workOrders);
        setClients(parsed.clients);
        setCatalogParts(parsed.catalogParts);
        setCatalogServices(parsed.catalogServices);
        setCatalogTechnicians(parsed.catalogTechnicians);
        setSettings(parsed.settings);
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

  // Grava o snapshot atual. true = nada pendente (gravou ou já estava igual).
  const saveNow = async (): Promise<boolean> => {
    if (inFlightRef.current) await inFlightRef.current;

    const { dbPath: path, loadStatus: status, db } = latestRef.current;
    if (status !== 'ok') return true;

    const snapshot = buildSnapshot(db);
    if (snapshot === lastSavedRef.current) {
      setSaveError(null);
      return true;
    }

    if (retryTimeoutRef.current) { clearTimeout(retryTimeoutRef.current); retryTimeoutRef.current = null; }

    const run = async (): Promise<boolean> => {
      setIsSaving(true);
      try {
        const res = await invoke<SaveResult>('save_database_atomic', { filepath: path, content: snapshot });
        if (!res || !res.success) throw new Error(res?.message || 'Falha desconhecida ao gravar.');
        lastSavedRef.current = snapshot;
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
    if (loadStatus !== 'ok') return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => { void saveNowRef.current(); }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [ledger, workOrders, clients, catalogParts, catalogServices, catalogTechnicians, settings, dbPath, loadStatus]);

  useEffect(() => () => clearTimers(), []);

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

  return (
    <DatabaseContext.Provider value={{
      ledger, setLedger,
      workOrders, setWorkOrders,
      clients, setClients,
      catalogParts, setCatalogParts,
      catalogServices, setCatalogServices,
      catalogTechnicians, setCatalogTechnicians,
      settings, setSettings,
      isLoading, isSaving,
      loadStatus, saveError,
      dbPath, setDbPath,
    }}>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      {blocked ? blockingScreen : children}
      {saveError && !blocked && (
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Appointment, AuditEvent, CatalogItem, Client, LedgerEntry, Technician, WorkOrder, WorkshopSettings,
} from '../types';
import type { Role } from '../services/permissions';
import { can } from '../services/permissions';
import { adoptSecrets, persistSecrets, stripSecrets } from '../utils/secrets';
import { LocalScheduler } from '../sync/localScheduler';
import { openIdbStore } from '../sync/idb';
import { startCloudPhotos } from '../sync/photoRuntime';
import type { CloudPhotos } from '../sync/photoRuntime';
import { setPhotoTransport } from '../services/photoStore';
import { describeSyncError, recoveryCopyContent, recoveryFileName, rejectionMessage } from '../sync/rejectMessages';
import { createMoneyClient } from '../sync/moneyClient';
import type { MoneyHttpResult, MoneyInvoke } from '../sync/moneyClient';
import { createSupabaseTransport } from '../sync/supabaseRepo';
import { realTimers, SyncEngine } from '../sync/syncEngine';
import type { CloudInfo, RemotePatch, SyncStatus } from '../sync/syncEngine';
import type { LoadStage } from '../utils/cloudStatus';
import type { OutboxOp } from '../sync/outbox';
import type { CollectionKey } from '../sync/types';
import { DatabaseContext } from './DatabaseContext';
import type { DatabaseContextData, LoadStatus } from './DatabaseContext';
import { useToast } from './ToastContext';
import { formatDateOnly } from '../utils/dates';
import { isTauri } from '../utils/platform';

// Provider da NUVEM (docs/NUVEM-SPEC.md seção 4). Entrega o MESMO contexto do modo arquivo (`DatabaseContext`),
// então as telas não mudam. Os `setX` são os do React; um efeito por coleção chama o motor (`SyncEngine`) com
// debounce de 500 ms, e o que vem de fora (pull, conflito, reversão) volta por `onPatch`.
// Desligado por padrão: ninguém monta este provider até o PR 5 (login) escolher entre arquivo e nuvem.
//
// PR 5: monte SEMPRE com `key={workshopId + userId + role}`. A troca de oficina, pessoa ou papel desmonta o provider
// (o motor, o cache e o estado antigos somem). O efeito do motor também zera o estado ao reabrir, por segurança, mas
// o `key` é o que garante que nenhum dado da pessoa anterior fique em memória nem em tela.

const LOCAL_DEBOUNCE_MS = 500;

const DEFAULT_SETTINGS: WorkshopSettings = { name: 'OFICINA', cnpj: '', address: '', exportPath: '', googleDriveToken: '', googleApiKey: '' };

export interface CloudDatabaseProviderProps {
  /** Cliente já autenticado (o login do PR 5 fornece). */
  supabase: SupabaseClient;
  workshopId: string;
  userId: string;
  role: Role;
  deviceId: string;
  deviceName: string;
  /** Nome de exibição da pessoa, para `AuditEvent.machine` ("Nome (aparelho)"). */
  userName?: string;
  /** Sobe a cada novo login da MESMA pessoa (ex.: "Entre de novo"): o motor sai do estado `sem_acesso` e volta a enviar e puxar. */
  resumeSignal?: number;
  children: React.ReactNode;
}

type WithId = { id: string };

/** Aplica um patch do motor numa lista: troca no lugar (mantém a ordem), acrescenta o novo no fim, tira o removido. */
export function applyPatchToList<T extends WithId>(prev: readonly T[], upserts: readonly unknown[], removes: readonly string[]): T[] {
  const incoming = new Map((upserts as T[]).map(u => [u.id, u]));
  const gone = new Set(removes);
  const out: T[] = [];
  for (const it of prev) {
    if (gone.has(it.id)) continue;
    const n = incoming.get(it.id);
    if (n) { out.push(n); incoming.delete(it.id); } else out.push(it);
  }
  for (const n of incoming.values()) out.push(n);
  return out;
}

/**
 * Cópia de recuperação: no Tauri, a pasta `recuperacao` do app; na web, o IndexedDB (`auth/recoveryStore`): NÃO baixa
 * arquivo sozinho (PC compartilhado). O Dono baixa depois. Nunca lança.
 */
async function saveRecoveryCopy(op: OutboxOp): Promise<void> {
  const savedAt = new Date().toISOString();
  const content = recoveryCopyContent(op, savedAt);
  try {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('save_recovery_copy', { content });
      return;
    }
    const { saveRecoveryCopyLocal } = await import('../auth/recoveryStore');
    await saveRecoveryCopyLocal({ name: recoveryFileName(op, savedAt), content, userId: op.actor });
  } catch (e) {
    console.error('Cópia de recuperação não gravada:', e);
  }
}

export const CloudDatabaseProvider: React.FC<CloudDatabaseProviderProps> = ({
  supabase, workshopId, userId, role, deviceId, deviceName, userName, resumeSignal, children,
}) => {
  const { addToast } = useToast();
  const toastRef = useRef(addToast);
  toastRef.current = addToast;

  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [catalogParts, setCatalogParts] = useState<CatalogItem[]>([]);
  const [catalogServices, setCatalogServices] = useState<CatalogItem[]>([]);
  const [catalogTechnicians, setCatalogTechnicians] = useState<Technician[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEvent[]>([]);
  const [settings, setSettingsRaw] = useState<WorkshopSettings>(() => adoptSecrets(DEFAULT_SETTINGS));
  // Mesmo contrato do modo arquivo: quem edita as configurações também grava os segredos no localStorage.
  const setSettings: React.Dispatch<React.SetStateAction<WorkshopSettings>> = useCallback(action => {
    setSettingsRaw(prev => {
      const next = typeof action === 'function' ? action(prev) : action;
      persistSecrets(next);
      return next;
    });
  }, []);

  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [loadStage, setLoadStage] = useState<LoadStage>('cache');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<SyncStatus>({ online: true, flushing: false, pending: 0, syncState: 'salvo', lastError: null });
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [localDirty, setLocalDirty] = useState(false);

  const engineRef = useRef<SyncEngine | null>(null);
  const photosRef = useRef<CloudPhotos | null>(null);
  // Valores mais recentes para o debounce e para quem roda fora do render.
  const latest = useRef({ ledger, workOrders, clients, catalogParts, catalogServices, catalogTechnicians, appointments, auditLog, settings });
  latest.current = { ledger, workOrders, clients, catalogParts, catalogServices, catalogTechnicians, appointments, auditLog, settings };
  // Debounce das edições locais. Configurações: o Dono pode criar mesmo sem linha no servidor (o motor usa o padrão
  // da tela como base da 3 vias); os demais só mandam depois que a linha existir (senão veriam uma recusa falsa).
  const canEditSettings = can(role, 'settings.edit');
  const scheduler = useRef<LocalScheduler | null>(null);
  if (scheduler.current === null) {
    scheduler.current = new LocalScheduler({
      timers: realTimers, debounceMs: LOCAL_DEBOUNCE_MS,
      getEngine: () => engineRef.current,
      getCurrent: c => latest.current[c],
      getSettings: () => stripSecrets(latest.current.settings),
      canEditSettings,
      onDirtyChange: setLocalDirty,
    });
  }
  const flushLocal = useCallback(() => scheduler.current?.flush(), []);
  const schedule = useCallback((c: CollectionKey) => scheduler.current?.schedule(c), []);

  // Um efeito por coleção: mudou o estado, o motor compara (referência igual e JSON igual não geram op).
  useEffect(() => schedule('ledger'), [ledger, schedule]);
  useEffect(() => schedule('workOrders'), [workOrders, schedule]);
  useEffect(() => schedule('clients'), [clients, schedule]);
  useEffect(() => schedule('catalogParts'), [catalogParts, schedule]);
  useEffect(() => schedule('catalogServices'), [catalogServices, schedule]);
  useEffect(() => schedule('catalogTechnicians'), [catalogTechnicians, schedule]);
  useEffect(() => schedule('appointments'), [appointments, schedule]);
  useEffect(() => schedule('auditLog'), [auditLog, schedule]);
  useEffect(() => schedule('settings'), [settings, schedule]);

  // Motor: abre o cache, liga o transporte e a primeira rodada.
  useEffect(() => {
    let cancelled = false;
    let engine: SyncEngine | null = null;
    // Troca de oficina, pessoa ou papel: nada do estado anterior pode sobrar.
    scheduler.current?.reset();
    scheduler.current?.setSettingsBaseline(stripSecrets(DEFAULT_SETTINGS), false);
    setLedger([]); setWorkOrders([]); setClients([]); setCatalogParts([]); setCatalogServices([]);
    setCatalogTechnicians([]); setAppointments([]); setAuditLog([]);
    setSettingsRaw(adoptSecrets(DEFAULT_SETTINGS));
    setLoadStatus('loading'); setLoadStage('cache'); setLoadError(null);
    setStatus({ online: true, flushing: false, pending: 0, syncState: 'salvo', lastError: null });
    let unsub: (() => void) | null = null;
    let closeStore: (() => void) | undefined;
    let photos: CloudPhotos | null = null;

    const applyPatches = (patches: RemotePatch[]): void => {
      if (cancelled) return;
      for (const p of patches) {
        switch (p.collection) {
          case 'ledger': setLedger(prev => applyPatchToList(prev, p.upserts, p.removes)); break;
          case 'workOrders': setWorkOrders(prev => applyPatchToList(prev, p.upserts, p.removes)); break;
          case 'clients': setClients(prev => applyPatchToList(prev, p.upserts, p.removes)); break;
          case 'catalogParts': setCatalogParts(prev => applyPatchToList(prev, p.upserts, p.removes)); break;
          case 'catalogServices': setCatalogServices(prev => applyPatchToList(prev, p.upserts, p.removes)); break;
          case 'catalogTechnicians': setCatalogTechnicians(prev => applyPatchToList(prev, p.upserts, p.removes)); break;
          case 'appointments': setAppointments(prev => applyPatchToList(prev, p.upserts, p.removes)); break;
          case 'auditLog': setAuditLog(prev => applyPatchToList(prev, p.upserts, p.removes)); break;
          case 'settings': {
            const next = p.upserts[0] as WorkshopSettings | undefined;
            if (next) {
              const merged = adoptSecrets({ ...DEFAULT_SETTINGS, ...next });
              scheduler.current?.setSettingsBaseline(stripSecrets(merged), true);
              setSettingsRaw(merged);
            }
            break;
          }
        }
      }
    };

    void (async () => {
      try {
        const store = await openIdbStore({ workshopId, userId });
        closeStore = () => store.close?.();
        engine = new SyncEngine({
          transport: createSupabaseTransport(supabase), store, workshopId, actor: userId, deviceId, role,
          now: () => new Date().toISOString(), newId: () => crypto.randomUUID(), timers: realTimers,
          online: typeof navigator === 'undefined' ? true : navigator.onLine,
          onPatch: applyPatches,
          beforeRemote: () => scheduler.current?.flush(),
          settingsDefault: stripSecrets(DEFAULT_SETTINGS),
          onRejected: (collection, _id, reason) => { toastRef.current(rejectionMessage(collection, reason), 'error'); },
          onNotice: message => { toastRef.current(message, 'info'); },
          onRecoveryCopy: op => { void saveRecoveryCopy(op); },
        });
        // Fotos no Storage (PR 7): fila e cache no mesmo banco local. Falha aqui não derruba os dados: só fica sem fotos.
        setLoadStage('fotos');
        try {
          photos = await startCloudPhotos({
            supabase, workshopId, userId, online: typeof navigator === 'undefined' ? true : navigator.onLine,
            onFailed: (_item, message) => { toastRef.current(message, 'error'); },
          });
        } catch (e) {
          console.warn('Fotos indisponíveis neste aparelho:', e);
        }
        if (cancelled) { void photos?.stop(); engine.stop(); closeStore(); return; }
        if (photos) { photosRef.current = photos; setPhotoTransport(photos.transport); }
        setLoadStage('dados');
        const initial = await engine.open();
        if (cancelled) { void photos?.stop(); engine.stop(); closeStore(); return; }
        engineRef.current = engine;
        setLedger(initial.ledger); setWorkOrders(initial.workOrders); setClients(initial.clients);
        setCatalogParts(initial.catalogParts); setCatalogServices(initial.catalogServices);
        setCatalogTechnicians(initial.catalogTechnicians); setAppointments(initial.appointments); setAuditLog(initial.auditLog);
        if (initial.settings) {
          const merged = adoptSecrets({ ...DEFAULT_SETTINGS, ...initial.settings });
          scheduler.current?.setSettingsBaseline(stripSecrets(merged), true);
          setSettingsRaw(merged);
        }
        unsub = engine.subscribeStatus(setStatus);
        setStatus(engine.getStatus());
        setLoadStatus('ok');
        engine.start();
      } catch (e) {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : String(e));
        setLoadStatus('error');
      }
    })();

    return () => {
      // Descarrega o debounce (a edição entra na outbox e fica no cache), para o motor, espera o que estava no ar
      // terminar e só então fecha o store.
      scheduler.current?.flush();
      cancelled = true;
      unsub?.();
      const e = engine;
      const close = closeStore;
      engineRef.current = null;
      photosRef.current = null;
      setPhotoTransport(null);
      void photos?.stop();
      e?.stop();
      void (e ? e.settled() : Promise.resolve()).then(() => close?.());
    };
  }, [supabase, workshopId, userId, role, deviceId]);

  // Novo login da mesma pessoa: tira o motor de `sem_acesso`.
  useEffect(() => { if (resumeSignal) engineRef.current?.resumeAfterLogin(); }, [resumeSignal]);

  // Janela: foco puxa tudo; internet volta/cai; ao esconder/fechar, descarrega o debounce.
  useEffect(() => {
    const onFocus = () => engineRef.current?.focus();
    const onOnline = () => { engineRef.current?.setOnline(true); photosRef.current?.queue.setOnline(true); };
    const onOffline = () => { engineRef.current?.setOnline(false); photosRef.current?.queue.setOnline(false); };
    const onHide = () => { if (document.visibilityState === 'hidden') flushLocal(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('pagehide', flushLocal);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('pagehide', flushLocal);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [flushLocal]);

  // "Salvo às HH:MM": instante em que a fila esvaziou e o servidor confirmou.
  useEffect(() => {
    if (status.syncState === 'salvo' && status.pending === 0 && loadStatus === 'ok') setLastSavedAt(new Date().toISOString());
  }, [status.syncState, status.pending, loadStatus]);

  // Descarrega o debounce local (a edição entra na outbox) e só então manda: quem troca de pessoa não perde o último passo.
  const syncNow = useCallback(async (): Promise<void> => { scheduler.current?.flush(); await engineRef.current?.syncNow(); }, []);
  const getMachineName = useCallback(() => (userName ? `${userName} (${deviceName})` : deviceName), [userName, deviceName]);
  const noopSetDbPath = useCallback<React.Dispatch<React.SetStateAction<string>>>(() => {}, []);

  // Operações de dinheiro (função `money`, PR 6). O cliente HTTP usa a sessão do supabase-js (token e chave publicável).
  const [moneyBusyKeys, setMoneyBusyKeys] = useState<string[]>([]);
  const moneyBusy = moneyBusyKeys.length > 0;
  const machineRef = useRef(getMachineName);
  machineRef.current = getMachineName;
  const moneyClient = useMemo(() => {
    const invoke: MoneyInvoke = async (body): Promise<MoneyHttpResult | null> => {
      const { data, error } = await supabase.functions.invoke('money', { body });
      if (!error) return { status: 200, body: typeof data === 'object' && data !== null ? data as Record<string, unknown> : {} };
      if (error instanceof FunctionsHttpError) {
        const res = error.context as Response;
        let json: Record<string, unknown> = {};
        try { json = await res.json() as Record<string, unknown>; } catch { /* corpo não JSON */ }
        return { status: res.status, body: json };
      }
      return null; // sem resposta (rede)
    };
    return createMoneyClient({
      invoke, engine: () => engineRef.current, newId: () => crypto.randomUUID(),
      today: () => formatDateOnly(new Date()), machine: () => machineRef.current(), deviceId, onBusy: setMoneyBusyKeys,
    });
  }, [supabase, deviceId]);

  const value = useMemo<DatabaseContextData>(() => {
    const cloud: CloudInfo = { role, ...status, syncNow, money: moneyClient.run, moneyBusy, moneyBusyKeys, loadStage };
    return {
      ledger, setLedger, workOrders, setWorkOrders, clients, setClients, catalogParts, setCatalogParts,
      catalogServices, setCatalogServices, catalogTechnicians, setCatalogTechnicians, appointments, setAppointments,
      auditLog, setAuditLog, settings, setSettings,
      isLoading: loadStatus === 'loading',
      isSaving: status.flushing || moneyBusy, // só com envio no ar (ou operação de dinheiro): fila em espera de backoff não trava o "Salvar OS"
      // Campos só do modo arquivo, com valor neutro: não há banco de versão futura, diálogo de conflito de arquivo
      // (o conflito da nuvem é resolvido por campo no motor) nem caminho de arquivo.
      readOnly: false,
      loadStatus,
      saveError: status.syncState === 'erro' ? describeSyncError(status.lastError) ?? 'Não deu para enviar agora.' : null,
      lastSavedAt,
      hasPendingChanges: localDirty || status.pending > 0,
      hasConflict: false,
      dbPath: `nuvem:${workshopId}`, // só identifica "outro banco" para quem limpa cache por `dbPath` (App.tsx)
      setDbPath: noopSetDbPath,
      getMachineName,
      cloud,
    };
  }, [
    ledger, workOrders, clients, catalogParts, catalogServices, catalogTechnicians, appointments, auditLog, settings, setSettings,
    loadStatus, status, lastSavedAt, localDirty, workshopId, role, noopSetDbPath, getMachineName, syncNow, moneyClient, moneyBusy, moneyBusyKeys, loadStage,
  ]);

  return (
    <DatabaseContext.Provider value={value}>
      {loadStatus === 'error'
        ? (
          <div role="alert" className="app-banner app-banner--danger">
            <span><strong>Não foi possível abrir os dados locais.</strong> {loadError}</span>
          </div>
        )
        : children}
    </DatabaseContext.Provider>
  );
};

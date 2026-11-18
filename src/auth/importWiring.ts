import { invoke } from '@tauri-apps/api/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseDatabase } from '../context/DatabaseContext';
import { createTauriTransport } from '../services/photoStore';
import { PHOTO_BUCKET, createPhotoUploader } from '../sync/photoTransport';
import { supabaseStorageApi } from '../sync/photoRuntime';
import { createSupabaseTransport, toTransportError } from '../sync/supabaseRepo';
import { IMPORT_TABLES, emptyTotals } from '../sync/importCheck';
import type { ImportTotals, PhotoFileInfo } from '../sync/importCheck';
import type { DiskMetaInfo, ImportDeps, ImportProgress, SaveOutcome } from '../sync/importRunner';
import type { CloudTable } from '../sync/types';
import type { WorkshopSettings } from '../types';
import { generateId } from '../utils/helpers';

// Liga o orquestrador da importação (`createImportRunner`) ao mundo real: comandos Tauri, RPC do Supabase e Storage.
// Sem regra de negócio aqui (docs/NUVEM-PR9.md, R6). Só roda no app instalado.

const DEFAULT_SETTINGS: WorkshopSettings = { name: 'OFICINA', cnpj: '', address: '', exportPath: '', googleDriveToken: '', googleApiKey: '' };

interface LoadResult { status: 'ok' | 'not_found'; content: string; machine: string }
interface MetaResult { status: DiskMetaInfo['status']; revision?: string | null }
interface SaveResult { status: 'ok' | 'conflict' | 'io_error'; message?: string }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number.isFinite(Number(v)) ? Number(v) : 0);

/** Resposta de `import_finish` para `ImportTotals` (o servidor devolve `numeric` como número ou texto). Puro. */
export function toImportTotals(data: unknown): ImportTotals {
  const o = isObj(data) ? data : {};
  const rawCounts = isObj(o.counts) ? o.counts : {};
  const counts = {} as Record<CloudTable, number>;
  for (const t of IMPORT_TABLES) counts[t] = num(rawCounts[t]);
  return {
    counts, ledgerSignedCents: num(o.ledgerSignedCents), osTotalCents: num(o.osTotalCents),
    paidEntries: num(o.paidEntries), advancesCents: num(o.advancesCents),
    state: o.state === 'vazio' || o.state === 'importando' || o.state === 'concluido' ? o.state : undefined,
  };
}

export interface ImportWiringOptions {
  supabase: SupabaseClient;
  workshopId: string;
  dbPath: string;
  onProgress?: (p: ImportProgress) => void;
}

export function createImportDeps(o: ImportWiringOptions): ImportDeps {
  const { supabase, workshopId } = o;
  const bucket = supabase.storage.from(PHOTO_BUCKET);
  const tauriPhotos = createTauriTransport();

  const rpc = async (fn: string, args: Record<string, unknown>): Promise<unknown> => {
    let res;
    try {
      res = await supabase.rpc(fn, args);
    } catch (e) {
      throw toTransportError(e);
    }
    if (res.error) throw toTransportError(res.error, res.status);
    return res.data;
  };

  return {
    workshopId,
    dbPath: o.dbPath,
    async readDatabase(path) {
      const r = await invoke<LoadResult>('load_database', { filepath: path });
      if (r.status !== 'ok') throw new Error('Não encontrei o arquivo do banco neste caminho.');
      return r.content;
    },
    async readMeta(path) {
      const r = await invoke<MetaResult>('read_db_meta', { filepath: path });
      return { status: r.status, revision: r.revision ?? null };
    },
    backupPreCloud: content => invoke<string>('backup_pre_cloud', { content }),
    photoInventory: dbPath => invoke<PhotoFileInfo[]>('photo_inventory', { dbPath }),
    parseDatabase: content => parseDatabase(content, DEFAULT_SETTINGS),
    async importRows(ws, rows) { await rpc('import_rows', { ws, rows }); },
    async importFinish(ws, commit, expected) {
      return toImportTotals(await rpc('import_finish', { ws, p_commit: commit, p_expected: commit ? expected ?? null : null }));
    },
    async importReset(ws) { await rpc('import_reset', { ws }); },
    transport: createSupabaseTransport(supabase),
    async listPhotoObjects(osId) {
      const { data, error } = await bucket.list(`${workshopId}/${osId}`, { limit: 1000 });
      if (error) throw new Error(error.message);
      return (data ?? []).map(f => f.name);
    },
    readPhoto: (osId, photoId, thumb) => tauriPhotos.read(o.dbPath, osId, photoId, thumb),
    uploadPhoto: createPhotoUploader(supabaseStorageApi(supabase), workshopId),
    async saveDatabase(path, content, expectedRevision): Promise<SaveOutcome> {
      const r = await invoke<SaveResult>('save_database_atomic', { filepath: path, content, expectedRevision });
      return { status: r.status, message: r.message };
    },
    now: () => new Date().toISOString(),
    newId: generateId,
    onProgress: o.onProgress,
  };
}

/** "Começar sem dados": conclui a importação sem enviar nada (a oficina nasce vazia). Funciona também no navegador. */
export async function finishWithoutData(supabase: SupabaseClient, workshopId: string): Promise<void> {
  let res;
  try {
    // Manda totais zerados: se outro PC já enviou linhas, o servidor recusa (`totais_divergentes`).
    res = await supabase.rpc('import_finish', { ws: workshopId, p_commit: true, p_expected: emptyTotals() });
  } catch (e) {
    throw toTransportError(e);
  }
  if (res.error) throw toTransportError(res.error, res.status);
}

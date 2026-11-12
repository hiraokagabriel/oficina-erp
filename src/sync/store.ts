import type { Role } from '../services/permissions';
import type { OutboxOp } from './outbox';
import type { PullPosition } from './syncEngine';
import type { CloudTable, CollectionKey } from './types';

// Contrato do cache local do sync (docs/NUVEM-SPEC.md seção 4, "IndexedDB"). Só tipos: `memoryStore.ts` (testes)
// e `idb.ts` (IndexedDB) implementam. O motor mantém tudo em memória e usa o store só para persistir.

/** Versão do formato do cache. Diferente da gravada = cache descartado e baixado de novo. */
export const CACHE_VERSION = 1;

/** Registro CONFIRMADO pelo servidor (sem as edições locais pendentes, que ficam na outbox). */
export interface StoredRecord {
  /** Registro já junto (OS completa para o papel, item de catálogo com preço/custo conforme o papel). */
  data: unknown;
  /** Versão por linha: `main`, `fin` (finance/preço) e `cost`. */
  versions: { main: number; fin?: number; cost?: number };
  /** `updated_at` da linha principal no servidor (ou o relógio local, se a confirmação veio do push). */
  updatedAt: string;
  /** Tombstone: o servidor apagou. Fica gravado para descartar linhas repetidas pela janela de 5 s do pull. */
  deleted: boolean;
  /** Só `ledger`: OS dona do lançamento (null = manual). */
  osId?: string | null;
}

export interface StoreMeta {
  cacheVersion: number;
  /** Posição `(updated_at, id)` da última linha aplicada por completo, por tabela (texto como o servidor devolveu). */
  cursor: Partial<Record<CloudTable, PullPosition>>;
  role: Role | null;
  lastPullAt: string | null;
}

export const emptyMeta = (): StoreMeta => ({ cacheVersion: CACHE_VERSION, cursor: {}, role: null, lastPullAt: null });

export interface StoredEntry { collection: CollectionKey; id: string; rec: StoredRecord }

export interface LocalSnapshot { records: StoredEntry[]; outbox: OutboxOp[]; meta: StoreMeta }

/** Uma gravação atômica: ou entra tudo (registros, outbox e meta) ou nada. */
export interface CommitBatch {
  putRecords: StoredEntry[];
  putOps: OutboxOp[];
  deleteOpIds: string[];
  meta?: StoreMeta;
}

export interface LocalStore {
  load(): Promise<LocalSnapshot>;
  commit(batch: CommitBatch): Promise<void>;
  /** Apaga o cache inteiro (troca de papel, versão do cache, pessoa desativada). */
  clear(): Promise<void>;
  close?(): void;
}

import type { OutboxOp } from './outbox';
import { emptyMeta } from './store';
import type { CommitBatch, LocalSnapshot, LocalStore, StoreMeta, StoredEntry } from './store';

// LocalStore em memória, para testes. Copia com `structuredClone` na entrada e na saída para imitar a
// serialização do IndexedDB (nada de compartilhar referência com o motor).

const SEP = '\u0000';

export function createMemoryStore(): LocalStore & { commits: number; failNext: number } {
  let records = new Map<string, StoredEntry>();
  let ops = new Map<string, OutboxOp>();
  let meta: StoreMeta = emptyMeta();

  const store = {
    commits: 0,
    /** Teste: as próximas N gravações falham (disco cheio etc.). */
    failNext: 0,
    async load(): Promise<LocalSnapshot> {
      return structuredClone({ records: [...records.values()], outbox: [...ops.values()], meta });
    },
    async commit(batch: CommitBatch): Promise<void> {
      if (store.failNext > 0) { store.failNext--; throw new Error('falha de gravação simulada'); }
      const b = structuredClone(batch);
      for (const e of b.putRecords) records.set(e.collection + SEP + e.id, e);
      for (const o of b.putOps) ops.set(o.opId, o);
      for (const id of b.deleteOpIds) ops.delete(id);
      if (b.meta) meta = b.meta;
      store.commits++;
    },
    async clear(): Promise<void> {
      records = new Map();
      ops = new Map();
      meta = emptyMeta();
    },
  };
  return store;
}

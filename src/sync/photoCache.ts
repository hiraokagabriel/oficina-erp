import type { KvStore } from './kvStore';

// Cache LRU de miniaturas no IndexedDB (`photoCache`): a lista de fotos abre rápido e, sem internet, as miniaturas
// já vistas continuam aparecendo. Só miniaturas (a foto grande é baixada na hora e fica só na memória da sessão).
// LRU: o acesso atualiza `lastUsed` na memória; o disco recebe a hora do último `put` (aproximado entre sessões).

export const MAX_CACHED_THUMBS = 300;
export const MAX_CACHED_THUMB_BYTES = 24 * 1024 * 1024;

export interface CachedThumb {
  key: string;
  data: ArrayBuffer;
  bytes: number;
  lastUsed: number;
}

interface Meta { bytes: number; lastUsed: number }

export class PhotoThumbCache {
  private index: Map<string, Meta> | null = null;

  constructor(
    private readonly store: KvStore<CachedThumb>,
    private readonly now: () => number,
    private readonly maxItems: number = MAX_CACHED_THUMBS,
    private readonly maxBytes: number = MAX_CACHED_THUMB_BYTES
  ) {}

  /** Índice só com chave, tamanho e uso (os bytes não ficam na memória). */
  private async load(): Promise<Map<string, Meta>> {
    if (!this.index) {
      const idx = new Map<string, Meta>();
      for (const r of await this.store.getAll()) idx.set(r.key, { bytes: r.bytes, lastUsed: r.lastUsed });
      this.index = idx;
    }
    return this.index;
  }

  async get(key: string): Promise<Blob | null> {
    const idx = await this.load();
    const meta = idx.get(key);
    if (!meta) return null;
    const rec = await this.store.get(key);
    if (!rec) { idx.delete(key); return null; }
    meta.lastUsed = this.now();
    return new Blob([rec.data], { type: 'image/jpeg' });
  }

  async put(key: string, blob: Blob): Promise<void> {
    const idx = await this.load();
    const data = await blob.arrayBuffer();
    const lastUsed = this.now();
    idx.set(key, { bytes: data.byteLength, lastUsed });
    await this.store.put({ key, data, bytes: data.byteLength, lastUsed });
    await this.evict(idx, key);
  }

  private async evict(idx: Map<string, Meta>, keep: string): Promise<void> {
    let total = 0;
    for (const m of idx.values()) total += m.bytes;
    if (idx.size <= this.maxItems && total <= this.maxBytes) return;
    const oldest = [...idx.entries()].filter(([k]) => k !== keep).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [k, m] of oldest) {
      if (idx.size <= this.maxItems && total <= this.maxBytes) break;
      idx.delete(k);
      total -= m.bytes;
      await this.store.delete(k);
    }
  }
}

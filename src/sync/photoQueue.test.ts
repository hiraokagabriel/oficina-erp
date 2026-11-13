import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { dbNameFor, openIdbDatabase } from './idb';
import { idbKv, memoryKv } from './kvStore';
import { BACKOFF_MAX_MS, PhotoQueue, backoffMs, queueKey } from './photoQueue';
import type { PhotoUploadResult, PhotoUploader, QueuedPhoto } from './photoQueue';
import type { Timers } from './syncEngine';

// Relógio falso: `now` só anda quando o teste manda; os temporizadores disparam em `advance`.
class FakeClock implements Timers {
  t = 1_000_000;
  private seq = 0;
  private tasks = new Map<number, { at: number; fn: () => void }>();
  now = (): number => this.t;
  set(fn: () => void, ms: number): unknown { const id = ++this.seq; this.tasks.set(id, { at: this.t + ms, fn }); return id; }
  clear(h: unknown): void { this.tasks.delete(h as number); }
  pendingTimers(): number { return this.tasks.size; }
  async advance(ms: number, settle: () => Promise<void>): Promise<void> {
    const end = this.t + ms;
    for (;;) {
      const due = [...this.tasks.entries()].filter(([, k]) => k.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.tasks.delete(due[0]);
      this.t = Math.max(this.t, due[1].at);
      due[1].fn();
      await settle();
    }
    this.t = end;
  }
}

const blob = (n: number): Blob => new Blob([new Uint8Array([n, n, n])], { type: 'image/jpeg' });
const ok: PhotoUploadResult = { ok: true };
const transient: PhotoUploadResult = { ok: false, kind: 'transient', message: 'Failed to fetch' };
const definitive = (message = 'new row violates row-level security policy'): PhotoUploadResult => ({ ok: false, kind: 'definitive', message });

interface Call { osId: string; photoId: string; thumb: boolean; size: number }

function setup(script: (call: Call, n: number) => PhotoUploadResult, opts: { online?: boolean } = {}) {
  const clock = new FakeClock();
  const calls: Call[] = [];
  const failed: string[] = [];
  const store = memoryKv<QueuedPhoto>(q => q.id);
  const uploader: PhotoUploader = async (osId, photoId, thumb, bytes) => {
    const c = { osId, photoId, thumb, size: bytes.size };
    calls.push(c);
    return script(c, calls.length);
  };
  const queue = new PhotoQueue({ store, uploader, now: clock.now, timers: clock, online: opts.online, onFailed: (_i, m) => failed.push(m) });
  return { clock, calls, failed, store, queue, uploader };
}

describe('backoffMs', () => {
  it('dobra a cada tentativa e para em 5 min', () => {
    expect(backoffMs(1)).toBe(2000);
    expect(backoffMs(2)).toBe(4000);
    expect(backoffMs(3)).toBe(8000);
    expect(backoffMs(30)).toBe(BACKOFF_MAX_MS);
  });
});

describe('PhotoQueue', () => {
  it('online: sobe miniatura e original, e a foto sai da fila', async () => {
    const s = setup(() => ok);
    await s.queue.enqueue('os1', 'f1', blob(1), blob(2));
    await s.queue.settled();
    expect(s.calls.map(c => c.thumb)).toEqual([true, false]);
    expect(s.queue.has('os1', 'f1')).toBe(false);
    expect(s.store.size()).toBe(0);
  });

  it('a foto aparece na hora do blob local, antes de subir', async () => {
    const s = setup(() => ok, { online: false });
    await s.queue.enqueue('os1', 'f1', blob(7), blob(8));
    const full = s.queue.readLocal('os1', 'f1', false);
    const thumb = s.queue.readLocal('os1', 'f1', true);
    expect(new Uint8Array(await full!.arrayBuffer())[0]).toBe(7);
    expect(new Uint8Array(await thumb!.arrayBuffer())[0]).toBe(8);
    expect(s.queue.readLocal('os1', 'outra', true)).toBeNull();
  });

  it('offline guarda no IndexedDB e não envia; ao voltar a internet sobe sozinha', async () => {
    const s = setup(() => ok, { online: false });
    await s.queue.enqueue('os1', 'f1', blob(1), blob(2));
    await s.queue.settled();
    expect(s.calls).toHaveLength(0);
    expect(s.store.size()).toBe(1);
    s.queue.setOnline(true);
    await s.queue.settled();
    expect(s.calls).toHaveLength(2);
    expect(s.store.size()).toBe(0);
  });

  it('erro de rede: tenta de novo com espera crescente e termina quando a rede volta', async () => {
    let netDown = true;
    const s = setup(() => (netDown ? transient : ok));
    await s.queue.enqueue('os1', 'f1', blob(1), blob(2));
    await s.queue.settled();
    expect(s.calls).toHaveLength(1);
    expect(s.queue.has('os1', 'f1')).toBe(true);
    // antes de 2 s nada acontece
    await s.clock.advance(1_900, () => s.queue.settled());
    expect(s.calls).toHaveLength(1);
    await s.clock.advance(200, () => s.queue.settled());
    expect(s.calls).toHaveLength(2); // 2ª tentativa; próxima só em 4 s
    await s.clock.advance(3_800, () => s.queue.settled());
    expect(s.calls).toHaveLength(2);
    netDown = false;
    await s.clock.advance(300, () => s.queue.settled());
    expect(s.queue.has('os1', 'f1')).toBe(false);
    expect(s.failed).toEqual([]);
  });

  it('não repete a miniatura que já subiu', async () => {
    let n = 0;
    const s = setup(c => (!c.thumb && ++n === 1 ? transient : ok));
    await s.queue.enqueue('os1', 'f1', blob(1), blob(2));
    await s.queue.settled();
    await s.clock.advance(2_000, () => s.queue.settled());
    expect(s.calls.map(c => (c.thumb ? 't' : 'f'))).toEqual(['t', 'f', 'f']);
    expect(s.queue.has('os1', 'f1')).toBe(false);
  });

  it('duplicado (409) já chega como ok: sucesso idempotente, sem aviso', async () => {
    // o adaptador transforma 409 em ok (ver photoTransport.test); aqui, o reenvio de uma foto cujo ack se perdeu
    let first = true;
    const s = setup(() => { if (first) { first = false; return transient; } return ok; });
    await s.queue.enqueue('os1', 'f1', blob(1), blob(2));
    await s.queue.settled();
    await s.clock.advance(2_000, () => s.queue.settled());
    expect(s.queue.has('os1', 'f1')).toBe(false);
    expect(s.failed).toEqual([]);
  });

  it('erro definitivo: avisa uma vez, para de tentar e guarda a foto com erro', async () => {
    const s = setup(() => definitive());
    await s.queue.enqueue('os1', 'f1', blob(1), blob(2));
    await s.queue.settled();
    await s.clock.advance(10 * 60_000, () => s.queue.settled());
    expect(s.calls).toHaveLength(1);
    expect(s.failed).toHaveLength(1);
    expect(s.queue.failedCount()).toBe(1);
    expect(s.queue.has('os1', 'f1')).toBe(true); // bytes guardados
    expect((await s.store.getAll())[0].state).toBe('failed');
  });

  it('retryFailed devolve a foto à fila', async () => {
    let allow = false;
    const s = setup(() => (allow ? ok : definitive()));
    await s.queue.enqueue('os1', 'f1', blob(1), blob(2));
    await s.queue.settled();
    allow = true;
    s.queue.retryFailed();
    await s.queue.settled();
    expect(s.queue.has('os1', 'f1')).toBe(false);
  });

  it('isFailed e retryOne: só a foto com erro volta para a fila', async () => {
    let allow = false;
    const s = setup(() => (allow ? ok : definitive()));
    await s.queue.enqueue('os1', 'f1', blob(1), blob(2));
    await s.queue.enqueue('os1', 'f2', blob(1), blob(2));
    await s.queue.settled();
    expect(s.queue.isFailed('os1', 'f1')).toBe(true);
    expect(s.queue.isFailed('os1', 'nada')).toBe(false);
    allow = true;
    s.queue.retryOne('os1', 'f1');
    await s.queue.settled();
    expect(s.queue.has('os1', 'f1')).toBe(false);
    expect(s.queue.isFailed('os1', 'f2')).toBe(true); // a outra segue com erro
  });

  it('descartar (cancel) foto com erro tira da fila e do disco', async () => {
    const s = setup(() => definitive());
    await s.queue.enqueue('os1', 'f1', blob(1), blob(2));
    await s.queue.settled();
    await s.queue.cancel('os1', 'f1');
    expect(s.queue.isFailed('os1', 'f1')).toBe(false);
    expect(s.store.size()).toBe(0);
  });

  it('cancelar tira da fila e do disco; durante o envio não ressuscita', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>(r => { release = r; });
    const s = setup(() => ok);
    const slow: PhotoUploader = async () => { await gate; return ok; };
    const q = new PhotoQueue({ store: s.store, uploader: slow, now: s.clock.now, timers: s.clock });
    await q.enqueue('os1', 'f1', blob(1), blob(2));
    await q.enqueue('os1', 'f2', blob(3), blob(4));
    await q.cancel('os1', 'f1');
    release();
    await q.settled();
    expect(q.has('os1', 'f1')).toBe(false);
    expect((await s.store.getAll()).map(x => x.id)).not.toContain(queueKey('os1', 'f1'));
  });

  it('cancelar a OS inteira (photoId nulo) leva todas as fotos dela', async () => {
    const s = setup(() => ok, { online: false });
    await s.queue.enqueue('os1', 'a', blob(1), blob(2));
    await s.queue.enqueue('os1', 'b', blob(1), blob(2));
    await s.queue.enqueue('os2', 'c', blob(1), blob(2));
    await s.queue.cancel('os1', null);
    expect(s.queue.count()).toBe(1);
    expect(s.store.size()).toBe(1);
  });

  it('o que ficou na fila na sessão anterior sobe ao carregar', async () => {
    const s = setup(() => ok, { online: false });
    await s.queue.enqueue('os1', 'f1', blob(1), blob(2));
    const calls: Call[] = [];
    const q2 = new PhotoQueue({
      store: s.store, now: s.clock.now, timers: s.clock,
      uploader: async (osId, photoId, thumb, b) => { calls.push({ osId, photoId, thumb, size: b.size }); return ok; },
    });
    await q2.load();
    await q2.settled();
    expect(calls).toHaveLength(2);
    expect(calls[0].size).toBe(3);
    expect(s.store.size()).toBe(0);
  });

  it('uploader que lança conta como erro temporário', async () => {
    const s = setup(() => ok);
    const boom: PhotoUploader = async () => { throw new TypeError('Failed to fetch'); };
    const q = new PhotoQueue({ store: s.store, uploader: boom, now: s.clock.now, timers: s.clock, onFailed: m => s.failed.push(String(m)) });
    await q.enqueue('os1', 'f1', blob(1), blob(2));
    await q.settled();
    expect(q.has('os1', 'f1')).toBe(true);
    expect(s.failed).toEqual([]);
    expect(s.clock.pendingTimers()).toBe(1);
  });
});

describe('PhotoQueue com IndexedDB (fake-indexeddb)', () => {
  it('os bytes sobrevivem a fechar e reabrir o banco, e depois sobem', async () => {
    const factory = new IDBFactory();
    const name = dbNameFor('ws', 'user');
    const clock = new FakeClock();

    const db1 = await openIdbDatabase(factory, name);
    const q1 = new PhotoQueue({ store: idbKv<QueuedPhoto>(db1, 'photoQueue'), uploader: async () => ok, now: clock.now, timers: clock, online: false });
    await q1.enqueue('os1', 'f1', blob(5), blob(6));
    q1.stop();
    db1.close();

    const db2 = await openIdbDatabase(factory, name);
    const sent: Call[] = [];
    const store2 = idbKv<QueuedPhoto>(db2, 'photoQueue');
    const q2 = new PhotoQueue({
      store: store2, now: clock.now, timers: clock, online: false,
      uploader: async (osId, photoId, thumb, b) => { sent.push({ osId, photoId, thumb, size: b.size }); return ok; },
    });
    await q2.load();
    expect(q2.has('os1', 'f1')).toBe(true);
    const local = q2.readLocal('os1', 'f1', false)!;
    expect(new Uint8Array(await local.arrayBuffer())[0]).toBe(5);
    q2.setOnline(true);
    await q2.settled();
    expect(sent.map(c => c.thumb)).toEqual([true, false]);
    expect(await store2.getAll()).toEqual([]);
    db2.close();
  });
});

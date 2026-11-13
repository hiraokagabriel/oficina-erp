import { describe, expect, it } from 'vitest';
import { PhotoQueue } from './photoQueue';
import type { QueuedPhoto } from './photoQueue';
import { memoryKv } from './kvStore';
import { PhotoThumbCache } from './photoCache';
import type { CachedThumb } from './photoCache';
import {
  classifyUploadError, createCloudPhotoTransport, createPhotoUploader, failedPhotoMessage, isNotFound, photoPath,
} from './photoTransport';
import type { PhotoStorageApi, StorageErrorLike } from './photoTransport';

const WS = '11111111-2222-3333-4444-555555555555';
const blob = (n: number): Blob => new Blob([new Uint8Array([n])], { type: 'image/jpeg' });

describe('photoPath', () => {
  it('segue o caminho aceito pelo bucket', () => {
    expect(photoPath(WS, 'os1', 'f1', false)).toBe(`${WS}/os1/f1.jpg`);
    expect(photoPath(WS, 'os1', 'f1', true)).toBe(`${WS}/os1/f1.t.jpg`);
    expect(photoPath(WS, 'os1', 'f1', true)).toMatch(/^[0-9a-f-]{36}\/[A-Za-z0-9-]{1,64}\/[A-Za-z0-9-]{1,64}(\.t)?\.jpg$/);
  });
});

describe('classifyUploadError', () => {
  it('sem erro e duplicado são sucesso (idempotente)', () => {
    expect(classifyUploadError(null)).toEqual({ ok: true });
    expect(classifyUploadError({ statusCode: '409', message: 'The resource already exists' })).toEqual({ ok: true });
    expect(classifyUploadError({ status: 400, statusCode: '409', message: 'Duplicate' })).toEqual({ ok: true });
    expect(classifyUploadError({ message: 'The resource already exists' })).toEqual({ ok: true });
  });

  it('rede, 5xx, 408, 429 e 401 são temporários', () => {
    for (const e of [
      { name: 'StorageUnknownError', message: 'Failed to fetch' },
      { statusCode: '500' }, { status: 503 }, { statusCode: '408' }, { statusCode: '429' }, { statusCode: '401' },
    ] as StorageErrorLike[]) {
      expect(classifyUploadError(e)).toMatchObject({ ok: false, kind: 'transient' });
    }
  });

  it('403, 400, 413 e 415 são definitivos', () => {
    for (const e of [
      { statusCode: '403', message: 'new row violates row-level security policy' },
      { statusCode: '413', message: 'The object exceeded the maximum allowed size' },
      { statusCode: '415', message: 'mime type image/png is not supported' },
      { status: 400, statusCode: '400', message: 'Invalid' },
    ] as StorageErrorLike[]) {
      expect(classifyUploadError(e)).toMatchObject({ ok: false, kind: 'definitive' });
    }
  });

  it('isNotFound reconhece 404 e a mensagem', () => {
    expect(isNotFound({ statusCode: '404' })).toBe(true);
    expect(isNotFound({ status: 400, message: 'Object not found' })).toBe(true);
    expect(isNotFound({ statusCode: '500', message: 'boom' })).toBe(false);
  });

  it('failedPhotoMessage dá texto simples', () => {
    expect(failedPhotoMessage('The object exceeded the maximum allowed size')).toContain('grande demais');
    expect(failedPhotoMessage('mime type not supported')).toContain('formato');
    expect(failedPhotoMessage('new row violates row-level security policy')).toContain('permissão');
    expect(failedPhotoMessage('???')).toContain('Tire a foto de novo');
  });
});

function fakeStorage() {
  const objects = new Map<string, Blob>();
  const uploads: { path: string; upsert?: never }[] = [];
  let uploadError: StorageErrorLike | null = null;
  let throwNetwork = false;
  const api: PhotoStorageApi = {
    async upload(path, body) {
      uploads.push({ path });
      if (throwNetwork) throw new TypeError('Failed to fetch');
      if (uploadError) return { error: uploadError };
      if (objects.has(path)) return { error: { statusCode: '409', message: 'The resource already exists' } };
      objects.set(path, body);
      return { error: null };
    },
    async download(path) {
      const b = objects.get(path);
      return b ? { data: b, error: null } : { data: null, error: { status: 400, statusCode: '404', message: 'Object not found' } };
    },
  };
  return { api, objects, uploads, setError: (e: StorageErrorLike | null) => { uploadError = e; }, setNetwork: (v: boolean) => { throwNetwork = v; } };
}

function build(storage: ReturnType<typeof fakeStorage>, workshopId = WS, online = true) {
  let t = 0;
  const timers = { set: () => 0, clear: () => undefined };
  const queue = new PhotoQueue({
    store: memoryKv<QueuedPhoto>(q => q.id), uploader: createPhotoUploader(storage.api, workshopId),
    now: () => t, timers, online,
  });
  const cache = new PhotoThumbCache(memoryKv<CachedThumb>(c => c.key), () => ++t);
  return { queue, cache, transport: createCloudPhotoTransport({ storage: storage.api, workshopId, queue, cache }) };
}

describe('transporte da nuvem', () => {
  it('save: grava no aparelho, sobe pelos caminhos certos e a leitura local vale até subir', async () => {
    const st = fakeStorage();
    const { transport, queue } = build(st, WS, false);
    await transport.save('nuvem:x', 'os1', 'f1', blob(1), blob(2));
    expect(transport.isPending?.('os1', 'f1')).toBe(true);
    expect(await transport.read('nuvem:x', 'os1', 'f1', false)).not.toBeNull(); // do blob local, sem rede
    queue.setOnline(true);
    await queue.settled();
    expect([...st.objects.keys()].sort()).toEqual([`${WS}/os1/f1.jpg`, `${WS}/os1/f1.t.jpg`]);
    expect(transport.isPending?.('os1', 'f1')).toBe(false);
  });

  it('outro aparelho: lê do Storage, 404 vira null e a miniatura fica no cache', async () => {
    const st = fakeStorage();
    st.objects.set(`${WS}/os1/f1.t.jpg`, blob(9));
    const { transport } = build(st);
    expect(await transport.read('d', 'os1', 'f1', false)).toBeNull(); // original ainda não chegou
    const t1 = await transport.read('d', 'os1', 'f1', true);
    expect(t1).not.toBeNull();
    st.objects.clear(); // sem Storage: a miniatura vem do cache
    expect(await transport.read('d', 'os1', 'f1', true)).not.toBeNull();
  });

  it('erro de leitura que não é 404 propaga', async () => {
    const st = fakeStorage();
    st.api.download = async () => ({ data: null, error: { statusCode: '500', message: 'boom' } });
    const { transport } = build(st);
    await expect(transport.read('d', 'os1', 'f1', false)).rejects.toThrow('boom');
  });

  it('trash só cancela o envio pendente: objetos já enviados ficam', async () => {
    const st = fakeStorage();
    const { transport, queue } = build(st);
    await transport.save('d', 'os1', 'f1', blob(1), blob(2));
    await queue.settled();
    const before = st.objects.size;
    await transport.trash('d', 'os1', 'f1');
    await transport.trash('d', 'os1', null);
    expect(st.objects.size).toBe(before);
    // pendente (offline) é cancelado
    const off = build(fakeStorage(), WS, false);
    await off.transport.save('d', 'os9', 'f9', blob(1), blob(2));
    await off.transport.trash('d', 'os9', 'f9');
    expect(off.transport.isPending?.('os9', 'f9')).toBe(false);
  });

  it('foto com erro definitivo: isFailed, retry e trash (descartar)', async () => {
    const st = fakeStorage();
    st.setError({ statusCode: '403', message: 'new row violates row-level security policy' });
    const { transport, queue } = build(st);
    await transport.save('d', 'os1', 'f1', blob(1), blob(2));
    await queue.settled();
    expect(transport.isFailed?.('os1', 'f1')).toBe(true);
    st.setError(null);
    transport.retry?.('os1', 'f1');
    await queue.settled();
    expect(transport.isPending?.('os1', 'f1')).toBe(false);
    st.setError({ statusCode: '403', message: 'x' });
    await transport.save('d', 'os1', 'f2', blob(1), blob(2));
    await queue.settled();
    await transport.trash('d', 'os1', 'f2');
    expect(transport.isFailed?.('os1', 'f2')).toBe(false);
  });

  it('save recusa ids fora do formato do bucket', async () => {
    const { transport } = build(fakeStorage());
    await expect(transport.save('d', '../x', 'f1', blob(1), blob(2))).rejects.toThrow('inválido');
    await expect(transport.save('d', 'os1', 'f 1', blob(1), blob(2))).rejects.toThrow('inválido');
  });

  it('reenvio de objeto que já existe (409) conta como sucesso', async () => {
    const st = fakeStorage();
    st.objects.set(`${WS}/os1/f1.t.jpg`, blob(1));
    st.objects.set(`${WS}/os1/f1.jpg`, blob(1));
    const { transport, queue } = build(st);
    await transport.save('d', 'os1', 'f1', blob(1), blob(2));
    await queue.settled();
    expect(queue.has('os1', 'f1')).toBe(false);
    expect(queue.failedCount()).toBe(0);
  });

  it('o envio usa `upsert:false` por construção: nunca sobrescreve', async () => {
    // o adaptador do supabase-js (`supabaseStorageApi`) passa { upsert: false, contentType: 'image/jpeg' }; a RLS não tem update.
    const st = fakeStorage();
    st.objects.set(`${WS}/os1/f1.jpg`, blob(1));
    const up = createPhotoUploader(st.api, WS);
    expect(await up('os1', 'f1', false, blob(2))).toEqual({ ok: true });
    expect(new Uint8Array(await st.objects.get(`${WS}/os1/f1.jpg`)!.arrayBuffer())[0]).toBe(1);
  });

  it('falha de rede no upload vira temporária; 403 definitiva', async () => {
    const st = fakeStorage();
    const up = createPhotoUploader(st.api, WS);
    st.setNetwork(true);
    expect(await up('os1', 'f1', true, blob(1))).toMatchObject({ ok: false, kind: 'transient' });
    st.setNetwork(false);
    st.setError({ statusCode: '403', message: 'new row violates row-level security policy' });
    expect(await up('os1', 'f1', true, blob(1))).toMatchObject({ ok: false, kind: 'definitive' });
  });
});

describe('PhotoThumbCache (LRU)', () => {
  it('passando do limite de itens, sai a menos usada', async () => {
    let t = 0;
    const cache = new PhotoThumbCache(memoryKv<CachedThumb>(c => c.key), () => ++t, 2, 1_000_000);
    await cache.put('a', blob(1));
    await cache.put('b', blob(2));
    await cache.get('a'); // a fica mais recente
    await cache.put('c', blob(3));
    expect(await cache.get('b')).toBeNull();
    expect(await cache.get('a')).not.toBeNull();
    expect(await cache.get('c')).not.toBeNull();
  });

  it('respeita o limite de bytes', async () => {
    let t = 0;
    const cache = new PhotoThumbCache(memoryKv<CachedThumb>(c => c.key), () => ++t, 100, 2);
    await cache.put('a', blob(1));
    await cache.put('b', blob(2));
    await cache.put('c', blob(3));
    expect(await cache.get('a')).toBeNull();
    expect(await cache.get('b')).not.toBeNull();
    expect(await cache.get('c')).not.toBeNull();
  });
});

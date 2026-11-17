import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acquirePhotoUrl, clearPhotoUrlCache, createTauriTransport, isPhotoFailed, isPhotoPending, retryPhoto, isPhotoStoreAvailable, newPhotoId, pendingPhotoCount, photoStoreKind,
  releasePhotoUrl, savePhoto, setPhotoTransport, trashOSPhotos, trashPhoto,
} from './photoStore';
import type { InvokeFn, PhotoTransport } from './photoStore';
import { MAX_PHOTOS_PER_OS } from './photos';
import { appendPhotoMetas } from './photosView';
import type { OSPhoto } from '../types';

// photoStore com transporte falso (nuvem): as funções delegam ao transporte registrado, a contagem de uso da
// object URL continua valendo e o modo arquivo (invoke) segue igual.

interface Rec { fn: string; args: unknown[] }

function fakeTransport(files: Map<string, Blob> = new Map()) {
  const log: Rec[] = [];
  const t: PhotoTransport = {
    kind: 'cloud',
    async save(dbPath, osId, photoId, full, thumb) { log.push({ fn: 'save', args: [dbPath, osId, photoId, full.size, thumb.size] }); files.set(`${osId}/${photoId}/f`, full); files.set(`${osId}/${photoId}/t`, thumb); },
    async read(dbPath, osId, photoId, thumb) { log.push({ fn: 'read', args: [dbPath, osId, photoId, thumb] }); return files.get(`${osId}/${photoId}/${thumb ? 't' : 'f'}`) ?? null; },
    async trash(dbPath, osId, photoId) { log.push({ fn: 'trash', args: [dbPath, osId, photoId] }); },
    isPending: (osId, photoId) => osId === 'os1' && photoId === 'pend',
  };
  return { t, log, files };
}

let seq = 0;
beforeEach(() => {
  seq = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:fake/${++seq}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});
afterEach(() => {
  setPhotoTransport(null);
  clearPhotoUrlCache();
  vi.restoreAllMocks();
});

describe('photoStore com transporte', () => {
  it('registrar o transporte liga o armazenamento (nuvem) e removê-lo desliga', () => {
    expect(isPhotoStoreAvailable()).toBe(false);
    expect(photoStoreKind()).toBe('none');
    setPhotoTransport(fakeTransport().t);
    expect(isPhotoStoreAvailable()).toBe(true);
    expect(photoStoreKind()).toBe('cloud');
    setPhotoTransport(null);
    expect(isPhotoStoreAvailable()).toBe(false);
  });

  it('savePhoto e trash delegam ao transporte registrado', async () => {
    const { t, log } = fakeTransport();
    setPhotoTransport(t);
    await savePhoto('nuvem:w', 'os1', 'f1', new Blob(['abc']), new Blob(['z']));
    await trashPhoto('nuvem:w', 'os1', 'f1');
    await trashOSPhotos('nuvem:w', 'os1');
    expect(log).toEqual([
      { fn: 'save', args: ['nuvem:w', 'os1', 'f1', 3, 1] },
      { fn: 'trash', args: ['nuvem:w', 'os1', 'f1'] },
      { fn: 'trash', args: ['nuvem:w', 'os1', null] },
    ]);
  });

  it('acquirePhotoUrl: lê pelo transporte, devolve null se ainda não chegou e conta o uso', async () => {
    const { t, log } = fakeTransport();
    setPhotoTransport(t);
    expect(await acquirePhotoUrl('d', 'os1', 'f1', true)).toBeNull();
    await savePhoto('d', 'os1', 'f1', new Blob(['a']), new Blob(['b']));
    const a = await acquirePhotoUrl('d', 'os1', 'f1', true);
    const b = await acquirePhotoUrl('d', 'os1', 'f1', true);
    expect(a).toBe('blob:fake/1');
    expect(b).toBe(a);
    expect(log.filter(r => r.fn === 'read')).toHaveLength(2); // o 2º acquire veio do cache de URLs
    releasePhotoUrl(a as string);
    releasePhotoUrl(b as string);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled(); // sem uso fica guardada; só o limite ou a limpeza revogam
    clearPhotoUrlCache();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(a);
  });

  it('erro de leitura que não é "não chegou" propaga', async () => {
    const { t } = fakeTransport();
    t.read = async () => { throw new Error('sem rede'); };
    setPhotoTransport(t);
    await expect(acquirePhotoUrl('d', 'os1', 'f1', true)).rejects.toThrow('sem rede');
  });

  it('trocar ou remover o transporte limpa o cache de URLs; registrar o mesmo não', async () => {
    const { t } = fakeTransport(new Map([['os1/f1/t', new Blob(['x'])]]));
    setPhotoTransport(t);
    const a = await acquirePhotoUrl('d', 'os1', 'f1', true);
    setPhotoTransport(t);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    setPhotoTransport(null);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(a);
  });

  it('pendingPhotoCount pergunta ao transporte e é 0 sem ele', () => {
    expect(pendingPhotoCount()).toBe(0);
    setPhotoTransport({ ...fakeTransport().t, pendingCount: () => 3 });
    expect(pendingPhotoCount()).toBe(3);
  });

  it('isPhotoPending pergunta ao transporte', () => {
    setPhotoTransport(fakeTransport().t);
    expect(isPhotoPending('os1', 'pend')).toBe(true);
    expect(isPhotoPending('os1', 'outra')).toBe(false);
    setPhotoTransport(null);
    expect(isPhotoPending('os1', 'pend')).toBe(false);
  });

  it('isPhotoFailed e retryPhoto falam com o transporte', () => {
    const { t } = fakeTransport();
    const retried: string[] = [];
    t.isFailed = (osId, photoId) => osId === 'os1' && photoId === 'bad';
    t.retry = (osId, photoId) => { retried.push(`${osId}/${photoId}`); };
    setPhotoTransport(t);
    expect(isPhotoFailed('os1', 'bad')).toBe(true);
    expect(isPhotoFailed('os1', 'ok')).toBe(false);
    retryPhoto('os1', 'bad');
    expect(retried).toEqual(['os1/bad']);
    setPhotoTransport(null);
    expect(isPhotoFailed('os1', 'bad')).toBe(false);
    expect(() => retryPhoto('os1', 'bad')).not.toThrow();
  });

  it('o parâmetro explícito vence o transporte registrado (modo arquivo continua igual)', async () => {
    const reg = fakeTransport();
    setPhotoTransport(reg.t);
    const calls: string[] = [];
    const invoke = (async (cmd: string) => { calls.push(cmd); return { success: true, message: 'ok' }; }) as InvokeFn;
    await savePhoto('C:\\db\\database.json', 'os1', 'f1', new Blob(['a']), new Blob(['b']), invoke);
    await trashPhoto('C:\\db\\database.json', 'os1', 'f1', invoke);
    expect(calls).toEqual(['save_photo', 'trash_photos']);
    expect(reg.log).toEqual([]);
  });

  it('createTauriTransport lê not_found como null', async () => {
    const t = createTauriTransport((async () => { throw 'not_found'; }) as InvokeFn);
    expect(await t.read('d', 'o', 'f', true)).toBeNull();
  });

  it('o limite de 20 fotos por OS continua valendo com ids da nuvem', () => {
    const metas: OSPhoto[] = Array.from({ length: MAX_PHOTOS_PER_OS + 3 }, () => ({ id: newPhotoId(), createdAt: '2026-01-01T12:00:00.000Z' }));
    const r = appendPhotoMetas([], metas);
    expect(r.list).toHaveLength(20);
    expect(r.recusadas).toHaveLength(3);
  });
});

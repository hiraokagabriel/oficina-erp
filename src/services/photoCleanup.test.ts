import { describe, it, expect, vi } from 'vitest';
import type { InvokeFn } from './photoStore';
import type { OSPhoto } from '../types';
import { trashDeletedOSPhotos, trashRemovedPhotos } from './photoCleanup';

const ph = (id: string): OSPhoto => ({ id, createdAt: '2026-05-03T15:00:00.000Z' });

const okInvoke = () => {
  const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
  const invoke = (async (cmd: string, args?: Record<string, unknown>) => {
    calls.push({ cmd, args });
    return { success: true, message: '' };
  }) as InvokeFn;
  return { invoke, calls };
};

describe('trashRemovedPhotos', () => {
  it('manda só as que saíram, uma a uma', async () => {
    const { invoke, calls } = okInvoke();
    await trashRemovedPhotos('db', 'os1', [ph('a'), ph('b')], [ph('b')], true, invoke);
    expect(calls).toEqual([{ cmd: 'trash_photos', args: { dbPath: 'db', osId: 'os1', photoId: 'a' } }]);
  });
  it('não faz nada fora do Tauri ou sem remoção', async () => {
    const { invoke, calls } = okInvoke();
    await trashRemovedPhotos('db', 'os1', [ph('a')], [], false, invoke);
    await trashRemovedPhotos('db', 'os1', [ph('a')], [ph('a')], true, invoke);
    expect(calls).toEqual([]);
  });
  it('falha vira aviso e segue com as outras', async () => {
    const warn = vi.fn();
    let n = 0;
    const invoke = (async () => { n += 1; if (n === 1) throw new Error('disco'); return { success: true, message: '' }; }) as InvokeFn;
    await trashRemovedPhotos('db', 'os1', [ph('a'), ph('b')], [], true, invoke, warn);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(n).toBe(2);
  });
});

describe('trashDeletedOSPhotos', () => {
  it('manda a OS inteira (photoId nulo)', async () => {
    const { invoke, calls } = okInvoke();
    await trashDeletedOSPhotos('db', { id: 'os1', photos: [ph('a')] }, true, invoke);
    expect(calls).toEqual([{ cmd: 'trash_photos', args: { dbPath: 'db', osId: 'os1', photoId: null } }]);
  });
  it('OS sem fotos ou fora do Tauri: nada', async () => {
    const { invoke, calls } = okInvoke();
    await trashDeletedOSPhotos('db', { id: 'os1' }, true, invoke);
    await trashDeletedOSPhotos('db', { id: 'os1', photos: [ph('a')] }, false, invoke);
    expect(calls).toEqual([]);
  });
  it('falha não propaga', async () => {
    const warn = vi.fn();
    const invoke = (async () => ({ success: false, message: 'erro' })) as InvokeFn;
    await expect(trashDeletedOSPhotos('db', { id: 'os1', photos: [ph('a')] }, true, invoke, warn)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_CACHED_PHOTO_URLS,
  PHOTO_NOT_FOUND,
  blobToByteArray,
  clearPhotoUrlCache,
  isPhotoStoreAvailable,
  newPhotoId,
  acquirePhotoUrl,
  releasePhotoUrl,
  savePhoto,
  trashOSPhotos,
  trashPhoto,
  type InvokeFn,
} from './photoStore';
import { isValidPhotoId } from './photos';
import { assertAcceptableImage } from '../utils/imageCompress';

type Call = { cmd: string; args?: Record<string, unknown> };

const fake = (impl: (cmd: string, args?: Record<string, unknown>) => unknown): { invoke: InvokeFn; calls: Call[] } => {
  const calls: Call[] = [];
  const invoke = (async (cmd: string, args?: Record<string, unknown>) => {
    calls.push({ cmd, args });
    return impl(cmd, args);
  }) as InvokeFn;
  return { invoke, calls };
};

let seq = 0;
beforeEach(() => {
  seq = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:fake/${++seq}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});
afterEach(() => {
  clearPhotoUrlCache();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('savePhoto', () => {
  it('envia bytes como number[] e nomes camelCase', async () => {
    const { invoke, calls } = fake(() => ({ success: true, message: 'ok' }));
    await savePhoto('C:\\db\\database.json', 'os1', 'f1', new Blob([new Uint8Array([1, 2, 3])]), new Blob([new Uint8Array([9])]), invoke);
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe('save_photo');
    expect(calls[0].args).toEqual({ dbPath: 'C:\\db\\database.json', osId: 'os1', photoId: 'f1', full: [1, 2, 3], thumb: [9] });
    expect(Array.isArray(calls[0].args?.full)).toBe(true);
  });

  it('lança com a mensagem quando success=false', async () => {
    const { invoke } = fake(() => ({ success: false, message: 'Erro ao salvar a foto: x' }));
    await expect(savePhoto('d', 'o', 'f', new Blob(['a']), new Blob(['b']), invoke)).rejects.toThrow('Erro ao salvar a foto: x');
  });
});

describe('blobToByteArray', () => {
  it('converte blob em number[]', async () => {
    expect(await blobToByteArray(new Blob([new Uint8Array([0, 255, 7])]))).toEqual([0, 255, 7]);
  });
});

describe('acquirePhotoUrl', () => {
  it('caminho feliz: ArrayBuffer vira object URL', async () => {
    const { invoke, calls } = fake(() => new Uint8Array([1, 2]).buffer);
    const url = await acquirePhotoUrl('d', 'o', 'f', true, invoke);
    expect(url).toBe('blob:fake/1');
    expect(calls[0]).toEqual({ cmd: 'read_photo', args: { dbPath: 'd', osId: 'o', photoId: 'f', thumb: true } });
  });

  it('aceita number[] como resposta', async () => {
    const { invoke } = fake(() => [1, 2, 3]);
    expect(await acquirePhotoUrl('d', 'o', 'f', false, invoke)).toBe('blob:fake/1');
  });

  it('usa cache: segunda leitura não chama invoke', async () => {
    const { invoke, calls } = fake(() => new ArrayBuffer(2));
    const a = await acquirePhotoUrl('d', 'o', 'f', true, invoke);
    const b = await acquirePhotoUrl('d', 'o', 'f', true, invoke);
    expect(a).toBe(b);
    expect(calls).toHaveLength(1);
    await acquirePhotoUrl('d', 'o', 'f', false, invoke);
    expect(calls).toHaveLength(2);
  });

  it('not_found (string) devolve null e não guarda cache', async () => {
    const { invoke, calls } = fake(() => {
      throw PHOTO_NOT_FOUND;
    });
    expect(await acquirePhotoUrl('d', 'o', 'f', true, invoke)).toBeNull();
    expect(await acquirePhotoUrl('d', 'o', 'f', true, invoke)).toBeNull();
    expect(calls).toHaveLength(2);
  });

  it('not_found como Error também devolve null', async () => {
    const { invoke } = fake(() => {
      throw new Error('not_found');
    });
    expect(await acquirePhotoUrl('d', 'o', 'f', true, invoke)).toBeNull();
  });

  it('outro erro propaga', async () => {
    const { invoke } = fake(() => {
      throw 'ler foto: acesso negado';
    });
    await expect(acquirePhotoUrl('d', 'o', 'f', true, invoke)).rejects.toBe('ler foto: acesso negado');
  });

  it('erro parecido com not_found (não exato) propaga', async () => {
    const { invoke } = fake(() => {
      throw 'not_found: x';
    });
    await expect(acquirePhotoUrl('d', 'o', 'f', true, invoke)).rejects.toBeDefined();
  });

  it('limite do cache revoga as mais antigas SEM uso', async () => {
    const { invoke } = fake(() => new ArrayBuffer(1));
    for (let i = 0; i < MAX_CACHED_PHOTO_URLS + 2; i++) {
      const u = await acquirePhotoUrl('d', 'o', `f${i}`, true, invoke);
      releasePhotoUrl(u as string);
    }
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake/1');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake/2');
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it('limite do cache nunca revoga URL em uso', async () => {
    const { invoke } = fake(() => new ArrayBuffer(1));
    for (let i = 0; i < MAX_CACHED_PHOTO_URLS + 3; i++) await acquirePhotoUrl('d', 'o', `f${i}`, true, invoke);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('chave do cache inclui o banco', async () => {
    const { invoke, calls } = fake(() => new ArrayBuffer(1));
    const a = await acquirePhotoUrl('d1', 'o', 'f', true, invoke);
    const b = await acquirePhotoUrl('d2', 'o', 'f', true, invoke);
    expect(a).not.toBe(b);
    expect(calls).toHaveLength(2);
  });

  it('leituras simultâneas da mesma foto dividem a URL e contam as duas referências', async () => {
    const { invoke } = fake(() => new ArrayBuffer(1));
    const [a, b] = await Promise.all([
      acquirePhotoUrl('d', 'o', 'f', true, invoke),
      acquirePhotoUrl('d', 'o', 'f', true, invoke),
    ]);
    expect(a).toBe(b);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });
});

describe('releasePhotoUrl', () => {
  it('liberar não revoga; URL sem uso continua em cache e é reaproveitada', async () => {
    const { invoke, calls } = fake(() => new ArrayBuffer(1));
    const url = await acquirePhotoUrl('d', 'o', 'f', true, invoke);
    releasePhotoUrl(url as string);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(await acquirePhotoUrl('d', 'o', 'f', true, invoke)).toBe(url);
    expect(calls).toHaveLength(1);
  });

  it('dois donos: um liberar não derruba o outro', async () => {
    const { invoke } = fake(() => new ArrayBuffer(1));
    const u1 = await acquirePhotoUrl('d', 'o', 'f', true, invoke);
    const u2 = await acquirePhotoUrl('d', 'o', 'f', true, invoke);
    releasePhotoUrl(u1 as string);
    for (let i = 0; i < MAX_CACHED_PHOTO_URLS + 1; i++) await acquirePhotoUrl('d', 'o', `x${i}`, true, invoke);
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith(u2);
  });

  it('URL desconhecida é ignorada', () => {
    expect(() => releasePhotoUrl('blob:nada')).not.toThrow();
  });

  it('clearPhotoUrlCache revoga tudo', async () => {
    const { invoke } = fake(() => new ArrayBuffer(1));
    const url = await acquirePhotoUrl('d', 'o', 'f', true, invoke);
    clearPhotoUrlCache();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
  });
});

describe('trash', () => {
  it('trashPhoto manda photoId', async () => {
    const { invoke, calls } = fake(() => ({ success: true, message: '2 arquivo(s)' }));
    await trashPhoto('d', 'o', 'f', invoke);
    expect(calls[0]).toEqual({ cmd: 'trash_photos', args: { dbPath: 'd', osId: 'o', photoId: 'f' } });
  });

  it('trashOSPhotos manda photoId null', async () => {
    const { invoke, calls } = fake(() => ({ success: true, message: 'ok' }));
    await trashOSPhotos('d', 'o', invoke);
    expect(calls[0].args).toEqual({ dbPath: 'd', osId: 'o', photoId: null });
  });

  it('falha lança', async () => {
    const { invoke } = fake(() => ({ success: false, message: 'Erro ao mover para a lixeira: x' }));
    await expect(trashPhoto('d', 'o', 'f', invoke)).rejects.toThrow('lixeira');
    await expect(trashOSPhotos('d', 'o', invoke)).rejects.toThrow('lixeira');
  });
});

describe('isPhotoStoreAvailable', () => {
  it('false sem window', () => {
    vi.stubGlobal('window', undefined);
    expect(isPhotoStoreAvailable()).toBe(false);
  });
  it('false em window sem Tauri', () => {
    vi.stubGlobal('window', {});
    expect(isPhotoStoreAvailable()).toBe(false);
  });
  it('true com __TAURI_INTERNALS__', () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    expect(isPhotoStoreAvailable()).toBe(true);
  });
});

describe('newPhotoId', () => {
  it('gera ids válidos e distintos', () => {
    const a = newPhotoId();
    const b = newPhotoId();
    expect(isValidPhotoId(a)).toBe(true);
    expect(a).not.toBe(b);
  });
});

describe('assertAcceptableImage (imageCompress)', () => {
  it('aceita JPEG', () => {
    expect(() => assertAcceptableImage({ type: 'image/jpeg', size: 1000 })).not.toThrow();
  });
  it('recusa HEIC com mensagem clara', () => {
    expect(() => assertAcceptableImage({ type: 'image/heic', size: 1000 })).toThrow('iPhone');
  });
  it('recusa arquivo grande', () => {
    expect(() => assertAcceptableImage({ type: 'image/png', size: 30 * 1024 * 1024 })).toThrow('25 MB');
  });
});

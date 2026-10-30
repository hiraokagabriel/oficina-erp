import { describe, expect, it } from 'vitest';
import { resolveSavedPhotos } from './photoDraft';
import type { OSPhoto } from '../types';

const p = (id: string): OSPhoto => ({ id, createdAt: '2026-01-01T00:00:00.000Z' });

describe('resolveSavedPhotos', () => {
  it('rascunho manda sobre as fotos mantidas', () => {
    expect(resolveSavedPhotos([p('a')], [p('b')])).toEqual([p('b')]);
  });
  it('rascunho vazio remove o campo', () => {
    expect(resolveSavedPhotos([p('a')], [])).toBeUndefined();
  });
  it('sem rascunho mantém as da OS', () => {
    expect(resolveSavedPhotos([p('a')], undefined)).toEqual([p('a')]);
  });
  it('nada em lugar nenhum: undefined', () => {
    expect(resolveSavedPhotos(undefined, undefined)).toBeUndefined();
    expect(resolveSavedPhotos([], undefined)).toBeUndefined();
  });
  it('não devolve a mesma referência', () => {
    const d = [p('a')];
    expect(resolveSavedPhotos(undefined, d)).not.toBe(d);
  });
});

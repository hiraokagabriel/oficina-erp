import { describe, expect, it } from 'vitest';
import { ESTIMATED_BYTES_PER_PHOTO, STORAGE_LIMIT_BYTES, formatBytes, photoSpaceUsage } from './photoSpace';

const os = (n: number) => ({ photos: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, createdAt: '2026-01-01T12:00:00.000Z' })) });

describe('photoSpaceUsage', () => {
  it('sem fotos: zero e sem aviso', () => {
    expect(photoSpaceUsage([{}, { photos: undefined }])).toMatchObject({ photos: 0, usedBytes: 0, percent: 0, warn: false });
  });

  it('3.000 fotos ≈ 1 GB', () => {
    const u = photoSpaceUsage([os(1500), os(1500)]);
    expect(u.percent).toBe(100);
    expect(u.usedBytes).toBeCloseTo(STORAGE_LIMIT_BYTES, -3);
  });

  it('avisa a partir de 80% (2.400 fotos), não antes', () => {
    expect(photoSpaceUsage([os(2399)]).warn).toBe(false);
    expect(photoSpaceUsage([os(2400)]).warn).toBe(true);
    expect(photoSpaceUsage([os(2400)]).percent).toBe(80);
  });

  it('passando de 1 GB o percentual passa de 100', () => {
    expect(photoSpaceUsage([os(3300)]).percent).toBe(110);
  });

  it('tamanho médio coerente com a decisão (3.000 fotos por GB)', () => {
    expect(Math.round(STORAGE_LIMIT_BYTES / ESTIMATED_BYTES_PER_PHOTO)).toBe(3000);
  });
});

describe('formatBytes', () => {
  it('MB e GB em pt-BR', () => {
    expect(formatBytes(820 * 1024 * 1024)).toBe('820 MB');
    expect(formatBytes(STORAGE_LIMIT_BYTES)).toBe('1,0 GB');
  });
});

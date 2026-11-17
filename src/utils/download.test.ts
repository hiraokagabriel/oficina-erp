import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob, downloadTextFile, REVOKE_AFTER_MS } from './download';

interface FakeAnchor { href: string; download: string; click: ReturnType<typeof vi.fn> }
let anchor: FakeAnchor;
let revoke: ReturnType<typeof vi.fn>;
let created: Blob[];

beforeEach(() => {
  vi.useFakeTimers();
  anchor = { href: '', download: '', click: vi.fn() };
  created = [];
  revoke = vi.fn();
  vi.stubGlobal('document', { createElement: vi.fn(() => anchor) });
  vi.stubGlobal('URL', { createObjectURL: vi.fn((b: Blob) => { created.push(b); return 'blob:fake'; }), revokeObjectURL: revoke });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('downloadBlob', () => {
  it('clica no link com nome e URL; revoga só depois de 60 s', () => {
    downloadBlob('a.bin', new Blob(['x']));
    expect(anchor.download).toBe('a.bin');
    expect(anchor.href).toBe('blob:fake');
    expect(anchor.click).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(REVOKE_AFTER_MS - 1);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revoke).toHaveBeenCalledWith('blob:fake');
  });
});

describe('downloadTextFile', () => {
  it('cria o blob com o tipo e o texto exatos', async () => {
    downloadTextFile('x.csv', '\uFEFFa;b', 'text/csv');
    expect(anchor.download).toBe('x.csv');
    expect(created[0].type).toBe('text/csv');
    // text() descartaria o BOM; confere os bytes (EF BB BF = BOM UTF-8).
    const bytes = Array.from(new Uint8Array(await created[0].arrayBuffer()));
    expect(bytes).toEqual([0xef, 0xbb, 0xbf, 0x61, 0x3b, 0x62]);
  });
});

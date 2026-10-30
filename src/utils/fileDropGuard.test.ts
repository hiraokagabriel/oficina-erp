import { describe, expect, it } from 'vitest';
import { dragHasFiles, shouldBlockFileDrop } from './fileDropGuard';

describe('fileDropGuard', () => {
  it('detecta arquivos', () => {
    expect(dragHasFiles(['text/plain', 'Files'])).toBe(true);
    expect(dragHasFiles(['text/plain'])).toBe(false);
    expect(dragHasFiles(undefined)).toBe(false);
    expect(dragHasFiles(null)).toBe(false);
  });
  it('bloqueia arquivo solto fora da área de fotos', () => {
    expect(shouldBlockFileDrop(['Files'], false)).toBe(true);
  });
  it('não mexe dentro da área de fotos', () => {
    expect(shouldBlockFileDrop(['Files'], true)).toBe(false);
  });
  it('não mexe em arrasto sem arquivos (cartões do quadro, texto)', () => {
    expect(shouldBlockFileDrop(['text/plain'], false)).toBe(false);
    expect(shouldBlockFileDrop([], false)).toBe(false);
  });
});

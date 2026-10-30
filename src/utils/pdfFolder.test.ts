import { describe, it, expect, afterEach, vi } from 'vitest';
import { getPdfFolder, setPdfFolder } from './pdfFolder';

const mem = () => {
  const d: Record<string, string> = {};
  return {
    d,
    getItem: (k: string) => (k in d ? d[k] : null),
    setItem: (k: string, v: string) => { d[k] = v; },
    removeItem: (k: string) => { delete d[k]; },
  };
};

afterEach(() => vi.unstubAllGlobals());

describe('pdfFolder', () => {
  it('guarda e lê com a chave oficina_pdf_folder', () => {
    const s = mem();
    vi.stubGlobal('localStorage', s);
    expect(getPdfFolder()).toBe('');
    expect(setPdfFolder('  D:\\PDFs ')).toBe(true);
    expect(s.d['oficina_pdf_folder']).toBe('D:\\PDFs');
    expect(getPdfFolder()).toBe('D:\\PDFs');
  });
  it('vazio remove e volta ao padrão', () => {
    const s = mem();
    vi.stubGlobal('localStorage', s);
    setPdfFolder('D:\\X');
    setPdfFolder('  ');
    expect(getPdfFolder()).toBe('');
    expect('oficina_pdf_folder' in s.d).toBe(false);
  });
  it('storage bloqueado não quebra', () => {
    const boom = () => { throw new Error('bloqueado'); };
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom, removeItem: boom });
    expect(getPdfFolder()).toBe('');
    expect(setPdfFolder('D:\\X')).toBe(false);
  });
});

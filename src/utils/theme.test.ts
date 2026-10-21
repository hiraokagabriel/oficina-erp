import { describe, it, expect } from 'vitest';
import { parseTheme, readStoredTheme, writeStoredTheme, THEME_STORAGE_KEY } from './theme';

describe('tema salvo', () => {
  it('só aceita dark e pastel; o resto vira dark', () => {
    expect(parseTheme('pastel')).toBe('pastel');
    expect(parseTheme('dark')).toBe('dark');
    for (const v of [null, undefined, '', 'Pastel', 'light', 42, {}]) expect(parseTheme(v)).toBe('dark');
  });
  it('lê a chave oficina.theme', () => {
    const store = { getItem: (k: string) => (k === THEME_STORAGE_KEY ? 'pastel' : null) };
    expect(readStoredTheme(store)).toBe('pastel');
    expect(readStoredTheme({ getItem: () => null })).toBe('dark');
  });
  it('localStorage que lança ou ausente não quebra', () => {
    expect(readStoredTheme({ getItem: () => { throw new Error('bloqueado'); } })).toBe('dark');
    expect(readStoredTheme(null)).toBe('dark');
    expect(writeStoredTheme('pastel', { setItem: () => { throw new Error('cheio'); } })).toBe(false);
    expect(writeStoredTheme('pastel', null)).toBe(false);
  });
  it('grava a chave certa', () => {
    const saved: Record<string, string> = {};
    expect(writeStoredTheme('pastel', { setItem: (k, v) => { saved[k] = v; } })).toBe(true);
    expect(saved).toEqual({ 'oficina.theme': 'pastel' });
  });
});

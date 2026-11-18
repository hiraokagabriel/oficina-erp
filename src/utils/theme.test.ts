import { describe, it, expect } from 'vitest';
import { parseTheme, readStoredTheme, writeStoredTheme, THEME_STORAGE_KEY, readUserTheme, writeUserTheme, userThemeKey } from './theme';

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

describe('tema por pessoa (modo nuvem)', () => {
  const mem = (init: Record<string, string> = {}) => {
    const d = { ...init };
    return { d, getItem: (k: string) => d[k] ?? null, setItem: (k: string, v: string) => { d[k] = v; } };
  };
  it('lê o da pessoa; sem escolha usa o do aparelho; inválido também', () => {
    const s = mem({ 'oficina.theme': 'pastel', 'oficina.theme.u1': 'dark' });
    expect(readUserTheme('u1', s)).toBe('dark');
    expect(readUserTheme('u2', s)).toBe('pastel');
    expect(readUserTheme('u3', mem({ 'oficina.theme.u3': 'xx' }))).toBe('dark');
  });
  it('grava na chave da pessoa e no aparelho', () => {
    const s = mem();
    expect(writeUserTheme('u1', 'pastel', s)).toBe(true);
    expect(s.d['oficina.theme.u1']).toBe('pastel');
    expect(s.d['oficina.theme']).toBe('pastel');
    expect(userThemeKey('u1')).toBe('oficina.theme.u1');
  });
  it('armazenamento que lança não quebra', () => {
    const bad = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(readUserTheme('u1', bad)).toBe('dark');
    expect(writeUserTheme('u1', 'pastel', bad)).toBe(false);
  });
});

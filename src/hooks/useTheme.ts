import { useSyncExternalStore } from 'react';
import { Theme, applyTheme, readStoredTheme, writeStoredTheme } from '../utils/theme';

// Tema por computador (mesmo armazenamento de sempre: `oficina.theme` no localStorage). Um só estado para quem lê:
// a Config (App) e o menu da pessoa (barra do topo do modo nuvem) mudam e veem o mesmo valor.

let current: Theme | null = null;
const listeners = new Set<() => void>();

const snapshot = (): Theme => (current ??= readStoredTheme());
const subscribe = (cb: () => void): (() => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };

export function setTheme(t: Theme): void {
  current = t;
  writeStoredTheme(t);
  applyTheme(t);
  listeners.forEach(l => l());
}

export function useTheme(): [Theme, (t: Theme) => void] {
  return [useSyncExternalStore(subscribe, snapshot, snapshot), setTheme];
}

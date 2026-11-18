import { useSyncExternalStore } from 'react';
import { Theme, applyTheme, readStoredTheme, readUserTheme, writeStoredTheme, writeUserTheme } from '../utils/theme';

// Tema por computador (mesmo armazenamento de sempre: `oficina.theme` no localStorage). Um só estado para quem lê:
// a Config (App) e o menu da pessoa (barra do topo do modo nuvem) mudam e veem o mesmo valor.
// Modo nuvem: `setThemeUser(userId)` passa a valer por pessoa (chave com o userId, reserva = tema do aparelho).
// Modo arquivo nunca chama `setThemeUser`: comportamento de sempre.

let current: Theme | null = null;
let scopeUser: string | null = null;
const listeners = new Set<() => void>();

const snapshot = (): Theme => (current ??= readStoredTheme());
const subscribe = (cb: () => void): (() => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };

export function setTheme(t: Theme): void {
  current = t;
  if (scopeUser) writeUserTheme(scopeUser, t); else writeStoredTheme(t);
  applyTheme(t);
  listeners.forEach(l => l());
}

/** Troca a pessoa dona do tema (entrou, trocou de pessoa) ou volta ao tema do aparelho (`null`). */
export function setThemeUser(userId: string | null): void {
  if (scopeUser === userId) return;
  scopeUser = userId;
  current = userId ? readUserTheme(userId) : readStoredTheme();
  applyTheme(current);
  listeners.forEach(l => l());
}

export function useTheme(): [Theme, (t: Theme) => void] {
  return [useSyncExternalStore(subscribe, snapshot, snapshot), setTheme];
}

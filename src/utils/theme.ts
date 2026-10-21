// Tema por computador: fica no localStorage ("oficina.theme"), nunca no database.json.
// O index.html lê a mesma chave antes do primeiro desenho; aqui o React lê, grava e aplica.

export type Theme = 'dark' | 'pastel';

export const THEME_STORAGE_KEY = 'oficina.theme';
export const DEFAULT_THEME: Theme = 'dark';

const THEME_COLORS: Record<Theme, string> = { dark: '#0E0F12', pastel: '#F7F5FA' };

/** Só 'dark' e 'pastel' valem; qualquer outra coisa cai no escuro. */
export const parseTheme = (raw: unknown): Theme => (raw === 'pastel' || raw === 'dark' ? raw : DEFAULT_THEME);

type ReadableStorage = Pick<Storage, 'getItem'>;
type WritableStorage = Pick<Storage, 'setItem'>;

const defaultStorage = (): Storage | null => {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
};

/** Lê o tema salvo. localStorage pode lançar (bloqueado, modo privado): nesse caso volta o padrão. */
export const readStoredTheme = (storage: ReadableStorage | null = defaultStorage()): Theme => {
  try { return storage ? parseTheme(storage.getItem(THEME_STORAGE_KEY)) : DEFAULT_THEME; } catch { return DEFAULT_THEME; }
};

/** Grava o tema. Devolve false se não foi possível (o app segue funcionando só nesta sessão). */
export const writeStoredTheme = (theme: Theme, storage: WritableStorage | null = defaultStorage()): boolean => {
  try { if (!storage) return false; storage.setItem(THEME_STORAGE_KEY, theme); return true; } catch { return false; }
};

/** Aplica o tema no <html> e na cor da barra do sistema. */
export const applyTheme = (theme: Theme): void => {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
};

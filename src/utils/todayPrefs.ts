// Preferências deste PC (localStorage; nunca no banco). Toda leitura e escrita é protegida: pode falhar em janela privada.

export type HomeTab = 'HOJE' | 'OFICINA';

const HOME_KEY = 'oficina.homeTab';
const GUIDE_KEY = 'oficina.guideDismissed';
const PRINTED_KEY = 'oficina.printedOnce';

const read = (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string): void => { try { localStorage.setItem(key, value); } catch { /* sem armazenamento: segue sem lembrar */ } };

/** Padrão Oficina: só abre em Hoje quem escolheu. */
export const readHomeTab = (): HomeTab => (read(HOME_KEY) === 'HOJE' ? 'HOJE' : 'OFICINA');
export const writeHomeTab = (tab: HomeTab): void => write(HOME_KEY, tab);

export const readGuideDismissed = (): boolean => read(GUIDE_KEY) === '1';
export const writeGuideDismissed = (): void => write(GUIDE_KEY, '1');

export const readPrintedOnce = (): boolean => read(PRINTED_KEY) === '1';
export const markPrintedOnce = (): void => write(PRINTED_KEY, '1');

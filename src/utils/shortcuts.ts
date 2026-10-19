// Regras puras dos atalhos de teclado (sem React): decidem se o atalho pode agir.
export interface ShortcutTarget { tagName?: string; isContentEditable?: boolean }

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** F2 (Nova OS) só vale com o foco fora de campos de texto e sem nenhuma janela modal aberta. */
export const canTriggerNewOSShortcut = (target: ShortcutTarget | null | undefined, hasOpenModal: boolean): boolean => {
  if (hasOpenModal) return false;
  if (!target) return true;
  if (target.isContentEditable) return false;
  return !TYPING_TAGS.has((target.tagName ?? '').toUpperCase());
};

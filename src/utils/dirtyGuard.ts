// Regras puras da proteção contra perda de alterações nas janelas de edição.

export type CloseDecision = 'close' | 'confirm';

/** Janela suja pede confirmação; limpa fecha direto. */
export const decideClose = (dirty: boolean): CloseDecision => (dirty ? 'confirm' : 'close');

export type EscapeDecision = 'ignore' | 'dismiss-confirm' | 'request-close';

export interface EscapeInput {
  /** Outro tratador já usou o Esc (campo "novo item", lista aberta...). */
  defaultPrevented: boolean;
  /** Está compondo texto (IME): Esc cancela a composição, não a janela. */
  isComposing: boolean;
  /** O diálogo "Descartar alterações?" está aberto. */
  confirmOpen: boolean;
}

export const decideEscape = ({ defaultPrevented, isComposing, confirmOpen }: EscapeInput): EscapeDecision => {
  if (defaultPrevented || isComposing) return 'ignore';
  return confirmOpen ? 'dismiss-confirm' : 'request-close';
};

/**
 * Controle marcado com data-no-dirty (preferência de tela, não dado da janela, ex.: interruptor "Custos"):
 * mudar nele não conta como alteração. Aceita qualquer alvo com closest (Element do DOM).
 */
export const isNoDirtyTarget = (t: unknown): boolean => {
  const el = t as { closest?: (selector: string) => unknown } | null;
  return !!el && typeof el.closest === 'function' && el.closest('[data-no-dirty]') !== null;
};

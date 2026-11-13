// Fila de avisos. Lógica pura: o ToastContext só guarda o estado e gera os ids.
import type { ToastAction, ToastMessage, ToastType } from '../components/ui/ToastContainer';

/**
 * Acrescenta um aviso. Erro igual a outro erro ainda visível não empilha: o aviso existente ganha `count` ("3 vezes"),
 * para o usuário saber que aconteceu de novo (ex.: várias alterações recusadas pelo servidor) sem encher a tela.
 * Depois que o usuário fecha o anterior, o mesmo erro volta a aparecer. Sucesso e info sempre entram (somem sozinhos
 * pelo timer do ToastItem).
 */
export const pushToast = (
  prev: ToastMessage[],
  message: string,
  type: ToastType,
  id: string,
  action?: ToastAction,
): ToastMessage[] =>
  type === 'error' && prev.some((t) => t.type === 'error' && t.message === message)
    ? prev.map((t) => (t.type === 'error' && t.message === message ? { ...t, count: (t.count ?? 1) + 1 } : t))
    : [...prev, action ? { id, message, type, action } : { id, message, type }];

/** Texto do aviso: com repetição, "mensagem (3 vezes)". */
export const toastText = (t: Pick<ToastMessage, 'message' | 'count'>): string => (t.count && t.count > 1 ? `${t.message} (${t.count} vezes)` : t.message);

/** Sem ação: 4 s. Com ação: 8 s, para dar tempo de clicar. */
export const TOAST_DURATION_MS = 4000;
export const TOAST_DURATION_WITH_ACTION_MS = 8000;

/** Tempo até o aviso sumir sozinho, ou null se fica até o usuário fechar (erro, com ou sem ação). */
export const toastDurationMs = (toast: Pick<ToastMessage, 'type' | 'action'>): number | null => {
  if (toast.type === 'error') return null;
  return toast.action ? TOAST_DURATION_WITH_ACTION_MS : TOAST_DURATION_MS;
};

export const dropToast = (prev: ToastMessage[], id: string): ToastMessage[] => prev.filter((t) => t.id !== id);

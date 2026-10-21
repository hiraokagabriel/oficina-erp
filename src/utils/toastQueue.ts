// Fila de avisos. Lógica pura: o ToastContext só guarda o estado e gera os ids.
import type { ToastMessage, ToastType } from '../components/ui/ToastContainer';

/**
 * Acrescenta um aviso. Erro igual a outro erro ainda visível não empilha (ex.: nova tentativa de salvar
 * falhando); depois que o usuário fecha o anterior, o mesmo erro volta a aparecer. Sucesso e info sempre entram
 * (somem sozinhos pelo timer do ToastItem).
 */
export const pushToast = (prev: ToastMessage[], message: string, type: ToastType, id: string): ToastMessage[] =>
  type === 'error' && prev.some((t) => t.type === 'error' && t.message === message)
    ? prev
    : [...prev, { id, message, type }];

export const dropToast = (prev: ToastMessage[], id: string): ToastMessage[] => prev.filter((t) => t.id !== id);

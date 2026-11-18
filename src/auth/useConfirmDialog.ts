import { RefObject, useEffect } from 'react';
import { useTopmostEscape } from '../hooks/useTopmostEscape';

/**
 * Painel de confirmação que aparece no meio da tela (role="alertdialog"): ao abrir, leva o foco ao primeiro
 * campo ou botão habilitado; ao fechar, devolve o foco ao botão que abriu; Esc fecha só este painel.
 * O componente que usa o hook só existe enquanto o painel está aberto. Em ação sem volta, marque o botão seguro
 * com `data-initial-focus` para o foco começar nele (Enter repetido não confirma sem ler).
 */
export const useConfirmDialog = (ref: RefObject<HTMLElement | null>, onClose: () => void): void => {
  useTopmostEscape(true, onClose);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = ref.current;
    (root?.querySelector<HTMLElement>('[data-initial-focus]:not([disabled])')
      ?? root?.querySelector<HTMLElement>('input:not([disabled]), button:not([disabled])'))?.focus();
    return () => { if (previous && previous.isConnected) previous.focus(); };
  }, [ref]);
};

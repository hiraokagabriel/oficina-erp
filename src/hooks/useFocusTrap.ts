import { RefObject, useEffect } from 'react';
import { nextFocusIndex } from '../utils/focusTrap';

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]';

const listFocusable = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => {
    if (el.tabIndex < 0 || (el as HTMLInputElement).disabled) return false;
    return el.getClientRects().length > 0;
  });

/** Prende o Tab dentro de `ref` enquanto `active` e devolve o foco ao elemento anterior ao fechar. */
export const useFocusTrap = (active: boolean, ref: RefObject<HTMLElement | null>) => {
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      // Diálogo de confirmação aberto por cima (ele tem a própria armadilha de foco).
      const nested = e.target instanceof Element ? e.target.closest('[role="alertdialog"]') : null;
      if (nested && nested !== ref.current) return;
      const root = ref.current;
      if (!root) return;
      const items = listFocusable(root);
      if (items.length === 0) { e.preventDefault(); return; }
      const cur = items.indexOf(document.activeElement as HTMLElement);
      const edge = e.shiftKey ? cur <= 0 : cur === items.length - 1;
      // Só intercepta nas pontas (ou foco fora do modal); no meio, o Tab nativo segue a ordem natural.
      if (cur >= 0 && !edge) return;
      e.preventDefault();
      items[nextFocusIndex(items.length, cur, e.shiftKey)]?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previous && previous.isConnected) previous.focus();
    };
  }, [active, ref]);
};

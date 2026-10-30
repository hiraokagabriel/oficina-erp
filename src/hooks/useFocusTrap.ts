import { RefObject, useEffect } from 'react';
import { nextFocusIndex } from '../utils/focusTrap';

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]';

/** Dados mínimos de um candidato a foco, sem depender do DOM (testável). */
export interface TabCandidate<T> {
  ref: T;
  /** Já passou nos filtros: habilitado, visível e tabindex >= 0. */
  tabbable: boolean;
  radioName?: string;
  checked?: boolean;
}

/**
 * Mantém só o que o Tab nativo realmente alcança. Em grupo de radio (mesmo nome),
 * só o marcado entra; se nenhum estiver marcado, o primeiro do grupo.
 */
export const pickTabbable = <T,>(cands: TabCandidate<T>[]): T[] => {
  const live = cands.filter(c => c.tabbable);
  const groupPick = new Map<string, TabCandidate<T>>();
  for (const c of live) {
    if (c.radioName === undefined || c.radioName === '') continue;
    const cur = groupPick.get(c.radioName);
    if (!cur || (c.checked && !cur.checked)) groupPick.set(c.radioName, c);
  }
  return live
    .filter(c => c.radioName === undefined || c.radioName === '' || groupPick.get(c.radioName) === c)
    .map(c => c.ref);
};

const listFocusable = (root: HTMLElement): HTMLElement[] =>
  pickTabbable(
    Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).map(el => {
      const input = el as HTMLInputElement;
      const isRadio = el instanceof HTMLInputElement && input.type === 'radio';
      return {
        ref: el,
        tabbable: el.tabIndex >= 0 && !input.disabled && el.getClientRects().length > 0,
        radioName: isRadio ? input.name : undefined,
        checked: isRadio ? input.checked : undefined,
      };
    })
  );

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

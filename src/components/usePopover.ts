import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useTopmostEscape } from '../hooks/useTopmostEscape';
import { useCloseOnAppLock } from '../hooks/useCloseOnAppLock';

/** Painel ancorado (selo e menu da pessoa): fecha com Esc e com clique fora; Esc devolve o foco ao botão. */
export function usePopover(): {
  open: boolean; toggle: () => void; close: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>; panelRef: RefObject<HTMLDivElement | null>;
} {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen(o => !o), []);

  useCloseOnAppLock(open, close);
  useTopmostEscape(open, () => { setOpen(false); triggerRef.current?.focus(); });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return { open, toggle, close, triggerRef, panelRef };
}

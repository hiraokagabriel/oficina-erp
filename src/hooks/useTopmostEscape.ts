import { useEffect, useRef } from 'react';

/**
 * Esc fecha só esta janela quando ela está por cima de outra. O listener é de captura no document:
 * roda antes dos handlers de Esc das janelas de baixo (useDirtyGuard, App) e os corta com stopPropagation.
 */
export const useTopmostEscape = (active: boolean, onClose: () => void) => {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing) return;
      e.preventDefault();
      e.stopPropagation();
      closeRef.current();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [active]);
};

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmationModal } from '../modals/ConfirmationModal';
import { decideClose, decideEscape } from '../utils/dirtyGuard';

interface DirtyGuardOptions {
  /** A janela está aberta (o guard só escuta enquanto estiver). */
  active: boolean;
  /** Fecha de verdade (sem perguntar). */
  onClose: () => void;
  /** Muda quando a janela troca de "tela" (ex.: lista -> editor): zera o estado de suja. */
  resetKey?: unknown;
  /** false = não conta digitação como alteração (ex.: tela de listagem com campo de busca). */
  trackInputs?: boolean;
  /** Alterações que não geram evento de campo (adicionar/remover item, clicar em estado). */
  isDirty?: () => boolean;
}

/**
 * Proteção contra perda de alterações. A janela fica "suja" quando um campo dentro de `overlayRef` dispara
 * input/change depois de aberta (ou quando `markDirty()`/`isDirty()` dizem). Esc, clique no fundo e Cancelar/X
 * devem chamar `requestClose`: suja pergunta "Descartar alterações?", limpa fecha direto. Salvar chama o
 * onClose da janela por conta própria, sem passar por aqui. Renderize `dialog` ao lado da janela.
 */
export const useDirtyGuard = ({ active, onClose, resetKey, trackInputs = true, isDirty }: DirtyGuardOptions) => {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const dirtyRef = useRef(false);
  const confirmRef = useRef(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const latest = useRef({ onClose, isDirty, trackInputs });
  latest.current = { onClose, isDirty, trackInputs };

  const setConfirm = useCallback((open: boolean) => {
    confirmRef.current = open;
    setConfirmOpen(open);
  }, []);

  // Janela (ou tela da janela) nova: começa limpa.
  useEffect(() => {
    dirtyRef.current = false;
    setConfirm(false);
  }, [active, resetKey, setConfirm]);

  const markDirty = useCallback(() => { dirtyRef.current = true; }, []);

  const requestClose = useCallback(() => {
    const dirty = dirtyRef.current || (latest.current.isDirty?.() ?? false);
    if (decideClose(dirty) === 'confirm') setConfirm(true);
    else latest.current.onClose();
  }, [setConfirm]);

  useEffect(() => {
    if (!active) return;
    const onField = (e: Event) => {
      if (!latest.current.trackInputs) return;
      const root = overlayRef.current;
      if (root && e.target instanceof Node && root.contains(e.target)) dirtyRef.current = true;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const action = decideEscape({ defaultPrevented: e.defaultPrevented, isComposing: e.isComposing, confirmOpen: confirmRef.current });
      if (action === 'ignore') return;
      e.preventDefault();
      if (action === 'dismiss-confirm') setConfirm(false);
      else requestClose();
    };
    document.addEventListener('input', onField, true);
    document.addEventListener('change', onField, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('input', onField, true);
      document.removeEventListener('change', onField, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [active, requestClose, setConfirm]);

  const dialog: React.ReactNode = confirmOpen ? (
    <ConfirmationModal
      isOpen
      title="Descartar alterações?"
      message="Você mudou campos e ainda não salvou. Se descartar, o que foi digitado se perde."
      confirmText="Descartar"
      cancelText="Continuar editando"
      confirmColor="danger"
      onConfirm={() => latest.current.onClose()}
      onClose={() => setConfirm(false)}
    />
  ) : null;

  return { overlayRef, requestClose, markDirty, dialog };
};

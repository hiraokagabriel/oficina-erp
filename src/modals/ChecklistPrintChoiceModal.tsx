import React, { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../components/ui/Icon';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useTopmostEscape } from '../hooks/useTopmostEscape';
import { ChecklistPrintMode } from '../utils/printChecklist';

// Pergunta rápida antes de imprimir a vistoria: completo (para marcar à mão) ou só o que já foi marcado.

interface ChecklistPrintChoiceModalProps {
  isOpen: boolean;
  /** Total de itens do checklist. */
  total: number;
  /** Itens já marcados (estado diferente de "não inspecionado"). */
  inspected: number;
  onClose: () => void;
  onConfirm: (mode: ChecklistPrintMode) => void;
}

export const ChecklistPrintChoiceModal: React.FC<ChecklistPrintChoiceModalProps> = ({
  isOpen, total, inspected, onClose, onConfirm,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const fullRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const [mode, setMode] = useState<ChecklistPrintMode>('full');
  useFocusTrap(isOpen, dialogRef);
  useTopmostEscape(isOpen, onClose);

  const noneMarked = inspected === 0;

  useEffect(() => {
    if (!isOpen) return;
    setMode(inspected > 0 ? 'summary' : 'full');
    // O foco vai para o rádio que já vem marcado, não para o primeiro.
    (inspected > 0 ? summaryRef : fullRef).current?.focus();
    // Reinicia a escolha só ao abrir; os números não mudam enquanto a janela está aberta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    // z-index acima da vistoria (.checklist-modal-overlay = 1100).
    <div className="modal-overlay choice-overlay" style={{ zIndex: 1200 }} onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal-content choice-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="choice-head">
          <span className="choice-icon" aria-hidden="true"><Icon name="imprimir" size={36} /></span>
          <h2 id={titleId} className="choice-title">Imprimir vistoria</h2>
        </div>

        <fieldset className="csm-choice" style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend className="choice-message">O que imprimir?</legend>
          <label className="csm-choice-row">
            <input
              ref={fullRef}
              type="radio"
              name="checklist-print-mode"
              checked={mode === 'full'}
              onChange={() => setMode('full')}
            />
            <span>Completo: todos os {total} itens, com caixas para marcar à mão</span>
          </label>
          <label className="csm-choice-row" style={noneMarked ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>
            <input
              ref={summaryRef}
              type="radio"
              name="checklist-print-mode"
              checked={mode === 'summary'}
              disabled={noneMarked}
              onChange={() => setMode('summary')}
            />
            <span>
              Resumido: só os {inspected} itens marcados
              {noneMarked ? ' (nenhum item marcado ainda)' : ''}
            </span>
          </label>
        </fieldset>

        <div className="choice-actions">
          <button type="button" className="btn btn-secondary choice-btn" onClick={onClose}>
            <Icon name="fechar" size={22} />
            <span>Cancelar</span>
          </button>
          <button
            type="button"
            className="btn btn-success choice-btn"
            onClick={(e) => { if (e.detail > 1) return; onConfirm(mode); }}
          >
            <Icon name="imprimir" size={22} />
            <span>Imprimir</span>
          </button>
        </div>
      </div>
    </div>
  );
};

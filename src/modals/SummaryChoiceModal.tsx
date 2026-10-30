import React, { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../components/ui/Icon';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useTopmostEscape } from '../hooks/useTopmostEscape';
import { DEFAULT_SUMMARY_CHOICE, SummaryChoice } from '../services/serviceSummaryView';

// Pergunta rápida antes de mostrar ou imprimir o resumo: incluir os itens marcados da vistoria?
// A nota geral só aparece (e só vale) com os itens da vistoria ligados.

interface SummaryChoiceModalProps {
  isOpen: boolean;
  mode: 'show' | 'print';
  onClose: () => void;
  onConfirm: (choice: SummaryChoice) => void;
}

export const SummaryChoiceModal: React.FC<SummaryChoiceModalProps> = ({ isOpen, mode, onClose, onConfirm }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const [choice, setChoice] = useState<SummaryChoice>(DEFAULT_SUMMARY_CHOICE);
  useFocusTrap(isOpen, dialogRef);
  useTopmostEscape(isOpen, onClose);

  useEffect(() => {
    if (!isOpen) return;
    setChoice(DEFAULT_SUMMARY_CHOICE);
    firstRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) return null;
  const isPrint = mode === 'print';

  return (
    <div className="modal-overlay choice-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal-content choice-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="choice-head">
          <span className="choice-icon" aria-hidden="true"><Icon name={isPrint ? 'imprimir' : 'info'} size={36} /></span>
          <h2 id={titleId} className="choice-title">{isPrint ? 'Imprimir resumo' : 'Mostrar ao cliente'}</h2>
          <div className="choice-message">Esta OS tem itens marcados na vistoria.</div>
        </div>

        <div className="csm-choice">
          <label className="csm-choice-row">
            <input
              ref={firstRef}
              type="checkbox"
              checked={choice.includeInspection}
              onChange={(e) => setChoice(c => ({ ...c, includeInspection: e.target.checked }))}
            />
            <span>Incluir itens da vistoria</span>
          </label>
          {choice.includeInspection && (
            <label className="csm-choice-row csm-choice-sub">
              <input
                type="checkbox"
                checked={choice.includeGeneralNote}
                onChange={(e) => setChoice(c => ({ ...c, includeGeneralNote: e.target.checked }))}
              />
              <span>Incluir também a nota geral da vistoria</span>
            </label>
          )}
        </div>

        <div className="choice-actions">
          <button type="button" className="btn btn-secondary choice-btn" onClick={onClose}>
            <Icon name="fechar" size={22} />
            <span>Cancelar</span>
          </button>
          <button
            type="button"
            className="btn btn-success choice-btn"
            onClick={(e) => { if (e.detail > 1) return; onConfirm(choice); }}
          >
            <Icon name={isPrint ? 'imprimir' : 'check'} size={22} />
            <span>{isPrint ? 'Imprimir' : 'Mostrar'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

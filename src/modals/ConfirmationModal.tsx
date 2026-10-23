import React, { useEffect, useId, useRef } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  /** Texto do botão que só fecha o diálogo (padrão: Cancelar). */
  cancelText?: string;
  confirmColor?: 'primary' | 'danger' | 'success'; // Permite botões vermelhos ou verdes
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ 
  isOpen, onClose, onConfirm, 
  title, message, 
  confirmText = "Confirmar", 
  cancelText = "Cancelar",
  confirmColor = 'primary' 
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useFocusTrap(isOpen, dialogRef);
  // Depois da armadilha de foco (que guarda o elemento anterior): o foco começa no botão seguro.
  useEffect(() => { if (isOpen) cancelRef.current?.focus(); }, [isOpen]);

  if (!isOpen) return null;

  // Define a cor do botão baseado na prop
  const getBtnColor = () => {
      switch(confirmColor) {
          case 'danger': return 'var(--text-danger)';
          case 'success': return 'var(--text-success)';
          default: return 'var(--accent-text)';
      }
  };

  return (
    <div className="modal-overlay" style={{zIndex: 1100}}>
      <div ref={dialogRef} className="modal-content" role="alertdialog" aria-modal="true" aria-labelledby={titleId} style={{maxWidth: '400px', textAlign: 'center'}}>
        <h2 id={titleId} style={{color: getBtnColor(), marginTop: 0}}>{title}</h2>
        
        <p style={{marginBottom: 25, color: 'var(--text-muted)', fontSize: '1.1rem', whiteSpace: 'pre-line'}}>
          {message}
        </p>

        <div className="modal-actions" style={{justifyContent: 'center', gap: 15}}>
            <button 
                className="btn-secondary" 
                onClick={onClose}
                style={{minWidth: 100}}
                ref={cancelRef}
            >
                {cancelText}
            </button>
            <button 
                className={confirmColor === 'danger' ? 'btn btn-danger' : confirmColor === 'success' ? 'btn btn-success' : 'btn'}
                onClick={() => { onConfirm(); onClose(); }}
                style={{minWidth: 100}}
            >
                {confirmText}
            </button>
        </div>
      </div>
    </div>
  );
};
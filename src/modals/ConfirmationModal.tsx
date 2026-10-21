import React from 'react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  confirmColor?: 'primary' | 'danger' | 'success'; // Permite botões vermelhos ou verdes
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ 
  isOpen, onClose, onConfirm, 
  title, message, 
  confirmText = "Confirmar", 
  confirmColor = 'primary' 
}) => {
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
      <div className="modal-content" style={{maxWidth: '400px', textAlign: 'center'}}>
        <h2 style={{color: getBtnColor(), marginTop: 0}}>{title}</h2>
        
        <p style={{marginBottom: 25, color: 'var(--text-muted)', fontSize: '1.1rem'}}>
          {message}
        </p>

        <div className="modal-actions" style={{justifyContent: 'center', gap: 15}}>
            <button 
                className="btn-secondary" 
                onClick={onClose}
                style={{minWidth: 100}}
            >
                Cancelar
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
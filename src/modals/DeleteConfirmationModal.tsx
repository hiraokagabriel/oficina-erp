import React from 'react';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmSingle: () => void;
  onConfirmGroup: () => void;
  isGroup: boolean; // Se false, nem mostra a opção de grupo
}

export const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({ 
  isOpen, onClose, onConfirmSingle, onConfirmGroup, isGroup 
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{maxWidth: '400px', textAlign: 'center'}}>
        <h2 style={{color: 'var(--danger)'}}>Excluir Lançamento</h2>
        
        <p style={{marginBottom: 20, color: 'var(--text-muted)'}}>
          {isGroup 
            ? "Este lançamento faz parte de uma série recorrente ou parcelada." 
            : "Tem certeza que deseja excluir este lançamento?"}
        </p>

        {isGroup ? (
            <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
                <button className="btn" onClick={onConfirmSingle} style={{background: 'var(--bg-panel)', border: '1px solid var(--border)', color: 'var(--text-main)'}}>
                    Excluir APENAS este (Resta o histórico)
                </button>
                <button className="btn" onClick={onConfirmGroup} style={{backgroundColor: 'var(--danger)', color: 'white'}}>
                    Excluir TODAS as parcelas/série
                </button>
                <button className="btn-secondary" onClick={onClose} style={{marginTop: 10}}>
                    Cancelar
                </button>
            </div>
        ) : (
            <div className="modal-actions" style={{justifyContent: 'center'}}>
                <button className="btn-secondary" onClick={onClose}>Cancelar</button>
                <button className="btn" onClick={onConfirmSingle} style={{backgroundColor: 'var(--danger)', color: 'white'}}>
                    Excluir
                </button>
            </div>
        )}
      </div>
    </div>
  );
};
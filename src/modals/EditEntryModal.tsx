import React, { useState, useEffect } from 'react';
import { LedgerEntry } from '../types';

interface EditEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, description: string, amount: number) => void;
  entry: LedgerEntry | null;
  Money: any; // Recebendo o utilitário Money
}

export const EditEntryModal: React.FC<EditEntryModalProps> = ({
  isOpen, onClose, onSave, entry, Money
}) => {
  const [description, setDescription] = useState('');
  const [amountStr, setAmountStr] = useState('');

  useEffect(() => {
    if (isOpen && entry) {
      setDescription(entry.description);
      // Converte o valor float para string formatada (sem R$) para edição
      setAmountStr(Money.toFloat(entry.amount).toFixed(2).replace('.', ','));
    }
  }, [isOpen, entry, Money]);

  const handleSave = () => {
    if (!entry) return;
    
    // Converte string "1.200,50" para float
    const cleanAmount = amountStr.replace(/\./g, '').replace(',', '.');
    const floatAmount = parseFloat(cleanAmount);

    if (isNaN(floatAmount)) {
      alert("Valor inválido");
      return;
    }

    onSave(entry.id, description, floatAmount);
  };

  if (!isOpen || !entry) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '400px' }}>
        <h2 className="modal-title">Editar Lançamento</h2>
        
        <div className="form-group">
          <label className="form-label">Descrição</label>
          <input 
            className="form-input" 
            value={description} 
            onChange={e => setDescription(e.target.value)}
            autoFocus 
          />
        </div>

        <div className="form-group">
          <label className="form-label">Valor (R$)</label>
          <input 
            className="form-input" 
            value={amountStr} 
            onChange={e => setAmountStr(e.target.value)}
            placeholder="0,00"
          />
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn" onClick={handleSave}>Salvar Alterações</button>
        </div>
      </div>
    </div>
  );
};
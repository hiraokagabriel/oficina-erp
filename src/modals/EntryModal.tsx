import React, { useState, useEffect } from 'react';
import { LedgerEntry } from '../types';

interface EntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (description: string, amount: number, type: 'CREDIT' | 'DEBIT', date: string) => void;
  initialData: LedgerEntry | null; // Recebe o dado para edição
}

export const EntryModal: React.FC<EntryModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'CREDIT' | 'DEBIT'>('DEBIT');
  const [date, setDate] = useState('');

  // Efeito: Quando o modal abre ou initialData muda, preenche os campos
  useEffect(() => {
    if (isOpen) {
        if (initialData) {
            // Modo Edição
            setDescription(initialData.description);
            setAmount(initialData.amount.toString());
            setType(initialData.type);
            // Formatar data ISO para YYYY-MM-DD do input type="date"
            setDate(initialData.effectiveDate.split('T')[0]);
        } else {
            // Modo Criação (Limpa tudo)
            setDescription('');
            setAmount('');
            setType('DEBIT'); // Padrão Despesa
            setDate(new Date().toISOString().split('T')[0]); // Hoje
        }
    }
  }, [isOpen, initialData]);

  const handleSave = () => {
    if (!description || !amount) return alert("Preencha descrição e valor.");
    
    const val = parseFloat(amount.replace(',', '.'));
    if (isNaN(val)) return alert("Valor inválido");

    onSave(description, val, type, date);
    // onClose é chamado pelo pai após salvar, ou podemos chamar aqui se preferir fechar imediato
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{maxWidth: '400px'}}>
        <h2>{initialData ? 'Editar Lançamento' : 'Novo Lançamento'}</h2>
        
        <div className="form-group">
          <label>Descrição</label>
          <input 
            className="form-input" 
            value={description} 
            onChange={e => setDescription(e.target.value)} 
            placeholder="Ex: Conta de Luz" 
            autoFocus
          />
        </div>

        <div className="form-group">
          <label>Valor (R$)</label>
          <input 
            className="form-input" 
            type="number" 
            step="0.01" 
            value={amount} 
            onChange={e => setAmount(e.target.value)} 
            placeholder="0.00" 
          />
        </div>

        <div className="form-group">
          <label>Data de Competência</label>
          <input 
            className="form-input" 
            type="date" 
            value={date} 
            onChange={e => setDate(e.target.value)} 
          />
        </div>

        <div className="form-group">
          <label>Tipo</label>
          <div style={{display: 'flex', gap: 10}}>
            <button 
                className="btn" 
                style={{
                    flex: 1, 
                    backgroundColor: type === 'CREDIT' ? 'var(--success)' : 'var(--bg-panel)',
                    color: type === 'CREDIT' ? '#fff' : 'var(--text-main)',
                    border: '1px solid var(--border)'
                }}
                onClick={() => setType('CREDIT')}
            >
                Receita (+Entrada)
            </button>
            <button 
                className="btn" 
                style={{
                    flex: 1, 
                    backgroundColor: type === 'DEBIT' ? 'var(--danger)' : 'var(--bg-panel)',
                    color: type === 'DEBIT' ? '#fff' : 'var(--text-main)',
                    border: '1px solid var(--border)'
                }}
                onClick={() => setType('DEBIT')}
            >
                Despesa (-Saída)
            </button>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn" onClick={handleSave}>
            {initialData ? 'Atualizar' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
};
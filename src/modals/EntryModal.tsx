import React, { useState, useEffect } from 'react';
import { LedgerEntry } from '../types';
import { getLocalDateString } from '../utils/helpers';

interface EntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (desc: string, val: number, type: 'CREDIT' | 'DEBIT', date: string, recurrence: 'SINGLE' | 'INSTALLMENT' | 'RECURRING', count: number) => void;
  initialData: LedgerEntry | null;
}

export const EntryModal: React.FC<EntryModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'CREDIT' | 'DEBIT'>('DEBIT');
  const [date, setDate] = useState('');
  
  const [recurrence, setRecurrence] = useState<'SINGLE' | 'INSTALLMENT' | 'RECURRING'>('SINGLE');
  const [count, setCount] = useState<number>(2);

  useEffect(() => {
    if (isOpen) {
        if (initialData) {
            setDescription(initialData.description);
            
            // --- CORREÇÃO DOS DECIMAIS ---
            // Divide por 100 para exibir corretamente (ex: 1500 virar 15.00)
            setAmount((initialData.amount / 100).toFixed(2));
            
            setType(initialData.type);
            setDate(initialData.effectiveDate.split('T')[0]);
            setRecurrence('SINGLE');
            setCount(1);
        } else {
            setDescription('');
            setAmount('');
            setType('DEBIT');
            setDate(getLocalDateString()); // 🔧 CORREÇÃO: Usa data local do computador
            setRecurrence('SINGLE');
            setCount(2);
        }
    }
  }, [isOpen, initialData]);

  const handleSave = () => {
    if (!description || !amount) return alert("Preencha descrição e valor.");
    
    const val = parseFloat(amount.replace(',', '.'));
    if (isNaN(val)) return alert("Valor inválido");

    onSave(description, val, type, date, recurrence, count);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{maxWidth: '450px'}}>
        <h2>{initialData ? 'Editar Lançamento' : 'Novo Lançamento'}</h2>
        
        {!initialData && (
            <div className="toggle-group" style={{display: 'flex', marginBottom: 15, justifyContent: 'center'}}>
                <button 
                    className="btn-sm" 
                    style={{opacity: recurrence === 'SINGLE' ? 1 : 0.5, border: recurrence === 'SINGLE' ? '1px solid var(--primary)' : '1px solid transparent'}}
                    onClick={() => setRecurrence('SINGLE')}
                >
                    Único
                </button>
                <button 
                    className="btn-sm" 
                    style={{opacity: recurrence === 'INSTALLMENT' ? 1 : 0.5, border: recurrence === 'INSTALLMENT' ? '1px solid var(--primary)' : '1px solid transparent'}}
                    onClick={() => setRecurrence('INSTALLMENT')}
                >
                    Parcelado
                </button>
                <button 
                    className="btn-sm" 
                    style={{opacity: recurrence === 'RECURRING' ? 1 : 0.5, border: recurrence === 'RECURRING' ? '1px solid var(--primary)' : '1px solid transparent'}}
                    onClick={() => setRecurrence('RECURRING')}
                >
                    Recorrente (Mensal)
                </button>
            </div>
        )}

        <div className="form-group">
          <label>Descrição</label>
          <input 
            className="form-input" 
            value={description} 
            onChange={e => setDescription(e.target.value)} 
            placeholder={recurrence === 'INSTALLMENT' ? "Ex: Compra Peças (O sistema adicionará 1/X)" : "Ex: Aluguel / Conta Luz"} 
            autoFocus
          />
        </div>

        <div className="form-group">
          <label>
              {recurrence === 'INSTALLMENT' ? 'Valor da Compra (R$)' : 'Valor (R$)'}
          </label>
          <input 
            className="form-input" 
            type="number" 
            step="0.01" 
            value={amount} 
            onChange={e => setAmount(e.target.value)} 
            placeholder="0.00" 
          />
        </div>

        {recurrence === 'INSTALLMENT' && (
            <div className="form-group">
                <label>Quantidade de Parcelas</label>
                <input 
                    className="form-input" 
                    type="number" 
                    min="2" 
                    max="60"
                    value={count} 
                    onChange={e => setCount(parseInt(e.target.value))} 
                />
            </div>
        )}

        {recurrence === 'RECURRING' && (
            <div className="form-group">
                <label>Repetir por quantos meses?</label>
                <input 
                    className="form-input" 
                    type="number" 
                    min="2" 
                    max="120"
                    value={count} 
                    onChange={e => setCount(parseInt(e.target.value))} 
                    placeholder="Ex: 12 meses"
                />
                <small style={{color:'var(--text-muted)'}}>Isso lançará o valor mensalmente a partir da data selecionada.</small>
            </div>
        )}

        <div className="form-group">
          <label>Data {recurrence !== 'SINGLE' ? 'da 1ª Parcela/Mês' : 'de Competência'}</label>
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
                    // Lógica visual melhorada: Cor de fundo + Opacidade
                    backgroundColor: type === 'CREDIT' ? 'var(--success)' : 'var(--bg-panel)',
                    color: type === 'CREDIT' ? '#fff' : 'var(--text-main)',
                    border: type === 'CREDIT' ? '1px solid var(--success)' : '1px solid var(--border)',
                    opacity: type === 'CREDIT' ? 1 : 0.5, // Visual "Desativado" se não for o escolhido
                    transform: type === 'CREDIT' ? 'scale(1.02)' : 'scale(1)', // Leve destaque
                    transition: 'all 0.2s ease'
                }}
                onClick={() => setType('CREDIT')}
            >
                Receita (+Entrada)
            </button>
            <button 
                className="btn" 
                style={{
                    flex: 1, 
                    // Lógica visual melhorada: Cor de fundo + Opacidade
                    backgroundColor: type === 'DEBIT' ? 'var(--danger)' : 'var(--bg-panel)',
                    color: type === 'DEBIT' ? '#fff' : 'var(--text-main)',
                    border: type === 'DEBIT' ? '1px solid var(--danger)' : '1px solid var(--border)',
                    opacity: type === 'DEBIT' ? 1 : 0.5, // Visual "Desativado" se não for o escolhido
                    transform: type === 'DEBIT' ? 'scale(1.02)' : 'scale(1)', // Leve destaque
                    transition: 'all 0.2s ease'
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
            {initialData ? 'Atualizar' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
};
import React, { useState, useEffect, useId } from 'react';
import { LedgerEntry } from '../types';
import { getLocalDateString } from '../utils/helpers';
import { useDirtyGuard } from '../hooks/useDirtyGuard';

interface EntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (desc: string, val: number, type: 'CREDIT' | 'DEBIT', date: string, recurrence: 'SINGLE' | 'INSTALLMENT' | 'RECURRING', count: number) => void;
  initialData: LedgerEntry | null;
}

export const EntryModal: React.FC<EntryModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
  const uid = useId();
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

  const guard = useDirtyGuard({ active: isOpen, onClose });

  if (!isOpen) return null;

  return (
    <>
    <div className="modal-overlay" ref={guard.overlayRef}>
      <div className="modal-content" style={{maxWidth: '450px'}}>
        <h2>{initialData ? 'Editar Lançamento' : 'Novo Lançamento'}</h2>
        
        <div className="form-group">
          <span className="field-label" id={`${uid}-tipo`}>Tipo</span>
          <div role="group" aria-labelledby={`${uid}-tipo`} style={{display: 'flex', gap: 10}}>
            <button 
                className={type === 'CREDIT' ? 'btn btn-success' : 'btn btn-secondary'}
                aria-pressed={type === 'CREDIT'}
                style={{ flex: 1 }}
                onClick={() => { if (type !== 'CREDIT') guard.markDirty(); setType('CREDIT'); }}
            >
                Receita (entrada)
            </button>
            <button 
                className={type === 'DEBIT' ? 'btn btn-danger' : 'btn btn-secondary'}
                aria-pressed={type === 'DEBIT'}
                style={{ flex: 1 }}
                onClick={() => { if (type !== 'DEBIT') guard.markDirty(); setType('DEBIT'); }}
            >
                Despesa (saída)
            </button>
          </div>
        </div>

        {!initialData && (
            <div className="segmented" role="group" aria-label="Repetição" style={{marginBottom: 15}}>
                <button type="button" aria-pressed={recurrence === 'SINGLE'} onClick={() => { if (recurrence !== 'SINGLE') guard.markDirty(); setRecurrence('SINGLE'); }}>Único</button>
                <button type="button" aria-pressed={recurrence === 'INSTALLMENT'} onClick={() => { if (recurrence !== 'INSTALLMENT') guard.markDirty(); setRecurrence('INSTALLMENT'); }}>Parcelado</button>
                <button type="button" aria-pressed={recurrence === 'RECURRING'} onClick={() => { if (recurrence !== 'RECURRING') guard.markDirty(); setRecurrence('RECURRING'); }}>Mensal (repete)</button>
            </div>
        )}

        <div className="form-group">
          <label htmlFor={`${uid}-desc`}>Descrição</label>
          <input 
            id={`${uid}-desc`}
            className="form-input" 
            value={description} 
            onChange={e => setDescription(e.target.value)} 
            placeholder={recurrence === 'INSTALLMENT' ? "Ex: Compra Peças (O sistema adicionará 1/X)" : "Ex: Aluguel / Conta Luz"} 
            autoFocus
          />
        </div>

        <div className="form-group">
          <label htmlFor={`${uid}-valor`}>
              {recurrence === 'INSTALLMENT' ? 'Valor da Compra (R$)' : 'Valor (R$)'}
          </label>
          <input 
            id={`${uid}-valor`}
            className="form-input" 
            type="number" 
            step="0.01" 
            value={amount} 
            onChange={e => setAmount(e.target.value)} 
            placeholder="0,00" 
          />
        </div>

        {recurrence === 'INSTALLMENT' && (
            <div className="form-group">
                <label htmlFor={`${uid}-parc`}>Quantidade de parcelas</label>
                <input 
                    id={`${uid}-parc`}
                    className="form-input" 
                    type="number" 
                    min="2" 
                    max="60"
                    value={count} 
                    onChange={e => setCount(parseInt(e.target.value, 10))} 
                />
            </div>
        )}

        {recurrence === 'RECURRING' && (
            <div className="form-group">
                <label htmlFor={`${uid}-meses`}>Repetir por quantos meses?</label>
                <input 
                    id={`${uid}-meses`}
                    className="form-input" 
                    type="number" 
                    min="2" 
                    max="120"
                    value={count} 
                    onChange={e => setCount(parseInt(e.target.value, 10))} 
                    placeholder="Ex: 12 meses"
                />
                <small className="field-hint">Isso lançará o valor mensalmente a partir da data selecionada.</small>
            </div>
        )}

        <div className="form-group">
          <label htmlFor={`${uid}-data`}>{recurrence !== 'SINGLE' ? 'Data da 1ª parcela/mês' : 'Data do lançamento'}</label>
          <input 
            id={`${uid}-data`}
            className="form-input" 
            type="date" 
            value={date} 
            onChange={e => setDate(e.target.value)} 
          />
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={guard.requestClose}>Cancelar</button>
          <button className="btn" onClick={handleSave}>
            {initialData ? 'Atualizar' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
    {guard.dialog}
    </>
  );
};
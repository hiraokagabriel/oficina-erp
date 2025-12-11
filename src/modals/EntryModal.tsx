import React, { useState } from 'react';

interface EntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (description: string, value: number, type: 'CREDIT' | 'DEBIT', date?: string) => void;
}

export const EntryModal: React.FC<EntryModalProps> = ({ isOpen, onClose, onSave }) => {
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");
  const [type, setType] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const handleSave = () => {
    if (!description || !value) { alert("Preencha todos os campos"); return; }
    const numVal = parseFloat(value.replace(',', '.'));
    if (isNaN(numVal)) { alert("Valor inválido"); return; }
    
    onSave(description, numVal, type, date);
    // Resetar campos
    setDescription("");
    setValue("");
    setType('CREDIT');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
       <div className="modal-content" style={{width: 400}}>
          <h2 className="modal-title">Novo Lançamento</h2>
          
          <div className="form-group">
            <label className="form-label">Data</label>
            <input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>

          <div className="form-group">
             <label className="form-label">Descrição</label>
             <input className="form-input" placeholder="Ex: Conta de Luz" value={description} onChange={e => setDescription(e.target.value)} />
          </div>

          <div className="form-group">
             <label className="form-label">Valor (R$)</label>
             <input className="form-input" type="number" step="0.01" placeholder="0.00" value={value} onChange={e => setValue(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label">Tipo</label>
            <div style={{display:'flex', gap:10}}>
                <button className={`btn ${type==='CREDIT'?'':'btn-secondary'}`} onClick={()=>setType('CREDIT')} style={{flex:1, borderColor: type==='CREDIT'?'var(--success)':''}}>Receita</button>
                <button className={`btn ${type==='DEBIT'?'':'btn-secondary'}`} onClick={()=>setType('DEBIT')} style={{flex:1, borderColor: type==='DEBIT'?'var(--danger)':''}}>Despesa</button>
            </div>
          </div>

          <div className="modal-actions">
              <button className="btn-secondary" onClick={onClose}>Cancelar</button>
              <button className="btn" onClick={handleSave}>Salvar</button>
          </div>
       </div>
    </div>
  );
};
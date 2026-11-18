import React, { useState, useEffect, useId } from 'react';
import { LedgerEntry } from '../types';
import { getLocalDateString } from '../utils/helpers';
import { useDirtyGuard } from '../hooks/useDirtyGuard';
import { MoneyField } from '../components/MoneyField';
import { validateEntryDraft, type EntryDraftErrors } from '../services/entryBuild';
import { debitPaidDay, isDebitPaid, toLocalDay } from '../services/expenseStatus';

interface EntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** `pending` (lançamento novo): true = "Vou pagar/receber em [data]"; false = "Já paguei/recebi". */
  onSave: (desc: string, val: number, type: 'CREDIT' | 'DEBIT', date: string, recurrence: 'SINGLE' | 'INSTALLMENT' | 'RECURRING', count: number, pending: boolean) => void;
  initialData: LedgerEntry | null;
}

export const EntryModal: React.FC<EntryModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
  const uid = useId();
  const [description, setDescription] = useState('');
  const [cents, setCents] = useState<number | undefined>(undefined);
  const [amountInvalid, setAmountInvalid] = useState(false);
  const [tried, setTried] = useState(false);
  const [errors, setErrors] = useState<EntryDraftErrors>({});
  const [type, setType] = useState<'CREDIT' | 'DEBIT'>('DEBIT');
  const [date, setDate] = useState('');
  
  const [recurrence, setRecurrence] = useState<'SINGLE' | 'INSTALLMENT' | 'RECURRING'>('SINGLE');
  const [count, setCount] = useState<number>(2);
  // Lançamento novo: "Já paguei/recebi" (padrão) ou "Vou pagar/receber em [data]".
  const [payLater, setPayLater] = useState(false);

  useEffect(() => {
    if (isOpen) {
        setTried(false);
        setErrors({});
        setPayLater(false);
        if (initialData) {
            setDescription(initialData.description);
            
            setCents(initialData.amount);
            
            setType(initialData.type);
            setDate(initialData.effectiveDate.split('T')[0]);
            setRecurrence('SINGLE');
            setCount(1);
        } else {
            setDescription('');
            setCents(undefined);
            setType('DEBIT');
            setDate(getLocalDateString()); // 🔧 CORREÇÃO: Usa data local do computador
            setRecurrence('SINGLE');
            setCount(2);
        }
    }
  }, [isOpen, initialData]);

  const handleSave = () => {
    setTried(true);
    const found = validateEntryDraft({ desc: description, cents, date, payLater, type, isNew: !initialData });
    setErrors(found);
    // Foco no 1º campo com erro; nada de toast de sucesso.
    const focusId = found.desc ? `${uid}-desc` : found.amount || amountInvalid ? `${uid}-valor` : found.date ? `${uid}-data` : null;
    if (focusId) { document.getElementById(focusId)?.focus(); return; }
    if (amountInvalid || cents === undefined) return;
    // O App recebe o valor em reais (float) e converte com Money.fromFloat; cents/100 é exato o bastante para isso.
    onSave(description, cents / 100, type, date, recurrence, count, !initialData && payLater);
  };

  const todayStr = getLocalDateString();
  const alreadyPaid = !payLater;
  // "Já paguei/recebi" não aceita data futura (fica a de hoje).
  const choosePayLater = (later: boolean) => {
    if (later !== payLater) guard.markDirty();
    setPayLater(later);
    // "Vou pagar/receber em": a data fica vazia e obrigatória; "Já": volta a hoje se estiver vazia ou futura.
    if (later) setDate('');
    else if (!date || date > todayStr) setDate(todayStr);
  };
  // Edição: só mostra o estado da despesa (mudar é pelo botão da lista).
  // Despesa já paga: a data editada é a do pagamento (não pode ser futura).
  const editingPaidDebit = !!initialData && initialData.type === 'DEBIT' && type === 'DEBIT'
    && isDebitPaid(initialData, toLocalDay(new Date()));
  const editStatus = initialData && initialData.type === 'DEBIT'
    ? (isDebitPaid(initialData, toLocalDay(new Date()))
        ? `Paga em ${debitPaidDay(initialData).split('-').reverse().join('/')}`
        : 'Prevista (ainda não paga)')
    : null;

  const guard = useDirtyGuard({ active: isOpen, onClose, label: 'um lançamento' });

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
            onChange={e => { setDescription(e.target.value); if (errors.desc) setErrors(x => ({ ...x, desc: undefined })); }} 
            placeholder={recurrence === 'INSTALLMENT' ? "Ex: Compra Peças (O sistema adicionará 1/X)" : "Ex: Aluguel / Conta Luz"} 
            autoFocus
            aria-invalid={errors.desc ? true : undefined}
          />
          {errors.desc && <p className="field-error" role="alert">{errors.desc}</p>}
        </div>

        <div className="form-group">
          <label htmlFor={`${uid}-valor`}>
              {recurrence === 'INSTALLMENT' ? 'Valor da Compra (R$)' : 'Valor (R$)'}
          </label>
          <MoneyField
            id={`${uid}-valor`}
            className="form-input"
            kind="optional"
            value={cents}
            onChange={c => { guard.markDirty(); setCents(c); if (errors.amount) setErrors(x => ({ ...x, amount: undefined })); }}
            onInvalidChange={(_id, inv) => setAmountInvalid(inv)}
            showError={tried}
            placeholder="0,00"
          />
          {errors.amount && <p className="field-error" role="alert">{errors.amount}</p>}
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

        {!initialData && (
            <div className="form-group">
                <span className="field-label" id={`${uid}-pago`}>{type === 'DEBIT' ? 'Esta despesa' : 'Esta receita'}</span>
                <div className="segmented" role="group" aria-labelledby={`${uid}-pago`}>
                    <button type="button" aria-pressed={!payLater} onClick={() => choosePayLater(false)}>{type === 'DEBIT' ? 'Já paguei' : 'Já recebi'}</button>
                    <button type="button" aria-pressed={payLater} onClick={() => choosePayLater(true)}>{type === 'DEBIT' ? 'Vou pagar em...' : 'Vou receber em...'}</button>
                </div>
            </div>
        )}

        {editStatus && <p className="field-hint" role="status">{editStatus}</p>}

        <div className="form-group">
          <label htmlFor={`${uid}-data`}>
            {recurrence !== 'SINGLE'
              ? 'Data da 1ª parcela/mês'
              : editingPaidDebit
                ? 'Paga em'
                : !initialData
                  ? (payLater ? (type === 'DEBIT' ? 'Vou pagar em' : 'Vou receber em') : (type === 'DEBIT' ? 'Data do pagamento' : 'Data do recebimento'))
                  : 'Data do lançamento'}
          </label>
          <input
            id={`${uid}-data`}
            className="form-input"
            type="date"
            value={date}
            max={(alreadyPaid && !initialData) || editingPaidDebit ? todayStr : undefined}
            aria-invalid={errors.date ? true : undefined}
            onChange={e => { setDate(e.target.value); if (errors.date) setErrors(x => ({ ...x, date: undefined })); }}
          />
          {errors.date && <p className="field-error" role="alert">{errors.date}</p>}
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
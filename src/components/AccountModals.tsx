import React, { useId, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import type { SimpleResult } from '../auth/AuthContext';
import { useToast } from '../context/ToastContext';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useTopmostEscape } from '../hooks/useTopmostEscape';

// "Trocar meu PIN" e "Trocar minha senha" (docs/NUVEM-UX.md 4.1). Sem internet o botão fica travado com o motivo à vista.

interface FieldDef { key: string; label: string; numeric?: boolean }

interface ModalProps {
  title: string;
  submitLabel: string;
  fields: FieldDef[];
  successToast: string;
  run: (v: Record<string, string>) => Promise<SimpleResult>;
  onClose: () => void;
}

const AccountModal: React.FC<ModalProps> = ({ title, submitLabel, fields, successToast, run, onClose }) => {
  const { online } = useAuth();
  const { addToast } = useToast();
  const ref = useRef<HTMLFormElement>(null);
  const titleId = useId();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useFocusTrap(true, ref);
  useTopmostEscape(true, onClose);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (busy) return;
    if (!online) { addToast('Precisa de internet', 'info'); return; }
    setBusy(true); setError('');
    const r = await run(values);
    setBusy(false);
    if (r.ok) { addToast(successToast, 'success'); onClose(); } else setError(r.message);
  };

  return (
    <div className="modal-overlay">
      <form ref={ref} className="modal-content account-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={e => void submit(e)}>
        <h2 id={titleId} className="modal-title">{title}</h2>
        {fields.map((f, i) => (
          <div className="form-group" key={f.key}>
            <label className="form-label" htmlFor={`acc-${f.key}`}>{f.label}</label>
            <input
              id={`acc-${f.key}`} className="form-input" type="password" autoComplete={f.key === 'current' ? 'current-password' : 'new-password'}
              inputMode={f.numeric ? 'numeric' : undefined} maxLength={f.numeric ? 6 : undefined} autoFocus={i === 0}
              value={values[f.key] ?? ''} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
            />
          </div>
        ))}
        {error && <p className="field-error" role="alert">{error}</p>}
        {!online && <p id="acc-offline" className="field-hint">Precisa de internet</p>}
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn" aria-disabled={!online || busy} aria-describedby={!online ? 'acc-offline' : undefined}>
            {busy ? 'Salvando...' : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
};

export const ChangePinModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { changePin } = useAuth();
  return (
    <AccountModal
      title="Trocar meu PIN" submitLabel="Salvar PIN" onClose={onClose}
      successToast="PIN trocado. Use o novo da próxima vez."
      fields={[
        { key: 'current', label: 'PIN atual', numeric: true },
        { key: 'next', label: 'PIN novo (6 números)', numeric: true },
        { key: 'repeat', label: 'Repita o PIN novo', numeric: true },
      ]}
      run={v => changePin(v.current ?? '', v.next ?? '', v.repeat ?? '')}
    />
  );
};

export const ChangePasswordModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { changePassword } = useAuth();
  return (
    <AccountModal
      title="Trocar minha senha" submitLabel="Salvar senha" onClose={onClose} successToast="Senha trocada."
      fields={[
        { key: 'current', label: 'Senha atual' },
        { key: 'next', label: 'Senha nova' },
        { key: 'repeat', label: 'Repita a senha nova' },
      ]}
      run={v => changePassword(v.current ?? '', v.next ?? '', v.repeat ?? '')}
    />
  );
};

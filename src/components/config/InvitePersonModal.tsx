import React, { useId, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { AuthApiError } from '../../auth/api';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useTopmostEscape } from '../../hooks/useTopmostEscape';
import { ROLES } from '../../services/permissions';
import type { Role } from '../../services/permissions';
import {
  INVITE_NAME_MAX, ROLE_DESCRIPTION, ROLE_LABEL, adminErrorMessage, validateInvite,
} from '../../utils/cloudUsers';
import type { InviteErrors } from '../../utils/cloudUsers';

// "Convidar pessoa" (docs/NUVEM-UX.md 5.1): nome, e-mail e papel; no fim, o aviso do e-mail que pode cair no Spam.

export const InvitePersonModal: React.FC<{ onClose: () => void; onInvited: () => void }> = ({ onClose, onInvited }) => {
  const { api, online } = useAuth();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role | null>(null);
  const [errors, setErrors] = useState<InviteErrors>({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  useFocusTrap(true, ref);
  useTopmostEscape(true, onClose);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (busy) return;
    const errs = validateInvite({ name, email, role });
    setErrors(errs);
    setServerError('');
    if (Object.keys(errs).length > 0 || !role) return;
    if (!online) { setServerError('Sem internet. Conecte para convidar.'); return; }
    setBusy(true);
    try {
      await api.users.invite({ email: email.trim(), role, displayName: name.trim() });
      setSentTo(name.trim());
      onInvited();
    } catch (err) {
      setServerError(err instanceof AuthApiError ? adminErrorMessage(err.error, err.message) : adminErrorMessage('sem_internet'));
    } finally { setBusy(false); }
  };

  if (sentTo !== null) {
    return (
      <div ref={ref} className="modal-overlay">
        <div className="modal-content account-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <h2 id={titleId} className="modal-title">Convite enviado</h2>
          <p className="cfg-help">
            Avise <strong>{sentTo}</strong>: o e-mail pode demorar alguns minutos e <strong>pode cair no Spam ou Lixo eletrônico</strong>.
            O link vale por tempo limitado.
          </p>
          <div className="modal-actions"><button type="button" className="btn" autoFocus onClick={onClose}>Entendi</button></div>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="modal-overlay">
      <form className="modal-content account-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={e => void submit(e)} noValidate>
        <h2 id={titleId} className="modal-title">Convidar pessoa</h2>
        <div className="form-group">
          <label className="form-label" htmlFor="inv-name">Nome</label>
          <input id="inv-name" className="form-input" value={name} maxLength={INVITE_NAME_MAX} autoComplete="off" autoFocus
            aria-invalid={errors.name ? true : undefined} aria-describedby={errors.name ? 'inv-name-err' : undefined}
            onChange={e => setName(e.target.value)} />
          {errors.name && <span id="inv-name-err" className="field-error" role="alert">{errors.name}</span>}
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="inv-email">E-mail</label>
          <input id="inv-email" className="form-input" type="email" value={email} autoComplete="off"
            aria-invalid={errors.email ? true : undefined} aria-describedby={errors.email ? 'inv-email-err' : undefined}
            onChange={e => setEmail(e.target.value)} />
          {errors.email && <span id="inv-email-err" className="field-error" role="alert">{errors.email}</span>}
        </div>
        <div role="radiogroup" aria-labelledby="inv-role-label" className="inv-roles">
          <span id="inv-role-label" className="form-label">Papel</span>
          {ROLES.map(r => (
            <label key={r} className={`inv-role${role === r ? ' is-selected' : ''}`}>
              <input type="radio" name="inv-role" value={r} checked={role === r} onChange={() => setRole(r)} />
              <span><strong>{ROLE_LABEL[r]}</strong><span className="cfg-help">{ROLE_DESCRIPTION[r]}</span></span>
            </label>
          ))}
          {errors.role && <span className="field-error" role="alert">{errors.role}</span>}
        </div>
        <p className="cfg-help">A pessoa recebe um e-mail com um link para criar a senha e o PIN.</p>
        {serverError && <p className="field-error" role="alert">{serverError}</p>}
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn" aria-busy={busy} disabled={busy}>{busy ? 'Enviando...' : 'Enviar convite'}</button>
        </div>
      </form>
    </div>
  );
};

import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { AuthApiError } from '../../auth/api';
import { useToast } from '../../context/ToastContext';
import { ConfirmationModal } from '../../modals/ConfirmationModal';
import { ROLES } from '../../services/permissions';
import type { Role } from '../../services/permissions';
import {
  LAST_OWNER_TEXT, NEEDS_INTERNET, OFFLINE_ADMIN_NOTE, PIN_LOCKED_TEXT, ROLE_DESCRIPTION, ROLE_LABEL, adminErrorMessage, deactivateText,
  deactivateTitle, formatDay, initials, inviteSentText, isOnlyActiveOwner, memberName, parsePeople, reactivateText, reactivateTitle,
  resendToast, roleChangeText, roleChangeTitle, sortMembers,
} from '../../utils/cloudUsers';
import type { MemberRow } from '../../utils/cloudUsers';
import { Icon } from '../ui/Icon';
import { InvitePersonModal } from './InvitePersonModal';

// Config > Usuários e papéis (docs/NUVEM-UX.md 5.1). Só o Dono: a lista vem da função `users.list` (e-mail, convite aceito
// e PIN bloqueado vêm do servidor).

type Pending =
  | { kind: 'role'; row: MemberRow; role: Role }
  | { kind: 'deactivate'; row: MemberRow }
  | { kind: 'reactivate'; row: MemberRow };

export const UsersSection: React.FC = () => {
  const { api, workshopId, userId, online } = useAuth();
  const { addToast } = useToast();
  const [rows, setRows] = useState<MemberRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    if (!workshopId) return;
    try {
      const r = await api.users.list();
      setFailed(false);
      setRows(sortMembers(parsePeople(r.people)));
    } catch {
      setFailed(true);
    }
  }, [api, workshopId]);

  useEffect(() => { void load(); }, [load, online]);

  const needNet = (): boolean => {
    if (online) return false;
    addToast(NEEDS_INTERNET, 'info');
    return true;
  };

  const run = async (action: () => Promise<unknown>, okMessage: string): Promise<void> => {
    try {
      await action();
      addToast(okMessage, 'success');
    } catch (e) {
      addToast(e instanceof AuthApiError ? adminErrorMessage(e.error, e.message) : adminErrorMessage('sem_internet'), 'error');
    }
    await load();
  };

  const resend = (r: MemberRow): void => {
    if (needNet()) return;
    void run(() => api.users.resendInvite(r.userId), resendToast(r.email || memberName(r)));
  };

  const unlockPin = (r: MemberRow): void => {
    if (needNet()) return;
    void run(() => api.users.unlockPin(r.userId), `PIN de ${memberName(r).split(' ')[0]} liberado. Ele pode tentar de novo.`);
  };

  const confirm = (): void => {
    const p = pending;
    if (!p) return;
    const name = memberName(p.row).split(' ')[0];
    if (p.kind === 'role') void run(() => api.users.setRole(p.row.userId, p.role), `Papel de ${name} mudado para ${ROLE_LABEL[p.role]}.`);
    if (p.kind === 'deactivate') void run(() => api.users.deactivate(p.row.userId), `${name} foi desativado.`);
    if (p.kind === 'reactivate') void run(() => api.users.reactivate(p.row.userId), `${name} foi reativado.`);
  };

  const confirmView = ((): { title: string; text: string; ok: string; danger: boolean } | null => {
    if (!pending) return null;
    const name = memberName(pending.row).split(' ')[0];
    switch (pending.kind) {
      case 'role': return { title: roleChangeTitle(name, pending.role), text: roleChangeText(name, pending.role), ok: 'Mudar papel', danger: false };
      case 'deactivate': return { title: deactivateTitle(name), text: deactivateText(name), ok: 'Desativar', danger: true };
      case 'reactivate': return { title: reactivateTitle(name), text: reactivateText(name), ok: 'Reativar', danger: false };
    }
  })();

  return (
    <section className="card cfg-card" aria-labelledby="cfg-users">
      <div className="cfg-row">
        <div className="cfg-row-text">
          <h3 id="cfg-users" className="cfg-title"><Icon name="pessoa" size={20} /> Usuários e papéis</h3>
          <p className="cfg-help">Quem pode entrar no OficinaPro e o que cada um vê.</p>
        </div>
        <button type="button" className="btn" aria-disabled={!online} aria-describedby={!online ? 'cfg-users-offline' : undefined}
          onClick={() => { if (!needNet()) setInviting(true); }}>
          <Icon name="adicionar" size={18} /> Convidar pessoa
        </button>
      </div>

      {!online && <p id="cfg-users-offline" className="cfg-warn"><Icon name="sem-internet" size={18} /> {OFFLINE_ADMIN_NOTE}</p>}

      {failed && (
        <div className="cfg-block">
          <p className="cfg-bad" role="alert"><Icon name="alerta" size={16} /> Não foi possível carregar as pessoas.</p>
          <button type="button" className="btn-secondary" onClick={() => void load()}>Tentar de novo</button>
        </div>
      )}
      {!failed && rows === null && <div className="cfg-people" aria-busy="true" aria-label="Carregando as pessoas">
        {[0, 1, 2].map(i => <div key={i} className="person-row person-row--skeleton" />)}
      </div>}

      {rows && (
        <ul className="cfg-people">
          {rows.map(r => {
            const self = r.userId === userId;
            const name = memberName(r);
            const lastOwner = isOnlyActiveOwner(rows, r.userId);
            const day = formatDay(r.invitedAt);
            return (
              <li key={r.userId} className={`person-row${r.active ? '' : ' is-inactive'}`}>
                <div className="person-id">
                  <span className="person-avatar" aria-hidden="true">{initials(name)}</span>
                  <div className="person-name">
                    <strong>{name}{self ? ' (você)' : ''}</strong>
                    {r.email && <span className="cfg-help">{r.email}</span>}
                    {r.invitePending && day && <span className="cfg-help">{inviteSentText(day)}</span>}
                    {r.pinLocked && r.active && <span className="cfg-bad"><Icon name="alerta" size={14} /> {PIN_LOCKED_TEXT}</span>}
                  </div>
                </div>
                <div className="person-actions">
                  {self || !r.active ? (
                    <span className="person-role">{ROLE_LABEL[r.role]}</span>
                  ) : (
                    <>
                      <label className="sr-only" htmlFor={`role-${r.userId}`}>Papel de {name}</label>
                      <select
                        id={`role-${r.userId}`} className="form-input person-select" value={r.role}
                        aria-disabled={!online || lastOwner} aria-describedby={lastOwner ? `last-${r.userId}` : undefined}
                        onChange={e => {
                          const next = e.target.value as Role;
                          if (needNet()) return;
                          if (lastOwner) { addToast(LAST_OWNER_TEXT, 'info'); return; }
                          if (next !== r.role) setPending({ kind: 'role', row: r, role: next });
                        }}
                      >
                        {ROLES.map(x => <option key={x} value={x}>{ROLE_LABEL[x]}</option>)}
                      </select>
                    </>
                  )}
                  <span className={`chip person-status ${r.active ? 'person-status--on' : 'person-status--off'}`}>
                    <Icon name={r.active ? 'check' : 'fechar'} size={14} /> {r.active ? 'Ativo' : 'Desativado'}
                  </span>
                  {!self && r.active && r.invitePending && (
                    <button type="button" className="btn-secondary btn-sm" aria-disabled={!online} onClick={() => resend(r)}>Reenviar convite</button>
                  )}
                  {!self && r.active && r.pinLocked && (
                    <button type="button" className="btn-secondary btn-sm" aria-disabled={!online} onClick={() => unlockPin(r)}>Liberar de novo</button>
                  )}
                  {!self && (r.active ? (
                    <button type="button" className="btn-secondary btn-sm" aria-disabled={!online || lastOwner}
                      aria-describedby={lastOwner ? `last-${r.userId}` : undefined}
                      onClick={() => { if (needNet()) return; if (lastOwner) { addToast(LAST_OWNER_TEXT, 'info'); return; } setPending({ kind: 'deactivate', row: r }); }}>
                      Desativar
                    </button>
                  ) : (
                    <button type="button" className="btn-secondary btn-sm" aria-disabled={!online}
                      onClick={() => { if (!needNet()) setPending({ kind: 'reactivate', row: r }); }}>
                      Reativar
                    </button>
                  ))}
                </div>
                {lastOwner && !self && <p id={`last-${r.userId}`} className="cfg-help person-note">{LAST_OWNER_TEXT}</p>}
              </li>
            );
          })}
        </ul>
      )}

      <details className="cfg-roles-help">
        <summary>O que cada papel faz</summary>
        <dl>
          {ROLES.map(r => (<React.Fragment key={r}><dt>{ROLE_LABEL[r]}</dt><dd>{ROLE_DESCRIPTION[r]}</dd></React.Fragment>))}
        </dl>
      </details>

      {inviting && <InvitePersonModal onClose={() => setInviting(false)} onInvited={() => void load()} />}
      {confirmView && (
        <ConfirmationModal
          isOpen onClose={() => setPending(null)} onConfirm={confirm}
          title={confirmView.title} message={confirmView.text} confirmText={confirmView.ok} confirmColor={confirmView.danger ? 'danger' : 'primary'}
        />
      )}
    </section>
  );
};

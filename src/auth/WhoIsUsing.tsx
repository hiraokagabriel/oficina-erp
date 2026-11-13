import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/ui/Icon';
import { useToast } from '../context/ToastContext';
import { useAuth } from './AuthContext';
import { initialsOf, ROLE_LABEL } from './authText';
import { readFails, readLastUser } from './deviceStore';
import type { RosterPerson } from './deviceStore';
import { ConfirmationModal } from '../modals/ConfirmationModal';
import { LEFT_OPEN_TEXT, joinLabels, leftOpenTitle, dirtyLabels } from '../utils/dirtyRegistry';
import { LoginScreen } from './LoginScreen';
import { NewPinScreen } from './NewPinScreen';
import { PinPad } from './PinPad';
import { AuthShell, AuthStatusIcon } from './AuthShell';
import { DEVICE_REVOKED_MESSAGE, DEVICE_SUSPENDED_MESSAGE, PIN_BLOCKED_MESSAGE, PIN_OFFLINE_BLOCKED_MESSAGE } from './pinLogic';

const FORGOT_HELP = 'Entre com e-mail e senha. Logo em seguida você cria um PIN novo.';
import type { PinFailure } from './pinLogic';

// "Quem está usando agora?" (docs/NUVEM-UX.md seção 3) e a tela de bloqueio por inatividade (4.3).
// Cobre tudo, opaca. Em PC compartilhado.

type Panel = { kind: 'cards' } | { kind: 'pin'; userId: string } | { kind: 'login'; help?: string } | { kind: 'forgot'; userId: string };

export const WhoIsUsing: React.FC = () => {
  const auth = useAuth();
  const { roster, rosterLoading, online, userId: currentId, gateReason, gatePerson, deviceBlock, device, displayName } = auth;
  const { addToast } = useToast();
  const [panel, setPanel] = useState<Panel>(() => (gateReason === 'idle' && gatePerson ? { kind: 'pin', userId: gatePerson } : { kind: 'cards' }));
  const [discardAsk, setDiscardAsk] = useState<{ labels: string[]; resolve: (ok: boolean) => void } | null>(null);
  const wasOnline = useRef(online);
  const firstCard = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!wasOnline.current && online) addToast('A internet voltou. Todos podem entrar.', 'success');
    wasOnline.current = online;
  }, [online, addToast]);

  const lastId = readLastUser();
  const people = useMemo(() => {
    const sorted = [...roster].sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? '', 'pt-BR'));
    const last = sorted.findIndex(p => p.userId === (lastId ?? currentId));
    if (last > 0) sorted.unshift(...sorted.splice(last, 1));
    return sorted;
  }, [roster, lastId, currentId]);

  useEffect(() => { if (panel.kind === 'cards') firstCard.current?.focus(); }, [panel.kind, people.length]);

  const currentName = (roster.find(p => p.userId === currentId)?.displayName ?? displayName) || 'a pessoa atual';
  const first = (n: string | null): string => (n ?? '').trim().split(/\s+/)[0] || 'Pessoa';

  // Entrou com a senha por PIN esquecido/bloqueado: antes de abrir, cria o PIN novo.
  if (auth.pinSetup && currentId) return <NewPinScreen />;

  if (deviceBlock === 'suspended' || deviceBlock === 'revoked') {
    const wasRevoked = deviceBlock === 'revoked';
    if (panel.kind === 'login') return <LoginScreen onBack={wasRevoked ? undefined : () => setPanel({ kind: 'cards' })} help={wasRevoked ? DEVICE_REVOKED_MESSAGE : DEVICE_SUSPENDED_MESSAGE} />;
    return (
      <AuthShell>
        <AuthStatusIcon name="cadeado" tone="danger" />
        <h1 className="auth-title">{wasRevoked ? 'Computador sem autorização' : 'Computador bloqueado'}</h1>
        <p className="auth-text">{wasRevoked ? DEVICE_REVOKED_MESSAGE : DEVICE_SUSPENDED_MESSAGE}</p>
        <div className="auth-actions"><button type="button" className="btn" onClick={() => setPanel({ kind: 'login' })}>Entrar com e-mail e senha</button></div>
      </AuthShell>
    );
  }

  if (panel.kind === 'login') {
    return <LoginScreen help={panel.help} offerNewPin={!!panel.help} onBack={() => setPanel({ kind: 'cards' })} />;
  }

  const person = (id: string): RosterPerson | undefined => roster.find(p => p.userId === id);

  if (panel.kind === 'forgot') {
    return (
      <AuthShell>
        <h1 className="auth-title">Esqueci meu PIN</h1>
        <p className="auth-text">Entre com seu e-mail e senha. Logo em seguida o OficinaPro pede para você <strong>criar um PIN novo</strong>.</p>
        <div className="auth-actions">
          <button type="button" className="btn" onClick={() => setPanel({ kind: 'login', help: FORGOT_HELP })}>Entrar com e-mail e senha</button>
          <button type="button" className="btn-ghost btn" onClick={() => setPanel({ kind: 'pin', userId: panel.userId })}>Voltar</button>
        </div>
      </AuthShell>
    );
  }

  if (panel.kind === 'pin') {
    const p = person(panel.userId);
    const name = p?.displayName || (panel.userId === currentId ? displayName : '') || 'Pessoa';
    const fails = readFails(panel.userId);
    // Com internet vale só o que o servidor diz (roster.locked); a contagem local só vale sem internet.
    const offlineBlocked = !online && fails.blocked && panel.userId === currentId;
    const submit = async (pin: string): Promise<PinFailure | null> => {
      const r = await auth.unlock(panel.userId, pin, labels => new Promise<boolean>(resolve => setDiscardAsk({ labels, resolve })));
      if (r.ok) return null;
      if (r.failure.kind === 'other' && !r.failure.message) { setPanel({ kind: 'cards' }); return null; } // desistiu de entrar (janela suja da pessoa anterior)
      if (r.failure.kind === 'blocked' && online) {
        setPanel({ kind: 'login', help: PIN_BLOCKED_MESSAGE });
        return null;
      }
      if (r.failure.kind === 'needs_password') {
        setPanel({ kind: 'login', help: r.failure.message });
        return null;
      }
      if (r.failure.kind === 'device_suspended' || r.failure.kind === 'device_revoked') return null;
      return r.failure;
    };
    return (
      <div className="auth-screen">
        {!online && <OfflineBanner currentName={first(currentName)} />}
        <div className="auth-center">
          <div className="card auth-card auth-card--pin">
            {gateReason === 'idle' && panel.userId === gatePerson && (
              <>
                <h1 className="auth-title">Computador bloqueado</h1>
                <p className="auth-text">{first(name)} estava usando. Digite o PIN para continuar de onde parou.</p>
              </>
            )}
            <PinPad
              key={panel.userId} name={name} role={p?.role ?? auth.role ?? 'mecanico'} onSubmit={submit}
              lockedMessage={offlineBlocked ? PIN_OFFLINE_BLOCKED_MESSAGE : null}
              onBack={() => setPanel({ kind: 'cards' })}
            >
              <div className="auth-links">
                {gateReason === 'idle' && panel.userId === gatePerson && (
                  <button type="button" className="btn-ghost btn" onClick={() => setPanel({ kind: 'cards' })}>Não é {first(name)}? Escolher outra pessoa</button>
                )}
                <button type="button" className="btn-ghost btn" onClick={() => setPanel({ kind: 'forgot', userId: panel.userId })}>Esqueci meu PIN</button>
              </div>
            </PinPad>
          </div>
        </div>
        {discardAsk && (
          <ConfirmationModal
            isOpen title={leftOpenTitle(first(currentName), discardAsk.labels)} message={LEFT_OPEN_TEXT}
            confirmText="Entrar mesmo assim" cancelText="Voltar" confirmColor="danger"
            onConfirm={() => { discardAsk.resolve(true); setDiscardAsk(null); }}
            onClose={() => { discardAsk.resolve(false); setDiscardAsk(null); }}
          />
        )}
      </div>
    );
  }

  // Cartões
  const noOneEntered = !currentId;
  if (!online && noOneEntered) {
    return (
      <AuthShell>
        <AuthStatusIcon name="sem-internet" tone="warning" />
        <h1 className="auth-title">Sem internet</h1>
        <p className="auth-text">Para entrar neste computador é preciso internet. Confira o cabo ou o Wi-Fi.</p>
      </AuthShell>
    );
  }

  const pick = (p: RosterPerson) => {
    if (!online && p.userId !== currentId) { addToast(`Sem internet, só ${first(currentName)} pode entrar agora.`, 'info'); return; }
    if (online && p.locked) { setPanel({ kind: 'login', help: PIN_BLOCKED_MESSAGE }); return; }
    setPanel({ kind: 'pin', userId: p.userId });
  };

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    const btns = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button.who-card')];
    const i = btns.findIndex(b => b === document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    btns[(i + step + btns.length) % btns.length]?.focus();
  };

  return (
    <div className="auth-screen">
      {!online && <OfflineBanner currentName={first(currentName)} />}
      <div className="auth-topline"><div className="logo-text">OFICINA<span className="logo-highlight">PRO</span></div></div>
      <div className="who-wrap">
        <h1 className="who-title">{gateReason === 'idle' ? 'Computador bloqueado' : 'Quem está usando agora?'}</h1>
        <p className="who-sub">Toque no seu nome.</p>
        {rosterLoading && people.length === 0 ? (
          <div className="who-grid" aria-busy="true">{[0, 1, 2].map(i => <div key={i} className="skeleton who-skel" />)}</div>
        ) : people.length === 0 ? (
          <div className="empty-state">
            <Icon name="pessoa" size={40} className="empty-state-icon" />
            <h2 className="empty-state-title">Ninguém tem PIN ainda</h2>
            <p className="empty-state-text">Cada pessoa cria o PIN ao aceitar o convite. Por enquanto, entre com e-mail e senha.</p>
          </div>
        ) : (
          <div className="who-grid" role="group" aria-label="Pessoas" onKeyDown={onKey}>
            {people.map((p, i) => {
              const isCurrent = p.userId === currentId;
              const blocked = online ? p.locked : readFails(p.userId).blocked;
              const left = isCurrent ? dirtyLabels() : [];
              const offlineOther = !online && !isCurrent;
              return (
                <button
                  key={p.userId} type="button" ref={i === 0 ? firstCard : undefined}
                  className="card who-card" aria-disabled={offlineOther || undefined} onClick={() => pick(p)}
                  aria-label={`${p.displayName ?? 'Pessoa'}, ${ROLE_LABEL[p.role]}`}
                >
                  <span className="who-avatar" aria-hidden="true">{initialsOf(p.displayName)}</span>
                  <span className="who-name">{first(p.displayName)}</span>
                  <span className="chip">{ROLE_LABEL[p.role]}</span>
                  {blocked && <span className="who-tag who-tag--danger"><Icon name="alerta" size={14} /> PIN bloqueado</span>}
                  {left.length > 0 && <span className="who-tag">Deixou {joinLabels(left)} sem salvar</span>}
                  {!blocked && isCurrent && !online && <span className="who-tag">Usando agora</span>}
                  {!blocked && !offlineOther && !(isCurrent && !online) && p.userId === (lastId ?? currentId) && <span className="who-tag">Usou por último</span>}
                  {offlineOther && <span className="who-tag"><Icon name="cadeado" size={14} /> Precisa de internet</span>}
                </button>
              );
            })}
          </div>
        )}
        <div className="auth-actions auth-actions--center">
          <button
            type="button" className="btn-secondary btn" aria-disabled={!online || undefined} aria-describedby={!online ? 'who-offline-why' : undefined}
            onClick={() => { if (!online) addToast('Precisa de internet.', 'info'); else setPanel({ kind: 'login' }); }}
          >
            {!online && <Icon name="cadeado" size={16} />} Entrar com e-mail e senha
          </button>
        </div>
        {!online && <p id="who-offline-why" className="field-hint who-center">Precisa de internet</p>}
        <p className="who-device">Computador: {device?.name ?? ''}</p>
      </div>
    </div>
  );
};

const OfflineBanner: React.FC<{ currentName: string }> = ({ currentName }) => (
  <div className="app-banner app-banner--warning" role="status">
    <Icon name="sem-internet" size={18} />
    <span><strong>Sem internet.</strong> Só <strong>{currentName}</strong>, que estava usando, pode desbloquear agora. As outras pessoas entram quando a internet voltar.</span>
  </div>
);

import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { useAuth } from '../auth/AuthContext';
import { isAppLocked } from '../utils/appLock';
import { dirtyLabels, joinLabels } from '../utils/dirtyRegistry';
import { useTheme } from '../hooks/useTheme';
import { useDatabase } from '../context/DatabaseContext';
import { ConfirmationModal } from '../modals/ConfirmationModal';
import { ROLE_LABEL, initials } from '../utils/cloudUsers';
import { ChangePasswordModal, ChangePinModal } from './AccountModals';
import { CloudBadge } from './CloudBadge';
import { Icon } from './ui/Icon';
import { usePopover } from './usePopover';
import '../styles-topbar.css';

// Barra do topo do modo nuvem (docs/NUVEM-UX.md 4.1): selo, pessoa (PIN, senha, sair) e "Trocar de pessoa" (F8).
// Só é montada pelo `src/auth/boot.tsx` e só aparece com `useDatabase().cloud`; o modo arquivo nunca importa este arquivo.

export const AppTopbar: React.FC = () => {
  const auth = useAuth();
  const { cloud, hasPendingChanges } = useDatabase();
  const menu = usePopover();
  const [dialog, setDialog] = useState<'pin' | 'password' | 'signout' | null>(null);
  const [switchAsk, setSwitchAsk] = useState<string[] | null>(null);
  const [theme, setTheme] = useTheme();
  const { sharedDevice, switching, switchPerson, gateClosed } = auth;

  // "Trocar de pessoa": se há janela com edição não salva, pergunta antes (o registro vem do useDirtyGuard).
  const requestSwitch = (): void => {
    if (switching || gateClosed || isAppLocked()) return;
    const left = dirtyLabels();
    if (left.length > 0) setSwitchAsk(left);
    else void switchPerson();
  };

  // F8 troca de pessoa (não conflita com F2, Nova OS).
  useEffect(() => {
    if (!sharedDevice) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'F8' || e.repeat) return;
      e.preventDefault();
      // com o bloqueio aberto (ou "Entre de novo") F8 não faz nada: não troca o motivo da tela
      if (isAppLocked() || gateClosed) return;
      requestSwitch();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedDevice, switchPerson, gateClosed, switching]);

  if (!cloud) return null;
  const name = auth.displayName || auth.email || 'Pessoa';
  const first = name.split(' ')[0];
  const role = auth.role ? ROLE_LABEL[auth.role] : '';
  const pending = cloud.pending;

  const signOutText = pending > 0 || hasPendingChanges
    ? `Ainda há ${pending > 0 ? `${pending} ${pending === 1 ? 'alteração sua' : 'alterações suas'}` : 'alterações suas'} que não ${pending === 1 ? 'foi enviada' : 'foram enviadas'}. Elas continuam guardadas neste aparelho e só chegam aos outros quando você entrar de novo aqui e houver internet.`
    : 'Você vai precisar do e-mail e da senha para entrar de novo aqui.';

  const pick = (d: 'pin' | 'password' | 'signout'): void => { menu.close(); setDialog(d); };

  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
    if (items.length === 0) return;
    e.preventDefault();
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
  };

  return (
    <header className="app-topbar">
      <CloudBadge />

      <div className="topbar-person-wrap">
        <button
          ref={menu.triggerRef} type="button" className="topbar-person" aria-haspopup="menu" aria-expanded={menu.open}
          aria-label={`${name}${role ? `, ${role}` : ''}. Menu da pessoa`} onClick={menu.toggle}
        >
          <span className="topbar-avatar" aria-hidden="true">{initials(name)}</span>
          <span className="topbar-person-text" aria-hidden="true"><span className="topbar-first">{first}</span>{role && <><span className="topbar-first"> · </span><span className="topbar-role">{role}</span></>}</span>
        </button>
        {menu.open && (
          <div ref={menu.panelRef} className="topbar-panel topbar-menu" role="menu" onKeyDown={onMenuKey}>
            <div className="topbar-menu-head">
              <strong>{name}</strong>
              {auth.email && <span>{auth.email}</span>}
              {role && <span>Papel: {role}</span>}
            </div>
            <button type="button" role="menuitem" className="topbar-menu-item" onClick={() => pick('pin')} autoFocus>
              <Icon name="chave" size={16} /> Trocar meu PIN
            </button>
            <button type="button" role="menuitem" className="topbar-menu-item" onClick={() => pick('password')}>
              <Icon name="chave" size={16} /> Trocar minha senha
            </button>
            <div className="topbar-menu-group" role="group" aria-label="Aparência">
              <span className="topbar-menu-label">Aparência</span>
              <button type="button" role="menuitemradio" aria-checked={theme === 'dark'} className="topbar-menu-item" onClick={() => setTheme('dark')}>
                <span className="topbar-radio" aria-hidden="true">{theme === 'dark' ? <Icon name="check" size={16} /> : null}</span> Escuro
              </button>
              <button type="button" role="menuitemradio" aria-checked={theme === 'pastel'} className="topbar-menu-item" onClick={() => setTheme('pastel')}>
                <span className="topbar-radio" aria-hidden="true">{theme === 'pastel' ? <Icon name="check" size={16} /> : null}</span> Pastel
              </button>
            </div>
            {!sharedDevice && (
              <button type="button" role="menuitem" className="topbar-menu-item" onClick={() => pick('signout')}>
                <Icon name="sair" size={16} /> Sair deste aparelho
              </button>
            )}
          </div>
        )}
      </div>

      {sharedDevice && (
        <button
          type="button" className="btn-secondary topbar-switch" title="Trocar de pessoa (F8)" aria-busy={switching}
          disabled={switching} onClick={requestSwitch}
        >
          <Icon name="pessoa" size={16} /> {switching ? 'Enviando...' : 'Trocar de pessoa'}
        </button>
      )}

      {dialog === 'pin' && <ChangePinModal onClose={() => setDialog(null)} />}
      {dialog === 'password' && <ChangePasswordModal onClose={() => setDialog(null)} />}
      {/* em portal: a janela da OS (desenhada depois da barra) cobriria este diálogo */}
      {switchAsk && ReactDOM.createPortal(
        <ConfirmationModal
          isOpen onClose={() => setSwitchAsk(null)} onConfirm={() => { setSwitchAsk(null); void switchPerson(); }}
          title="Descartar alterações?" confirmText="Trocar de pessoa" cancelText="Continuar editando" confirmColor="danger"
          message={`Há ${joinLabels(switchAsk)} com alterações que ainda não foram salvas. Se a outra pessoa entrar, o que foi digitado nessa janela se perde.`}
        />,
        document.body,
      )}
      <ConfirmationModal
        isOpen={dialog === 'signout'} onClose={() => setDialog(null)} onConfirm={() => void auth.signOut()}
        title="Sair deste aparelho?" message={signOutText} confirmText="Sair" confirmColor="danger"
      />
    </header>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import { CloudDatabaseProvider } from '../context/CloudDatabaseProvider';
import { useDatabase } from '../context/DatabaseContext';
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton';
import { Icon } from '../components/ui/Icon';
import { AccessGateProps } from './types';
import { useAuth } from './AuthContext';
import { DeactivatedScreen, NotConfiguredScreen, ReauthScreen, RoleChangedScreen } from './AccessScreens';
import { AuthShell, AuthStatusIcon } from './AuthShell';
import { IdleLock } from './IdleLock';
import { InviteLinkError, InviteScreen, ResetLinkError, ResetPasswordScreen } from './InviteScreens';
import { LoginScreen, MfaScreen } from './LoginScreen';
import { pickScreen } from './screens';
import { supabaseConfigured } from './supabaseClient';
import { useTabLock } from './tabLock';
import { setAppLocked } from '../utils/appLock';
import { WhoIsUsing } from './WhoIsUsing';

// Raiz do modo nuvem: escolhe a tela pelo estado do acesso (`pickScreen`) e, com a pessoa entrada, monta
// `CloudDatabaseProvider key={workshopId+userId+role}` (docs/NUVEM-SPEC.md 4 e o comentário de topo do provider).
// O app fica num `div` com `display: contents` que recebe `inert` quando algo o cobre (bloqueio, "Entre de novo"):
// assim os modais abertos continuam montados e a mesma pessoa volta exatamente onde estava.

const openedKey = (ws: string, uid: string): string => `oficina.opened.${ws}.${uid}`;

/** Fica dentro do provider: liga o envio da fila à troca de pessoa, vigia `sem_acesso` e cobre a abertura. */
const CloudBridge: React.FC<{ inert: boolean; children: React.ReactNode; overlay: React.ReactNode }> = ({ inert, children, overlay }) => {
  const auth = useAuth();
  const db = useDatabase();
  const dbRef = useRef(db);
  dbRef.current = db;

  // "Enviando o que a Ana fez...": espera a fila esvaziar (o chamador limita a 10 s).
  const { registerFlush } = auth;
  useEffect(() => {
    registerFlush(async () => {
      // primeiro descarrega a edição que ainda está no debounce e pede o envio; depois espera a fila esvaziar
      if (navigator.onLine) { try { await dbRef.current.cloud?.syncNow?.(); } catch { /* o envio tenta de novo sozinho */ } }
      for (let i = 0; i < 100; i++) {
        const d = dbRef.current;
        if (!navigator.onLine || !d.hasPendingChanges) return;
        await new Promise(r => setTimeout(r, 100));
      }
    });
    return () => registerFlush(null);
  }, [registerFlush]);

  // O motor travou por falta de acesso: descobre se foi desativação, entrar de novo ou troca de papel.
  const lastError = db.cloud?.lastError ?? null;
  const { probeAccess } = auth;
  useEffect(() => { if (lastError === 'sem_acesso') void probeAccess(); }, [lastError, probeAccess]);

  // Nada por baixo do bloqueio age: menus em portal fecham, o resto do body fica inerte e os atalhos globais param.
  useEffect(() => {
    setAppLocked(inert);
    return () => setAppLocked(false);
  }, [inert]);

  return (
    <>
      <div className="cloud-app" inert={inert}>{children}</div>
      <OpeningData />
      {overlay}
    </>
  );
};

/** "Abrindo os dados" (1.4): cobre o app enquanto o cache local abre. */
const OpeningData: React.FC = () => {
  const { isLoading } = useDatabase();
  const { workshopId, userId } = useAuth();
  const key = workshopId && userId ? openedKey(workshopId, userId) : null;
  const [firstTime] = useState(() => { try { return key ? localStorage.getItem(key) === null : false; } catch { return false; } });
  useEffect(() => { if (!isLoading && key) { try { localStorage.setItem(key, '1'); } catch { /* sem armazenamento */ } } }, [isLoading, key]);
  if (!isLoading) return null;
  if (firstTime) {
    return (
      <AuthShell>
        <AuthStatusIcon name="nuvem" />
        <h1 className="auth-title">Preparando este aparelho</h1>
        <p className="auth-text">Baixando os dados da oficina para este aparelho. Na primeira vez pode levar alguns minutos. Não feche o programa.</p>
        <div className="auth-progress" role="progressbar" aria-label="Preparando os dados" aria-busy="true"><span /></div>
      </AuthShell>
    );
  }
  return (
    <div className="auth-screen" role="status">
      <LoadingSkeleton type="page" />
      <p className="auth-opening">Abrindo o OficinaPro...</p>
    </div>
  );
};

const TabBusy: React.FC<{ onTakeOver: () => void }> = ({ onTakeOver }) => (
  <AuthShell>
    <AuthStatusIcon name="info" tone="warning" />
    <h1 className="auth-title">O OficinaPro já está aberto em outra janela</h1>
    <p className="auth-text">Para não misturar os dados, só uma janela por vez pode enviar e receber. Feche a outra janela ou use esta.</p>
    <div className="auth-actions"><button type="button" className="btn" onClick={onTakeOver}><Icon name="computador" size={16} /> Usar esta janela</button></div>
  </AuthShell>
);

export const CloudRoot: React.FC<AccessGateProps> = ({ app }) => {
  const a = useAuth();
  const screen = pickScreen({
    configured: supabaseConfigured(), loading: a.loading, route: a.url.route, linkError: a.url.linkError, hasSession: !!a.session,
    membership: a.membershipState, mfaPending: a.mfaPending, sharedDevice: a.sharedDevice, gateClosed: a.gateClosed,
  });
  const key = a.workshopId && a.userId && a.role ? `${a.workshopId}${a.userId}${a.role}` : null;
  const tab = useTabLock(screen === 'app' || screen === 'lockedApp' ? (key ? `oficinapro-sync-${key}` : null) : null);

  switch (screen) {
    case 'notConfigured': return <NotConfiguredScreen />;
    case 'loading': return <div className="auth-screen" role="status"><LoadingSkeleton type="page" /><p className="auth-opening">Abrindo o OficinaPro...</p></div>;
    case 'inviteLinkError': return <InviteLinkError />;
    case 'invite': return <InviteScreen />;
    case 'resetLinkError': return <ResetLinkError />;
    case 'resetPassword': return <ResetPasswordScreen />;
    case 'mfa': return <MfaScreen />;
    case 'deactivated': return <DeactivatedScreen />;
    case 'login': return <LoginScreen />;
    case 'who':
      // Mesma estrutura de 'lockedApp' (posição 0 vazia): a tela de cartões não perde o estado ao trocar de pessoa.
      return <>{null}<WhoIsUsing /></>;
    case 'app':
    case 'lockedApp': break;
  }

  if (!key || !a.workshopId || !a.userId || !a.role) return <LoadingSkeleton type="page" />;
  if (tab.state === 'busy') return <TabBusy onTakeOver={tab.takeOver} />;
  if (tab.state === 'checking') return <div className="auth-screen" role="status"><LoadingSkeleton type="page" /></div>;

  const locked = screen === 'lockedApp';
  const reauth = a.accessCase === 'reauth' && !locked;
  const roleChanged = a.accessCase === 'roleChanged' && !locked && !reauth;
  const covered = locked || reauth || roleChanged;
  return (
    <>
      <CloudDatabaseProvider
        key={key} supabase={a.supabase} workshopId={a.workshopId} userId={a.userId} role={a.role} deviceId={a.deviceId}
        deviceName={a.deviceName} userName={a.displayName || undefined} resumeSignal={a.resumeSignal}
      >
        <CloudBridge
          inert={covered}
          overlay={<>
            {locked && <WhoIsUsing />}
            {reauth && <ReauthScreen />}
            {roleChanged && <RoleChangedScreen newRole={null} />}
            {a.switching && <div className="auth-switching" role="status">Enviando o que {(a.displayName || 'a pessoa').split(' ')[0]} fez...</div>}
          </>}
        >
          {app}
          <IdleLock />
        </CloudBridge>
      </CloudDatabaseProvider>
    </>
  );
};

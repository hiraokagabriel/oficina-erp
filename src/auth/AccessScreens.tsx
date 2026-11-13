import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { ROLE_LABEL } from './authText';
import { AuthShell, AuthStatusIcon, Spinner } from './AuthShell';
import { LoginScreen } from './LoginScreen';

// Tela "Sem acesso" (docs/NUVEM-UX.md 6.3): A) pessoa desativada, B) entrar de novo, C) papel mudou.

/** A. Pessoa desativada. */
export const DeactivatedScreen: React.FC = () => {
  const { leaveDeactivated, sharedDevice } = useAuth();
  const [busy, setBusy] = useState(false);
  return (
    <AuthShell>
      <AuthStatusIcon name="cadeado" tone="danger" />
      <h1 className="auth-title">Seu acesso foi desativado</h1>
      <p className="auth-text">Fale com o Dono da oficina. Se havia alterações suas que ainda não tinham sido enviadas, elas ficaram numa cópia de recuperação neste aparelho.</p>
      <div className="auth-actions">
        <button type="button" className="btn" aria-busy={busy} disabled={busy} onClick={() => { setBusy(true); void leaveDeactivated(); }}>
          {busy ? <><Spinner /> Saindo...</> : 'Voltar para a tela de entrada'}
        </button>
      </div>
      <p className="field-hint">{sharedDevice ? 'Você vai para "Quem está usando agora?".' : 'Você vai para a tela de entrada.'}</p>
    </AuthShell>
  );
};

/** B. Precisa entrar de novo: e-mail travado, senha, e (PC compartilhado) PIN. */
export const ReauthScreen: React.FC = () => {
  const { lastEmail, signOut, sharedDevice, lock } = useAuth();
  return <LoginScreen reauth lockedEmail={lastEmail} onNotYou={() => { void signOut(); }} onUsePin={sharedDevice ? lock : undefined} />;
};

/** C. O papel mudou enquanto a pessoa usava. */
export const RoleChangedScreen: React.FC<{ newRole: keyof typeof ROLE_LABEL | null }> = ({ newRole }) => {
  const { acceptRoleChange } = useAuth();
  return (
    <AuthShell>
      <AuthStatusIcon name="pessoa" />
      <h1 className="auth-title">Seu papel mudou{newRole ? ` para ${ROLE_LABEL[newRole]}` : ''}</h1>
      <p className="auth-text">O Dono mudou o que você pode ver. O programa vai abrir de novo com o que esse papel permite.</p>
      <div className="auth-actions"><button type="button" className="btn" onClick={acceptRoleChange}>Continuar</button></div>
    </AuthShell>
  );
};

/** Faltam as variáveis do Supabase no `.env` (só aparece em desenvolvimento). */
export const NotConfiguredScreen: React.FC = () => (
  <AuthShell>
    <AuthStatusIcon name="alerta" tone="warning" />
    <h1 className="auth-title">Nuvem não configurada</h1>
    <p className="auth-text">Faltam VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nas configurações deste programa. Fale com quem instalou o sistema.</p>
  </AuthShell>
);

import React, { useRef, useState } from 'react';
import { Icon } from '../components/ui/Icon';
import { useToast } from '../context/ToastContext';
import { useAuth } from './AuthContext';
import { MSG, validateEmail, validateSignIn } from './authText';
import { AuthShell, AuthStatusIcon, FieldError, PasswordField, Spinner, useAutofocus, useCountdown } from './AuthShell';

type View = 'login' | 'forgot' | 'forgotSent';

interface LoginProps {
  /** Texto de ajuda sob o título (ex.: "Você ainda não tem PIN neste computador..."). */
  help?: string;
  /** PC compartilhado: mostra "Voltar para a escolha de pessoa". */
  onBack?: () => void;
  /** E-mail já preenchido e travado ("Entre de novo", 6.3 B). */
  lockedEmail?: string;
  /** Título e texto próprios da tela "Entre de novo". */
  reauth?: boolean;
  onNotYou?: () => void;
  /** Em PC compartilhado, o botão "Usar meu PIN". */
  onUsePin?: () => void;
  /** PIN esquecido ou bloqueado: depois de entrar, oferece criar um PIN novo antes de abrir o app. */
  offerNewPin?: boolean;
}

/** Entrar (1.1) e Esqueci a senha (1.2). */
export const LoginScreen: React.FC<LoginProps> = ({ help, onBack, lockedEmail, reauth, onNotYou, onUsePin, offerNewPin }) => {
  const { signIn, sendResetLink, online, lastEmail } = useAuth();
  const { addToast } = useToast();
  const [view, setView] = useState<View>(() => {
    try { if (sessionStorage.getItem('oficina.openForgot') === '1') { sessionStorage.removeItem('oficina.openForgot'); return 'forgot'; } } catch { /* segue */ }
    return 'login';
  });
  const [email, setEmail] = useState(lockedEmail ?? lastEmail);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<{ field?: 'email' | 'password'; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useCountdown();
  const emailRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);

  useAutofocus(view === 'login' && (email || lockedEmail) ? passRef : emailRef, [view]);

  const focusField = (f?: 'email' | 'password') => { (f === 'password' ? passRef : emailRef).current?.focus(); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!online) { addToast(MSG.offlineSignIn, 'info'); return; }
    const bad = validateSignIn(email, password);
    if (bad) { setError(bad); focusField(bad.field); return; }
    setError(null);
    setBusy(true);
    const r = await signIn(email, password, offerNewPin ? { holdGate: true } : undefined);
    setBusy(false);
    if (!r.ok) {
      setError({ message: r.message, field: 'password' });
      setPassword('');
      passRef.current?.focus();
    }
  };

  const sendLink = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    if (!online) { addToast(MSG.offlineForgot, 'info'); return; }
    const bad = validateEmail(email);
    if (bad) { setError({ field: 'email', message: bad }); focusField('email'); return; }
    setError(null);
    setBusy(true);
    const r = await sendResetLink(email);
    setBusy(false);
    if (!r.ok) { setError({ message: r.message }); return; }
    setLeft(60);
    setView('forgotSent');
  };

  const offlineBanner = !online
    ? <div className="app-banner app-banner--warning" role="status"><Icon name="sem-internet" size={18} /> Sem internet. Conecte o aparelho para entrar.</div>
    : null;

  if (view === 'forgotSent') {
    return (
      <AuthShell banner={offlineBanner}>
        <AuthStatusIcon name="check" tone="success" />
        <h1 className="auth-title">Confira seu e-mail</h1>
        <p className="auth-text">Se <strong>{email.trim()}</strong> tiver acesso ao OficinaPro, o link chega em alguns minutos.</p>
        <div className="attention-note">
          <Icon name="alerta" className="attention-note-icon" />
          <div className="attention-note-text"><strong>Não achou?</strong> Olhe também na caixa <strong>Spam</strong> ou <strong>Lixo eletrônico</strong>. Procure por "OficinaPro". Se estiver lá, marque como "Não é spam".</div>
        </div>
        {error && <FieldError>{error.message}</FieldError>}
        <div className="auth-actions">
          <button type="button" className="btn" onClick={() => { setView('login'); setError(null); }}>Voltar para Entrar</button>
          <button type="button" className="btn-secondary btn" disabled={left > 0 || busy} onClick={() => { void sendLink(); }}>
            {left > 0 ? `Mandar de novo em ${left} s` : 'Mandar de novo'}
          </button>
        </div>
      </AuthShell>
    );
  }

  if (view === 'forgot') {
    return (
      <AuthShell banner={offlineBanner}>
        <h1 className="auth-title">Esqueci a senha</h1>
        <p className="auth-text">Digite o e-mail do seu acesso. Vamos mandar um link para você criar uma senha nova.</p>
        <form onSubmit={e => { void sendLink(e); }} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="auth-forgot-email">E-mail</label>
            <input
              id="auth-forgot-email" ref={emailRef} className="form-input" type="email" autoComplete="username" value={email}
              aria-invalid={error?.field === 'email' || undefined} aria-describedby={error ? 'auth-err' : undefined}
              onChange={ev => setEmail(ev.target.value)} disabled={busy}
            />
          </div>
          {error && <FieldError id="auth-err">{error.message}</FieldError>}
          <div className="auth-actions">
            <button type="submit" className="btn" aria-busy={busy} aria-disabled={!online || undefined}>
              {busy ? <><Spinner /> Enviando...</> : 'Enviar link'}
            </button>
            <button type="button" className="btn-ghost btn" onClick={() => { setView('login'); setError(null); }}>Voltar para Entrar</button>
          </div>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell banner={offlineBanner}>
      {reauth ? (
        <>
          <AuthStatusIcon name="pessoa" />
          <h1 className="auth-title">Entre de novo para continuar</h1>
          <p className="auth-text">Por segurança, digite sua senha outra vez. Nada do que você fez se perdeu: está guardado neste aparelho.</p>
        </>
      ) : (
        <>
          <h1 className="auth-title">Entrar</h1>
          <p className="auth-text">{help ?? 'Use o e-mail e a senha do seu convite.'}</p>
        </>
      )}
      <form onSubmit={e => { void submit(e); }} noValidate>
        <div className="form-group">
          <label className="form-label" htmlFor="auth-email">E-mail</label>
          <input
            id="auth-email" ref={emailRef} className="form-input" type="email" autoComplete="username" inputMode="email"
            value={email} readOnly={!!lockedEmail} disabled={busy}
            aria-invalid={error?.field === 'email' || undefined} aria-describedby={error ? 'auth-err' : undefined}
            onChange={ev => setEmail(ev.target.value)}
          />
          {lockedEmail && onNotYou && <button type="button" className="btn-ghost btn-sm" onClick={onNotYou}>Não é você?</button>}
        </div>
        <PasswordField
          label="Senha" value={password} onChange={setPassword} autoComplete="current-password" disabled={busy}
          invalid={error?.field === 'password'} describedBy={error ? 'auth-err' : undefined} inputRef={passRef}
        />
        {error && <FieldError id="auth-err">{error.message}</FieldError>}
        <button type="submit" className="btn auth-wide" aria-busy={busy} aria-disabled={!online || undefined}>
          {busy ? <><Spinner /> Entrando...</> : 'Entrar'}
        </button>
        {!online && <p className="field-hint" id="auth-offline-why">Sem internet. Conecte o aparelho para entrar.</p>}
      </form>
      {reauth && onUsePin && <button type="button" className="btn-secondary btn auth-wide" onClick={onUsePin}>Usar meu PIN</button>}
      <div className="auth-links">
        <button type="button" className="btn-ghost btn" onClick={() => { setView('forgot'); setError(null); }}>Esqueci a senha</button>
      </div>
      {onBack && (
        <div className="auth-foot">
          <button type="button" className="btn-ghost btn" onClick={onBack}><Icon name="voltar" size={16} /> Voltar para a escolha de pessoa</button>
        </div>
      )}
    </AuthShell>
  );
};

/** Código de verificação em 2 etapas do Dono (1.1). */
export const MfaScreen: React.FC = () => {
  const { verifyMfa, signOut } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useAutofocus(ref);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const r = await verifyMfa(code);
    setBusy(false);
    if (!r.ok) { setError(r.message); setCode(''); ref.current?.focus(); }
  };
  return (
    <AuthShell>
      <h1 className="auth-title">Código de verificação</h1>
      <p className="auth-text">Abra o aplicativo de códigos no seu celular (Google Authenticator ou parecido) e digite os 6 números.</p>
      <form onSubmit={e => { void submit(e); }}>
        <div className="form-group">
          <label className="form-label" htmlFor="auth-mfa">Código</label>
          <input id="auth-mfa" ref={ref} className="form-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ''))} aria-describedby={error ? 'auth-err' : undefined} />
        </div>
        {error && <FieldError id="auth-err">{error}</FieldError>}
        <button type="submit" className="btn auth-wide" aria-busy={busy}>{busy ? <><Spinner /> Confirmando...</> : 'Confirmar'}</button>
      </form>
      <div className="auth-foot"><button type="button" className="btn-ghost btn" onClick={() => { void signOut(); }}>Cancelar e sair</button></div>
    </AuthShell>
  );
};

import React, { useId, useRef, useState } from 'react';
import { Icon } from '../components/ui/Icon';
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton';
import { useAuth } from './AuthContext';
import { MSG, ROLE_BLURB, ROLE_LABEL, validateNewPassword } from './authText';
import {
  AuthShell, AuthStatusIcon, FieldError, PASSWORD_HINT, PasswordField, PasswordRule, Spinner, useAutofocus,
} from './AuthShell';
import { PIN_FORMAT_MESSAGES, PIN_LENGTH, sanitizePinInput, validateNewPin } from './pinLogic';

const goHome = (): void => { window.location.replace('/'); };
const firstName = (n: string): string => n.trim().split(/\s+/)[0] ?? '';

/** Campo de PIN de 6 números: `type=password`, `inputMode=numeric`, "Mostrar". */
export const PinField: React.FC<{
  label: string; value: string; onChange: (v: string) => void; disabled?: boolean; invalid?: boolean; describedBy?: string;
  inputRef?: React.Ref<HTMLInputElement>; hint?: React.ReactNode;
}> = ({ label, value, onChange, disabled, invalid, describedBy, inputRef, hint }) => {
  const [show, setShow] = useState(false);
  const id = useId();
  return (
    <div className="form-group">
      <div className="auth-label-row">
        <label className="form-label" htmlFor={id}>{label}</label>
        <button type="button" className="btn-ghost btn-sm auth-show" aria-pressed={show} onClick={() => setShow(s => !s)}>
          <Icon name="olho" size={16} /> {show ? 'Esconder' : 'Mostrar'}
        </button>
      </div>
      <div className="pin-boxes">
        <div className="pin-box-row" aria-hidden="true">
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <span key={i} className={`pin-box${i === value.length && !disabled ? ' pin-box--next' : ''}${invalid ? ' pin-box--invalid' : ''}`}>
              {i < value.length ? (show ? value[i] : '●') : ''}
            </span>
          ))}
        </div>
        <input
          id={id} ref={inputRef} className="pin-box-input" type={show ? 'text' : 'password'} inputMode="numeric" maxLength={PIN_LENGTH}
          autoComplete="off" value={value} disabled={disabled} aria-invalid={invalid || undefined} aria-describedby={describedBy}
          onChange={e => onChange(sanitizePinInput(e.target.value))}
        />
      </div>
      {hint}
    </div>
  );
};

/** Aceitar convite em 2 passos (2): senha e PIN. Rota `/convite`. */
export const InviteScreen: React.FC = () => {
  const { displayName, workshopName, role, membershipState, setNewPassword, createPin, signOut } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pwRef = useRef<HTMLInputElement>(null);
  const pinRef = useRef<HTMLInputElement>(null);
  useAutofocus(pwRef, [step === 1]);
  useAutofocus(pinRef, [step === 2]);

  if (membershipState === 'unknown') return <AuthShell><LoadingSkeleton type="card" /></AuthShell>;
  if (membershipState === 'none' || !role) {
    return (
      <AuthShell>
        <AuthStatusIcon name="alerta" tone="warning" />
        <h1 className="auth-title">Este convite não vale mais</h1>
        <p className="auth-text">Este convite foi cancelado. Fale com o Dono da oficina.</p>
        <div className="auth-actions"><button type="button" className="btn" onClick={() => { void signOut().then(goHome); }}>Entrar</button></div>
      </AuthShell>
    );
  }
  const name = firstName(displayName);

  const toStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const bad = validateNewPassword(pw, pw2);
    if (bad) { setError(bad); pwRef.current?.focus(); return; }
    setError(null); setBusy(true);
    const r = await setNewPassword(pw, pw2);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setStep(2);
  };

  const finish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const f = validateNewPin(pin);
    if (f) { setError(PIN_FORMAT_MESSAGES[f]); pinRef.current?.focus(); return; }
    if (pin !== pin2) { setError(MSG.pinMismatch); return; }
    setError(null); setBusy(true);
    const r = await createPin(pin, pin2);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setStep(3);
  };

  if (step === 3) {
    return (
      <AuthShell>
        <AuthStatusIcon name="check" tone="success" />
        <h1 className="auth-title">Tudo pronto{name ? `, ${name}` : ''}!</h1>
        <p className="auth-text"><strong>No computador da oficina:</strong> toque no seu nome e digite o PIN.<br /><strong>No celular:</strong> entre com seu e-mail e senha.</p>
        <div className="auth-actions"><button type="button" className="btn" onClick={goHome}>Entrar agora</button></div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <p className="auth-step" aria-live="polite">Passo {step} de 2</p>
      <h1 className="auth-title">Bem-vindo(a){name ? `, ${name}` : ''}!</h1>
      <p className="auth-text">O Dono da <strong>{workshopName}</strong> convidou você para usar o OficinaPro como <strong>{ROLE_LABEL[role]}</strong>.</p>
      <p className="field-hint">{ROLE_BLURB[role]}</p>
      {step === 1 ? (
        <form onSubmit={e => { void toStep2(e); }} noValidate>
          <h2 className="auth-subtitle">Crie sua senha</h2>
          <p className="auth-text">Você vai usar esta senha com o seu e-mail para entrar no celular ou num computador novo.</p>
          <PasswordField label="Senha nova" value={pw} onChange={setPw} autoComplete="new-password" disabled={busy} inputRef={pwRef}
            describedBy={error ? 'auth-err' : undefined} hint={<><p className="field-hint">{PASSWORD_HINT}</p><PasswordRule value={pw} /></>} />
          <PasswordField label="Repita a senha nova" value={pw2} onChange={setPw2} autoComplete="new-password" disabled={busy} />
          {error && <FieldError id="auth-err">{error}</FieldError>}
          <button type="submit" className="btn auth-wide" aria-busy={busy}>{busy ? <><Spinner /> Salvando...</> : 'Continuar'}</button>
        </form>
      ) : (
        <form onSubmit={e => { void finish(e); }} noValidate>
          <h2 className="auth-subtitle">Crie seu PIN</h2>
          <p className="auth-text">O PIN são <strong>6 números</strong> para entrar rápido no computador da oficina, tocando no seu nome. Não conte para ninguém.</p>
          <PinField label="PIN (6 números)" value={pin} onChange={setPin} disabled={busy} inputRef={pinRef} describedBy={error ? 'auth-err' : undefined}
            hint={<p className="field-hint">Evite números fáceis, como 123456, 111111 ou sua data de nascimento.</p>} />
          <PinField label="Repita o PIN" value={pin2} onChange={setPin2} disabled={busy} />
          {error && <FieldError id="auth-err">{error}</FieldError>}
          <button type="submit" className="btn auth-wide" aria-busy={busy}>{busy ? <><Spinner /> Salvando...</> : 'Concluir'}</button>
          <div className="auth-foot"><button type="button" className="btn-ghost btn" onClick={() => { setStep(1); setError(null); }}><Icon name="voltar" size={16} /> Voltar para a senha</button></div>
        </form>
      )}
    </AuthShell>
  );
};

/** Link do convite vencido ou usado (2). */
export const InviteLinkError: React.FC = () => (
  <AuthShell>
    <AuthStatusIcon name="alerta" tone="warning" />
    <h1 className="auth-title">Este convite não vale mais</h1>
    <p className="auth-text">O link do convite venceu ou já foi usado. Peça ao Dono para reenviar o convite. Se você já criou sua senha, é só entrar.</p>
    <div className="auth-actions">
      <button type="button" className="btn" onClick={goHome}>Entrar</button>
      <button type="button" className="btn-secondary btn" onClick={() => { try { sessionStorage.setItem('oficina.openForgot', '1'); } catch { /* segue */ } goHome(); }}>Esqueci a senha</button>
    </div>
  </AuthShell>
);

/** Nova senha, pelo link do e-mail (1.3). Rota `/nova-senha`. */
export const ResetPasswordScreen: React.FC = () => {
  const { setNewPassword, signOut } = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useAutofocus(ref);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const bad = validateNewPassword(pw, pw2);
    if (bad) { setError(bad); ref.current?.focus(); return; }
    setError(null); setBusy(true);
    const r = await setNewPassword(pw, pw2);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setDone(true);
  };

  if (done) {
    return (
      <AuthShell>
        <AuthStatusIcon name="check" tone="success" />
        <h1 className="auth-title">Senha trocada</h1>
        <p className="auth-text">Pronto. Agora entre com a senha nova. No computador da oficina, continue usando seu PIN normalmente.</p>
        <div className="auth-actions"><button type="button" className="btn" onClick={() => { void signOut().then(goHome); }}>Entrar</button></div>
      </AuthShell>
    );
  }
  return (
    <AuthShell>
      <h1 className="auth-title">Criar senha nova</h1>
      <form onSubmit={e => { void submit(e); }} noValidate>
        <PasswordField label="Senha nova" value={pw} onChange={setPw} autoComplete="new-password" disabled={busy} inputRef={ref}
          describedBy={error ? 'auth-err' : undefined} hint={<><p className="field-hint">{PASSWORD_HINT}</p><PasswordRule value={pw} /></>} />
        <PasswordField label="Repita a senha nova" value={pw2} onChange={setPw2} autoComplete="new-password" disabled={busy} />
        {error && <FieldError id="auth-err">{error}</FieldError>}
        <button type="submit" className="btn auth-wide" aria-busy={busy}>{busy ? <><Spinner /> Salvando...</> : 'Salvar senha nova'}</button>
      </form>
    </AuthShell>
  );
};

/** Link de nova senha vencido ou usado (1.3). */
export const ResetLinkError: React.FC = () => (
  <AuthShell>
    <AuthStatusIcon name="alerta" tone="warning" />
    <h1 className="auth-title">Este link não vale mais</h1>
    <p className="auth-text">O link venceu ou já foi usado. Peça um novo.</p>
    <div className="auth-actions">
      <button type="button" className="btn" onClick={() => { try { sessionStorage.setItem('oficina.openForgot', '1'); } catch { /* segue */ } goHome(); }}>Pedir link novo</button>
    </div>
  </AuthShell>
);

import React, { useEffect, useId, useState } from 'react';
import { Icon } from '../components/ui/Icon';
import type { IconName } from '../components/ui/Icon';

// Peças comuns das telas de acesso (docs/NUVEM-UX.md 0.2, 0.4 e 1.1). Estilo em `styles-auth.css`.

/** Tela inteira opaca com cartão central de 420 px e a marca. */
export const AuthShell: React.FC<{ children: React.ReactNode; wide?: boolean; banner?: React.ReactNode }> = ({ children, wide, banner }) => (
  <div className="auth-screen">
    {banner}
    <div className="auth-center">
      <div className={`card auth-card${wide ? ' auth-card--wide' : ''}`}>
        <div className="logo-text auth-logo">OFICINA<span className="logo-highlight">PRO</span></div>
        {children}
      </div>
    </div>
  </div>
);

export const AuthStatusIcon: React.FC<{ name: IconName; tone?: 'success' | 'warning' | 'danger' | 'muted' }> = ({ name, tone = 'muted' }) => (
  <div className={`auth-big-icon auth-big-icon--${tone}`}><Icon name={name} size={40} /></div>
);

export const Spinner: React.FC = () => <span className="auth-spinner" aria-hidden="true" />;

/** Aviso de erro: `role="alert"`, texto em `--text-danger`. */
export const FieldError: React.FC<{ id?: string; children: React.ReactNode }> = ({ id, children }) => (
  <p id={id} className="field-error auth-error" role="alert">{children}</p>
);

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: 'current-password' | 'new-password';
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  hint?: React.ReactNode;
}

/** Campo de senha com "Mostrar"/"Esconder" e aviso de Caps Lock. */
export const PasswordField: React.FC<PasswordFieldProps> = ({ label, value, onChange, autoComplete, disabled, invalid, describedBy, inputRef, hint }) => {
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const id = useId();
  return (
    <div className="form-group">
      <div className="auth-label-row">
        <label className="form-label" htmlFor={id}>{label}</label>
        <button type="button" className="btn-ghost btn-sm auth-show" aria-pressed={show} onClick={() => setShow(s => !s)}>
          <Icon name="olho" size={16} /> {show ? 'Esconder' : 'Mostrar'}
        </button>
      </div>
      <input
        id={id} ref={inputRef} className="form-input" type={show ? 'text' : 'password'} value={value} disabled={disabled}
        autoComplete={autoComplete} aria-invalid={invalid || undefined} aria-describedby={describedBy}
        onChange={e => onChange(e.target.value)}
        onKeyUp={e => setCaps(e.getModifierState('CapsLock'))}
        onBlur={() => setCaps(false)}
      />
      {hint}
      {caps && <p className="field-hint auth-caps"><Icon name="alerta" size={14} /> Caps Lock ligado: a senha pode sair em maiúsculas.</p>}
    </div>
  );
};

/** Regra ao vivo "8 ou mais caracteres" (ícone check verde ou info cinza). */
export const PasswordRule: React.FC<{ value: string }> = ({ value }) => {
  const ok = value.length >= 8;
  return (
    <p className={`auth-rule${ok ? ' auth-rule--ok' : ''}`}>
      <Icon name={ok ? 'check' : 'info'} size={16} /> 8 ou mais caracteres
    </p>
  );
};

export const PASSWORD_HINT = 'Pelo menos 8 letras ou números. Dica: use uma frase fácil de lembrar, como carro-azul-2026.';

/** Foca o primeiro campo ao abrir. */
export function useAutofocus<T extends HTMLElement>(ref: React.RefObject<T | null>, deps: React.DependencyList = []): void {
  useEffect(() => { ref.current?.focus(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Contagem regressiva em segundos (reenvio do link). */
export function useCountdown(): [number, (s: number) => void] {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft(l => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, setLeft];
}

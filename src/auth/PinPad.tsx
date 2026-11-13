import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/ui/Icon';
import { initialsOf, ROLE_LABEL } from './authText';
import { PIN_LENGTH, sanitizePinInput } from './pinLogic';
import type { PinFailure } from './pinLogic';

// Painel do PIN (docs/NUVEM-UX.md 3.2 e 3.4): 6 bolinhas, campo real por trás (teclado físico e NumLock), teclado na tela
// com teclas de 72 px. Envia sozinho ao chegar a 6 números. Nunca mostra nem anuncia os números.

export interface PinPadProps {
  name: string;
  role: keyof typeof ROLE_LABEL;
  /** Devolve `null` quando o PIN foi aceito (a tela some) ou a falha para mostrar. */
  onSubmit: (pin: string) => Promise<PinFailure | null>;
  onBack: () => void;
  /** Teclado travado (5 erros sem internet, PIN bloqueado). */
  lockedMessage?: string | null;
  title?: string;
  children?: React.ReactNode;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

export const PinPad: React.FC<PinPadProps> = ({ name, role, onSubmit, onBack, lockedMessage, title = 'Digite seu PIN', children }) => {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const disabled = busy || !!lockedMessage;

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { if (!busy && !lockedMessage) inputRef.current?.focus(); }, [busy, lockedMessage]);

  const submit = async (pin: string) => {
    setBusy(true);
    setError(null);
    const fail = await onSubmit(pin);
    // Sucesso: o componente é desmontado pela troca de tela; só falhas chegam aqui com valor.
    setBusy(false);
    if (fail) { setValue(''); setError(fail.message); }
  };

  const change = (raw: string) => {
    if (disabled) return;
    const v = sanitizePinInput(raw);
    setValue(v);
    if (error) setError(null);
    if (v.length === PIN_LENGTH) void submit(v);
  };

  const press = (d: string) => change(value + d);

  return (
    <div className="pin-panel">
      <button type="button" className="btn-ghost btn pin-back" onClick={onBack}><Icon name="voltar" size={16} /> Voltar</button>
      <div className="who-avatar who-avatar--lg" aria-hidden="true">{initialsOf(name)}</div>
      <div className="pin-name">{name}</div>
      <span className="chip">{ROLE_LABEL[role]}</span>
      <h2 className="pin-title" id="pin-title">{title}</h2>

      <div className={`pin-dots${busy ? ' pin-dots--busy' : ''}`} aria-hidden="true">
        {Array.from({ length: PIN_LENGTH }, (_, i) => <span key={i} className={`pin-dot${i < value.length ? ' pin-dot--on' : ''}`} />)}
      </div>
      <input
        ref={inputRef} className="pin-real" type="password" inputMode="numeric" autoComplete="off" maxLength={PIN_LENGTH}
        value={value} disabled={disabled} aria-label={`PIN de ${name}, 6 números`} aria-describedby="pin-live pin-msg"
        onChange={e => change(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Delete') { e.preventDefault(); setValue(''); }
          else if (e.key === 'Escape') { e.preventDefault(); onBack(); }
        }}
      />
      <p id="pin-live" className="sr-only" aria-live="polite">{value.length > 0 ? `${value.length} de ${PIN_LENGTH} números digitados` : ''}</p>
      <div id="pin-msg" className="pin-msg">
        {busy && <p role="status" className="pin-checking">Conferindo...</p>}
        {!busy && (lockedMessage || error) && <p role="alert" className="field-error">{lockedMessage ?? error}</p>}
      </div>

      <div className="pin-keys" role="group" aria-label="Teclado numérico">
        {KEYS.map(k => <button key={k} type="button" className="pin-key" disabled={disabled} onClick={() => press(k)}>{k}</button>)}
        <button type="button" className="pin-key pin-key--small" disabled={disabled} onClick={() => setValue(v => v.slice(0, -1))}>
          <Icon name="apagar" size={22} /><span>Apagar</span>
        </button>
        <button type="button" className="pin-key" disabled={disabled} onClick={() => press('0')}>0</button>
        <button type="button" className="pin-key pin-key--small" disabled={disabled} onClick={() => setValue('')}>Limpar</button>
      </div>
      {children}
    </div>
  );
};

import React, { useState } from 'react';
import { useToast } from '../context/ToastContext';
import { useAuth } from './AuthContext';
import { MSG } from './authText';
import { PinPad } from './PinPad';
import { PIN_FORMAT_MESSAGES, validateNewPin } from './pinLogic';
import type { PinFailure } from './pinLogic';

// "Criar PIN novo": logo depois de entrar com e-mail e senha porque o PIN foi esquecido ou bloqueado. A sessão acabou de
// nascer da senha, então o servidor aceita `pin.set` sem o PIN atual (que a pessoa não tem mais). Cobre o app, como o bloqueio.

export const NewPinScreen: React.FC = () => {
  const { createPin, finishPinSetup, displayName, role } = useAuth();
  const { addToast } = useToast();
  const [first, setFirst] = useState<string | null>(null);

  const submit = async (pin: string): Promise<PinFailure | null> => {
    if (first === null) {
      const bad = validateNewPin(pin);
      if (bad) return { kind: 'other', message: PIN_FORMAT_MESSAGES[bad] };
      setFirst(pin);
      return null;
    }
    if (pin !== first) {
      setFirst(null);
      return { kind: 'other', message: MSG.pinMismatch };
    }
    const r = await createPin(pin, pin);
    if (!r.ok) return { kind: 'other', message: r.message };
    addToast('PIN novo criado. Use-o da próxima vez.', 'success');
    finishPinSetup();
    return null;
  };

  const name = displayName || 'Pessoa';
  return (
    <div className="auth-screen">
      <div className="auth-center">
        <div className="card auth-card auth-card--pin">
          <h1 className="auth-title">Criar PIN novo</h1>
          <p className="auth-text">Escolha 6 números que só você sabe. Sem números repetidos nem em sequência.</p>
          <PinPad
            key={first === null ? 'novo' : 'repita'} name={name} role={role ?? 'mecanico'} title={first === null ? 'Crie um PIN novo' : 'Repita o PIN novo'}
            onSubmit={submit} onBack={() => (first === null ? finishPinSetup() : setFirst(null))}
          >
            <div className="auth-links">
              <button type="button" className="btn-ghost btn" onClick={finishPinSetup}>Agora não</button>
            </div>
          </PinPad>
        </div>
      </div>
    </div>
  );
};

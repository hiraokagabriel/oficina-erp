import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/ui/Icon';
import { useAuth } from './AuthContext';
import { computeIdle, idleWarningText } from './idle';
import type { IdleState } from './idle';

// Bloqueio por inatividade (docs/NUVEM-UX.md 4.3). Só em PC compartilhado autorizado. Liga ponteiro e teclado, avisa 60 s
// antes e então chama `lock()`, que abre "Quem está usando" POR CIMA do app (o app continua montado, só fica `inert`).

const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;

export const IdleLock: React.FC = () => {
  const { device, gateClosed, lock } = useAuth();
  const minutes = device?.idleMinutes ?? null;
  const last = useRef(Date.now());
  const [state, setState] = useState<IdleState>({ kind: 'active' });
  const active = !!device && !gateClosed && minutes !== null;

  useEffect(() => {
    if (!active) return;
    last.current = Date.now();
    setState({ kind: 'active' });
    const touch = () => { last.current = Date.now(); };
    for (const ev of ACTIVITY_EVENTS) document.addEventListener(ev, touch, { passive: true, capture: true });
    const tick = () => {
      const s = computeIdle(last.current, Date.now(), minutes);
      setState(prev => (prev.kind === s.kind && (s.kind !== 'warning' || (prev.kind === 'warning' && prev.secondsLeft === s.secondsLeft)) ? prev : s));
      if (s.kind === 'locked') lock();
    };
    const id = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
      for (const ev of ACTIVITY_EVENTS) document.removeEventListener(ev, touch, { capture: true });
    };
  }, [active, minutes, lock]);

  if (!active || minutes === null || state.kind !== 'warning') return null;
  return (
    <div className="app-banner app-banner--warning idle-banner">
      <Icon name="relogio" size={18} />
      <span className="sr-only" role="alert">{`${idleWarningText(minutes)} 60 segundos.`}</span>
      <span aria-hidden="true">{idleWarningText(minutes)} <strong>{state.secondsLeft}</strong> segundos.</span>
      <button type="button" className="btn-secondary btn-sm" onClick={() => { last.current = Date.now(); setState({ kind: 'active' }); }}>Continuar usando</button>
    </div>
  );
};

import React from 'react';
import { Icon } from '../ui/Icon';

// Faixa de atenção do Financeiro: só aparece quando há conta vencida ou valor atrasado. Visual puro:
// as frases e os botões chegam prontos (sem aria-live: não interrompe quem está lendo a tela).

export interface FinAlertAction {
  label: string;
  /** id do título (h2) da caixa que o botão leva o usuário. */
  targetId: string;
}

interface Props {
  /** Até 2 frases, já formatadas. Vazio = a faixa não aparece. */
  messages: string[];
  actions: FinAlertAction[];
}

const goTo = (id: string) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ block: 'start' });
  el.focus();
};

export const FinAlertStrip: React.FC<Props> = ({ messages, actions }) => {
  if (messages.length === 0) return null;
  return (
    <div className="fin-alert" role="group" aria-label="Atenção">
      <Icon name="alerta" size={24} className="fin-alert__icon" />
      <div className="fin-alert__text">
        {messages.slice(0, 2).map(m => <p key={m}>{m}</p>)}
      </div>
      <div className="fin-alert__actions">
        {actions.map(a => (
          <button key={a.targetId} type="button" className="btn btn-secondary" onClick={() => goTo(a.targetId)}>{a.label}</button>
        ))}
      </div>
    </div>
  );
};

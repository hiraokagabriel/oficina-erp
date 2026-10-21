import React from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { Icon, IconName } from './ui/Icon';
import { describeSaveStatus, SaveStatusKind } from '../utils/saveStatus';

const ICONS: Record<SaveStatusKind, IconName> = {
  saved: 'check', saving: 'relogio', pending: 'relogio', error: 'alerta', conflict: 'alerta', readonly: 'info',
};

/** Estado do salvamento no rodapé do menu: ícone + texto (cor nunca é a única pista). */
export const SaveIndicator: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isSaving, saveError, readOnly, lastSavedAt, hasPendingChanges, hasConflict } = useDatabase();
  const view = describeSaveStatus({ isSaving, saveError, readOnly, lastSavedAt, hasPendingChanges, hasConflict });
  // "Salvando"/"Salvo"/"pendente" mudam a cada edição: não anunciar. Só problemas interrompem o leitor de tela.
  const live = view.kind === 'error' || view.kind === 'conflict' ? 'polite' : 'off';
  return (
    <div
      role="status"
      aria-live={live}
      className={`save-indicator save-indicator--${view.kind}${compact ? ' save-indicator--compact' : ''}`}
      title={view.text}
    >
      <Icon name={ICONS[view.kind]} size={18} />
      <span className={compact ? 'sr-only' : undefined}>{view.text}</span>
    </div>
  );
};

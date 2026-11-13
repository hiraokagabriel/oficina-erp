import React, { useEffect, useRef, useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { describeCloudStatus, shouldAnnounceChange } from '../utils/cloudStatus';
import type { CloudBadgeKind } from '../utils/cloudStatus';
import { Icon } from './ui/Icon';
import { usePopover } from './usePopover';

// Selo fixo do topo no modo nuvem (docs/NUVEM-UX.md 6.1): salvo, enviando, sem internet ou erro, com painel de detalhes.
// O texto vem de `describeCloudStatus` (puro, com teste). Só é montado quando `useDatabase().cloud` existe.

export const CloudBadge: React.FC = () => {
  const { cloud, lastSavedAt } = useDatabase();
  const pop = usePopover();
  useFocusTrap(pop.open, pop.panelRef);
  const [retrying, setRetrying] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const prev = useRef<CloudBadgeKind | null>(null);

  const view = cloud
    ? describeCloudStatus({ syncState: cloud.syncState, pending: cloud.pending, lastError: cloud.lastError, lastSavedAt })
    : null;
  const kind = view?.kind ?? null;
  const text = view?.text ?? '';

  // Só problemas e a volta ao normal interrompem o leitor de tela; "Enviando" nunca.
  useEffect(() => {
    if (!kind) return;
    setAnnouncement(shouldAnnounceChange(prev.current, kind) ? text : '');
    prev.current = kind;
    // `text` muda a cada alteração enviada; só a troca de estado anuncia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  if (!cloud || !view) return null;

  const retry = async (): Promise<void> => {
    if (!cloud.syncNow) return;
    setRetrying(true);
    try { await cloud.syncNow(); } finally { setRetrying(false); }
  };

  return (
    <div className="cloud-badge-wrap">
      <button
        ref={pop.triggerRef} type="button"
        className={`cloud-badge cloud-badge--${view.kind}`}
        aria-expanded={pop.open} aria-haspopup="dialog" aria-controls="cloud-badge-panel"
        title={view.text} onClick={pop.toggle}
      >
        {view.icons.map(n => <Icon key={n} name={n} size={16} />)}
        <span className="cloud-badge-text">{view.text}</span>
        <span className="cloud-badge-short" aria-hidden="true">{view.shortText}</span>
      </button>
      <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
      {pop.open && (
        <div ref={pop.panelRef} id="cloud-badge-panel" className="topbar-panel cloud-badge-panel" role="dialog" aria-label="Estado do envio">
          {view.detail.map(p => <p key={p} className="topbar-panel-text">{p}</p>)}
          {view.advice && <p className="topbar-panel-text topbar-panel-advice">{view.advice}</p>}
          {view.canRetry && cloud.syncNow && (
            <button type="button" className="btn btn-sm" onClick={() => void retry()} disabled={retrying} aria-busy={retrying}>
              {retrying ? 'Enviando...' : 'Tentar enviar agora'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

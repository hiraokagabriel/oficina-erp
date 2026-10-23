import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { WorkOrder, OSStatus, STATUS_LABELS } from '../types';
import { KanbanCardMenu, KanbanCardActions } from './KanbanCardMenu';
import { Icon } from './ui/Icon';
import { DEFAULT_TARGET_MARGIN } from '../services/margin';
import { getMarginBadge } from '../services/marginView';
import { deliveryProgress, formatKm, nextStep, splitVehicle, statusClass } from '../services/kanbanCardView';

interface KanbanCardProps {
  os: WorkOrder;
  formatMoney: (val: number) => string;
  status: OSStatus;
  actions: KanbanCardActions;
  /** Mesmo handler do arrastar: o botão de próximo passo cai nos mesmos diálogos de finalização. */
  onStatusChange: (orderId: string, newStatus: OSStatus) => void;
  /** Dia de hoje ('AAAA-MM-DD'), calculado uma vez pelo quadro (string: não quebra o React.memo). */
  today: string;
  /** Selo de margem: só aparece se a oficina ligou a opção na Configuração. */
  showMargin?: boolean;
  isDragging?: boolean;
  /** Meta de margem global (%), das Configurações. */
  targetMargin?: number;
}

const CARD_HELP =
  'Clique abre a OS. Clique direito ou botão "Mais": todas as ações. Ctrl+clique: finalizar rápido. ' +
  'Mover com o teclado: tecle M, use as setas e confirme com Enter.';

export const KanbanCard = React.memo(({
  os,
  formatMoney,
  status,
  actions,
  onStatusChange,
  today,
  showMargin = false,
  isDragging: forcedDragging,
  targetMargin = DEFAULT_TARGET_MARGIN
}: KanbanCardProps) => {
  // Só abre com clique no "Mais" ou clique direito; o menu nem é montado enquanto está fechado.
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: os.id });

  const { onKeyDown: dndKeyDown, ...pointerListeners } = listeners ?? {};

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging || forcedDragging ? 9999 : 'auto',
  };

  const cardClassName = [
    'kanban-card',
    'kcard',
    `kcard--${statusClass(status)}`,
    isDragging && 'is-dragging',
    forcedDragging && 'is-overlay'
  ].filter(Boolean).join(' ');

  const marginBadge = showMargin ? getMarginBadge(os, targetMargin, formatMoney) : null;
  const delivery = deliveryProgress(os, today);
  const step = nextStep(status);
  const { model, plate } = splitVehicle(os.vehicle);
  const km = formatKm(os.mileage);
  const technician = (os.technician || '').trim();

  const handleClick = (e: React.MouseEvent) => {
    if (e.ctrlKey && status !== 'FINALIZADO' && actions.onQuickFinish) {
      e.preventDefault();
      e.stopPropagation();
      actions.onQuickFinish(os.id);
      return;
    }
    if ((e.target as HTMLElement).closest('button')) return;
    actions.onEdit(os);
  };

  // Enter/Espaço no cartão focado abrem a OS; o arraste por teclado começa com M (ver KanbanBoard).
  const handleKeyDown = (e: React.KeyboardEvent) => {
    dndKeyDown?.(e);
    if (e.target !== e.currentTarget || isDragging || forcedDragging) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      actions.onEdit(os);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuAt({ x: e.clientX, y: e.clientY });
  };

  const openMore = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setMenuAt({ x: r.left, y: r.bottom + 4 });
  };

  // Botão não começa arraste: o clique é só do botão.
  const stopDrag = (e: React.PointerEvent) => e.stopPropagation();

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className="kcard-wrap"
        {...attributes}
        {...pointerListeners}
        role="group"
        aria-label={`OS ${os.osNumber}, ${os.clientName}, ${STATUS_LABELS[status]}`}
        onKeyDown={handleKeyDown}
      >
        <div
          className={cardClassName}
          title={CARD_HELP}
          onClick={handleClick}
          onContextMenu={handleContextMenu}
        >
          <div className="kcard-top">
            <span className={`status-light status-light--${statusClass(status)}`}>
              {STATUS_LABELS[status]}
            </span>
            <span className="kcard-num">OS {os.osNumber}</span>
          </div>

          <div className="kcard-client" title={os.clientName}>{os.clientName}</div>

          <div className="kcard-vehicle">
            <span className="kcard-model" title={model}>{model}</span>
            {km && <span className="kcard-km">{km}</span>}
            {plate && <span className="kcard-plate" title="Placa">{plate}</span>}
          </div>

          {delivery && (
            <div className={`kcard-due kcard-due--${delivery.level}`} title={delivery.title}>
              <Icon name={delivery.level === 'atrasada' ? 'alerta' : 'calendario'} size={14} />
              <span>{delivery.label}</span>
            </div>
          )}

          <div className="kcard-foot">
            <span className="kcard-total">{formatMoney(os.total)}</span>
            {marginBadge && (
              <span
                className={`margin-badge margin-badge--${marginBadge.level.toLowerCase()}`}
                title={marginBadge.title}
              >
                {marginBadge.label}
              </span>
            )}
            {technician && (
              <span className="kcard-tech" title={`Técnico: ${technician}`}>
                <Icon name="chave" size={14} />
                <span className="kcard-tech-name">{technician}</span>
              </span>
            )}
          </div>

          <div className="kcard-actions">
            {step && (
              <button
                type="button"
                className="btn kcard-next"
                onPointerDown={stopDrag}
                onClick={(e) => { e.stopPropagation(); onStatusChange(os.id, step.to); }}
              >
                {step.label}
                <Icon name="proximo" size={16} />
              </button>
            )}
            <button
              type="button"
              className="btn-secondary kcard-more"
              aria-haspopup="menu"
              aria-expanded={menuAt !== null}
              title="Editar, vistoria, imprimir, WhatsApp, voltar, arquivar e excluir"
              onPointerDown={stopDrag}
              onClick={openMore}
            >
              <Icon name="processos" size={16} />
              Mais
            </button>
          </div>

          {delivery && delivery.level !== 'sem' && (
            <div className={`kcard-bar kcard-bar--${delivery.level}`} aria-hidden="true">
              <span style={{ width: `${delivery.pct}%` }} />
            </div>
          )}
        </div>
      </div>

      {menuAt && (
        <KanbanCardMenu
          os={os}
          status={status}
          actions={actions}
          x={menuAt.x}
          y={menuAt.y}
          onClose={() => setMenuAt(null)}
        />
      )}
    </>
  );
});

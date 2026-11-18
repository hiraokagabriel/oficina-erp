import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../ui/Icon';
import { OnlineOnlyButton } from '../OnlineOnlyButton';
import type { FinDueRow, FinDueGroup } from '../../services/financeDueView';

// Caixa de contas ("Contas para pagar" e "Para receber"). Visual puro: a página monta as linhas e decide o que
// cada botão faz. Cada linha: luz de status + data + descrição + valor + situação em texto + botão.

interface Props {
  /** Prefixo dos ids (o título recebe `${idPrefix}-title`). */
  idPrefix: string;
  title: string;
  kind: 'pay' | 'receive';
  /** Texto de abrangência ("Todas as datas."). */
  scope: string;
  total: string;
  /** Valor vencido/atrasado já formatado; ausente = sem selo. */
  lateTotal?: string;
  groups: FinDueGroup[];
  actionLabel: string;
  busyLabel: string;
  onAction: (row: FinDueRow, e: React.MouseEvent) => void;
  emptyText: string;
  limit?: number;
}

const FOCUS_MAX_AGE_MS = 2000;

export const FinDueList: React.FC<Props> = ({
  idPrefix, title, kind, scope, total, lateTotal, groups, actionLabel, busyLabel, onAction, emptyText, limit = 6,
}) => {
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const focusAfter = useRef<{ index: number; at: number } | null>(null);
  const titleId = `${idPrefix}-title`;

  const allRows = groups.flatMap(g => g.rows);
  const count = allRows.length;
  const visibleLimit = expanded ? count : limit;
  let shown = 0;
  const visibleGroups = groups
    .map(g => {
      const room = Math.max(0, visibleLimit - shown);
      const rows = g.rows.slice(0, room);
      shown += rows.length;
      return { label: g.label, rows, total: g.rows.length };
    })
    .filter(g => g.rows.length > 0);

  // Depois de pagar/receber a linha some: o foco vai para o botão da linha que ocupou o lugar (ou para o título).
  const idsKey = allRows.map(r => r.id).join('|');
  useEffect(() => {
    const pending = focusAfter.current;
    if (!pending) return;
    focusAfter.current = null;
    if (Date.now() - pending.at > FOCUS_MAX_AGE_MS) return;
    const buttons = rootRef.current?.querySelectorAll<HTMLButtonElement>('button[data-fin-action]');
    const target = buttons && buttons.length > 0 ? buttons[Math.min(pending.index, buttons.length - 1)] : null;
    (target ?? document.getElementById(titleId))?.focus();
  }, [idsKey, titleId]);

  const act = (row: FinDueRow, index: number, e: React.MouseEvent) => {
    if (e.detail <= 1) focusAfter.current = { index, at: Date.now() }; // o 2º clique do duplo clique é ignorado pela página
    onAction(row, e);
  };

  let rowIndex = -1;
  return (
    <section ref={rootRef} className="fin-box" aria-labelledby={titleId}>
      <div className="fin-box__head">
        <h2 id={titleId} className="fin-box__title" tabIndex={-1}>{title}</h2>
        <span className="fin-box__total">{total}</span>
      </div>
      {lateTotal && (
        <p className="fin-box__scope">
          <span className="fin-due__badge"><Icon name="alerta" size={16} />{lateTotal} {kind === 'pay' ? 'vencido' : 'atrasado'}</span>
        </p>
      )}
      <p className="fin-box__scope">{scope}</p>

      {count === 0 ? (
        <div className="fin-empty">
          {kind === 'pay' && <Icon name="check" size={28} className="fin-empty__icon" />}
          <p className="fin-empty__title">{emptyText}</p>
        </div>
      ) : (
        <>
          {visibleGroups.map(g => (
            <React.Fragment key={g.label}>
              <h3 className="fin-due__group">{g.label}</h3>
              <ul className="fin-due__list">
                {g.rows.map(row => {
                  rowIndex += 1;
                  const idx = rowIndex;
                  return (
                    <li key={row.id} className="fin-due__row">
                      <span className={`status-light status-light--${row.tone}`} aria-hidden="true" />
                      <span className="fin-due__date">{row.date}</span>
                      <span className="fin-due__desc" title={row.description}>{row.description}</span>
                      <span className="fin-due__amount">{row.amount}</span>
                      <OnlineOnlyButton
                        data-fin-action=""
                        className={kind === 'pay' ? 'btn btn-secondary' : 'btn btn-success'}
                        onClick={(e) => act(row, idx, e)}
                        busyLabel={busyLabel} busyKey={row.id}
                        aria-label={`${actionLabel}: ${row.description}`}
                      >
                        <Icon name={kind === 'pay' ? 'check' : 'receber'} size={18} />{actionLabel}
                      </OnlineOnlyButton>
                      <span className={`fin-due__state fin-due__state--${row.tone}`}>{row.stateText}</span>
                    </li>
                  );
                })}
              </ul>
            </React.Fragment>
          ))}
          {count > limit && (
            <div className="fin-due__more">
              <button type="button" className="btn btn-secondary" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>
                {expanded ? 'Ver menos' : `Ver todas (${count})`}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
};

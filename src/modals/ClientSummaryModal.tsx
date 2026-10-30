import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useTopmostEscape } from '../hooks/useTopmostEscape';
import { WorkOrder, WorkshopSettings } from '../types';
import { buildServiceSummary, ServiceSummaryItem, ServiceSummaryOptions } from '../services/serviceSummary';
import { inspectionItemText, itemDetailText, remainingLabel, sumItems } from '../services/serviceSummaryView';
import { Money } from '../utils/helpers';

// "Modo cliente": resumo em tela cheia para mostrar ao cliente. Só lê o resultado de
// buildServiceSummary (sem custo, margem, telefone, técnico ou notas internas).

interface ClientSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  os: WorkOrder | null;
  settings: WorkshopSettings;
  options?: ServiceSummaryOptions;
}

interface ItemListProps {
  title: string;
  items: ServiceSummaryItem[];
  idPrefix: string;
  warrantyDays: number;
  open: Record<string, boolean>;
  toggle: (key: string) => void;
}

const ItemList: React.FC<ItemListProps> = ({ title, items, idPrefix, warrantyDays, open, toggle }) => {
  if (items.length === 0) return null;
  return (
    <section className="csm-section">
      <h2 className="csm-h2">{title} <span className="csm-sub">{Money.format(sumItems(items))}</span></h2>
      <ul className="csm-list">
        {items.map((item, i) => {
          const key = `${idPrefix}-${i}`;
          const isOpen = !!open[key];
          return (
            <li key={key} className="csm-item">
              <button type="button" className="csm-item-btn" aria-expanded={isOpen} aria-controls={`${key}-detail`} onClick={() => toggle(key)}>
                <span className="csm-item-name">{item.description}</span>
                <span className="csm-item-price">{Money.format(item.price)}</span>
                <span className="csm-chevron" aria-hidden="true">{isOpen ? '▲' : '▼'}</span>
              </button>
              {isOpen && <div id={`${key}-detail`} className="csm-detail">{itemDetailText(item, warrantyDays)}</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export const ClientSummaryModal: React.FC<ClientSummaryModalProps> = ({ isOpen, onClose, os, settings, options }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useFocusTrap(isOpen, dialogRef);

  useEffect(() => { if (isOpen) { setOpen({}); closeRef.current?.focus(); } }, [isOpen]);

  // Esc fecha só o Modo cliente, mesmo aberto por cima de outra janela.
  useTopmostEscape(isOpen, onClose);

  const summary = useMemo(() => (os ? buildServiceSummary(os, settings, options) : null), [os, settings, options]);

  // Largura da barra de rolagem do corpo, para o rodapé (sem rolagem) alinhar com a lista.
  const visible = isOpen && !!summary;
  useLayoutEffect(() => {
    if (!visible) return;
    const sync = () => {
      const body = bodyRef.current;
      if (body) dialogRef.current?.style.setProperty('--csm-gutter', `${body.offsetWidth - body.clientWidth}px`);
    };
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [visible, summary, open]);

  if (!isOpen || !summary) return null;
  const toggle = (key: string) => setOpen(prev => ({ ...prev, [key]: !prev[key] }));
  const { totals } = summary;

  return (
    <div className="csm-overlay">
      <div ref={dialogRef} className="csm-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="csm-header">
          <div>
            <h1 id={titleId} className="csm-title">Resumo do serviço</h1>
            <div className="csm-meta">{summary.workshop.name} - OS {summary.osNumber}</div>
          </div>
          <button type="button" ref={closeRef} className="btn-secondary" onClick={onClose}>Fechar (Esc)</button>
        </header>

        <div ref={bodyRef} className="csm-body">
          <div className="csm-who">
            <div><span className="csm-label">Cliente</span> <strong>{summary.clientName}</strong></div>
            <div><span className="csm-label">Veículo</span> <strong>{summary.vehicle}</strong></div>
            <div><span className="csm-label">Situação</span> <strong>{summary.statusText}</strong></div>
            {summary.expectedDate && <div><span className="csm-label">Previsão</span> <strong>{summary.expectedDate}</strong></div>}
          </div>

          <ItemList title="Serviços" items={summary.items.services} idPrefix="s" warrantyDays={summary.warranty.days} open={open} toggle={toggle} />
          <ItemList title="Peças" items={summary.items.parts} idPrefix="p" warrantyDays={summary.warranty.days} open={open} toggle={toggle} />

          {(summary.inspection.groups.length > 0 || summary.inspection.generalNote) && (
            <section className="csm-section">
              <h2 className="csm-h2">Itens da vistoria</h2>
              {summary.inspection.groups.map(g => (
                <div key={g.status} className="csm-insp-group">
                  <h3 className="csm-h3">{g.label} <span className="csm-sub">({g.items.length})</span></h3>
                  <ul className="csm-recs">
                    {g.items.map((i, idx) => (
                      <li key={idx}>
                        {inspectionItemText(i)}
                        {i.note && <div className="csm-rec-note">{i.note}</div>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {summary.inspection.generalNote && (
                <div className="csm-insp-group">
                  <h3 className="csm-h3">Nota geral da vistoria</h3>
                  <p className="csm-notes">{summary.inspection.generalNote}</p>
                </div>
              )}
            </section>
          )}

          {summary.publicNotes && (
            <section className="csm-section">
              <h2 className="csm-h2">Observações</h2>
              <p className="csm-notes">{summary.publicNotes}</p>
            </section>
          )}

          {summary.warranty.hasWarrantyItems && <p className="csm-warranty">{summary.warranty.text}</p>}
        </div>

        <footer className="csm-totals" aria-live="polite">
          <div className="csm-total-row"><span>Total</span><span>{Money.format(totals.total)}</span></div>
          {totals.hasAdvance && <div className="csm-total-row"><span>Adiantamento recebido</span><span>- {Money.format(totals.advance)}</span></div>}
          <div className="csm-total-row csm-total-strong"><span>{remainingLabel(totals.remaining)}</span><span>{Money.format(totals.remaining)}</span></div>
        </footer>
      </div>
    </div>
  );
};

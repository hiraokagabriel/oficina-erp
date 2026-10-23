import React, { useMemo } from 'react';
import { CatalogItem, WorkOrder, WorkshopSettings } from '../types';
import { buildMarginReport, formatPct, marginLevel, MarginLevel, MarginRow, PeriodMode } from '../services/margin';
import { isLowCoverage, levelText, priceHintCents, priceHintText, rowMarginText } from '../services/marginReportView';
import { toLocalDay } from '../services/receivables';
import { Money } from '../utils/helpers';

interface MarginReportProps {
  workOrders: WorkOrder[];
  settings: WorkshopSettings;
  catalogParts: CatalogItem[];
  catalogServices: CatalogItem[];
  selectedMonth: string;
  viewMode: PeriodMode;
}

const levelClass = (l: MarginLevel): string => `mr-level mr-level--${l.toLowerCase().replace('_', '-')}`;

interface RowsTableProps {
  caption: string;
  rows: MarginRow[];
  target: number;
  withPrices: boolean;
  emptyText: string;
}

const RowsTable: React.FC<RowsTableProps> = ({ caption, rows, target, withPrices, emptyText }) => (
  <section className="card mr-section" aria-labelledby={`mr-${caption}`}>
    <h3 id={`mr-${caption}`} className="mr-title">{caption}</h3>
    {rows.length === 0 ? (
      <p className="mr-empty">{emptyText}</p>
    ) : (
      <div className="mr-scroll">
        <table className="data-table mr-table">
          <thead>
            <tr>
              <th scope="col">Descrição</th>
              <th scope="col">Vezes</th>
              <th scope="col">Receita</th>
              <th scope="col">Custo</th>
              <th scope="col">Lucro</th>
              <th scope="col">Margem</th>
              {withPrices && <th scope="col">Preço do catálogo</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const level = marginLevel(r.marginPct, target);
              const hint = withPrices ? priceHintCents(r) : null;
              return (
                <tr key={r.key}>
                  <td className="mr-desc" data-label="Descrição" title={r.description}>
                    {r.description}
                    {withPrices && (
                      <span className="mr-sub">
                        Preço mediano praticado: {r.medianPrice === null ? '—' : Money.format(r.medianPrice)}
                        {hint !== null && <span className="mr-hint">{priceHintText(hint, Money.format)}</span>}
                      </span>
                    )}
                  </td>
                  <td data-label="Vezes">{r.count}</td>
                  <td data-label="Receita">{Money.format(r.revenue)}</td>
                  <td data-label="Custo">{r.cost > 0 ? Money.format(r.cost) : '—'}</td>
                  <td data-label="Lucro">{r.marginPct === null ? '—' : Money.format(r.profit)}</td>
                  <td data-label="Margem">
                    <span className={levelClass(level)}>{rowMarginText(r.marginPct, level)}</span>
                  </td>
                  {withPrices && (
                    <td data-label="Preço do catálogo">{r.catalogPrice === null ? '—' : Money.format(r.catalogPrice)}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
  </section>
);

export const MarginReport: React.FC<MarginReportProps> = ({
  workOrders, settings, catalogParts, catalogServices, selectedMonth, viewMode,
}) => {
  const report = useMemo(
    () => buildMarginReport({
      workOrders, settings, mode: viewMode, selectedMonth, catalogParts, catalogServices,
      today: toLocalDay(new Date()),
    }),
    [workOrders, settings, viewMode, selectedMonth, catalogParts, catalogServices],
  );

  const { totals, target } = report;
  const periodo = viewMode === 'YEAR' ? 'neste ano' : 'neste mês';

  if (report.scopeCount === 0) {
    return (
      <div className="card mr-empty-card" role="status">
        Nenhuma OS finalizada ou aguardando pagamento {periodo}. A margem aparece aqui quando houver.
      </div>
    );
  }

  const level = marginLevel(totals.marginPct, target);
  const lowCoverage = isLowCoverage(totals.coveragePct, totals.revenue);

  return (
    <div className="mr-root">
      <p className="mr-scope">
        Considera OS finalizadas e aguardando pagamento, pela data de criação. Meta de margem: {target}%.
        Itens sem custo ficam fora do cálculo.
      </p>

      <div className="stats-row mr-stats fin-stats">
        <div className="stat-card">
          <div className="stat-label">OS abaixo da meta</div>
          <div className="stat-value">{report.osBelowTarget.length}</div>
          <div className="stat-trend">de {report.scopeCount} OS no período</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Margem geral</div>
          <div className="stat-value">{totals.marginPct === null ? '—' : `${formatPct(totals.marginPct)}%`}</div>
          <div className="stat-trend"><span className={levelClass(level)}>{levelText(level)}</span></div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Lucro</div>
          <div className="stat-value">{Money.format(totals.profit)}</div>
          <div className="stat-trend">Só itens com custo</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Receita no período</div>
          <div className="stat-value">{Money.format(totals.revenue)}</div>
          <div className="stat-trend">{report.scopeCount} OS no período</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Itens com custo informado</div>
          <div className="stat-value">{formatPct(totals.coveragePct)}%</div>
          <div className="stat-trend">{formatPct(totals.coveragePct)}% da receita tem custo informado</div>
        </div>
      </div>

      {lowCoverage && (
        <div className="mr-warning" role="alert">
          <strong>Atenção:</strong> A margem considera só os itens com custo informado.
          Apenas {formatPct(totals.coveragePct)}% da receita tem custo.
        </div>
      )}

      <RowsTable caption="Por serviço" rows={report.byService} target={target} withPrices
        emptyText="Nenhum serviço no período." />
      <RowsTable caption="Por peça" rows={report.byPart} target={target} withPrices
        emptyText="Nenhuma peça no período." />
      <RowsTable caption="Por categoria" rows={report.byCategory} target={target} withPrices={false}
        emptyText="Nenhuma categoria no período." />

      <section className="card mr-section" aria-labelledby="mr-abaixo">
        <h3 id="mr-abaixo" className="mr-title">OS abaixo da meta</h3>
        {report.osBelowTarget.length === 0 ? (
          <p className="mr-empty">Nenhuma OS abaixo da meta no período.</p>
        ) : (
          <ul className="mr-list">
            {report.osBelowTarget.map(({ os, margin }) => (
              <li key={os.id} className="mr-list-item">
                <span className="mr-os">OS #{os.osNumber}</span>
                <span className="mr-client">{os.clientName}</span>
                <span className={levelClass(marginLevel(margin.marginPct, target))}>
                  {rowMarginText(margin.marginPct, marginLevel(margin.marginPct, target))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card mr-section" aria-labelledby="mr-semcusto">
        <h3 id="mr-semcusto" className="mr-title">Itens sem custo</h3>
        {report.itemsWithoutCost.length === 0 ? (
          <p className="mr-empty">Nenhum item sem custo no período. Toda a receita entra na margem.</p>
        ) : (
          <>
            <p className="mr-tip">Cadastre o custo no Gerenciador de cadastros para entrarem na margem.</p>
            <div className="mr-scroll">
              <table className="data-table mr-table mr-table--uncosted">
                <thead>
                  <tr>
                    <th scope="col">Descrição</th>
                    <th scope="col">Tipo</th>
                    <th scope="col">Ocorrências</th>
                    <th scope="col">Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {report.itemsWithoutCost.map(i => (
                    <tr key={`${i.kind}:${i.key}`}>
                      <td className="mr-desc" data-label="Descrição" title={i.description}>{i.description}</td>
                      <td data-label="Tipo">{i.kind === 'PART' ? 'Peça' : 'Serviço'}</td>
                      <td data-label="Ocorrências">{i.occurrences}</td>
                      <td data-label="Receita">{Money.format(i.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
};

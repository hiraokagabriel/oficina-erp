import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ChartFluxoPoint } from '../../types';
import { formatAxisBRL } from '../../services/financeView';
import { Icon } from '../ui/Icon';

// "Entrou e saiu por dia" (ou por mês no ano). Cores e tooltip por classe/token; sem animação.
// Os valores chegam em reais (float); o texto sai no formato brasileiro via `format` (centavos -> texto).

interface Props {
  data: ChartFluxoPoint[];
  isYear: boolean;
  /** "novembro" ou "2026", só para a frase de vazio. */
  periodLabel: string;
  /** Reais (float) -> "R$ 1.234,56". */
  formatReais: (reais: number) => string;
}

interface TipProps {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<{ dataKey?: string | number; value?: number | string }>;
  formatReais: (reais: number) => string;
  isYear: boolean;
}

const FlowTip: React.FC<TipProps> = ({ active, label, payload, formatReais, isYear }) => {
  if (!active || !payload || payload.length === 0) return null;
  const val = (key: string): number => Number(payload.find(p => p.dataKey === key)?.value ?? 0);
  return (
    <div className="fin-tip">
      <p className="fin-tip__title">{isYear ? String(label) : `Dia ${String(label)}`}</p>
      <p className="fin-tip__line fin-tip__line--in"><span>Entrou</span><span>{formatReais(val('entrou'))}</span></p>
      <p className="fin-tip__line fin-tip__line--out"><span>Saiu</span><span>{formatReais(val('saiu'))}</span></p>
    </div>
  );
};

export const FinFlowChart: React.FC<Props> = ({ data, isYear, periodLabel, formatReais }) => {
  const totalIn = data.reduce((s, p) => s + p.entrou, 0);
  const totalOut = data.reduce((s, p) => s + p.saiu, 0);
  const empty = totalIn === 0 && totalOut === 0;
  const tick = { fill: 'var(--text-2)', fontSize: 13 };
  return (
    <section className="fin-box fin-flow" aria-labelledby="fin-flow-title">
      <div className="fin-box__head">
        <h2 id="fin-flow-title" className="fin-box__title">Entrou e saiu {isYear ? 'por mês' : 'por dia'}</h2>
      </div>
      {empty ? (
        <div className="fin-empty">
          <Icon name="info" size={28} className="fin-empty__icon" />
          <p className="fin-empty__title">Nenhum dinheiro entrou ou saiu em {periodLabel}.</p>
        </div>
      ) : (
        <>
          <div className="fin-flow__chart" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={tick} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={tick} tickLine={false} axisLine={false} width={76} tickFormatter={(v: number) => formatAxisBRL(Number(v))} />
                <Tooltip
                  cursor={{ fill: 'var(--surface-2)' }}
                  content={<FlowTip formatReais={formatReais} isYear={isYear} />}
                />
                <Bar dataKey="entrou" fill="var(--fin-in)" isAnimationActive={false} />
                <Bar dataKey="saiu" fill="var(--fin-out)" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="fin-flow__legend" aria-label="Legenda do gráfico">
            <li className="fin-flow__key fin-flow__key--in">Entrou</li>
            <li className="fin-flow__key fin-flow__key--out">Saiu</li>
          </ul>
          <p className="fin-flow__sr">Em {periodLabel}, entrou {formatReais(totalIn)} e saiu {formatReais(totalOut)}.</p>
        </>
      )}
    </section>
  );
};

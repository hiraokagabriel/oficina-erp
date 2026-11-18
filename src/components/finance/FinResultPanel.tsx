import React from 'react';

// "Dinheiro de novembro": Entrou, Saiu e Sobrou. Só mostra números já calculados (centavos); a barra é decoração
// (aria-hidden): o valor sempre aparece em texto.

interface Props {
  isLoading: boolean;
  /** "novembro" (mês) ou "2026" (ano). */
  periodLabel: string;
  isYear: boolean;
  /** Centavos. */
  entrou: number;
  saiu: number;
  saldo: number;
  /** Só o Dono vê a linha "Lucro do período". */
  showProfit: boolean;
  format: (cents: number) => string;
}

const widthOf = (value: number, max: number): React.CSSProperties =>
  ({ '--w': `${max > 0 ? Math.round((value / max) * 100) : 0}%` } as React.CSSProperties);

export const FinResultPanel: React.FC<Props> = ({ isLoading, periodLabel, isYear, entrou, saiu, saldo, showProfit, format }) => {
  const title = `Dinheiro de ${periodLabel}`;
  if (isLoading) {
    return (
      <section className="fin-box fin-stack" aria-label={title} aria-busy="true">
        <span className="fin-skeleton fin-skeleton--lg" />
        <span className="fin-skeleton fin-skeleton--bar" />
        <span className="fin-skeleton fin-skeleton--bar" />
      </section>
    );
  }
  const max = Math.max(entrou, saiu);
  const positive = saldo >= 0;
  return (
    <section className="fin-box fin-result" aria-labelledby="fin-result-title">
      <div className="fin-result__head">
        <div>
          <h2 id="fin-result-title" className="fin-box__title">{title}</h2>
          {showProfit && (
            <span className="fin-result__profit">{positive ? 'Lucro do período' : 'Prejuízo do período'}</span>
          )}
        </div>
        <span className={positive ? 'fin-result__sum fin-result__sum--pos' : 'fin-result__sum fin-result__sum--neg'}>
          {positive ? 'Sobrou' : 'Faltou'} {format(Math.abs(saldo))}
        </span>
      </div>
      <div className="fin-result__row fin-result__row--in">
        <span className="fin-result__label">Entrou</span>
        <span className="fin-bar" aria-hidden="true"><span className="fin-bar__fill fin-bar__fill--in" style={widthOf(entrou, max)} /></span>
        <span className="fin-result__value">{format(entrou)}</span>
      </div>
      <div className="fin-result__row fin-result__row--out">
        <span className="fin-result__label">Saiu</span>
        <span className="fin-bar" aria-hidden="true"><span className="fin-bar__fill fin-bar__fill--out" style={widthOf(saiu, max)} /></span>
        <span className="fin-result__value">− {format(saiu)}</span>
      </div>
      {entrou === 0 && saiu === 0 && (
        <p className="fin-note">Ainda não há pagamentos {isYear ? 'neste ano' : 'neste mês'}.</p>
      )}
      <p className="fin-note">Conta só o que já foi pago, pelo dia do pagamento.</p>
    </section>
  );
};

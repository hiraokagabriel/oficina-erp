import React from 'react';
import { Icon } from '../ui/Icon';

// "Peças e serviços (OS finalizadas)": barra empilhada em CSS, sem biblioteca de gráfico.

interface Props {
  /** Centavos. */
  parts: number;
  services: number;
  /** Valor médio por OS, em centavos. */
  average: number;
  finalizedCount: number;
  /** "novembro" ou "2026". */
  periodLabel: string;
  format: (cents: number) => string;
}

export const FinMixBar: React.FC<Props> = ({ parts, services, average, finalizedCount, periodLabel, format }) => {
  const sum = parts + services;
  const partsPct = sum > 0 ? Math.round((parts / sum) * 100) : 0;
  const servicesPct = sum > 0 ? 100 - partsPct : 0;
  return (
    <section className="fin-box fin-mix" aria-labelledby="fin-mix-title">
      <div className="fin-box__head">
        <h2 id="fin-mix-title" className="fin-box__title">Peças e serviços (OS finalizadas)</h2>
      </div>
      {finalizedCount === 0 ? (
        <div className="fin-empty">
          <Icon name="info" size={28} className="fin-empty__icon" />
          <p className="fin-empty__title">Nenhuma OS finalizada em {periodLabel}.</p>
        </div>
      ) : (
        <>
          {sum > 0 && (
            <>
              <div className="fin-mix__bar" aria-hidden="true">
                <span className="fin-mix__seg fin-mix__seg--parts" style={{ '--w': `${partsPct}%` } as React.CSSProperties} />
                <span className="fin-mix__seg fin-mix__seg--services" style={{ '--w': `${servicesPct}%` } as React.CSSProperties} />
              </div>
              <ul className="fin-mix__legend">
                <li className="fin-mix__key fin-mix__key--parts">Peças {partsPct}% {format(parts)}</li>
                <li className="fin-mix__key fin-mix__key--services">Serviços {servicesPct}% {format(services)}</li>
              </ul>
            </>
          )}
          <p className="fin-mix__avg">Valor médio por OS: {format(average)}</p>
          <p className="fin-mix__avg-sub">
            {finalizedCount} {finalizedCount === 1 ? 'OS finalizada' : 'OS finalizadas'} em {periodLabel}
          </p>
        </>
      )}
    </section>
  );
};

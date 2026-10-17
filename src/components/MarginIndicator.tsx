import React from 'react';
import { formatPct, hasCost, marginLabel, marginLevel, suggestPriceForTarget } from '../services/margin';

interface MarginIndicatorProps {
  /** Custo em centavos; ausente ou 0 = "Sem custo". */
  cost?: number;
  price: number;
  formatMoney: (val: number) => string;
  onSuggestPrice?: (suggestedPrice: number) => void;
  /** Meta de margem global (%), vinda das Configurações. */
  minMarginPercent?: number;
}

export const MarginIndicator: React.FC<MarginIndicatorProps> = ({
  cost,
  price,
  formatMoney,
  onSuggestPrice,
  minMarginPercent = 70
}) => {
  if (!hasCost({ cost })) {
    return (
      <div className="margin-ind margin-ind--sem_custo">
        <span className="margin-ind__label margin-text--sem_custo">Sem custo</span>
        <span className="margin-ind__muted"> (fora da conta de margem)</span>
      </div>
    );
  }
  const costCents = cost as number;
  // Evitar divisão por zero
  if (price === 0) return null;

  const margin = ((price - costCents) / price) * 100;
  const level = marginLevel(margin, minMarginPercent);
  const suggestedPrice = suggestPriceForTarget(costCents, minMarginPercent);
  const pct = Math.min(Math.max(margin, 0), 100);

  return (
    <div className={`margin-ind margin-ind--${level.toLowerCase()}`}>
      <div className="margin-ind__row">
        <span className={`margin-ind__label margin-text--${level.toLowerCase()}`}>
          {marginLabel(level, margin)}
        </span>
        <span className="margin-ind__muted">Custo: {formatMoney(costCents)}</span>
      </div>

      <div className="margin-ind__track" role="img" aria-label={`Margem de ${formatPct(margin)}%, meta de ${minMarginPercent}%`}>
        <div className="margin-ind__fill" style={{ width: `${pct}%` }} />
        <div className="margin-ind__goal" style={{ left: `${minMarginPercent}%` }} />
      </div>

      {margin < minMarginPercent && suggestedPrice !== null && onSuggestPrice && (
        <div className="margin-suggest">
          <span className="margin-ind__muted">Preço para atingir a meta ({minMarginPercent}%):</span>
          <button
            className="margin-btn"
            onClick={() => onSuggestPrice(suggestedPrice)}
            type="button"
            title="Aplica este preço na linha"
          >
            {formatMoney(suggestedPrice)}
          </button>
        </div>
      )}

      <div className="margin-ind__row" style={{ marginTop: 4 }}>
        <span className="margin-ind__muted">Lucro:</span>
        <span className={`margin-ind__label margin-text--${level.toLowerCase()}`}>
          {formatMoney(price - costCents)}
        </span>
      </div>
    </div>
  );
};
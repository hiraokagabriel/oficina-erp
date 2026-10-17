// Textos e regras de exibição do relatório de margem. Puro, sem telas.
import { MarginLevel, MarginRow, formatPct } from './margin';

/** Abaixo disso a margem considera pouca receita e o relatório avisa. */
export const LOW_COVERAGE_PCT = 80;
/** Diferença mínima (mediana x catálogo) para sugerir ajuste de preço. */
export const PRICE_HINT_MIN_DIFF_PCT = 10;

export const isLowCoverage = (coveragePct: number, revenue: number): boolean =>
  revenue > 0 && coveragePct < LOW_COVERAGE_PCT;

/** Nível em texto (nunca só cor). */
export function levelText(level: MarginLevel): string {
  switch (level) {
    case 'NA_META': return 'Na meta';
    case 'ATENCAO': return 'Atenção';
    case 'ABAIXO': return 'Abaixo da meta';
    default: return 'Sem custo';
  }
}

/** Margem de uma linha: "72,5% · Na meta" ou "sem custo". */
export function rowMarginText(marginPct: number | null, level: MarginLevel): string {
  if (marginPct === null) return 'sem custo';
  return `${formatPct(marginPct)}% · ${levelText(level)}`;
}

/**
 * Dica informativa quando o preço mediano praticado difere do catálogo em >= 10%.
 * Devolve o valor sugerido em centavos (a mediana) ou null.
 */
export function priceHintCents(row: Pick<MarginRow, 'medianPrice' | 'catalogPrice'>): number | null {
  const { medianPrice, catalogPrice } = row;
  if (medianPrice === null || catalogPrice === null || catalogPrice <= 0) return null;
  const diffPct = (Math.abs(medianPrice - catalogPrice) * 100) / catalogPrice;
  return diffPct >= PRICE_HINT_MIN_DIFF_PCT ? medianPrice : null;
}

export const priceHintText = (cents: number, format: (c: number) => string): string =>
  `Sugestão: ajustar para ${format(cents)}`;

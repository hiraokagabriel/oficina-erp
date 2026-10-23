import { MONEY_INVALID_MESSAGE, parseMoneyText } from './osModalView';

export type EntryAmountResult =
  | { ok: true; cents: number }
  | { ok: false; reason: 'empty' | 'invalid'; message: string };

/** Valor do lançamento: texto pt-BR para centavos. Vazio e inválido nunca viram valor. */
export function parseEntryAmount(raw: string): EntryAmountResult {
  const p = parseMoneyText(raw);
  if (p.status === 'ok') return { ok: true, cents: p.cents };
  if (p.status === 'empty') return { ok: false, reason: 'empty', message: 'Preencha descrição e valor.' };
  return { ok: false, reason: 'invalid', message: MONEY_INVALID_MESSAGE };
}

export const YEAR_MIN = 2000;
export const YEAR_MAX = 2100;
export const YEAR_INVALID_MESSAGE = 'Use um ano de 4 dígitos, entre 2000 e 2100.';

/** Rascunho do ano digitado: só vale com 4 dígitos entre 2000 e 2100. */
export function parseYearDraft(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d{4}$/.test(t)) return null;
  const y = parseInt(t, 10);
  return y >= YEAR_MIN && y <= YEAR_MAX ? y : null;
}

/** Eixo do gráfico (valor em reais): "R$ 500", "R$ 1,5 mil", "R$ 2 mi". */
export function formatAxisBRL(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  const fmt = (n: number): string => {
    const r = Math.round(n * 10) / 10;
    return String(r).replace('.', ',');
  };
  if (abs >= 1_000_000) return `${sign}R$ ${fmt(abs / 1_000_000)} mi`;
  if (abs >= 1000) return `${sign}R$ ${fmt(abs / 1000)} mil`;
  return `${sign}R$ ${fmt(abs)}`;
}

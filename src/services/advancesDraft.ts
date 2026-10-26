import type { OSAdvanceDraft, WorkOrder } from '../types';
import { formatDateOnly, parseDateFlexible } from '../utils/dates';
import { advancesExceedTotal, validateAdvance } from './advances';

// Rascunho local dos adiantamentos no modal da OS (funções puras). `date` é 'AAAA-MM-DD' do input.

export interface AdvanceRow {
  /** Chave estável da linha na tela (id do adiantamento, ou 'novo-N' / 'legado'). */
  key: string;
  /** Id do adiantamento já gravado; ausente = novo. */
  id?: string;
  date: string;
  amount: number;
}

const dayOf = (iso: string): string => formatDateOnly(parseDateFlexible(iso));

/** Mais antigo primeiro; empate mantém a ordem de entrada. */
export const sortAdvanceRows = (rows: AdvanceRow[]): AdvanceRow[] =>
  rows.map((r, i) => ({ r, i })).sort((a, b) => (a.r.date < b.r.date ? -1 : a.r.date > b.r.date ? 1 : a.i - b.i)).map(x => x.r);

/**
 * Linhas iniciais: adiantamentos v4 da OS; OS legada (advanceAmount sem `advances`) vira uma linha sem id,
 * com a data de criação da OS (limitada a hoje, pois adiantamento não pode ser futuro).
 */
export const buildAdvanceRows = (os: WorkOrder | null | undefined, today: string): AdvanceRow[] => {
  if (!os) return [];
  if (os.advances && os.advances.length > 0) {
    return sortAdvanceRows(os.advances.map(a => ({ key: a.id, id: a.id, date: dayOf(a.date), amount: a.amount })));
  }
  if (typeof os.advanceAmount === 'number' && os.advanceAmount > 0) {
    const created = os.createdAt ? dayOf(os.createdAt) : today;
    return [{ key: 'legado', date: created > today ? today : created, amount: os.advanceAmount }];
  }
  return [];
};

export interface AdvanceTotals {
  sum: number;
  remaining: number;
  exceeds: boolean;
}

/** Total adiantado, restante a pagar (nunca negativo) e se a soma passa do total (só aviso). */
export const advanceTotals = (rows: Pick<AdvanceRow, 'amount'>[], total: number): AdvanceTotals => {
  const advances = rows.map((r, i) => ({ id: String(i), date: '', amount: r.amount, entryId: '' }));
  const sum = rows.reduce((acc, r) => acc + r.amount, 0);
  return { sum, remaining: Math.max(total - sum, 0), exceeds: advancesExceedTotal({ advances, total }) };
};

/** Erro de uma linha (valor > 0, data válida e não futura), ou undefined se está certa. */
export const advanceRowError = (row: { date: string; amount: number | undefined }, today: string): string | undefined => {
  const r = validateAdvance({ date: row.date, amount: row.amount as number }, today);
  return r.valid ? undefined : r.error;
};

/** Lista completa para o payload da OS: linhas atuais, com id só nos já gravados, por data. */
export const advanceRowsToPayload = (rows: AdvanceRow[]): OSAdvanceDraft[] =>
  sortAdvanceRows(rows).map(r => (r.id ? { id: r.id, date: r.date, amount: r.amount } : { date: r.date, amount: r.amount }));

/** Troca (mesma key) ou acrescenta a linha, mantendo a ordem por data. */
export const upsertAdvanceRow = (rows: AdvanceRow[], row: AdvanceRow): AdvanceRow[] =>
  sortAdvanceRows(rows.some(r => r.key === row.key) ? rows.map(r => (r.key === row.key ? row : r)) : [...rows, row]);

export const removeAdvanceRow = (rows: AdvanceRow[], key: string): AdvanceRow[] => rows.filter(r => r.key !== key);

/** Há linha inválida (ex.: data que virou futura)? Devolve a primeira com o erro. */
export const firstInvalidAdvanceRow = (rows: AdvanceRow[], today: string): { key: string; error: string } | undefined => {
  for (const r of rows) {
    const error = advanceRowError(r, today);
    if (error) return { key: r.key, error };
  }
  return undefined;
};

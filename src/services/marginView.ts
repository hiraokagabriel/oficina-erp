// Textos e entradas de margem usados pelas telas (modal da OS, Kanban). Puro, sem React.
import { WorkOrder } from '../types';
import { Money } from '../utils/helpers';
import { computeOSMargin, formatPct, marginLabel, marginLevel, MarginLevel, MarginResult } from './margin';

/**
 * Campo de custo digitado (em reais): vazio, inválido ou <= 0 = sem custo (undefined).
 * Nunca grava 0: custo 0 e custo ausente significam a mesma coisa (item fora da conta).
 */
export function parseCostInput(raw: string): number | undefined {
  const n = parseFloat(raw.trim().replace(',', '.'));
  if (!isFinite(n) || n <= 0) return undefined;
  const cents = Money.fromFloat(n);
  return cents > 0 ? cents : undefined;
}

/**
 * Edição por linha: vazio = undefined; qualquer outro texto vira centavos (0 incluído, para
 * permitir digitar "0,5" sem o campo se apagar). O 0 é normalizado ao salvar (normalizeItemCost).
 */
export function parseCostEdit(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = parseFloat(raw.replace(',', '.'));
  return isFinite(n) && n > 0 ? Money.fromFloat(n) : 0;
}

/** Ao salvar: custo ausente, 0 ou negativo vira undefined (nunca grava 0). */
export function normalizeItemCost<T extends { cost?: number }>(item: T): T {
  if (typeof item.cost === 'number' && item.cost > 0) return item;
  const { cost: _cost, ...rest } = item;
  return rest as T;
}

/** Custo em centavos para o campo de texto (reais); sem custo = vazio. */
export function costToInput(cost: number | undefined): string {
  return typeof cost === 'number' && cost > 0 ? String(Money.toFloat(cost)) : '';
}

/** "1 item sem custo: margem parcial" / "N itens sem custo: margem parcial"; null se todos têm custo. */
export function partialMarginNote(m: Pick<MarginResult, 'itemsWithoutCost'>): string | null {
  const n = m.itemsWithoutCost;
  if (n <= 0) return null;
  return `${n} ${n === 1 ? 'item sem custo' : 'itens sem custo'}: margem parcial`;
}

/** Dica do selo: lucro só dos itens com custo e quanto da receita eles cobrem. */
export function marginTooltip(m: MarginResult, formatMoney: (cents: number) => string): string {
  if (m.marginPct === null) return 'Nenhum item tem custo informado: a margem não pode ser calculada.';
  const parts = [
    `Lucro (só itens com custo): ${formatMoney(m.profit)}`,
    `Cobertura: ${formatPct(m.coveragePct)}% da receita tem custo`,
  ];
  const note = partialMarginNote(m);
  if (note) parts.push(note);
  return parts.join(' | ');
}

export interface MarginBadge {
  level: MarginLevel;
  label: string;
  title: string;
}

/** Selo do Kanban; null quando a OS não tem nenhum item. Sempre recalcula dos itens (não usa profitMargin gravado). */
export function getMarginBadge(
  os: Pick<WorkOrder, 'parts' | 'services'>,
  target: number,
  formatMoney: (cents: number) => string,
): MarginBadge | null {
  if ((os.parts?.length ?? 0) + (os.services?.length ?? 0) === 0) return null;
  const m = computeOSMargin(os);
  const level = marginLevel(m.marginPct, target);
  return { level, label: marginLabel(level, m.marginPct), title: marginTooltip(m, formatMoney) };
}

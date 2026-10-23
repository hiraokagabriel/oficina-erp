/** Paginação "mostrar mais" para listas longas (Processos). Funções puras. */

export const PAGE_STEP = 50;

/** Quantos itens exibir agora: nunca mais que o total nem menos que 0. */
export const clampVisible = (visible: number, total: number): number =>
  Math.max(0, Math.min(Math.floor(visible), total));

/** Próximo limite ao clicar em "Mostrar mais": soma o passo e respeita o total. */
export const nextVisible = (visible: number, total: number, step: number = PAGE_STEP): number =>
  clampVisible(visible + step, total);

/** Quantos itens o próximo clique revela (para o texto do botão). */
export const nextBatchSize = (visible: number, total: number, step: number = PAGE_STEP): number =>
  Math.max(0, nextVisible(visible, total, step) - clampVisible(visible, total));

export const pageSlice = <T,>(items: readonly T[], visible: number): T[] =>
  items.slice(0, clampVisible(visible, items.length));

export const pageCounterLabel = (visible: number, total: number): string =>
  `Mostrando ${clampVisible(visible, total)} de ${total}`;

/**
 * Regra de reinício da paginação: sem status zera todos os grupos (mudou busca, filtro ou ordem);
 * com status zera só aquele grupo (grupo recolhido). Devolve o mesmo objeto quando nada muda.
 */
export const resetVisible = <K extends string>(
  map: Partial<Record<K, number>>,
  status?: K,
): Partial<Record<K, number>> => {
  if (status === undefined) return Object.keys(map).length === 0 ? map : {};
  if (!(status in map)) return map;
  const next = { ...map };
  delete next[status];
  return next;
};

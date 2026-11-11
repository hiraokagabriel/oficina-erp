import type { OrderItem } from '../types';

const isId = (v: unknown): v is string => typeof v === 'string' && v !== '';

/**
 * Ids únicos entre peças e serviços da mesma OS. A primeira ocorrência de um id válido fica;
 * id faltando ou repetido vira `${osId}-p${i}` (peça) ou `${osId}-s${i}` (serviço), `i` = posição na lista.
 * Se o id gerado já existir na OS, acrescenta `-x` até ficar livre. Determinístico e idempotente.
 * Não muta a entrada.
 */
export function ensureUniqueItemIds(
  osId: string,
  parts: OrderItem[] | undefined,
  services: OrderItem[] | undefined,
): { parts: OrderItem[]; services: OrderItem[] } {
  const used = new Set<string>();
  const keep = (list: OrderItem[]): boolean[] =>
    list.map(it => {
      if (isId(it.id) && !used.has(it.id)) { used.add(it.id); return true; }
      return false;
    });
  const keepParts = keep(parts ?? []);
  const keepServices = keep(services ?? []);

  const fix = (list: OrderItem[], kept: boolean[], tag: 'p' | 's'): OrderItem[] =>
    list.map((it, i) => {
      if (kept[i]) return { ...it };
      let id = `${osId}-${tag}${i}`;
      while (used.has(id)) id += '-x';
      used.add(id);
      return { ...it, id };
    });
  return {
    parts: fix(parts ?? [], keepParts, 'p'),
    services: fix(services ?? [], keepServices, 's'),
  };
}

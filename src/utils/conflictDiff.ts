import { Appointment, Client, DatabaseSchema, LedgerEntry, WorkOrder } from '../types';

export interface LocalChange {
  kind: 'novo' | 'alterado' | 'removido';
  group: 'OS' | 'Lançamento' | 'Cliente' | 'Agendamento';
  id: string;
  label: string;
}

type Keyed = { id: string };

function diffList<T extends Keyed>(
  base: T[] | undefined,
  current: T[],
  group: LocalChange['group'],
  label: (item: T) => string
): LocalChange[] {
  const baseMap = new Map<string, T>();
  for (const item of base || []) baseMap.set(item.id, item);
  const changes: LocalChange[] = [];
  const seen = new Set<string>();

  for (const item of current) {
    seen.add(item.id);
    const before = baseMap.get(item.id);
    if (!before) changes.push({ kind: 'novo', group, id: item.id, label: label(item) });
    else if (JSON.stringify(before) !== JSON.stringify(item)) {
      changes.push({ kind: 'alterado', group, id: item.id, label: label(item) });
    }
  }
  for (const [id, item] of baseMap) {
    if (!seen.has(id)) changes.push({ kind: 'removido', group, id, label: label(item) });
  }
  return changes;
}

/**
 * Lista de OS, lançamentos e clientes cujo JSON difere da base (último estado lido/gravado).
 * `baseSnapshot` é o JSON da base; nulo ou ilegível = sem base (lista vazia).
 */
export function diffLocalChanges(baseSnapshot: string | null, current: DatabaseSchema): LocalChange[] {
  if (!baseSnapshot) return [];
  let base: Partial<DatabaseSchema>;
  try {
    base = JSON.parse(baseSnapshot);
  } catch {
    return [];
  }
  return [
    ...diffList<WorkOrder>(base.workOrders, current.workOrders, 'OS', os => (os.clientName ? `OS #${os.osNumber} (${os.clientName})` : `OS #${os.osNumber}`)),
    ...diffList<LedgerEntry>(base.ledger, current.ledger, 'Lançamento', e => e.description || 'sem descrição'),
    ...diffList<Client>(base.clients, current.clients, 'Cliente', c => c.name || 'sem nome'),
    ...diffList<Appointment>(base.appointments, current.appointments ?? [], 'Agendamento', a => `${a.clientName || 'sem cliente'} (${a.vehicle})`),
  ];
}

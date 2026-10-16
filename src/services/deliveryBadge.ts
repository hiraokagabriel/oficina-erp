import { WorkOrder } from '../types';
import { formatDateOnly, parseDateFlexible } from '../utils/dates';
import { getDaysLate, getDeliveryStatus } from './schedule';
import { toLocalDay } from './receivables';

// Selo de previsão de entrega (Kanban e Processos). Só apresentação: a regra de atraso fica em schedule.ts.

export type DeliveryBadgeKind = 'atrasada' | 'hoje' | 'prazo';

export interface DeliveryBadge {
  kind: DeliveryBadgeKind;
  label: string;
  title: string;
}

type OSDelivery = Pick<WorkOrder, 'status' | 'expectedDate'>;

const dayOf = (os: Pick<WorkOrder, 'expectedDate'>): string | undefined => {
  if (!os.expectedDate) return undefined;
  const d = parseDateFlexible(os.expectedDate);
  return isNaN(d.getTime()) ? undefined : formatDateOnly(d);
};

/** null = status que não conta ou sem previsão (nada a mostrar). */
export const getDeliveryBadge = (os: OSDelivery, today: string | Date): DeliveryBadge | null => {
  const status = getDeliveryStatus(os, today);
  const day = dayOf(os);
  if (!status || status === 'SEM_PREVISAO' || !day) return null;
  const [y, m, d] = day.split('-');
  if (status === 'ATRASADA') {
    const n = getDaysLate(os, today);
    return {
      kind: 'atrasada',
      label: `Atrasada há ${n} ${n === 1 ? 'dia' : 'dias'}`,
      title: `Previsão de entrega: ${d}/${m}/${y}`,
    };
  }
  if (day === toLocalDay(today)) {
    return { kind: 'hoje', label: 'Entrega hoje', title: `Previsão de entrega: ${d}/${m}/${y}` };
  }
  return { kind: 'prazo', label: `Entrega ${d}/${m}`, title: `Previsão de entrega: ${d}/${m}/${y}` };
};

/** Ordena por previsão (dia local). Sem previsão (ou inválida) vai SEMPRE por último, em qualquer direção. */
export const compareByExpectedDate = (
  a: Pick<WorkOrder, 'expectedDate'>,
  b: Pick<WorkOrder, 'expectedDate'>,
  direction: 'asc' | 'desc'
): number => {
  const da = dayOf(a);
  const db = dayOf(b);
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  const c = da < db ? -1 : da > db ? 1 : 0;
  return direction === 'asc' ? c : -c;
};

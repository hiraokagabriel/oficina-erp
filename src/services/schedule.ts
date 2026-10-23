import { Appointment, WorkOrder } from '../types';
import { formatDateOnly, parseDateFlexible, parseDateOnly } from '../utils/dates';
import { diffDays, toLocalDay } from './receivables';

// Prazo de entrega e agenda de entrada de veículos. Funções puras; `today` é injetado
// (Date ou 'YYYY-MM-DD') e toda comparação é por DIA LOCAL (sem efeito de horário de verão).

export type DeliveryStatus = 'ATRASADA' | 'NO_PRAZO' | 'SEM_PREVISAO';

/** Só estas OS contam para o prazo; as demais nunca atrasam. */
const COUNTS_FOR_DELIVERY = new Set<WorkOrder['status']>(['APROVADO', 'EM_SERVICO']);

/** Dia local 'AAAA-MM-DD' da previsão; undefined se ausente ou inválida. */
export const expectedDay = (os: Pick<WorkOrder, 'expectedDate'>): string | undefined => {
  if (!os.expectedDate) return undefined;
  const d = parseDateFlexible(os.expectedDate);
  return isNaN(d.getTime()) ? undefined : formatDateOnly(d);
};

/** null = status que não conta; SEM_PREVISAO = conta mas não tem data. */
export const getDeliveryStatus = (
  os: Pick<WorkOrder, 'status' | 'expectedDate'>,
  today: string | Date
): DeliveryStatus | null => {
  if (!COUNTS_FOR_DELIVERY.has(os.status)) return null;
  const day = expectedDay(os);
  if (!day) return 'SEM_PREVISAO';
  return day < toLocalDay(today) ? 'ATRASADA' : 'NO_PRAZO';
};

/** Dias de calendário de atraso (0 se não está atrasada). */
export const getDaysLate = (
  os: Pick<WorkOrder, 'status' | 'expectedDate'>,
  today: string | Date
): number => {
  if (getDeliveryStatus(os, today) !== 'ATRASADA') return 0;
  return diffDays(expectedDay(os) as string, toLocalDay(today));
};

/** Previsão como dd/mm/aaaa pelo dia local; '' se não houver. */
export const formatExpectedDate = (os: Pick<WorkOrder, 'expectedDate'>): string => {
  const day = expectedDay(os);
  if (!day) return '';
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
};

export interface DeliverySummary {
  /** Da mais atrasada para a menos (empate: número da OS). */
  atrasadas: WorkOrder[];
  /** OS que contam, com previsão para hoje. */
  hoje: number;
  /** OS que contam, sem previsão. */
  semPrevisao: number;
}

export const summarizeDeliveries = (workOrders: WorkOrder[], today: string | Date): DeliverySummary => {
  const todayKey = toLocalDay(today);
  const atrasadas: WorkOrder[] = [];
  let hoje = 0;
  let semPrevisao = 0;
  for (const os of workOrders) {
    const status = getDeliveryStatus(os, today);
    if (status === 'ATRASADA') atrasadas.push(os);
    else if (status === 'SEM_PREVISAO') semPrevisao++;
    else if (status === 'NO_PRAZO' && expectedDay(os) === todayKey) hoje++;
  }
  atrasadas.sort((a, b) => getDaysLate(b, today) - getDaysLate(a, today) || a.osNumber - b.osNumber);
  return { atrasadas, hoje, semPrevisao };
};

// ---------- Agenda ----------

const toDay = (value: string | Date): Date => parseDateOnly(toLocalDay(value));

/** Segunda-feira da semana do dia local de `date`, em meio-dia local. */
export const startOfWeek = (date: string | Date): Date => {
  const d = toDay(date);
  const sinceMonday = (d.getDay() + 6) % 7; // domingo = 6
  d.setDate(d.getDate() - sinceMonday);
  return d;
};

/** Soma `delta` semanas (pode ser negativo) ao início da semana. */
export const shiftWeek = (weekStart: string | Date, delta: number): Date => {
  const d = toDay(weekStart);
  d.setDate(d.getDate() + delta * 7);
  return d;
};

export interface AppointmentDay {
  dayKey: string;
  isToday: boolean;
  isTomorrow: boolean;
  items: Appointment[];
}

const byTime = (a: Appointment, b: Appointment): number => {
  if (a.time && b.time) return a.time.localeCompare(b.time) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  if (a.time) return -1;
  if (b.time) return 1;
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
};

/**
 * 7 dias (segunda a domingo) a partir de `weekStart`. Cancelados e faltas entram nos grupos
 * (quem exibe distingue pelo `status`). Itens ordenados por hora; sem hora vão por último.
 * `today` só marca isToday/isTomorrow.
 */
export const groupAppointmentsByDay = (
  appointments: Appointment[],
  weekStart: string | Date,
  today: string | Date = new Date()
): AppointmentDay[] => {
  const start = toDay(weekStart);
  const todayKey = toLocalDay(today);
  const tomorrow = toDay(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = formatDateOnly(tomorrow);

  const days: AppointmentDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getTime());
    d.setDate(start.getDate() + i);
    const dayKey = formatDateOnly(d);
    days.push({ dayKey, isToday: dayKey === todayKey, isTomorrow: dayKey === tomorrowKey, items: [] });
  }
  const byKey = new Map(days.map(d => [d.dayKey, d]));
  for (const ap of appointments) {
    const d = parseDateFlexible(ap.date);
    if (isNaN(d.getTime())) continue;
    byKey.get(formatDateOnly(d))?.items.push(ap);
  }
  days.forEach(d => d.items.sort(byTime));
  return days;
};

export interface OSDraftFromAppointment {
  clientName: string;
  clientPhone: string;
  clientId?: string;
  vehicle: string;
  vehicleId?: string;
  notes: string;
}

/** Dados para pré-preencher a OS a partir do agendamento (a ligação à OS fica a cargo de quem salva). */
export const appointmentToOSDraft = (ap: Appointment): OSDraftFromAppointment => ({
  clientName: ap.clientName,
  clientPhone: ap.clientPhone ?? '',
  clientId: ap.clientId,
  vehicle: ap.vehicle,
  vehicleId: ap.vehicleId,
  notes: ap.reason ?? '',
});

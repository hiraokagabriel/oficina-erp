import { Appointment } from '../types';
import { formatDateOnly, parseDateFlexible, parseDateOnly } from '../utils/dates';

/** Janela de busca de pendências: dias anteriores a hoje, até este limite. */
export const PENDING_LOOKBACK_DAYS = 30;

const dayKeyOf = (ap: Appointment): string | null => {
  const d = parseDateFlexible(ap.date);
  return isNaN(d.getTime()) ? null : formatDateOnly(d);
};

/**
 * Agendamentos pendentes de dias anteriores: status AGENDADO, sem OS ligada, com dia (local)
 * antes de `todayKey` e de no máximo `PENDING_LOOKBACK_DAYS` dias atrás (inclusive).
 * Dia de hoje e futuros nunca contam. Ordem: mais antigo primeiro, depois por hora.
 */
export const listPastPending = (
  appointments: Appointment[],
  todayKey: string,
  lookbackDays: number = PENDING_LOOKBACK_DAYS
): Appointment[] => {
  const limit = parseDateOnly(todayKey);
  limit.setDate(limit.getDate() - lookbackDays);
  const limitKey = formatDateOnly(limit);
  return appointments
    .map(ap => ({ ap, key: dayKeyOf(ap) }))
    .filter((x): x is { ap: Appointment; key: string } =>
      x.key !== null && x.ap.status === 'AGENDADO' && !x.ap.workOrderId && x.key < todayKey && x.key >= limitKey)
    .sort((a, b) =>
      a.key.localeCompare(b.key) ||
      (a.ap.time ?? '99:99').localeCompare(b.ap.time ?? '99:99') ||
      a.ap.createdAt.localeCompare(b.ap.createdAt) ||
      a.ap.id.localeCompare(b.ap.id))
    .map(x => x.ap);
};

export const countPastPending = (appointments: Appointment[], todayKey: string): number =>
  listPastPending(appointments, todayKey).length;

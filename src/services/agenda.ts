import type { Appointment, AppointmentStatus, Client, WorkOrder } from '../types';
import { formatDateOnly, isDateOnly, parseDateFlexible, parseDateOnly, toISOFromDateInput } from '../utils/dates';
import { normalizeName, resolveClientId, resolveVehicleId } from '../utils/links';

// Regras da tela da Agenda (rodada C). Funções puras; relógio e gerador de id são injetados.

export type AppointmentAction = 'CANCELAR' | 'FALTOU' | 'REAGENDAR' | 'COMPARECEU';

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  AGENDADO: 'Agendado',
  COMPARECEU: 'Compareceu',
  CANCELADO: 'Cancelado',
  FALTOU: 'Faltou',
};

export const statusLabel = (status: AppointmentStatus): string => STATUS_LABELS[status] ?? status;

/** Campos do formulário. `date` é o AAAA-MM-DD do input; `time` é 'HH:MM' ou vazio. */
export interface AppointmentInput {
  clientName: string;
  clientPhone?: string;
  clientId?: string;
  vehicle: string;
  vehicleId?: string;
  date: string;
  time?: string;
  reason?: string;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const isRealDay = (value: string): boolean => {
  if (!isDateOnly(value)) return false;
  return formatDateOnly(parseDateOnly(value)) === value; // recusa 2026-02-31
};

/** Mensagem de erro em pt-BR, ou null se o formulário é válido. */
export const validateAppointmentInput = (input: AppointmentInput): string | null => {
  if (!input.clientName.trim()) return 'Informe o cliente.';
  const date = (input.date ?? '').trim();
  if (!date) return 'Informe a data do agendamento.';
  if (!isRealDay(date)) return 'Data inválida.';
  const time = (input.time ?? '').trim();
  if (time && !TIME_RE.test(time)) return 'Hora inválida. Use o formato HH:MM.';
  return null;
};

const clean = (s: string | undefined): string | undefined => {
  const t = (s ?? '').trim();
  return t === '' ? undefined : t;
};

const fieldsFromInput = (input: AppointmentInput) => {
  const error = validateAppointmentInput(input);
  if (error) throw new Error(error);
  return {
    date: toISOFromDateInput(input.date.trim()),
    time: clean(input.time),
    clientName: input.clientName.trim().replace(/\s+/g, ' '),
    clientId: clean(input.clientId),
    clientPhone: clean(input.clientPhone),
    vehicle: (input.vehicle ?? '').trim(),
    vehicleId: clean(input.vehicleId),
    reason: clean(input.reason),
  };
};

export const makeAppointment = (input: AppointmentInput & { newId: string; now: Date }): Appointment => ({
  id: input.newId,
  ...fieldsFromInput(input),
  status: 'AGENDADO',
  createdAt: input.now.toISOString(),
});

/** Atualiza os campos editáveis; mantém id, status, workOrderId e createdAt. */
export const updateAppointment = (original: Appointment, input: AppointmentInput): Appointment => ({
  ...original,
  ...fieldsFromInput(input),
});

/** Dia local 'AAAA-MM-DD' do agendamento (para o input de data e o agrupamento). */
export const appointmentDayKey = (ap: Pick<Appointment, 'date'>): string => formatDateOnly(parseDateFlexible(ap.date));

/** Só um agendamento ainda AGENDADO e sem OS pode gerar OS. */
export const canCreateOS = (ap: Pick<Appointment, 'status' | 'workOrderId'>): boolean =>
  ap.status === 'AGENDADO' && !ap.workOrderId;

/** Quais ações cada status aceita. Reagendar também vale para cancelado e faltou. */
const ALLOWED: Record<AppointmentAction, AppointmentStatus[]> = {
  CANCELAR: ['AGENDADO'],
  FALTOU: ['AGENDADO'],
  COMPARECEU: ['AGENDADO'],
  REAGENDAR: ['AGENDADO', 'CANCELADO', 'FALTOU'],
};

export const canApplyAction = (ap: Pick<Appointment, 'status'>, action: AppointmentAction): boolean =>
  ALLOWED[action].includes(ap.status);

/**
 * Aplica uma ação. Transição inválida lança Error. REAGENDAR exige `reschedule.date` (AAAA-MM-DD)
 * e volta o agendamento a AGENDADO; `time` vazio limpa a hora.
 */
export const applyAppointmentAction = (
  ap: Appointment,
  action: AppointmentAction,
  reschedule?: { date: string; time?: string }
): Appointment => {
  if (!canApplyAction(ap, action)) throw new Error(`Ação ${action} não vale para agendamento ${statusLabel(ap.status)}.`);
  switch (action) {
    case 'CANCELAR':
      return { ...ap, status: 'CANCELADO' };
    case 'FALTOU':
      return { ...ap, status: 'FALTOU' };
    case 'COMPARECEU':
      return { ...ap, status: 'COMPARECEU' };
    case 'REAGENDAR': {
      if (!reschedule) throw new Error('Informe a nova data.');
      const error = validateAppointmentInput({ clientName: 'x', date: reschedule.date, time: reschedule.time, vehicle: '' });
      if (error) throw new Error(error);
      return { ...ap, status: 'AGENDADO', date: toISOFromDateInput(reschedule.date.trim()), time: clean(reschedule.time) };
    }
  }
};

/** Liga o agendamento à OS criada a partir dele: COMPARECEU + workOrderId. */
export const linkAppointmentToOS = (ap: Appointment, os: Pick<WorkOrder, 'id'>): Appointment => ({
  ...ap,
  status: 'COMPARECEU',
  workOrderId: os.id,
});

/**
 * Acrescenta `extra` numa nota existente, SEMPRE na linha de baixo e sem apagar o que já havia.
 * Usado para levar o motivo do agendamento às notas internas do cliente (Obs. Interna da OS).
 */
export const appendNote = (existing: string | undefined, extra: string | undefined): string => {
  const base = (existing ?? '').replace(/\s+$/, '');
  const add = (extra ?? '').trim();
  if (!add) return base;
  return base ? `${base}\n${add}` : add;
};

/** 'dd/mm a dd/mm/aaaa' (segunda a domingo). */
export const weekRangeLabel =(weekStart: string | Date): string => {
  const start = typeof weekStart === 'string' ? parseDateFlexible(weekStart) : new Date(weekStart.getTime());
  const end = new Date(start.getTime());
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date, withYear: boolean) => {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return withYear ? `${dd}/${mm}/${d.getFullYear()}` : `${dd}/${mm}`;
  };
  return `${fmt(start, false)} a ${fmt(end, true)}`;
};

// ---------- Resolução do cliente ----------

export type AppointmentClientResolution =
  | { kind: 'unique'; client: Client; clientId: string; vehicleId?: string }
  | { kind: 'ambiguous'; candidates: Client[] }
  | { kind: 'none' };

/**
 * Cliente do agendamento pelo nome. Um único cliente com o nome -> unique; homônimos -> ambiguous, a menos que
 * `chosenId` seja um deles; nenhum -> none (o agendamento guarda só o texto; nunca cria cliente no cadastro).
 */
export const resolveAppointmentClient = (
  clientName: string,
  clients: Client[],
  chosenId?: string,
  vehicle?: string
): AppointmentClientResolution => {
  const name = normalizeName(clientName);
  if (!name) return { kind: 'none' };
  const candidates = clients.filter(c => normalizeName(c.name) === name);
  if (candidates.length === 0) return { kind: 'none' };

  let client: Client | undefined;
  if (candidates.length === 1) {
    const id = resolveClientId({ clientName }, clients);
    client = candidates.find(c => c.id === id);
  } else if (chosenId) {
    client = candidates.find(c => c.id === chosenId);
  }
  if (!client) return { kind: 'ambiguous', candidates };

  const vehicleId = vehicle?.trim() ? resolveVehicleId({ vehicle }, client) : undefined;
  return { kind: 'unique', client, clientId: client.id, vehicleId };
};

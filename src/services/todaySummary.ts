import { Appointment, Client, LedgerEntry, WorkOrder, WorkshopSettings } from '../types';
import { formatDateOnly } from '../utils/dates';
import { getDaysOverdue, summarizeReceivables, toLocalDay } from './receivables';
import { getDaysLate, getDeliveryStatus, groupAppointmentsByDay, startOfWeek, summarizeDeliveries } from './schedule';

// Painel "Hoje": só junta funções puras que já existem. `today` é injetado (Date ou 'AAAA-MM-DD'), dia local.

export const TODAY_LIST_LIMIT = 5;

export interface TodayLate { os: WorkOrder; daysLate: number }
export interface TodayOverdue { entry: LedgerEntry; daysOverdue: number }

export interface TodaySummary {
  /** OS com entrega prevista para hoje (aprovada ou em serviço), por número. */
  entregasHoje: WorkOrder[];
  /** Mais atrasada primeiro. */
  atrasadas: TodayLate[];
  /** Agendamentos de hoje que ainda valem (sem cancelados e faltas), por hora. */
  agendamentosHoje: Appointment[];
  /** Parcelas vencidas, a mais antiga primeiro. */
  contasVencidas: TodayOverdue[];
  totalVencido: number;
  countVencido: number;
}

export const buildTodaySummary = (
  workOrders: WorkOrder[],
  appointments: Appointment[],
  ledger: LedgerEntry[],
  today: string | Date
): TodaySummary => {
  const todayKey = toLocalDay(today);
  const deliveries = summarizeDeliveries(workOrders, today);
  const entregasHoje = workOrders
    .filter(os => getDeliveryStatus(os, today) === 'NO_PRAZO' && os.expectedDate && toLocalDay(os.expectedDate) === todayKey)
    .sort((a, b) => a.osNumber - b.osNumber);

  const week = groupAppointmentsByDay(appointments, startOfWeek(today), today);
  const dia = week.find(d => d.dayKey === todayKey);
  const agendamentosHoje = (dia ? dia.items : []).filter(a => a.status !== 'CANCELADO' && a.status !== 'FALTOU');

  const rec = summarizeReceivables(ledger, today);
  const vencidas = rec.items
    .filter(e => getDaysOverdue(e, today) > 0)
    .map(entry => ({ entry, daysOverdue: getDaysOverdue(entry, today) }));

  return {
    entregasHoje,
    atrasadas: deliveries.atrasadas.map(os => ({ os, daysLate: getDaysLate(os, today) })),
    agendamentosHoje,
    contasVencidas: vencidas,
    totalVencido: rec.totalAtrasado,
    countVencido: rec.countAtrasado,
  };
};

/** "1 dia de atraso" ou "N dias de atraso". */
export const lateLabel = (days: number): string => `${days} ${days === 1 ? 'dia' : 'dias'} de atraso`;

/** Data por extenso em pt-BR, ex.: "quinta-feira, 22 de outubro de 2026". */
export const formatTodayLong = (today: Date): string => {
  const t = today.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export const todayKeyOf = (today: Date): string => formatDateOnly(today);

// ---------- Primeiros passos ----------

export interface OnboardingStep { id: 'oficina' | 'cliente' | 'os' | 'servico' | 'imprimir'; label: string; done: boolean }

const MOVED_PAST_APPROVED = new Set<WorkOrder['status']>(['EM_SERVICO', 'AGUARDANDO_PAGAMENTO', 'FINALIZADO', 'ARQUIVADO']);

/** Marcas calculadas dos dados existentes; "imprimir" vem do aviso gravado neste PC. */
export const buildOnboarding = (
  settings: Pick<WorkshopSettings, 'name' | 'cnpj' | 'address'>,
  clients: Client[],
  workOrders: WorkOrder[],
  printedOnThisPC: boolean
): OnboardingStep[] => {
  const name = (settings.name ?? '').trim();
  const oficinaOk = (name !== '' && name.toUpperCase() !== 'OFICINA') || (settings.cnpj ?? '').trim() !== '' || (settings.address ?? '').trim() !== '';
  return [
    { id: 'oficina', label: 'Preencher os dados da oficina em Configurações', done: oficinaOk },
    { id: 'cliente', label: 'Cadastrar o primeiro cliente', done: clients.length > 0 },
    { id: 'os', label: 'Criar a primeira OS', done: workOrders.length > 0 },
    { id: 'servico', label: 'Mover uma OS para Em serviço', done: workOrders.some(o => MOVED_PAST_APPROVED.has(o.status)) },
    { id: 'imprimir', label: 'Imprimir uma OS', done: printedOnThisPC },
  ];
};

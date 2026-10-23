// Textos e regras de apresentação do cartão do quadro (Oficina). Puro, sem React: `today` é injetado.
import type { OSStatus, WorkOrder } from '../types';
import type { IconName } from '../components/ui/Icon';
import { formatDateOnly, parseDateFlexible } from '../utils/dates';
import { diffDays, toLocalDay } from './receivables';
import { expectedDay, getDaysLate, getDeliveryStatus } from './schedule';

export interface NextStep {
  to: OSStatus;
  /** Texto do botão (o ícone de seta vem da tela). */
  label: string;
}

const NEXT_STEPS: Partial<Record<OSStatus, NextStep>> = {
  ORCAMENTO: { to: 'APROVADO', label: 'Aprovar' },
  APROVADO: { to: 'EM_SERVICO', label: 'Começar serviço' },
  EM_SERVICO: { to: 'AGUARDANDO_PAGAMENTO', label: 'Terminar serviço' },
  AGUARDANDO_PAGAMENTO: { to: 'FINALIZADO', label: 'Receber' },
};

/** Próximo passo do fluxo da OS; null em FINALIZADO e ARQUIVADO (sem botão). */
export const nextStep = (status: OSStatus): NextStep | null => NEXT_STEPS[status] ?? null;

/** Ícone de cada status (a informação nunca vai só pela cor). */
export const STATUS_ICON: Record<OSStatus, IconName> = {
  ORCAMENTO: 'prancheta',
  APROVADO: 'check',
  EM_SERVICO: 'oficina',
  AGUARDANDO_PAGAMENTO: 'cifrao',
  FINALIZADO: 'bandeira',
  ARQUIVADO: 'caixa',
};

/** Sufixo das classes `.status-light--*` e `.kanban-column--*`. */
export const statusClass = (status: OSStatus): string => status.toLowerCase().replace(/_/g, '-');

export type DeliveryLevel = 'ok' | 'hoje' | 'atrasada' | 'sem';

export interface DeliveryProgress {
  /** 0 a 100: quanto do prazo (da abertura da OS até a previsão) já passou. */
  pct: number;
  level: DeliveryLevel;
  /** Texto que sempre acompanha a barra. */
  label: string;
  title: string;
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const weekdayOf = (day: string): string => {
  const [y, m, d] = day.split('-').map(Number);
  return WEEKDAYS[new Date(y, m - 1, d, 12).getDay()];
};

/**
 * Barra de prazo do cartão. null = status que não conta (só APROVADO e EM_SERVICO contam).
 * Sem previsão: nível 'sem' e barra vazia. Atrasada e no dia: barra cheia.
 */
export const deliveryProgress = (
  os: Pick<WorkOrder, 'status' | 'expectedDate' | 'createdAt'>,
  today: string | Date
): DeliveryProgress | null => {
  const status = getDeliveryStatus(os, today);
  if (!status) return null;
  if (status === 'SEM_PREVISAO') {
    return { pct: 0, level: 'sem', label: 'Sem previsão', title: 'Esta OS ainda não tem previsão de entrega' };
  }
  const day = expectedDay(os) as string;
  const todayKey = toLocalDay(today);
  const [y, m, d] = day.split('-');
  const title = `Previsão de entrega: ${d}/${m}/${y}`;
  if (status === 'ATRASADA') {
    const n = getDaysLate(os, today);
    return { pct: 100, level: 'atrasada', label: `Atrasada ${n} ${n === 1 ? 'dia' : 'dias'}`, title };
  }
  if (day === todayKey) return { pct: 100, level: 'hoje', label: 'Entrega hoje', title };

  const when = `${weekdayOf(day)} ${d}/${m}`;
  const label = diffDays(todayKey, day) === 1 ? `Entrega amanhã (${when})` : `Entrega ${when}`;

  const created = parseDateFlexible(os.createdAt);
  let pct = 0;
  if (!isNaN(created.getTime())) {
    const createdDay = formatDateOnly(created);
    const total = diffDays(createdDay, day);
    if (total > 0) pct = Math.min(100, Math.max(0, Math.round((diffDays(createdDay, todayKey) / total) * 100)));
  }
  return { pct, level: 'ok', label, title };
};

export interface VehicleParts {
  model: string;
  /** Placa gravada no fim do texto ("Modelo - ABC1D23"); null se não houver. */
  plate: string | null;
}

/** Separa "Modelo - PLACA" (formato gravado pelo OSModal). A placa precisa ter número; senão tudo é modelo. */
export const splitVehicle = (vehicle: string): VehicleParts => {
  const text = (vehicle || '').trim();
  const match = /^(.*\S)\s+-\s+((?=[A-Za-z0-9-]*\d)[A-Za-z0-9-]{5,8})$/.exec(text);
  return match ? { model: match[1], plate: match[2].toUpperCase() } : { model: text, plate: null };
};

/** "45.000 km"; vazio quando a quilometragem não foi informada. */
export const formatKm = (mileage: number | undefined): string =>
  typeof mileage === 'number' && isFinite(mileage) && mileage > 0 ? `${Math.round(mileage).toLocaleString('pt-BR')} km` : '';

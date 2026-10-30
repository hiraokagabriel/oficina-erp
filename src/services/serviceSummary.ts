import { INSPECTION_STATUS_META, InspectionStatus, OrderItem, OSStatus, WorkOrder, WorkshopSettings, migrateChecklist } from '../types';
import { formatDateOnly, parseDateFlexible } from '../utils/dates';
import { WARRANTY_DAYS, WARRANTY_SUMMARY_TEXT } from '../utils/warranty';
import { sumAdvances } from './osFinanceService';
import { formatExpectedDate } from './schedule';

// "Resumo do serviço" para o cliente. Função pura: monta um objeto NOVO campo a campo
// (nunca `...os`), então custo, margem, telefone, técnico, notas internas e dados do
// caixa nunca chegam à tela nem à impressão. Valores em centavos.

export interface ServiceSummaryOptions {
  /** Inclui os itens MARCADOS da vistoria (ok, atenção, urgente), com a nota de cada item (padrão false). */
  includeInspection?: boolean;
  /** Inclui a nota geral da vistoria (padrão false; só vale com includeInspection). */
  includeGeneralNote?: boolean;
}

export interface ServiceSummaryItem {
  description: string;
  /** Centavos. */
  price: number;
  /** Garantia só para item cobrado (price > 0). */
  warranty: boolean;
}

export type SummaryInspectionStatus = Exclude<InspectionStatus, 'pending'>;

export interface ServiceSummaryInspectionItem {
  label: string;
  category: string;
  /** Só quando a nota do item está preenchida. */
  note?: string;
}

export interface ServiceSummaryInspectionGroup {
  status: SummaryInspectionStatus;
  /** Palavra do estado (INSPECTION_STATUS_META), nunca só cor. */
  label: string;
  items: ServiceSummaryInspectionItem[];
}

export interface ServiceSummaryInspection {
  /** Do mais grave ao menos grave (urgente, trocar, ok); grupo vazio não aparece. */
  groups: ServiceSummaryInspectionGroup[];
  /** Nota geral da vistoria; '' se não escolhida ou vazia. */
  generalNote: string;
}

export interface ServiceSummary {
  workshop: { name: string; address: string; cnpj: string };
  osNumber: number;
  /** dd/mm/aaaa (dia local da criação da OS). */
  osDate: string;
  vehicle: string;
  mileage: number;
  clientName: string;
  status: OSStatus;
  /** Status em linguagem simples (plainStatus). */
  statusText: string;
  /** dd/mm/aaaa; '' se não houver previsão. */
  expectedDate: string;
  /** Observações públicas da OS (texto cru, sem HTML escapado: a tela escapa). */
  publicNotes: string;
  items: { services: ServiceSummaryItem[]; parts: ServiceSummaryItem[] };
  totals: {
    /** Total da OS. */
    total: number;
    /** Adiantamento já recebido (0 se não houver). */
    advance: number;
    /** Restante a pagar: max(total - adiantamento, 0), igual à OS impressa. */
    remaining: number;
    hasAdvance: boolean;
  };
  warranty: { days: number; text: string; hasWarrantyItems: boolean };
  inspection: ServiceSummaryInspection;
  /** dd/mm/aaaa do dia em que o resumo foi gerado. */
  generatedAt: string;
}

const PLAIN_STATUS: Record<OSStatus, string> = {
  ORCAMENTO: 'Orçamento aguardando aprovação',
  APROVADO: 'Aprovado, aguardando início do serviço',
  EM_SERVICO: 'Serviço em andamento',
  AGUARDANDO_PAGAMENTO: 'Pronto para retirada',
  FINALIZADO: 'Serviço concluído e entregue',
  ARQUIVADO: 'Serviço concluído',
};

export const plainStatus = (status: OSStatus): string => PLAIN_STATUS[status] ?? '';

const toBR = (iso: string): string => {
  const d = parseDateFlexible(iso);
  if (isNaN(d.getTime())) return '';
  const [y, m, day] = formatDateOnly(d).split('-');
  return `${day}/${m}/${y}`;
};

const toSummaryItem = (item: OrderItem): ServiceSummaryItem => ({
  description: item.description,
  price: item.price,
  warranty: item.price > 0,
});

const INSPECTION_ORDER: SummaryInspectionStatus[] = ['urgent', 'attention', 'ok'];

/**
 * Adiantamento recebido, igual ao que a OS impressa mostra (handlePrintOS): soma dos `advances` (v4),
 * senão o `advanceAmount` legado mesmo sem advanceEntryId. Não limita ao total.
 */
const receivedAdvance = (os: WorkOrder): number => {
  const sum = sumAdvances(os);
  if (sum > 0) return sum;
  return typeof os.advanceAmount === 'number' && os.advanceAmount > 0 ? os.advanceAmount : 0;
};

export const buildServiceSummary = (
  os: WorkOrder,
  settings: WorkshopSettings,
  options: ServiceSummaryOptions = {},
  now: Date = new Date()
): ServiceSummary => {
  const services = (os.services ?? []).map(toSummaryItem);
  const parts = (os.parts ?? []).map(toSummaryItem);

  const advance = receivedAdvance(os);
  const remaining = advance > 0 ? Math.max(os.total - advance, 0) : os.total;

  const inspection: ServiceSummaryInspection = { groups: [], generalNote: '' };
  if (options.includeInspection) {
    const checklist = migrateChecklist(os.checklist);
    for (const status of INSPECTION_ORDER) {
      const items: ServiceSummaryInspectionItem[] = [];
      for (const cat of checklist.categories) {
        for (const item of cat.items) {
          if (item.status !== status) continue;
          const entry: ServiceSummaryInspectionItem = { label: item.label, category: cat.label };
          const note = item.note?.trim();
          if (note) entry.note = note;
          items.push(entry);
        }
      }
      if (items.length > 0) inspection.groups.push({ status, label: INSPECTION_STATUS_META[status].label, items });
    }
    if (options.includeGeneralNote) inspection.generalNote = (checklist.notes ?? '').trim();
  }

  return {
    workshop: { name: settings.name, address: settings.address, cnpj: settings.cnpj },
    osNumber: os.osNumber,
    osDate: toBR(os.createdAt),
    vehicle: os.vehicle,
    mileage: os.mileage,
    clientName: os.clientName,
    status: os.status,
    statusText: plainStatus(os.status),
    expectedDate: formatExpectedDate(os),
    publicNotes: (os.publicNotes ?? '').trim(),
    items: { services, parts },
    totals: { total: os.total, advance, remaining, hasAdvance: advance > 0 },
    warranty: {
      days: WARRANTY_DAYS,
      text: WARRANTY_SUMMARY_TEXT,
      hasWarrantyItems: services.some(i => i.warranty) || parts.some(i => i.warranty),
    },
    inspection,
    generatedAt: toBR(now.toISOString()),
  };
};

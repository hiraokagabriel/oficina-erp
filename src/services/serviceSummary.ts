import { OrderItem, OSStatus, WorkOrder, WorkshopSettings, migrateChecklist } from '../types';
import { formatDateOnly, parseDateFlexible } from '../utils/dates';
import { WARRANTY_DAYS, WARRANTY_SUMMARY_TEXT } from '../utils/warranty';
import { getRemainingAmount } from './osFinanceService';
import { formatExpectedDate } from './schedule';

// "Resumo do serviço" para o cliente. Função pura: monta um objeto NOVO campo a campo
// (nunca `...os`), então custo, margem, telefone, técnico, notas internas e dados do
// caixa nunca chegam à tela nem à impressão. Valores em centavos.

export interface ServiceSummaryOptions {
  /** Inclui os itens do checklist em "atenção"/"urgente" (padrão false). */
  includeRecommendations?: boolean;
  /** Inclui a nota de cada recomendação (padrão false; só vale com includeRecommendations). */
  includeInspectionNotes?: boolean;
}

export interface ServiceSummaryItem {
  description: string;
  /** Centavos. */
  price: number;
  /** Garantia só para item cobrado (price > 0). */
  warranty: boolean;
}

export interface ServiceSummaryRecommendation {
  label: string;
  urgent: boolean;
  /** Só com includeInspectionNotes e nota preenchida. */
  note?: string;
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
    /** Restante a pagar (getRemainingAmount). */
    remaining: number;
    hasAdvance: boolean;
  };
  warranty: { days: number; text: string; hasWarrantyItems: boolean };
  recommendations: ServiceSummaryRecommendation[];
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

export const buildServiceSummary = (
  os: WorkOrder,
  settings: WorkshopSettings,
  options: ServiceSummaryOptions = {},
  now: Date = new Date()
): ServiceSummary => {
  const services = (os.services ?? []).map(toSummaryItem);
  const parts = (os.parts ?? []).map(toSummaryItem);

  const remaining = getRemainingAmount(os);
  const advance = Math.max(os.total - remaining, 0);

  const recommendations: ServiceSummaryRecommendation[] = [];
  if (options.includeRecommendations) {
    for (const cat of migrateChecklist(os.checklist).categories) {
      for (const item of cat.items) {
        if (item.status !== 'attention' && item.status !== 'urgent') continue;
        const rec: ServiceSummaryRecommendation = { label: item.label, urgent: item.status === 'urgent' };
        const note = item.note?.trim();
        if (options.includeInspectionNotes && note) rec.note = note;
        recommendations.push(rec);
      }
    }
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
    recommendations,
    generatedAt: toBR(now.toISOString()),
  };
};

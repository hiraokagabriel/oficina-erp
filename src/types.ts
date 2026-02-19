export interface LedgerEntry {
  id: string;
  description: string;
  amount: number;
  type: 'CREDIT' | 'DEBIT';
  effectiveDate: string;
  createdAt: string;
  groupId?: string;
  installmentNumber?: number;
  totalInstallments?: number;
  installmentGroupId?: string;
  isPaid?: boolean;
  dueDate?: string;
  paymentDate?: string;
  history?: Array<{
    date: string;
    action: string;
    user?: string;
    timestamp?: string;
  }>;
}

export interface WorkOrder {
  id: string;
  osNumber: number;
  vehicle: string;
  clientName: string;
  clientPhone: string;
  mileage: number;
  status: OSStatus;
  parts: OrderItem[];
  services: OrderItem[];
  total: number;
  totalCost?: number;
  profit?: number;
  profitMargin?: number;
  createdAt: string;
  financialId?: string;
  checklist?: ChecklistSchema;
  publicNotes?: string;
  paymentDate?: string;
  paymentMethod?: 'SINGLE' | 'INSTALLMENT';
  installmentConfig?: InstallmentConfig;
}

export type OSStatus = 'ORCAMENTO' | 'APROVADO' | 'EM_SERVICO' | 'FINALIZADO' | 'ARQUIVADO';

export const STATUS_LABELS: Record<OSStatus, string> = {
  ORCAMENTO: 'Orçamento',
  APROVADO: 'Aprovado',
  EM_SERVICO: 'Em Serviço',
  FINALIZADO: 'Finalizado',
  ARQUIVADO: 'Arquivado'
};

export const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export interface Client {
  id: string;
  name: string;
  phone: string;
  notes?: string;
  vehicles: { model: string; plate: string }[];
  totalSpent?: number;
  serviceCount?: number;
  lastServiceDate?: string;
  averageTicket?: number;
  vipStatus?: boolean;
}

export interface CatalogItem {
  id: string;
  description: string;
  price: number;
  cost?: number;
}

export interface OrderItem {
  id: string;
  description: string;
  price: number;
  cost?: number;
}

export interface WorkshopSettings {
  name: string;
  cnpj: string;
  address: string;
  technician: string;
  exportPath: string;
  googleDriveToken: string;
  googleApiKey: string;
}

export interface DatabaseSchema {
  ledger: LedgerEntry[];
  workOrders: WorkOrder[];
  clients: Client[];
  catalogParts: CatalogItem[];
  catalogServices: CatalogItem[];
  settings: WorkshopSettings;
}

// ════════════════════════════════════════════════════════════════
// 🆕 Issue #43 — Checklist de Inspeção Mecânica (Passo 1)
// ════════════════════════════════════════════════════════════════

/**
 * Status de inspeção de cada item do checklist.
 * Ciclo ao clicar: pending → ok → attention → urgent → pending
 */
export type InspectionStatus = 'pending' | 'ok' | 'attention' | 'urgent';

/** Metadados de exibição para cada status */
export const INSPECTION_STATUS_META: Record<
  InspectionStatus,
  { label: string; color: string; emoji: string }
> = {
  pending:   { label: 'Não inspecionado', color: '#9E9E9E', emoji: '⚪' },
  ok:        { label: 'OK / Feito',        color: '#43A047', emoji: '🟢' },
  attention: { label: 'Necessita trocar',  color: '#FB8C00', emoji: '🟡' },
  urgent:    { label: 'Urgente!',          color: '#E53935', emoji: '🔴' },
};

/** Ciclo de status ao clicar (pending → ok → attention → urgent → pending) */
export const NEXT_INSPECTION_STATUS: Record<InspectionStatus, InspectionStatus> = {
  pending:   'ok',
  ok:        'attention',
  attention: 'urgent',
  urgent:    'pending',
};

/** Um item individual dentro de uma categoria de inspeção */
export interface InspectionItem {
  id: string;
  label: string;
  status: InspectionStatus;
  note?: string;
  /** Se true, foi adicionado manualmente pelo usuário (pode ser excluído) */
  custom?: boolean;
}

/** Uma categoria de inspeção (ex: MOTOR, FREIOS) com seus itens */
export interface InspectionCategory {
  id: string;
  label: string;
  items: InspectionItem[];
  /** Se true, foi adicionada manualmente pelo usuário (pode ser excluída) */
  custom?: boolean;
}

/** Schema principal do checklist — armazenado em `WorkOrder.checklist` */
export interface ChecklistSchema {
  /** Quilometragem registrada na entrada do veículo */
  mileageIn?: number;
  /** Categorias de inspeção com seus itens e status */
  categories: InspectionCategory[];
  /** Observações gerais do vistoriador */
  notes: string;
  /** ISO timestamp da última inspeção */
  inspectedAt?: string;
}

/**
 * 14 categorias e ~73 itens pré-definidos, portados do Checklist-Veicular.html.
 * Usados para criar um novo checklist em branco.
 */
export const DEFAULT_CHECKLIST_CATEGORIES: Omit<InspectionCategory, 'id'>[] = [
  {
    label: 'Motor',
    items: [
      { id: 'motor-1', label: 'Óleo do motor',          status: 'pending' },
      { id: 'motor-2', label: 'Filtro de óleo',          status: 'pending' },
      { id: 'motor-3', label: 'Filtro de ar',             status: 'pending' },
      { id: 'motor-4', label: 'Correia dentada',          status: 'pending' },
      { id: 'motor-5', label: 'Correia alternador/ar',   status: 'pending' },
      { id: 'motor-6', label: 'Bomba de água',           status: 'pending' },
      { id: 'motor-7', label: 'Válvula termostática',   status: 'pending' },
    ],
  },
  {
    label: 'Sistema de Freios',
    items: [
      { id: 'freio-1', label: 'Pastilha dianteira', status: 'pending' },
      { id: 'freio-2', label: 'Pastilha traseira',  status: 'pending' },
      { id: 'freio-3', label: 'Disco dianteiro',    status: 'pending' },
      { id: 'freio-4', label: 'Disco traseiro',     status: 'pending' },
      { id: 'freio-5', label: 'Fluido de freio',    status: 'pending' },
      { id: 'freio-6', label: 'Mangueiras',         status: 'pending' },
    ],
  },
  {
    label: 'Suspensão',
    items: [
      { id: 'susp-1',  label: 'Amortecedor diant. esq.', status: 'pending' },
      { id: 'susp-2',  label: 'Amortecedor diant. dir.', status: 'pending' },
      { id: 'susp-3',  label: 'Amortecedor tras. esq.',  status: 'pending' },
      { id: 'susp-4',  label: 'Amortecedor tras. dir.',  status: 'pending' },
      { id: 'susp-5',  label: 'Bandeja dianteira',       status: 'pending' },
      { id: 'susp-6',  label: 'Bieletas',                status: 'pending' },
      { id: 'susp-7',  label: 'Buchas',                  status: 'pending' },
      { id: 'susp-8',  label: 'Rolamentos',              status: 'pending' },
      { id: 'susp-9',  label: 'Braço oscilante diant.',  status: 'pending' },
      { id: 'susp-10', label: 'Braço oscilante tras.',   status: 'pending' },
    ],
  },
  {
    label: 'Direção',
    items: [
      { id: 'dir-1', label: 'Terminais direção', status: 'pending' },
      { id: 'dir-2', label: 'Caixa de direção', status: 'pending' },
      { id: 'dir-3', label: 'Fluido direção',  status: 'pending' },
      { id: 'dir-4', label: 'Alinhamento',      status: 'pending' },
      { id: 'dir-5', label: 'Braço axial',      status: 'pending' },
    ],
  },
  {
    label: 'Transmissão',
    items: [
      { id: 'trans-1', label: 'Óleo câmbio',          status: 'pending' },
      { id: 'trans-2', label: 'Filtro câmbio',         status: 'pending' },
      { id: 'trans-3', label: 'Coifa homocinética',    status: 'pending' },
    ],
  },
  {
    label: 'Sistema Elétrico',
    items: [
      { id: 'elet-1', label: 'Bateria',          status: 'pending' },
      { id: 'elet-2', label: 'Alternador',       status: 'pending' },
      { id: 'elet-3', label: 'Motor partida',    status: 'pending' },
      { id: 'elet-4', label: 'Fiação/chicotes', status: 'pending' },
      { id: 'elet-5', label: 'Tomada',           status: 'pending' },
    ],
  },
  {
    label: 'Radiador e Arrefecimento',
    items: [
      { id: 'rad-1', label: 'Fluido radiador',     status: 'pending' },
      { id: 'rad-2', label: 'Mangueira inferior',  status: 'pending' },
      { id: 'rad-3', label: 'Mangueira superior',  status: 'pending' },
      { id: 'rad-4', label: 'Reservatório',       status: 'pending' },
      { id: 'rad-5', label: 'Termostato',          status: 'pending' },
      { id: 'rad-6', label: 'Sensor de temperatura', status: 'pending' },
      { id: 'rad-7', label: 'Selo motor',          status: 'pending' },
      { id: 'rad-8', label: 'Cano de água',       status: 'pending' },
    ],
  },
  {
    label: 'Pneus e Rodas',
    items: [
      { id: 'pneu-1', label: 'Pneu diant. esquerdo', status: 'pending' },
      { id: 'pneu-2', label: 'Pneu diant. direito',  status: 'pending' },
      { id: 'pneu-3', label: 'Pneu tras. esquerdo',  status: 'pending' },
      { id: 'pneu-4', label: 'Pneu tras. direito',   status: 'pending' },
      { id: 'pneu-5', label: 'Pressão pneus',       status: 'pending' },
    ],
  },
  {
    label: 'Sistema de Combustível',
    items: [
      { id: 'comb-1', label: 'Filtro combustível', status: 'pending' },
      { id: 'comb-2', label: 'Injetores',           status: 'pending' },
    ],
  },
  {
    label: 'Injeção Eletrônica',
    items: [
      { id: 'inj-1', label: 'Limpeza TBI',       status: 'pending' },
      { id: 'inj-2', label: 'Limpeza injetores', status: 'pending' },
      { id: 'inj-3', label: 'Sensor O2',         status: 'pending' },
      { id: 'inj-4', label: 'Bobina ignição',   status: 'pending' },
      { id: 'inj-5', label: 'Velas de ignição', status: 'pending' },
      { id: 'inj-6', label: 'Cabo de velas',     status: 'pending' },
    ],
  },
  {
    label: 'Ar Condicionado',
    items: [
      { id: 'ac-1', label: 'Compressor',         status: 'pending' },
      { id: 'ac-2', label: 'Gás/Refrigerante',  status: 'pending' },
      { id: 'ac-3', label: 'Filtro do clima',    status: 'pending' },
      { id: 'ac-4', label: 'Mangueiras',         status: 'pending' },
    ],
  },
  {
    label: 'Escapamento',
    items: [
      { id: 'esc-1', label: 'Silenciador',   status: 'pending' },
      { id: 'esc-2', label: 'Tubo escape',   status: 'pending' },
      { id: 'esc-3', label: 'Catalisador',   status: 'pending' },
      { id: 'esc-4', label: 'Junta coletor', status: 'pending' },
    ],
  },
  {
    label: 'Embreagem',
    items: [
      { id: 'emb-1', label: 'Disco embreagem',   status: 'pending' },
      { id: 'emb-2', label: 'Platô',            status: 'pending' },
      { id: 'emb-3', label: 'Cilindro mestre',   status: 'pending' },
      { id: 'emb-4', label: 'Rolamento',         status: 'pending' },
    ],
  },
  {
    label: 'Iluminação',
    items: [
      { id: 'luz-1', label: 'Farol dianteiro',  status: 'pending' },
      { id: 'luz-2', label: 'Lanterna traseira', status: 'pending' },
      { id: 'luz-3', label: 'Luz interna',       status: 'pending' },
      { id: 'luz-4', label: 'Pisca',             status: 'pending' },
    ],
  },
];

/**
 * Cria um checklist em branco com as 14 categorias padrão.
 * Chamado ao abrir uma OS sem checklist ainda.
 */
export function createEmptyChecklist(mileageIn = 0): ChecklistSchema {
  return {
    mileageIn,
    categories: DEFAULT_CHECKLIST_CATEGORIES.map((cat, i) => ({
      id: `cat-default-${i}`,
      label: cat.label,
      items: cat.items.map(item => ({ ...item })),
    })),
    notes: '',
    inspectedAt: new Date().toISOString(),
  };
}

/**
 * Migra um checklist legado (schema antigo: fuelLevel/tires/notes)
 * para o novo modelo de categorias, sem perder as observações.
 */
export function migrateChecklist(raw: any): ChecklistSchema {
  // Já é o novo formato
  if (raw && Array.isArray(raw.categories)) return raw as ChecklistSchema;

  // Formato legado — preserva notas e cria categorias em branco
  const mileageIn = raw?.mileageIn ?? 0;
  const notes     = raw?.notes     ?? '';
  const base      = createEmptyChecklist(mileageIn);
  return { ...base, notes };
}

// ════════════════════════════════════════════════════════════════
// Tipos existentes (inalterados)
// ════════════════════════════════════════════════════════════════

export interface InstallmentConfig {
  installments: number;
  firstPaymentDate: string;
  totalAmount: number;
  installmentAmount: number;
  lastInstallmentAmount: number;
  groupId: string;
  description: string;
  interval?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  amounts?: number[];
}

export interface CRMStats {
  totalClients: number;
  vipClients: Client[];
  monthlyRevenue: number;
  pendingServices: number;
  averageTicket: number;
  topClients: Array<{
    client: Client;
    totalSpent: number;
    serviceCount: number;
  }>;
}

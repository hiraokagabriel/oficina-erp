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
  paymentDate?: string; // Data efetiva do pagamento
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
  totalCost?: number; // NOVO: custo total interno
  profit?: number; // NOVO: lucro bruto
  profitMargin?: number; // NOVO: margem de lucro em %
  createdAt: string;
  financialId?: string;
  checklist?: ChecklistSchema;
  publicNotes?: string;
  paymentDate?: string; // Data do pagamento
  paymentMethod?: 'SINGLE' | 'INSTALLMENT';
  installmentConfig?: any;
  technician?: string; // 🆕 NOVO: Técnico responsável pela OS
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
}

export interface CatalogItem {
  id: string;
  description: string;
  price: number;
  cost?: number;       // custo de aquisição
  category?: PartCategory; // 🆕 Issue #42: categoria aprendida automaticamente
}

// 🆕 NOVO: Catálogo de Técnicos
export interface Technician {
  id: string;
  name: string;
}

// 🆕 Issue #41: Tipos para categorização de peças
export type PartCategory =
  | 'MOTOR'
  | 'FREIO'
  | 'SUSPENSAO'
  | 'ELETRICA'
  | 'TRANSMISSAO'
  | 'AR_CONDICIONADO'
  | 'CARROCERIA'
  | 'OUTROS';

export interface PartCategoryMeta {
  label: string;
  color: string;
}

export const PART_CATEGORY_META: Record<PartCategory, PartCategoryMeta> = {
  MOTOR:           { label: 'Motor',           color: '#E53935' },
  FREIO:           { label: 'Freio',           color: '#FB8C00' },
  SUSPENSAO:       { label: 'Suspensão',       color: '#FDD835' },
  ELETRICA:        { label: 'Elétrica',        color: '#1E88E5' },
  TRANSMISSAO:     { label: 'Transmissão',     color: '#8E24AA' },
  AR_CONDICIONADO: { label: 'Ar-condicionado', color: '#00ACC1' },
  CARROCERIA:      { label: 'Carroceria',      color: '#43A047' },
  OUTROS:          { label: 'Outros',          color: '#757575' },
};

export interface OrderItem {
  id: string;
  description: string;
  price: number;
  cost?: number;         // custo de aquisição/interno
  category?: PartCategory; // 🆕 Issue #41: categoria da peça (opcional)
}

export interface WorkshopSettings {
  name: string;
  cnpj: string;
  address: string;
  // technician foi REMOVIDO daqui
  exportPath: string;
  googleDriveToken: string;
  googleApiKey?: string;
}

export interface DatabaseSchema {
  ledger: LedgerEntry[];
  workOrders: WorkOrder[];
  clients: Client[];
  catalogParts: CatalogItem[];
  catalogServices: CatalogItem[];
  catalogTechnicians: Technician[]; // 🆕 NOVO
  settings: WorkshopSettings;
}

export interface ChecklistSchema {
  [key: string]: boolean | string | undefined;
}

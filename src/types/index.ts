// src/types/index.ts

export interface LedgerEntry {
  id: string;
  description: string;
  amount: number;
  type: 'CREDIT' | 'DEBIT';
  effectiveDate: string;
  createdAt: string;
  updatedAt?: string;
  groupId?: string;
  history?: { timestamp: string; note: string }[];
  installmentNumber?: number;
  totalInstallments?: number;
  installmentGroupId?: string;
  isPaid?: boolean;
  paidAt?: string;
  dueDate?: string;
  paymentDate?: string; // 🔧 NOVO: Data de pagamento (usada para receitas vindas de OS)
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
  createdAt: string;
  financialId?: string;
  checklist?: ChecklistSchema;
  publicNotes?: string;
  paymentMethod?: 'CASH' | 'CARD' | 'PIX' | 'INSTALLMENT';
  installmentConfig?: InstallmentConfig;
  paymentDate?: string; // 🆕 Data de pagamento (preenchida ao finalizar)
}

// ✅ FIX: Adicionar lastInstallmentAmount para arredondamento correto
export interface InstallmentConfig {
  totalAmount: number;
  installments: number;
  installmentAmount: number; // Valor das parcelas normais
  lastInstallmentAmount?: number; // ✅ Última parcela ajustada
  firstPaymentDate: string;
  groupId: string;
  description: string;
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
  lastServiceDate?: string;
  serviceCount?: number;
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
}

export interface WorkshopSettings {
  name: string;
  cnpj: string;
  address: string;
  technician: string;
  exportPath: string;
  googleDriveToken: string;
}

export interface DatabaseSchema {
  ledger: LedgerEntry[];
  workOrders: WorkOrder[];
  clients: Client[];
  catalogParts: CatalogItem[];
  catalogServices: CatalogItem[];
  settings: WorkshopSettings;
}

export interface ChecklistSchema {
  fuelLevel: number;
  tires: {
    fl: boolean;
    fr: boolean;
    bl: boolean;
    br: boolean;
  };
  notes: string;
  [key: string]: boolean | string | number | object | undefined;
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
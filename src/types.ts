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
  history?: Array<{ date: string; action: string; user?: string }>; // ✅ ADICIONADO
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
  installmentConfig?: InstallmentConfig; // ✅ TIPADO
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
  googleApiKey: string; // ✅ ADICIONADO
}

export interface DatabaseSchema {
  ledger: LedgerEntry[];
  workOrders: WorkOrder[];
  clients: Client[];
  catalogParts: CatalogItem[];
  catalogServices: CatalogItem[];
  settings: WorkshopSettings;
}

// ✅ Checklist com tipos específicos
export interface ChecklistSchema {
  fuelLevel: number;
  tires: {
    fl: boolean;
    fr: boolean;
    bl: boolean;
    br: boolean;
  };
  notes: string;
  [key: string]: any; // Permite campos customizados
}

// ✅ ADICIONADO: InstallmentConfig
export interface InstallmentConfig {
  installments: number;
  firstDueDate: string;
  interval: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  amounts?: number[]; // Valores customizados por parcela
}

// ✅ ADICIONADO: CRMStats
export interface CRMStats {
  totalClients: number;
  activeClients: number;
  totalRevenue: number;
  averageTicket: number;
  topClients: Array<{
    name: string;
    totalSpent: number;
    serviceCount: number;
  }>;
  revenueByMonth: Array<{
    month: string;
    revenue: number;
  }>;
}
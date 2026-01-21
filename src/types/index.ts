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
  // ✅ NOVO: Campos para pagamento parcelado
  installmentNumber?: number; // Número da parcela (1, 2, 3...)
  totalInstallments?: number; // Total de parcelas (2, 3, 6, 12)
  installmentGroupId?: string; // ID do grupo de parcelas
  isPaid?: boolean; // Se a parcela foi paga
  paidAt?: string; // Data do pagamento
  dueDate?: string; // Data de vencimento
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
  // ✅ NOVO: Campos para controle de pagamento
  paymentMethod?: 'CASH' | 'CARD' | 'PIX' | 'INSTALLMENT';
  installmentConfig?: InstallmentConfig;
}

// ✅ NOVO: Configuração de parcelamento
export interface InstallmentConfig {
  totalAmount: number;
  installments: number; // 2-12x
  installmentAmount: number; // Valor de cada parcela
  firstPaymentDate: string; // Data do primeiro pagamento
  groupId: string; // ID para agrupar parcelas
  description: string; // Descrição (ex: "OS #123 - Cliente X")
}

export type OSStatus = 'ORCAMENTO' | 'APROVADO' | 'EM_SERVICO' | 'FINALIZADO' | 'ARQUIVADO';

export const STATUS_LABELS: Record<OSStatus, string> = {
  ORCAMENTO: 'Orçamento',
  APROVADO: 'Aprovado',
  EM_SERVICO: 'Em Serviço',
  FINALIZADO: 'Finalizado',
  ARQUIVADO: 'Arquivado'
};

// --- ADICIONADO: A constante que faltava para o ExportModal ---
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
  // ✅ NOVO: Campos para CRM
  totalSpent?: number; // Total gasto pelo cliente
  lastServiceDate?: string; // Último serviço realizado
  serviceCount?: number; // Quantidade de serviços
  averageTicket?: number; // Ticket médio
  vipStatus?: boolean; // Cliente VIP
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

// ✅ NOVO: Interface para estatísticas do CRM
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
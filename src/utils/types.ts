// Extraindo tipos para serem usados em toda a app
export type OSStatus = 'ORCAMENTO' | 'APROVADO' | 'EM_SERVICO' | 'FINALIZADO';

export interface LedgerEntry {
  id: string;
  description: string;
  amount: number;
  type: 'CREDIT' | 'DEBIT';
  effectiveDate: string;
  history: { timestamp: string; note: string }[];
}

export interface OrderItem { id: string; description: string; price: number; }

export interface WorkOrder {
  id: string;
  osNumber: number;
  clientName: string;
  clientPhone: string;
  vehicle: string;
  mileage: number;
  status: OSStatus;
  parts: OrderItem[];
  services: OrderItem[];
  total: number;
  createdAt: string;
  financialId?: string;
  // Checklist omitido por brevidade, pode adicionar se necessário
}
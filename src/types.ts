// Tipos de Status da Ordem de Serviço
// ADICIONE 'ARQUIVADO' AQUI PARA CORRIGIR OS ERROS
export type OSStatus = 'ORCAMENTO' | 'APROVADO' | 'EM_SERVICO' | 'FINALIZADO' | 'ARQUIVADO';

// Labels para exibição (Mapeamento)
export const STATUS_LABELS: Record<OSStatus, string> = {
  ORCAMENTO: 'Orçamento',
  APROVADO: 'Aprovado',
  EM_SERVICO: 'Em Serviço',
  FINALIZADO: 'Finalizado',
  ARQUIVADO: 'Arquivado'
};

// Item de Pedido (Peça ou Serviço dentro da OS)
export interface OrderItem {
  id: string;
  description: string;
  price: number;
}

// Item de Catálogo (Para autocompletar)
export interface CatalogItem {
  id: string;
  description: string;
  price: number;
}

// Estrutura do Checklist (Flexível)
export interface ChecklistSchema {
  [key: string]: boolean | string | undefined;
}

// Ordem de Serviço Principal
export interface WorkOrder {
  id: string;
  osNumber: number;
  
  // Dados do Cliente
  clientName: string;
  clientPhone: string;
  clientNotes?: string;
  
  // Dados do Veículo
  vehicle: string;        // Nome completo ex: "Fiat Uno - Prata"
  vehicleModelOnly?: string; // Apenas modelo ex: "Fiat Uno"
  plate?: string;
  mileage: number;
  
  // Controle
  status: OSStatus;
  createdAt: string;      // ISO Date String
  total: number;
  
  // Itens
  parts: OrderItem[];
  services: OrderItem[];
  
  // Integrações
  financialId?: string;   // ID do lançamento no financeiro (se houver)
  checklist?: ChecklistSchema;
}

// Lançamento Financeiro
export interface LedgerEntry {
  id: string;
  description: string;
  amount: number;         // Valor em centavos ou float
  type: 'CREDIT' | 'DEBIT';
  effectiveDate: string;  // ISO Date YYYY-MM-DD
}

// Cliente (CRM)
export interface Client {
  id: string;
  name: string;
  phone: string;
  notes?: string;
  vehicles: { model: string; plate: string }[];
}

// Configurações da Oficina
export interface WorkshopSettings {
  name: string;
  cnpj: string;
  address: string;
  technician: string;
  exportPath: string;
  googleDriveToken: string;
}

// Estrutura do Banco de Dados (JSON)
export interface DatabaseSchema {
  ledger: LedgerEntry[];
  workOrders: WorkOrder[];
  clients: Client[];
  catalogParts: CatalogItem[];
  catalogServices: CatalogItem[];
  settings: WorkshopSettings;
}
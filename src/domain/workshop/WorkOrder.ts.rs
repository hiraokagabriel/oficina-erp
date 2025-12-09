import { Cents, Money } from '../shared/Money';

export type OSStatus = 'ORCAMENTO' | 'APROVADO' | 'EM_SERVICO' | 'FINALIZADO';

export interface WorkOrder {
  readonly id: string;
  readonly vehicle: string;      // Modelo/Placa
  readonly clientName: string;
  readonly description: string;
  readonly status: OSStatus;
  readonly total: Cents;
  readonly createdAt: string;
}

// === FUNÇÕES PURAS ===

export const createWorkOrder = (
  vehicle: string,
  clientName: string,
  description: string,
  amountFloat: number
): WorkOrder => ({
  id: crypto.randomUUID(),
  vehicle,
  clientName,
  description,
  status: 'ORCAMENTO',
  total: Money.fromFloat(amountFloat),
  createdAt: new Date().toISOString()
});

// Máquina de Estados: Define qual o próximo passo de cada status
export const advanceStatus = (os: WorkOrder): WorkOrder => {
  const flow: Record<OSStatus, OSStatus> = {
    'ORCAMENTO': 'APROVADO',
    'APROVADO': 'EM_SERVICO',
    'EM_SERVICO': 'FINALIZADO',
    'FINALIZADO': 'FINALIZADO'
  };

  return { ...os, status: flow[os.status] };
};

// Labels amigáveis para a UI
export const STATUS_LABELS: Record<OSStatus, string> = {
  'ORCAMENTO': '📝 Orçamento',
  'APROVADO': '✅ Aprovado',
  'EM_SERVICO': '🔧 Em Serviço',
  'FINALIZADO': '🏁 Finalizado'
};
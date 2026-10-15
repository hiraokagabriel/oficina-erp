import { InstallmentConfig, LedgerEntry, OSStatus, WorkOrder } from '../types';
import { generateId } from '../utils/helpers';

// Regras financeiras da OS extraídas do App.tsx como funções puras (extração literal).
// O App mantém setState, toasts, sons e modais; aqui só o cálculo.

export interface Injectables {
  now?: string;
  newId?: () => string;
}

// Aplica o parcelamento na OS (usado sobre o estado atual da OS).
export const applyInstallmentToOS = (
  os: WorkOrder,
  config: InstallmentConfig,
  firstEntryId: string
): WorkOrder => ({
  ...os,
  status: 'AGUARDANDO_PAGAMENTO' as OSStatus,
  financialId: firstEntryId,
  paymentMethod: 'INSTALLMENT',
  installmentConfig: config,
  paymentDate: undefined,
});

// Gera as parcelas (CREDIT, não pagas) a partir da configuração do modal.
export const buildInstallmentEntries = (
  config: InstallmentConfig,
  { now = new Date().toISOString(), newId = () => crypto.randomUUID() }: Injectables = {}
): LedgerEntry[] => {
  const newEntries: LedgerEntry[] = [];
  const baseDate = new Date(config.firstPaymentDate);
  const groupId = config.groupId;

  for (let i = 0; i < config.installments; i++) {
    const dueDate = new Date(baseDate);
    dueDate.setMonth(dueDate.getMonth() + i);

    const isLastInstallment = i === config.installments - 1;
    const amount = isLastInstallment ? config.lastInstallmentAmount : config.installmentAmount;

    newEntries.push({
      id: newId(),
      description: `${config.description} - Parcela ${i + 1}/${config.installments}`,
      amount: amount,
      type: 'CREDIT',
      effectiveDate: dueDate.toISOString(),
      createdAt: now,
      groupId: groupId,
      installmentNumber: i + 1,
      totalInstallments: config.installments,
      installmentGroupId: groupId,
      isPaid: false,
      dueDate: dueDate.toISOString(),
    });
  }

  return newEntries;
};

// Reabre a OS (EM_SERVICO) limpando os dados financeiros.
export const reopenOS = (os: WorkOrder): WorkOrder => ({
  ...os,
  status: 'EM_SERVICO' as OSStatus,
  financialId: undefined,
  paymentMethod: undefined,
  installmentConfig: undefined,
  paymentDate: undefined,
});

// Remove o grupo de parcelas (ou o lançamento único) da OS e a reabre.
export const restoreFinancial = (
  ledger: LedgerEntry[],
  os: WorkOrder
): { ledger: LedgerEntry[]; os: WorkOrder; removedCount: number; removedGroup: boolean } => {
  let newLedger = ledger;
  let removedCount = 0;
  let removedGroup = false;

  const financialEntry = ledger.find(e => e.id === os.financialId);

  if (financialEntry) {
    const groupToDelete = financialEntry.groupId || financialEntry.installmentGroupId;

    if (groupToDelete) {
      removedCount = ledger.filter(e =>
        e.groupId === groupToDelete || e.installmentGroupId === groupToDelete
      ).length;
      removedGroup = true;
      newLedger = ledger.filter(e =>
        e.groupId !== groupToDelete && e.installmentGroupId !== groupToDelete
      );
    } else {
      removedCount = 1;
      newLedger = ledger.filter(e => e.id !== os.financialId);
    }
  }

  return { ledger: newLedger, os: reopenOS(os), removedCount, removedGroup };
};

// Alterna pago/pendente de um CREDIT e sincroniza o paymentDate da OS ligada por financialId.
export const togglePayment = (
  ledger: LedgerEntry[],
  workOrders: WorkOrder[],
  entryId: string,
  now: string = new Date().toISOString()
): { ledger: LedgerEntry[]; workOrders: WorkOrder[]; paid: boolean } | null => {
  const entry = ledger.find(e => e.id === entryId);
  if (!entry || entry.type !== 'CREDIT') return null;

  const newPaymentDate = entry.paymentDate ? undefined : now;

  const newLedger = ledger.map(e =>
    e.id === entryId
      ? { ...e, paymentDate: newPaymentDate }
      : e
  );

  let newWorkOrders = workOrders;
  const linkedOS = workOrders.find(os => os.financialId === entryId);
  if (linkedOS) {
    newWorkOrders = workOrders.map(os =>
      os.id === linkedOS.id
        ? { ...os, paymentDate: newPaymentDate }
        : os
    );
  }

  return { ledger: newLedger, workOrders: newWorkOrders, paid: !!newPaymentDate };
};

export type StatusChangeEffect =
  | { kind: 'noop' }
  | { kind: 'ask-finish' }
  | { kind: 'ask-restore' }
  | { kind: 'update'; updates: Partial<WorkOrder> };

// Decide o que fazer ao mover a OS de status (handleUpdateStatus).
export const statusChangeEffects = (
  os: WorkOrder,
  newStatus: OSStatus,
  now: string = new Date().toISOString()
): StatusChangeEffect => {
  if (os.status === newStatus) return { kind: 'noop' };

  const isBecomingFinalized = newStatus === 'FINALIZADO' && os.status !== 'FINALIZADO';
  const isLeavingFinalized = os.status === 'FINALIZADO' && newStatus !== 'FINALIZADO';

  if (isBecomingFinalized && !os.financialId) {
    return { kind: 'ask-finish' };
  } else if (isLeavingFinalized && os.financialId) {
    return { kind: 'ask-restore' };
  }

  const updates: Partial<WorkOrder> = { status: newStatus };

  if (isBecomingFinalized) {
    updates.paymentDate = now;
  }

  if (isLeavingFinalized) {
    updates.paymentDate = undefined;
  }

  return { kind: 'update', updates };
};

// Marca a OS como FINALIZADO ligada ao lançamento à vista.
export const markOSFinalized = (os: WorkOrder, entryId: string, paymentDate: string): WorkOrder => ({
  ...os,
  status: 'FINALIZADO' as OSStatus,
  financialId: entryId,
  paymentDate: paymentDate,
});

// Finalização à vista: receita com competência = createdAt da OS, já paga em `now`.
// Equivale a createEntry(desc, total, 'CREDIT', os.createdAt, undefined, now).
export const finalizeOSSingle = (
  os: WorkOrder,
  { now = new Date().toISOString(), newId = generateId }: Injectables = {}
): { entry: LedgerEntry; os: WorkOrder } => {
  const paymentDate = now;
  const entry: LedgerEntry = {
    id: newId(),
    description: `Receita OS #${os.osNumber} - ${os.clientName}`,
    amount: os.total,
    type: 'CREDIT',
    effectiveDate: new Date(os.createdAt).toISOString(),
    createdAt: now,
    groupId: undefined,
    paymentDate: new Date(paymentDate).toISOString(),
  };
  return { entry, os: markOSFinalized(os, entry.id, paymentDate) };
};

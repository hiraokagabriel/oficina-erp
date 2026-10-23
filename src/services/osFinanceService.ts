import { InstallmentConfig, LedgerEntry, OSStatus, WorkOrder } from '../types';
import { generateId } from '../utils/helpers';
import { addMonths, formatDateOnly, parseDateFlexible, parseDateOnly } from '../utils/dates';

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
  // Nada a parcelar (restante 0 ou negativo, ou nenhuma parcela): não cria lançamento zerado.
  if (config.totalAmount <= 0 || config.installments <= 0) return newEntries;
  const baseDate = parseDateFlexible(config.firstPaymentDate);
  const groupId = config.groupId;

  for (let i = 0; i < config.installments; i++) {
    const dueDate = addMonths(baseDate, i);

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

export interface TogglePaymentResult {
  ledger: LedgerEntry[];
  workOrders: WorkOrder[];
  paid: boolean;
  /** Preenchido quando o pagamento de parcelas finalizou ou reabriu a OS (para o toast). */
  osEffect?: { osNumber: number; kind: 'finalized' | 'reopened' };
}

// Alterna pago/pendente de um CREDIT e mantém a OS ligada coerente.
// À vista (ligada por financialId): o paymentDate da OS acompanha o lançamento.
// Parcelada (installmentConfig.groupId == installmentGroupId): o estado da OS é derivado de TODAS as parcelas.
export const togglePayment = (
  ledger: LedgerEntry[],
  workOrders: WorkOrder[],
  entryId: string,
  now: string = new Date().toISOString()
): TogglePaymentResult | null => {
  const entry = ledger.find(e => e.id === entryId);
  if (!entry || entry.type !== 'CREDIT') return null;

  const newPaymentDate = entry.paymentDate ? undefined : now;

  const newLedger = ledger.map(e =>
    e.id === entryId
      ? { ...e, paymentDate: newPaymentDate }
      : e
  );

  let newWorkOrders = workOrders;
  let osEffect: TogglePaymentResult['osEffect'];

  const installmentOS = entry.installmentGroupId
    ? workOrders.find(o =>
        o.paymentMethod === 'INSTALLMENT' && o.installmentConfig?.groupId === entry.installmentGroupId)
    : undefined;

  if (installmentOS) {
    const group = newLedger.filter(e =>
      e.type === 'CREDIT' && e.installmentGroupId === entry.installmentGroupId);
    const allPaid = group.length > 0 && group.every(e => !!e.paymentDate);
    let changed: Partial<WorkOrder> | null = null;

    if (allPaid) {
      const latest = group
        .map(e => e.paymentDate as string)
        .reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a));
      // OS arquivada só recebe o paymentDate: o status não sai do arquivo.
      changed = installmentOS.status === 'ARQUIVADO'
        ? { paymentDate: latest }
        : { status: 'FINALIZADO' as OSStatus, paymentDate: latest };
      if (installmentOS.status !== 'FINALIZADO' && installmentOS.status !== 'ARQUIVADO') {
        osEffect = { osNumber: installmentOS.osNumber, kind: 'finalized' };
      }
    } else if (installmentOS.status === 'FINALIZADO') {
      changed = { status: 'AGUARDANDO_PAGAMENTO' as OSStatus, paymentDate: undefined };
      osEffect = { osNumber: installmentOS.osNumber, kind: 'reopened' };
    }

    if (changed) {
      newWorkOrders = workOrders.map(o => o.id === installmentOS.id ? { ...o, ...changed } : o);
    }
  } else {
    const linkedOS = workOrders.find(os => os.financialId === entryId);
    if (linkedOS) {
      newWorkOrders = workOrders.map(os =>
        os.id === linkedOS.id
          ? { ...os, paymentDate: newPaymentDate }
          : os
      );
    }
  }

  return { ledger: newLedger, workOrders: newWorkOrders, paid: !!newPaymentDate, osEffect };
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

  // D7: arquivar uma OS finalizada só muda o status (receitas, financialId e paymentDate ficam).
  if (isLeavingFinalized && newStatus === 'ARQUIVADO' && os.financialId) {
    return { kind: 'update', updates: { status: newStatus } };
  }

  if (isBecomingFinalized && !os.financialId) {
    return { kind: 'ask-finish' };
  } else if (isLeavingFinalized && os.financialId) {
    return { kind: 'ask-restore' };
  }

  const updates: Partial<WorkOrder> = { status: newStatus };

  if (isBecomingFinalized) {
    // Desarquivar uma OS que já tem financialId e paymentDate não sobrescreve o paymentDate.
    updates.paymentDate = os.financialId && os.paymentDate ? os.paymentDate : now;
  }

  if (isLeavingFinalized) {
    updates.paymentDate = undefined;
  }

  return { kind: 'update', updates };
};

// Marca a OS como FINALIZADO ligada ao lançamento à vista.
// `entryId` ausente = restante 0 (adiantamentos cobriram o total): a OS fecha sem lançamento.
export const markOSFinalized = (os: WorkOrder, entryId: string | undefined, paymentDate: string): WorkOrder => ({
  ...os,
  status: 'FINALIZADO' as OSStatus,
  financialId: entryId,
  paymentDate: paymentDate,
});

// Finalização à vista: receita com competência = createdAt da OS, já paga em `now`.
// Equivale a createEntry(desc, total, 'CREDIT', os.createdAt, undefined, now).
// CORRIGIDO (adiantamentos v4): restante 0 NÃO cria lançamento de R$ 0,00 (`entry` fica undefined; a OS fecha sem financialId).
export const finalizeOSSingle = (
  os: WorkOrder,
  { now = new Date().toISOString(), newId = generateId }: Injectables = {}
): { entry: LedgerEntry | undefined; os: WorkOrder } => {
  const paymentDate = now;
  const amount = getRemainingAmount(os);
  if (amount <= 0) return { entry: undefined, os: markOSFinalized(os, undefined, paymentDate) };
  const entry: LedgerEntry = {
    id: newId(),
    description: `Receita OS #${os.osNumber} - ${os.clientName}`,
    amount,
    type: 'CREDIT',
    effectiveDate: new Date(os.createdAt).toISOString(),
    createdAt: now,
    groupId: undefined,
    paymentDate: new Date(paymentDate).toISOString(),
  };
  return { entry, os: markOSFinalized(os, entry.id, paymentDate) };
};

// Soma dos adiantamentos da OS (schema v4). OS legada sem `advances`: 0 (use getRemainingAmount para a regra antiga).
export const sumAdvances = (os: Pick<WorkOrder, 'advances'>): number =>
  (os.advances ?? []).reduce((acc, a) => acc + a.amount, 0);

// Valor ainda a receber da OS. Com `advances` (v4): max(total - soma, 0).
// OS legada sem `advances`: total - adiantamento só quando o adiantamento está no caixa (advanceEntryId);
// advanceAmount sem advanceEntryId usa o total cheio (D3).
export const getRemainingAmount = (os: WorkOrder): number => {
  if (os.advances) return Math.max(os.total - sumAdvances(os), 0);
  return os.advanceEntryId ? Math.max(os.total - (os.advanceAmount || 0), 0) : os.total;
};

// Receita à vista de OS finalizada editada: o lançamento (financialId) passa a valer o RESTANTE
// (total - adiantamentos), não o total (defeito: o adiantamento já está no caixa). Competência = createdAt da OS.
// Lançamento de OS parcelada (paymentMethod 'INSTALLMENT' ou com grupo de parcelas) NUNCA é tocado.
export const refreshFinishedReceipt = (os: WorkOrder, ledger: LedgerEntry[]): LedgerEntry[] => {
  if (!os.financialId || os.paymentMethod === 'INSTALLMENT') return ledger;
  return ledger.map(e => {
    if (e.id !== os.financialId || e.installmentGroupId) return e;
    return {
      ...e,
      effectiveDate: os.createdAt,
      amount: getRemainingAmount(os),
      description: `Receita OS #${os.osNumber} - ${os.clientName}`,
    };
  });
};

// D3: OS FINALIZADO, ARQUIVADO com financeiro ou com financialId não sincroniza o adiantamento.
export const isAdvanceSyncLocked = (os: WorkOrder): boolean =>
  os.status === 'FINALIZADO' || (os.status === 'ARQUIVADO' && !!os.financialId) || !!os.financialId;

// Mantém o lançamento de adiantamento (CREDIT já recebido) da OS no caixa.
// @deprecated Schema v4: use syncAdvances (services/advances.ts). Vale só para OS ainda SEM `advances` que a UI antiga alimenta.
// D3: OS FINALIZADO, ARQUIVADO com financeiro ou com financialId não sincroniza (ledger intacto).
export const syncAdvanceEntry = ({ os, advanceAmount, ledger, now = new Date().toISOString(), newId = generateId }: {
  os: WorkOrder;
  advanceAmount?: number;
  ledger: LedgerEntry[];
  now?: string;
  newId?: () => string;
}): { ledger: LedgerEntry[]; advanceEntryId?: string } => {
  if (isAdvanceSyncLocked(os)) return { ledger, advanceEntryId: os.advanceEntryId };

  const description = `Adiantamento OS #${os.osNumber} - ${os.clientName}`;
  const existing = os.advanceEntryId ? ledger.find(e => e.id === os.advanceEntryId) : undefined;

  if (!advanceAmount || advanceAmount <= 0) {
    if (!os.advanceEntryId) return { ledger, advanceEntryId: undefined };
    return { ledger: ledger.filter(e => e.id !== os.advanceEntryId), advanceEntryId: undefined };
  }

  if (existing) {
    return {
      ledger: ledger.map(e => e.id === existing.id ? { ...e, amount: advanceAmount, description } : e),
      advanceEntryId: existing.id,
    };
  }

  const entry: LedgerEntry = {
    id: newId(),
    description,
    amount: advanceAmount,
    type: 'CREDIT',
    effectiveDate: parseDateOnly(formatDateOnly(new Date(now))).toISOString(),
    createdAt: now,
    paymentDate: now,
  };
  return { ledger: [entry, ...ledger], advanceEntryId: entry.id };
};

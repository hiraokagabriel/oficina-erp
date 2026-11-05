import { InstallmentConfig, LedgerEntry, OSStatus, WorkOrder } from '../types';
import { generateId } from '../utils/helpers';
import { addMonths, formatDateOnly, parseDateFlexible, parseDateOnly } from '../utils/dates';
import { getRemainingAmount, sumAdvances } from './osRemaining';
import { BACKWARD_FROM_PAYMENT, getOSReceipt, planReceiveOS, planReopenOS } from './osFinanceGuards';

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

// Reabre a OS (padrão EM_SERVICO; ou o status para onde o usuário arrastou) limpando os dados financeiros.
export const reopenOS = (os: WorkOrder, target: OSStatus = 'EM_SERVICO'): WorkOrder => ({
  ...os,
  status: target,
  financialId: undefined,
  paymentMethod: undefined,
  installmentConfig: undefined,
  paymentDate: undefined,
});

// Remove o grupo de parcelas (ou o lançamento único) da OS e a reabre (em `target`, padrão EM_SERVICO).
// Quem decide se pode (parcela já recebida bloqueia) é planReopenOS; aqui só se aplica.
export const restoreFinancial = (
  ledger: LedgerEntry[],
  os: WorkOrder,
  target: OSStatus = 'EM_SERVICO'
): { ledger: LedgerEntry[]; os: WorkOrder; removedCount: number; removedGroup: boolean } => {
  const { entries, grouped } = getOSReceipt(os, ledger);
  if (entries.length === 0) return { ledger, os: reopenOS(os, target), removedCount: 0, removedGroup: false };
  const ids = new Set(entries.map(e => e.id));
  return {
    ledger: ledger.filter(e => !ids.has(e.id)),
    os: reopenOS(os, target),
    removedCount: entries.length,
    removedGroup: grouped,
  };
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
  /** Pede confirmação para desfazer a receita/parcelas; `message` diz o que será apagado, `target` é o novo status. */
  | { kind: 'ask-restore'; target: OSStatus; message: string }
  /** Recusado (parcela aberta ao receber; parcela já recebida ao reabrir): mostrar `message` e não mudar nada. */
  | { kind: 'blocked'; message: string }
  /** `settleEntry`: receita à vista ligada ainda em aberto que deve ser marcada como recebida na mesma data (settleOpenReceipt). */
  | { kind: 'update'; updates: Partial<WorkOrder>; settleEntry?: { entryId: string; paymentDate: string } };

// Decide o que fazer ao mover a OS de status (handleUpdateStatus).
export const statusChangeEffects = (
  os: WorkOrder,
  newStatus: OSStatus,
  now: string = new Date().toISOString(),
  ledger: LedgerEntry[] = []
): StatusChangeEffect => {
  if (os.status === newStatus) return { kind: 'noop' };

  const isBecomingFinalized = newStatus === 'FINALIZADO' && os.status !== 'FINALIZADO';
  const isLeavingFinalized = os.status === 'FINALIZADO' && newStatus !== 'FINALIZADO';
  // Receita ligada: à vista (financialId) ou parcelada (installmentConfig, mesmo sem financialId).
  const hasReceipt = !!os.financialId || !!os.installmentConfig;

  // Restaurar do arquivo para qualquer status que não seja Finalizado reabre a OS: mesma trava e mesmo aviso.
  if (os.status === 'ARQUIVADO' && newStatus !== 'FINALIZADO' && hasReceipt) {
    const plan = planReopenOS(os, ledger, newStatus);
    return plan.ok
      ? { kind: 'ask-restore', target: newStatus, message: plan.message }
      : { kind: 'blocked', message: plan.message };
  }

  // D7: arquivar uma OS finalizada só muda o status (receitas, financialId e paymentDate ficam).
  if (isLeavingFinalized && newStatus === 'ARQUIVADO' && hasReceipt) {
    return { kind: 'update', updates: { status: newStatus } };
  }

  // "Receber" numa OS parcelada com parcelas abertas não finaliza nem marca parcelas.
  if (isBecomingFinalized && hasReceipt) {
    const receive = planReceiveOS(os, ledger);
    if (!receive.ok) return { kind: 'blocked', message: receive.message };
  }

  // Voltar de Aguardando Pagamento para antes do serviço desfaz o parcelamento (sem parcela recebida).
  const isGoingBackFromPayment = os.status === 'AGUARDANDO_PAGAMENTO' && BACKWARD_FROM_PAYMENT.includes(newStatus)
    && (!!os.financialId || !!os.installmentConfig);

  if (isBecomingFinalized && !hasReceipt) {
    return { kind: 'ask-finish' };
  } else if ((isLeavingFinalized && hasReceipt) || isGoingBackFromPayment) {
    const plan = planReopenOS(os, ledger, newStatus);
    return plan.ok
      ? { kind: 'ask-restore', target: newStatus, message: plan.message }
      : { kind: 'blocked', message: plan.message };
  }

  const updates: Partial<WorkOrder> = { status: newStatus };
  let settleEntry: { entryId: string; paymentDate: string } | undefined;

  if (isBecomingFinalized) {
    // Desarquivar uma OS que já tem financialId e paymentDate não sobrescreve o paymentDate.
    updates.paymentDate = hasReceipt && os.paymentDate ? os.paymentDate : now;
    // OS à vista que volta a Finalizado com a receita ainda em aberto: o lançamento é marcado como recebido na
    // MESMA data do paymentDate da OS (senão a OS fica paga e o caixa continua em "A receber").
    if (os.financialId && !os.installmentConfig && os.paymentMethod !== 'INSTALLMENT') {
      const entry = ledger.find(e => e.id === os.financialId);
      if (entry && entry.type === 'CREDIT' && !entry.paymentDate) {
        settleEntry = { entryId: entry.id, paymentDate: updates.paymentDate };
      }
    }
  }

  if (isLeavingFinalized) {
    updates.paymentDate = undefined;
  }

  return settleEntry ? { kind: 'update', updates, settleEntry } : { kind: 'update', updates };
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

// sumAdvances e getRemainingAmount vivem em osRemaining.ts (módulo-folha, sem ciclo com osFinanceGuards); reexportados aqui.
export { sumAdvances, getRemainingAmount };

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

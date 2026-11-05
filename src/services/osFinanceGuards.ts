import { LedgerEntry, OSStatus, STATUS_LABELS, WorkOrder } from '../types';
import { Money } from '../utils/helpers';
import { getRemainingAmount } from './osRemaining';

// Travas e avisos financeiros da OS (lote A). Funções puras: sem estado, sem relógio.
// O App só chama estas funções, mostra a mensagem e aplica o resultado.

/** Lançamentos de receita ligados à OS (à vista, ou o grupo inteiro de parcelas). Não inclui adiantamentos. */
export interface OSReceipt {
  entries: LedgerEntry[];
  /** true quando a receita é um grupo de parcelas (parcelamento). */
  grouped: boolean;
}

export const getOSReceipt = (os: WorkOrder, ledger: LedgerEntry[]): OSReceipt => {
  const fin = os.financialId ? ledger.find(e => e.id === os.financialId) : undefined;
  const group = fin?.groupId || fin?.installmentGroupId || os.installmentConfig?.groupId;
  if (group) {
    const entries = ledger.filter(e => e.groupId === group || e.installmentGroupId === group);
    return { entries, grouped: entries.length > 0 };
  }
  return { entries: fin ? [fin] : [], grouped: false };
};

export interface ReceiptTotals {
  paidCount: number;
  paidAmount: number;
  openCount: number;
  openAmount: number;
}

export const totalsOfReceipt = (entries: LedgerEntry[]): ReceiptTotals => {
  const t: ReceiptTotals = { paidCount: 0, paidAmount: 0, openCount: 0, openAmount: 0 };
  for (const e of entries) {
    if (e.type !== 'CREDIT') continue;
    if (e.paymentDate) { t.paidCount++; t.paidAmount += e.amount; }
    else { t.openCount++; t.openAmount += e.amount; }
  }
  return t;
};

const isInstallmentOS = (os: WorkOrder): boolean =>
  os.paymentMethod === 'INSTALLMENT' || !!os.installmentConfig;

export const parcelas = (n: number): string => `${n} ${n === 1 ? 'parcela' : 'parcelas'}`;

export type GuardResult = { ok: true; message: string } | { ok: false; message: string };

/** "Receber" (virar FINALIZADO) numa OS parcelada com parcelas abertas é bloqueado. */
export const planReceiveOS = (os: WorkOrder, ledger: LedgerEntry[]): GuardResult => {
  if (!isInstallmentOS(os)) return { ok: true, message: '' };
  const t = totalsOfReceipt(getOSReceipt(os, ledger).entries);
  if (t.openCount === 0) return { ok: true, message: '' };
  return {
    ok: false,
    message: `A OS #${os.osNumber} é parcelada e ainda tem ${parcelas(t.openCount)} em aberto (${Money.format(t.openAmount)}). `
      + 'Receba cada parcela em Financeiro > A receber: a OS é finalizada sozinha quando a última for paga.',
  };
};

/**
 * Reabrir uma OS (sair de FINALIZADO ou voltar de Aguardando Pagamento para antes) desfaz a receita ligada.
 * Bloqueado se houver parcela já recebida; senão `message` diz o que será apagado.
 */
export const planReopenOS = (os: WorkOrder, ledger: LedgerEntry[], target: OSStatus): GuardResult => {
  const { entries, grouped } = getOSReceipt(os, ledger);
  const t = totalsOfReceipt(entries);
  const destino = STATUS_LABELS[target];
  if (grouped && t.paidCount > 0) {
    return {
      ok: false,
      message: `Não dá para reabrir a OS #${os.osNumber}: ${parcelas(t.paidCount)} já ${t.paidCount === 1 ? 'recebida' : 'recebidas'}, `
        + `somando ${Money.format(t.paidAmount)}. Desmarque o pagamento dessas parcelas em Financeiro > A receber `
        + '(a OS volta para Aguardando Pagamento) e tente de novo.',
    };
  }
  if (entries.length === 0) {
    return { ok: true, message: `A OS volta para ${destino}. Nenhum lançamento do caixa será apagado.` };
  }
  if (grouped) {
    return {
      ok: true,
      message: `Vai desfazer o parcelamento: apaga ${parcelas(t.openCount)} em aberto (${Money.format(t.openAmount)}) do caixa. `
        + `A OS volta para ${destino}.`,
    };
  }
  const e = entries[0];
  return {
    ok: true,
    message: `Vai apagar do caixa a receita de ${Money.format(e.amount)}${e.paymentDate ? ' (já recebida)' : ''}. `
      + `A OS volta para ${destino}.`,
  };
};

/** Lançamentos da receita removidos ao excluir a OS (os adiantamentos saem por removeAllAdvances). */
export const removeOSReceipt = (os: WorkOrder, ledger: LedgerEntry[]): LedgerEntry[] => {
  const ids = new Set(getOSReceipt(os, ledger).entries.map(e => e.id));
  if (ids.size === 0) return ledger;
  return ledger.filter(e => !ids.has(e.id));
};

/**
 * Excluir a OS: bloqueado se alguma parcela já foi recebida (o dinheiro entrou; exclua depois de desmarcar).
 * Receita à vista já recebida e adiantamentos só pedem confirmação, com o valor na mensagem.
 */
export const planDeleteOS = (os: WorkOrder, ledger: LedgerEntry[]): GuardResult => {
  const { entries, grouped } = getOSReceipt(os, ledger);
  const t = totalsOfReceipt(entries);
  if (grouped && t.paidCount > 0) {
    return {
      ok: false,
      message: `Não dá para excluir a OS #${os.osNumber}: ${parcelas(t.paidCount)} já ${t.paidCount === 1 ? 'recebida' : 'recebidas'}, `
        + `somando ${Money.format(t.paidAmount)}. Desmarque o pagamento dessas parcelas em Financeiro > A receber e tente de novo.`,
    };
  }
  const lines = [`Vai excluir a OS #${os.osNumber}.`];
  if (grouped) {
    lines.push(`Apaga também ${parcelas(t.openCount)} em aberto (${Money.format(t.openAmount)}) do caixa.`);
  } else if (entries.length > 0) {
    const e = entries[0];
    lines.push(`Apaga também a receita de ${Money.format(e.amount)}${e.paymentDate ? ' (já recebida)' : ''} do caixa.`);
  }
  const advTotal = (os.advances ?? []).reduce((acc, a) => acc + a.amount, 0)
    || (os.advanceEntryId ? os.advanceAmount || 0 : 0);
  if (advTotal > 0) lines.push(`Apaga os adiantamentos já recebidos (${Money.format(advTotal)}) do caixa.`);
  return { ok: true, message: lines.join('\n') };
};

/** Marca como recebido (na data dada) um lançamento ainda em aberto; lançamento já recebido ou inexistente: lista intacta. */
export const settleOpenReceipt = (ledger: LedgerEntry[], entryId: string, paymentDate: string): LedgerEntry[] =>
  ledger.map(e => (e.id === entryId && !e.paymentDate ? { ...e, paymentDate } : e));

/** Voltar de Aguardando Pagamento para antes do serviço desfaz o parcelamento (ou receita) já criado. */
export const BACKWARD_FROM_PAYMENT: OSStatus[] = ['ORCAMENTO', 'APROVADO', 'EM_SERVICO'];

// ---------- Financeiro: lançamentos que pertencem a uma OS ----------

/** OS dona de uma receita (à vista ou parcela): travada no Financeiro, só se mexe pela OS. */
export const findReceiptOwner = (workOrders: WorkOrder[], entry: LedgerEntry): WorkOrder | undefined =>
  workOrders.find(o =>
    o.financialId === entry.id
    || (!!entry.installmentGroupId && o.installmentConfig?.groupId === entry.installmentGroupId)
    || (!!entry.groupId && o.installmentConfig?.groupId === entry.groupId));

export const receiptLockedMessage = (osNumber: number): string =>
  `Este lançamento pertence à OS #${osNumber} e não pode ser apagado aqui. Para desfazê-lo, reabra ou exclua a OS na Oficina.`;

// ---------- Editar OS já lançada ----------

const itemsKey = (os: Pick<WorkOrder, 'parts' | 'services'>): string =>
  JSON.stringify([...os.parts, ...os.services].map(i => [i.description, i.price]));

/**
 * Aviso curto antes de salvar uma OS finalizada ou já lançada no financeiro quando total ou itens mudam
 * (o valor do caixa muda em silêncio). null = salvar direto.
 */
export const editWarning = (previous: WorkOrder, next: WorkOrder): string | null => {
  const launched = previous.status === 'FINALIZADO' || !!previous.financialId;
  if (!launched) return null;
  const totalChanged = previous.total !== next.total;
  if (!totalChanged && itemsKey(previous) === itemsKey(next)) return null;
  const head = totalChanged
    ? `Esta OS já foi lançada no financeiro. O total vai de ${Money.format(previous.total)} para ${Money.format(next.total)}.`
    : 'Esta OS já foi lançada no financeiro e os itens mudaram.';
  // OS fechada sem lançamento (adiantamentos cobriram o total): o que passar do total antigo não entra no caixa.
  const unbooked = previous.status === 'FINALIZADO' && !previous.financialId && !isInstallmentOS(previous)
    ? getRemainingAmount(next) - getRemainingAmount(previous)
    : 0;
  const tail = isInstallmentOS(previous)
    ? ' As parcelas já criadas NÃO mudam.'
    : previous.financialId
      ? ' A receita lançada no caixa será atualizada.'
      : unbooked > 0
        ? ` A diferença de ${Money.format(unbooked)} NÃO será lançada no financeiro (a OS foi fechada sem receita, pois os adiantamentos cobriram o total). Lance essa diferença à mão no Financeiro, se for o caso.`
        : '';
  return `${head}${tail}

Salvar mesmo assim?`;
};

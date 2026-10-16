import { Client, LedgerEntry, WorkOrder } from '../types';
import { clientGroupKey, resolveClientId } from '../utils/links';
import { formatDateOnly, parseDateFlexible } from '../utils/dates';

// Conceito único de "a receber": `paymentDate` é a única verdade de "pago" (isPaid não é mais lido).
// Funções puras; `today` é injetado (Date ou 'YYYY-MM-DD') e a comparação é por DIA LOCAL.

export type ReceivableStatus = 'RECEBIDO' | 'A_RECEBER' | 'ATRASADO';

export interface ReceivablesSummary {
  totalAReceber: number;
  totalAtrasado: number;
  countAReceber: number;
  countAtrasado: number;
  /** A_RECEBER + ATRASADO, ordenados por vencimento (mais antigo primeiro). */
  items: LedgerEntry[];
}

export const getDueDate = (entry: LedgerEntry): string => entry.dueDate ?? entry.effectiveDate;

// 'YYYY-MM-DD' local de um Date, de um 'YYYY-MM-DD' ou de um ISO completo.
const toLocalDay = (value: string | Date): string =>
  value instanceof Date ? formatDateOnly(value) : formatDateOnly(parseDateFlexible(value));

export const getReceivableStatus = (
  entry: LedgerEntry,
  today: string | Date
): ReceivableStatus | null => {
  if (entry.type !== 'CREDIT') return null;
  if (entry.paymentDate) return 'RECEBIDO';
  return toLocalDay(getDueDate(entry)) < toLocalDay(today) ? 'ATRASADO' : 'A_RECEBER';
};

export const summarizeReceivables = (
  ledger: LedgerEntry[],
  today: string | Date
): ReceivablesSummary => {
  const summary: ReceivablesSummary = {
    totalAReceber: 0, totalAtrasado: 0, countAReceber: 0, countAtrasado: 0, items: [],
  };
  for (const e of ledger) {
    const status = getReceivableStatus(e, today);
    if (status === 'ATRASADO') {
      summary.totalAtrasado += e.amount;
      summary.countAtrasado++;
      summary.items.push(e);
    } else if (status === 'A_RECEBER') {
      summary.totalAReceber += e.amount;
      summary.countAReceber++;
      summary.items.push(e);
    }
  }
  summary.items.sort((a, b) =>
    parseDateFlexible(getDueDate(a)).getTime() - parseDateFlexible(getDueDate(b)).getTime());
  return summary;
};

// ---------- Apresentação (texto, nunca só cor) ----------

const dayParts = (day: string) => day.split('-').map(Number);

/** Dias de calendário entre dois 'YYYY-MM-DD' (b - a). Usa UTC só para a conta: sem efeito de horário de verão. */
const diffDays = (a: string, b: string): number => {
  const [ay, am, ad] = dayParts(a);
  const [by, bm, bd] = dayParts(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
};

/** Vencimento como dd/mm/aaaa, pelo dia LOCAL. */
export const formatDueDate = (entry: LedgerEntry): string => {
  const [y, m, d] = dayParts(toLocalDay(getDueDate(entry)));
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
};

/** Dias de atraso (0 se não está atrasado). */
export const getDaysOverdue = (entry: LedgerEntry, today: string | Date): number =>
  getReceivableStatus(entry, today) === 'ATRASADO'
    ? diffDays(toLocalDay(getDueDate(entry)), toLocalDay(today))
    : 0;

/** "A receber", "Atrasado há 1 dia" ou "Atrasado há N dias"; '' se não for crédito em aberto. */
export const getReceivableLabel = (entry: LedgerEntry, today: string | Date): string => {
  const status = getReceivableStatus(entry, today);
  if (status === 'A_RECEBER') return 'A receber';
  if (status === 'ATRASADO') {
    const n = getDaysOverdue(entry, today);
    return `Atrasado há ${n} ${n === 1 ? 'dia' : 'dias'}`;
  }
  return '';
};

// ---------- Contas a receber por cliente ----------

export interface ClientReceivable {
  /** Nome para exibir (do cadastro quando resolvido; senão o texto da primeira OS). */
  clientName: string;
  /** Preenchido quando a OS resolve para um cliente do cadastro. */
  clientId?: string;
  /** Total em aberto (A_RECEBER + ATRASADO). */
  emAberto: number;
  /** Parte do total em aberto que já venceu. */
  atrasado: number;
  countAberto: number;
  countAtrasado: number;
}

export interface ClientReceivablesResult {
  byClient: Map<string, ClientReceivable>;
  /** Clientes com valor em aberto, do maior para o menor (empate: nome). */
  ranking: ClientReceivable[];
}

/**
 * Agrupa o que cada cliente deve. Ligação lançamento -> OS: `os.financialId === entry.id`
 * (à vista e 1ª parcela) ou `entry.installmentGroupId === os.installmentConfig?.groupId` (parcelas).
 * Cliente = resolveClientId (clientId válido, senão o ÚNICO cliente de mesmo nome normalizado); a chave de
 * `byClient` é o id do cliente. OS sem cliente resolvível agrupam em `nome:<nome normalizado>` (sem clientId).
 * Sem `clients`, tudo cai na chave `nome:`.
 * Lançamentos sem OS (manuais) ficam de fora.
 */
export const getClientReceivables = (
  workOrders: WorkOrder[],
  ledger: LedgerEntry[],
  today: string | Date,
  clients: Client[] = []
): ClientReceivablesResult => {
  const byEntryId = new Map<string, WorkOrder>();
  const byGroupId = new Map<string, WorkOrder>();
  for (const os of workOrders) {
    if (os.financialId) byEntryId.set(os.financialId, os);
    const g = os.installmentConfig?.groupId;
    if (g) byGroupId.set(g, os);
  }

  const byClient = new Map<string, ClientReceivable>();
  for (const e of ledger) {
    const status = getReceivableStatus(e, today);
    if (status !== 'A_RECEBER' && status !== 'ATRASADO') continue;
    const os = byEntryId.get(e.id) ?? (e.installmentGroupId ? byGroupId.get(e.installmentGroupId) : undefined);
    if (!os) continue;
    const key = clientGroupKey(os, clients);
    let c = byClient.get(key);
    if (!c) {
      const clientId = resolveClientId(os, clients);
      const name = clientId ? clients.find(x => x.id === clientId)?.name ?? os.clientName : os.clientName;
      c = { clientName: name, emAberto: 0, atrasado: 0, countAberto: 0, countAtrasado: 0 };
      if (clientId) c.clientId = clientId;
      byClient.set(key, c);
    }
    c.emAberto += e.amount;
    c.countAberto++;
    if (status === 'ATRASADO') { c.atrasado += e.amount; c.countAtrasado++; }
  }

  const ranking = [...byClient.values()].sort(
    (a, b) => b.emAberto - a.emAberto || a.clientName.localeCompare(b.clientName, 'pt-BR'));
  return { byClient, ranking };
};

// ---------- Gasto por cliente (CRM) ----------

export interface ClientSpending {
  total: number;
  count: number;
  lastDate: string;
}

/**
 * Soma as OS FINALIZADAS por cliente (total, quantidade, última data), com a mesma chave de
 * getClientReceivables (id do cliente; reserva `nome:<normalizado>`). Mesma conta que o CRMDashboard fazia por nome.
 */
export const getClientSpending = (workOrders: WorkOrder[], clients: Client[]): Map<string, ClientSpending> => {
  const map = new Map<string, ClientSpending>();
  for (const wo of workOrders) {
    if (wo.status !== 'FINALIZADO') continue;
    const key = clientGroupKey(wo, clients);
    const current = map.get(key) || { total: 0, count: 0, lastDate: wo.createdAt };
    map.set(key, {
      total: current.total + wo.total,
      count: current.count + 1,
      lastDate: wo.createdAt > current.lastDate ? wo.createdAt : current.lastDate,
    });
  }
  return map;
};

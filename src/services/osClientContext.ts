import type { Client, LedgerEntry, WorkOrder } from '../types';
import { Money } from '../utils/helpers';
import { clientGroupKey, normalizeName, normalizePlate, vehicleParts } from '../utils/links';
import { formatKm } from './kanbanCardView';
import { getClientReceivables } from './receivables';

// O que o sistema já sabe do cliente escolhido na janela da OS (dívida e última visita). Funções puras.

/**
 * Linha de dívida: "Deve R$ 1.200,00 (R$ 300,00 atrasado)". null quando o cliente não deve nada.
 * `client` = cliente escolhido no cadastro; undefined = nome digitado que não é do cadastro (liga pelo nome).
 * Usa getClientReceivables (a mesma conta do Financeiro e do CRM): lançamentos em aberto das OS do cliente e OS em
 * Aguardando Pagamento sem lançamento.
 */
export type ClientDebts = ReturnType<typeof getClientReceivables>['byClient'];

/** Dívida de todos os clientes de uma vez (para memorizar na tela e consultar por chave a cada tecla). */
export const buildClientDebts = (workOrders: WorkOrder[], ledger: LedgerEntry[], clients: Client[], today: string | Date): ClientDebts =>
  getClientReceivables(workOrders, ledger, today, clients).byClient;

export const clientDebtLine = ({ workOrders, ledger, clients, client, clientName, today, debts }: {
  /** Dívidas já calculadas (buildClientDebts); ausente = calcula aqui. */
  debts?: ClientDebts;
  workOrders: WorkOrder[];
  ledger: LedgerEntry[];
  clients: Client[];
  client: Client | undefined;
  clientName: string;
  today: string | Date;
}): string | null => {
  if (!client && !normalizeName(clientName)) return null;
  const key = clientGroupKey({ clientName: client?.name ?? clientName, clientId: client?.id }, clients);
  const debt = (debts ?? buildClientDebts(workOrders, ledger, clients, today)).get(key);
  if (!debt || debt.emAberto <= 0) return null;
  const late = debt.atrasado > 0 ? ` (${Money.format(debt.atrasado)} atrasado)` : '';
  return `Deve ${Money.format(debt.emAberto)}${late}`;
};

/**
 * Última visita do cliente: a OS mais recente (por data de criação; orçamento ainda não é visita) do mesmo cliente.
 * Com `vehicle` digitado (modelo - placa): só OS do mesmo carro (pela placa; sem placa, pelo modelo) e a linha traz
 * "OS #N, km K". Sem veículo digitado: a última OS do cliente, com o modelo ("OS #N (Gol), km K").
 * Veículo digitado que nunca veio à oficina, ou cliente sem histórico: null. `excludeId` = a OS que está sendo editada.
 */
export const lastVisitLine = ({ workOrders, clients, client, clientName, vehicle, excludeId }: {
  workOrders: WorkOrder[];
  clients: Client[];
  client: Client | undefined;
  clientName: string;
  vehicle: string;
  excludeId?: string;
}): string | null => {
  if (!client && !normalizeName(clientName)) return null;
  const key = clientGroupKey({ clientName: client?.name ?? clientName, clientId: client?.id }, clients);
  const mine = workOrders.filter(o => o.id !== excludeId && o.status !== 'ORCAMENTO' && clientGroupKey(o, clients) === key);
  if (mine.length === 0) return null;

  const typed = vehicleParts(vehicle.trim());
  const plate = normalizePlate(typed.plate);
  const model = normalizeName(typed.model);
  const hasVehicle = !!plate || !!model;
  const sameCar = (o: WorkOrder): boolean => {
    const p = vehicleParts(o.vehicle);
    return plate ? normalizePlate(p.plate) === plate : normalizeName(p.model) === model;
  };
  const pool = hasVehicle ? mine.filter(sameCar) : mine;
  if (pool.length === 0) return null;

  const last = pool.reduce((a, b) => (b.createdAt > a.createdAt || (b.createdAt === a.createdAt && b.osNumber > a.osNumber) ? b : a));
  const km = formatKm(last.mileage);
  const car = hasVehicle ? '' : ` (${vehicleParts(last.vehicle).model || last.vehicle})`;
  return `Última visita: OS #${last.osNumber}${car}${km ? `, ${km}` : ''}`;
};

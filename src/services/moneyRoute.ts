import type { LedgerEntry, OSStatus, WorkOrder } from '../types';
import { stable } from './osEditMerge';
import type { StatusChangeEffect } from './osFinanceService';
import type { Role } from './permissions';
import { classify, statusNeedsMoney } from '../sync/diff';
import type { MoneyOutcome } from '../sync/moneyClient';

// Decisões puras do modo nuvem sobre o dinheiro (PR 6): quando o handler precisa chamar a função `money` em vez de
// gravar pelo `setX`. O `classify` do motor continua revertendo `money_op` que escape por `setX`; isto evita que escape.

/** Texto para quem não pode finalizar (Recepção e Dono podem). Mesma frase da UX (seção 7.3). */
export const FINALIZE_DENIED_MESSAGE = 'Só a Recepção ou o Dono finaliza (envolve pagamento).';

/** Mudar de status por `os.status`: transição que o servidor guarda, parcela/receita a acertar ou chave além de `status`. */
export function statusNeedsMoneyOp(os: WorkOrder, newStatus: OSStatus, effect: StatusChangeEffect): boolean {
  if (statusNeedsMoney(os, newStatus)) return true;
  if (effect.kind !== 'update') return false;
  return !!effect.settleEntry || Object.keys(effect.updates).some(k => k !== 'status');
}

/** Alguma linha do caixa mudou (por referência; só compara o conteúdo das que trocaram de objeto). */
export function ledgerTouched(next: readonly LedgerEntry[], prev: readonly LedgerEntry[]): boolean {
  if (next.length !== prev.length) return true;
  for (let i = 0; i < next.length; i++) {
    if (next[i] !== prev[i] && stable(next[i]) !== stable(prev[i])) return true;
  }
  return false;
}

/**
 * Salvar a janela da OS: vai pela função `money` (`os.save`) quando muda o caixa, gera auditoria de adiantamento ou
 * mexe em dinheiro da OS (adiantamentos, preços de OS já lançada). `previous` ausente = OS nova.
 */
export function saveNeedsMoney(a: {
  role: Role;
  previous: WorkOrder | undefined;
  saved: { os: WorkOrder; ledger: readonly LedgerEntry[]; events: readonly unknown[] };
  ledger: readonly LedgerEntry[];
}): boolean {
  if (a.saved.events.length > 0) return true;
  if (ledgerTouched(a.saved.ledger, a.ledger)) return true;
  return classify(a.role, 'workOrders', a.previous ?? null, a.saved.os) === 'money_op';
}

/** Tipo do toast para uma recusa de `cloud.money`: sem internet é aviso, o resto é erro. */
export const moneyFailToastType = (o: Extract<MoneyOutcome, { ok: false }>): 'info' | 'error' => (o.code === 'offline' ? 'info' : 'error');

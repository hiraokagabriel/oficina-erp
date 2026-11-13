import type { OSStatus, WorkOrder } from '../types';
import { isAdvanceSyncLocked } from './osFinanceService';

// Textos e regras puras de "Precisa de internet" nas telas de dinheiro (docs/NUVEM-UX.md 6.2). Só o modo nuvem usa:
// no modo arquivo `online` é sempre verdadeiro e nada aparece.

/** Faixa da coluna Finalizado ao arrastar sem internet (com o ícone `cadeado`). */
export const OFFLINE_COLUMN_HINT = 'Precisa de internet';
/** Faixa no cabeçalho da tabela "A receber" do Financeiro sem internet. */
export const FIN_TABLE_OFFLINE_BANNER = 'Sem internet: receber e marcar como pago voltam quando a internet voltar.';
/** Aviso na janela de uma OS finalizada/lançada sem internet (itens e preços travam). */
export const FINALIZED_OFFLINE_LOCK = 'Sem internet: OS finalizada só pode ser mudada com internet, porque mexe no caixa.';

const BEFORE_PAYMENT: readonly OSStatus[] = ['ORCAMENTO', 'APROVADO', 'EM_SERVICO'];

/**
 * Mover a OS de `from` para `to` mexe no caixa? Mesma régua do Kanban (menu, arrastar) e do menu de status de Processos:
 * entrar em Finalizado, sair de Finalizado (menos arquivar), voltar de Aguardando Pagamento e sair do arquivo.
 */
export function statusMoveNeedsInternet(from: OSStatus, to: OSStatus): boolean {
  if (from === to) return false;
  if (to === 'FINALIZADO') return true;
  if (from === 'FINALIZADO') return to !== 'ARQUIVADO';
  if (from === 'ARQUIVADO') return true;
  return from === 'AGUARDANDO_PAGAMENTO' && BEFORE_PAYMENT.includes(to);
}

/** Qual faixa a coluna Finalizado mostra enquanto se arrasta um cartão. */
export function finalizeColumnHint(i: { dragging: boolean; canFinalize: boolean; online: boolean }): 'denied' | 'offline' | null {
  if (!i.dragging) return null;
  if (!i.canFinalize) return 'denied';
  return i.online ? null : 'offline';
}

/** Janela da OS: itens e preços travam sem internet quando a OS já mexe no caixa (finalizada ou com receita). */
export const itemsLockedOffline = (online: boolean, os: WorkOrder | null | undefined): boolean =>
  !online && !!os && isAdvanceSyncLocked(os);

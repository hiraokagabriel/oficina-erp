import { OS_DELETED_MESSAGE, RECORD_DELETED_MESSAGE, RECORD_EDITED_MESSAGE } from './mergeRecord';
import type { OutboxOp } from './outbox';
import type { RejectReason } from './syncEngine';
import type { CollectionKey } from './types';

// Textos dos avisos do motor (toasts do provider) e conteúdo da cópia de recuperação. Puro.

export function rejectionMessage(collection: CollectionKey, reason: RejectReason): string {
  switch (reason) {
    case 'money_op':
      return 'Esta alteração mexe com dinheiro e só pode ser feita pelo caminho do financeiro, com internet. Nada foi alterado.';
    case 'denied_local':
      return 'O seu perfil não pode fazer esta alteração. Nada foi alterado.';
    case 'denied':
      return 'O servidor não aceitou esta alteração (seu perfil não tem permissão). Ela foi desfeita e uma cópia ficou guardada.';
    case 'offline':
      return 'Sem internet: este lançamento só pode ser feito online. Nada foi salvo.';
    case 'failed':
      return 'O servidor recusou esta alteração e ela foi desfeita. Uma cópia ficou guardada.';
    case 'server_deleted':
      return collection === 'workOrders' ? OS_DELETED_MESSAGE : RECORD_DELETED_MESSAGE;
    case 'server_edited':
      return RECORD_EDITED_MESSAGE;
    case 'cache_discarded':
      return 'Os dados guardados neste aparelho foram descartados (mudança de perfil ou de versão). O que ainda não tinha sido enviado ficou numa cópia de recuperação.';
  }
}

/** JSON da cópia de recuperação de uma op descartada (`denied`/`failed`). */
export function recoveryCopyContent(op: OutboxOp, savedAt: string): string {
  return JSON.stringify({
    tipo: 'copia-de-recuperacao-nuvem', salvoEm: savedAt, colecao: op.collection, registro: op.recordId,
    operacao: op.kind, motivo: op.lastError ?? op.state, valorTentado: op.value, baseDoServidor: op.base,
  }, null, 2);
}

/** Nome do arquivo de download na web (sem caracteres inválidos). */
export const recoveryFileName = (op: OutboxOp, savedAt: string): string =>
  `recuperacao-${op.collection}-${savedAt.replace(/[^0-9]/g, '').slice(0, 14)}.json`;

/**
 * Texto simples para o selo (`saveError`) a partir do `lastError` do motor. Nunca devolve código cru nem mensagem
 * técnica do servidor.
 */
export function describeSyncError(raw: string | null): string | null {
  if (raw === null) return null;
  if (raw === 'sem_acesso') return 'Sua sessão não tem mais acesso. Entre de novo para continuar.';
  if (raw.startsWith('Cache local')) return 'Não foi possível guardar os dados neste aparelho.';
  if (raw === 'registro_incompleto') return 'Um registro chegou incompleto. O app tenta buscar de novo.';
  return 'Sem conexão com o servidor. Suas alterações estão guardadas e serão enviadas.';
}

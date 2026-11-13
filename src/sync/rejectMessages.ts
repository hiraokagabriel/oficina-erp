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
      return 'O seu papel não pode fazer esta alteração. Nada foi alterado.';
    case 'denied':
      return 'O sistema não aceitou esta alteração. Ela foi desfeita e uma cópia ficou guardada. Se continuar acontecendo, peça ajuda a quem cuida do sistema.';
    case 'offline':
      return 'Sem internet: este lançamento só pode ser feito online. Nada foi salvo.';
    case 'failed':
      return 'O sistema recusou esta alteração e ela foi desfeita. Uma cópia ficou guardada.';
    case 'server_deleted':
      return collection === 'workOrders' ? OS_DELETED_MESSAGE : RECORD_DELETED_MESSAGE;
    case 'server_edited':
      return RECORD_EDITED_MESSAGE;
    case 'cache_discarded':
      return 'Os dados guardados neste aparelho foram descartados (mudança de papel ou de versão). O que ainda não tinha sido enviado ficou numa cópia de recuperação.';
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
 * Texto simples para o selo (`saveError`) a partir do `lastError` do motor (docs/NUVEM-UX.md 6.1). Nunca devolve código
 * cru nem mensagem técnica do servidor. `sem_acesso` normalmente vira a tela "Sem acesso" (6.3); este texto é só reserva.
 */
export function describeSyncError(raw: string | null): string | null {
  if (raw === null) return null;
  if (raw === 'sem_acesso') return 'Seu acesso precisa ser confirmado. Entre de novo para continuar.';
  if (raw.startsWith('Cache local')) return 'Este aparelho não conseguiu guardar os dados.';
  if (raw === 'registro_incompleto') return 'Um registro chegou pela metade. O programa vai buscar de novo sozinho.';
  return 'Não deu para enviar agora. Suas alterações estão guardadas neste aparelho.';
}

/** "O que fazer" do painel do selo para cada erro; `null` = sem ação (o motor resolve sozinho). */
export function syncErrorAdvice(raw: string | null): string | null {
  if (raw === null || raw === 'registro_incompleto') return null;
  if (raw === 'sem_acesso') return 'Entre de novo com o seu e-mail e senha.';
  if (raw.startsWith('Cache local')) {
    return "Feche outras janelas do OficinaPro e libere espaço no aparelho. Não feche o programa até o selo mostrar 'Salvo'.";
  }
  return 'Confira a internet. O programa tenta de novo sozinho; se quiser, toque em Tentar enviar agora.';
}

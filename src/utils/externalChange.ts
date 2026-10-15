// Detecção de mudança externa no arquivo do banco (outro PC salvou), com linhagem.

/** Resposta do comando `read_db_meta` (só o meta do arquivo no disco). */
export interface DiskMetaInfo {
  /** ok = meta com revision | no_meta = banco v0 | not_found / unreadable = não deu para ler */
  status: 'ok' | 'no_meta' | 'not_found' | 'unreadable';
  revision?: string | null;
  history?: string[];
  savedBy?: string | null;
  savedAt?: string | null;
}

export type ExternalChangeDecision = 'none' | 'reload' | 'diverged' | 'skip';

/**
 * Decide o que fazer com o que está no disco, comparado à revision que este PC leu/gravou por último.
 * - skip: não decidir agora (arquivo ausente/ilegível, ou há edição pendente: o conflito será tratado no salvamento);
 * - none: o disco é o que já temos;
 * - reload: o disco descende do que temos (minha revision está no history dele): recarregar em silêncio;
 * - diverged: o disco não parte do que temos (ou perdeu o meta): bloquear com o diálogo.
 */
export function decideExternalChange(args: {
  myRevision: string | null;
  disk: DiskMetaInfo;
  hasPendingEdits: boolean;
}): ExternalChangeDecision {
  const { myRevision, disk, hasPendingEdits } = args;
  if (disk.status === 'not_found' || disk.status === 'unreadable') return 'skip';

  const diskRevision = disk.status === 'ok' ? disk.revision || null : null;
  if (diskRevision === myRevision) return 'none'; // inclui: nós sem revision e disco v0 sem meta
  if (hasPendingEdits) return 'skip';

  if (diskRevision && myRevision && (disk.history ?? []).includes(myRevision)) return 'reload';
  return 'diverged';
}

// Primeira abertura da nuvem neste aparelho (cache local vazio): decisão pura. Sem o primeiro pull completo a pessoa
// veria o quadro vazio com o selo "Salvo", então o provider mantém "Preparando este aparelho" até o pull terminar.

/** Cache que nunca concluiu um pull: primeira abertura (ou cache descartado). Com pull anterior, abre na hora. */
export const needsFirstPull = (lastPullAt: string | null): boolean => lastPullAt === null;

export type FirstPullOutcome = 'ok' | 'offline' | 'erro';

export interface FirstPullInput {
  /** O motor concluiu ao menos um pull completo (`lastPullAt` gravado). */
  hasPulled: boolean;
  online: boolean;
  lastError: string | null;
}

/**
 * Resultado da primeira rodada. `sem_acesso` vira `ok` para as telas de acesso (Entrar de novo, desativado) assumirem,
 * como no resto da nuvem. Sem pull, sem internet: `offline`; qualquer outro caso sem pull: `erro`.
 */
export function firstPullOutcome(i: FirstPullInput): FirstPullOutcome {
  if (i.hasPulled || i.lastError === 'sem_acesso') return 'ok';
  return i.online ? 'erro' : 'offline';
}

export function firstPullMessage(o: Exclude<FirstPullOutcome, 'ok'>): string {
  return o === 'offline'
    ? 'Sem internet. Para abrir pela primeira vez neste aparelho, conecte à internet e toque em Tentar de novo.'
    : 'Não deu para baixar os dados da oficina agora. Confira a internet e toque em Tentar de novo.';
}

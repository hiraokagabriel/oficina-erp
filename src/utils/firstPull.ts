// Primeira abertura da nuvem neste aparelho (cache local vazio): decisão pura. Sem o primeiro pull completo a pessoa
// veria o quadro vazio com o selo "Salvo", então o provider mantém "Preparando este aparelho" até o pull terminar.

/** Cache que nunca concluiu um pull: primeira abertura (ou cache descartado). Com pull anterior, abre na hora. */
export const needsFirstPull = (lastPullAt: string | null): boolean => lastPullAt === null;

export type FirstPullOutcome = 'ok' | 'offline' | 'erro' | 'acesso';

export interface FirstPullInput {
  /** O motor concluiu ao menos um pull completo (`lastPullAt` gravado). */
  hasPulled: boolean;
  online: boolean;
  lastError: string | null;
}

/**
 * Resultado da primeira rodada. Só `hasPulled` abre o quadro: abrir com `sem_acesso` mostraria o quadro vazio como se
 * fosse real. `sem_acesso` sem pull é `acesso`: o provider segue em "Preparando" e as telas de acesso (Entrar de novo,
 * desativado) assumem por cima (CloudRoot sonda o acesso). Sem pull, sem internet: `offline`; outro caso sem pull: `erro`.
 */
export function firstPullOutcome(i: FirstPullInput): FirstPullOutcome {
  if (i.hasPulled) return 'ok';
  if (i.lastError === 'sem_acesso') return 'acesso';
  return i.online ? 'erro' : 'offline';
}

export function firstPullMessage(o: Exclude<FirstPullOutcome, 'ok' | 'acesso'>): string {
  return o === 'offline'
    ? 'Sem internet. Para abrir pela primeira vez neste aparelho, conecte à internet e toque em Tentar de novo.'
    : 'Não deu para baixar os dados da oficina agora. Confira a internet e toque em Tentar de novo.';
}

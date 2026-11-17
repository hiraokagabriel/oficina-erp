// Textos do aviso "fotos ainda não subiram" (nuvem), ao sair deste aparelho ou trocar de pessoa. Puro.

/** "1 foto ainda não subiu" / "3 fotos ainda não subiram". Vazio quando não há nenhuma. */
export const photosPendingLine = (n: number): string => {
  if (!Number.isFinite(n) || n <= 0) return '';
  return n === 1 ? '1 foto ainda não subiu.' : `${n} fotos ainda não subiram.`;
};

/** Aviso completo: o que acontece com as fotos e quando elas sobem. */
export const photosPendingNotice = (n: number): string => {
  const line = photosPendingLine(n);
  if (!line) return '';
  return `${line} ${n === 1 ? 'Ela sobe' : 'Elas sobem'} quando esta pessoa entrar de novo neste aparelho.`;
};

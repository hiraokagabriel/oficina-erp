// Banco em somente leitura (lacrado ou de versão futura): nenhuma ação que altera dados pode dar falso sucesso.
// Puro; o App.tsx chama `readOnlyBlock` no começo de cada handler que grava e mostra a mensagem como erro.

export const READ_ONLY_MESSAGE = 'Somente leitura: este banco não aceita alterações.';

/** Mensagem de bloqueio quando o banco está só para leitura; `null` quando pode alterar. */
export function readOnlyBlock(readOnly: boolean): string | null {
  return readOnly ? READ_ONLY_MESSAGE : null;
}

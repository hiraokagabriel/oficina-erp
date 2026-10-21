// Garantia dos serviços: fonte única para a OS impressa (printOS.ts) e o resumo do cliente.

export const WARRANTY_DAYS = 90;

/** Prazo por extenso, como aparece na cláusula 4 da OS impressa. */
export const WARRANTY_TERM_TEXT = '90 (noventa) dias';

/** Texto curto de garantia para o resumo do cliente. */
export const WARRANTY_SUMMARY_TEXT =
  `Garantia de ${WARRANTY_TERM_TEXT} a partir da data de entrega do veículo, apenas para os itens cobrados.`;

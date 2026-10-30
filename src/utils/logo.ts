// Letras do logo impresso (círculo do cabeçalho da OS). Ausente ou vazio = 'AM'.
export const DEFAULT_LOGO_TEXT = 'AM';

/** Limpa o texto digitado: sem espaços/controles, só letras e números, maiúsculas, 1 a 3 caracteres. */
export function normalizeLogoText(raw: string | undefined | null): string {
  if (typeof raw !== 'string') return DEFAULT_LOGO_TEXT;
  // Array.from separa por ponto de código: .slice cortaria um par substituto (letra fora do BMP) ao meio.
  const clean = Array.from(
    raw
      .normalize('NFC')
      .toLocaleUpperCase('pt-BR')
      .replace(/[^\p{L}\p{N}]/gu, '')
  ).slice(0, 3).join('');
  return clean === '' ? DEFAULT_LOGO_TEXT : clean;
}

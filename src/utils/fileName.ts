/**
 * Parte segura para nome de arquivo: sem acentos (ç vira c), só [A-Za-z0-9] e "_",
 * "_" repetidos juntos, sem "_" nas pontas, cortada em `max` caracteres.
 */
export function sanitizeFilePart(text: string, max = 40): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, max);
}

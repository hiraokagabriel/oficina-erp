// Máscara de telefone só para EXIBIR (o valor gravado não muda). Puro.

/** "11987654321" -> "(11) 98765-4321"; "1134567890" -> "(11) 3456-7890"; com 55 na frente também. Outro formato volta como veio. */
export function formatPhoneDisplay(raw: string | undefined | null): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  const local = (digits.length === 12 || digits.length === 13) && digits.startsWith('55') ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return raw;
}

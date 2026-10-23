// Lógica pura da janela da OS: validação por campo e texto de dinheiro. Sem React.

/** Ids dos campos que podem ficar com erro (na ordem em que aparecem na janela). */
export type OSFieldId = 'os-client' | 'os-vehicle' | 'os-client-choice' | 'os-number';

export interface OSValidationInput {
  clientName: string;
  vehicle: string;
  needsClientChoice: boolean;
  osNumber: string;
}

export type OSFieldErrors = Partial<Record<OSFieldId, string>>;

/** Mesmas regras de antes (cliente e veículo, escolha de homônimo, número da OS), agora por campo. */
export function validateOSFields(i: OSValidationInput): OSFieldErrors {
  const errors: OSFieldErrors = {};
  if (!i.clientName) errors['os-client'] = 'Preencha o cliente.';
  if (!i.vehicle) errors['os-vehicle'] = 'Preencha o veículo.';
  if (i.clientName && i.needsClientChoice) {
    errors['os-client-choice'] = 'Há mais de um cliente com esse nome. Escolha o cliente em "Qual cliente?".';
  }
  if (Number.isNaN(parseInt(i.osNumber, 10))) errors['os-number'] = 'Número da OS inválido.';
  return errors;
}

const FIELD_ORDER: OSFieldId[] = ['os-client', 'os-client-choice', 'os-vehicle', 'os-number'];

/** Primeiro campo com erro, na ordem visual da janela. */
export function firstErrorField(errors: OSFieldErrors): OSFieldId | null {
  return FIELD_ORDER.find(f => errors[f]) ?? null;
}

/** Texto de dinheiro: só dígitos, vírgula, ponto e "-" (este só na primeira posição). */
export function sanitizeMoneyText(raw: string): string {
  const kept = raw.replace(/[^0-9.,-]/g, '');
  return kept.charAt(0) === '-' ? '-' + kept.slice(1).replace(/-/g, '') : kept.replace(/-/g, '');
}

export type MoneyParse =
  | { status: 'empty' }
  | { status: 'ok'; cents: number }
  | { status: 'invalid' };

const THOUSANDS = /^\d{1,3}(\.\d{3})+$/;

/**
 * Texto de dinheiro em reais para centavos inteiros, sem float. Formato pt-BR:
 * - com vírgula: os pontos antes dela são milhar ("1.234,50" = 123450); depois da vírgula, até 2 dígitos ("12," = 1200);
 * - sem vírgula e com ponto: ponto + exatamente 3 dígitos com parte inteira de 1 a 3 dígitos (não "0") é milhar
 *   ("1.500" = 150000, "1.234.567" = 123456700); senão é decimal de até 2 dígitos ("1.5" = 150);
 * - "-" só na primeira posição (valor negativo é preservado);
 * - mais de 2 casas decimais ("0,005"), mistura ("1,234.50"), vários decimais ("1.2.3") ou lixo = inválido,
 *   nunca arredondado em silêncio. Vazio = empty.
 */
export function parseMoneyText(raw: string): MoneyParse {
  let t = raw.trim().replace(/\s+/g, '');
  if (t === '') return { status: 'empty' };
  let negative = false;
  if (t.charAt(0) === '-') { negative = true; t = t.slice(1); }
  if (!/^[0-9.,]+$/.test(t) || !/\d/.test(t)) return { status: 'invalid' };

  let intPart: string;
  let fracPart = '';
  const commas = t.split(',').length - 1;
  if (commas > 1) return { status: 'invalid' };
  if (commas === 1) {
    const [left, right] = t.split(',');
    if (!(left === '' || /^\d+$/.test(left) || THOUSANDS.test(left))) return { status: 'invalid' };
    if (!/^\d*$/.test(right) || right.length > 2) return { status: 'invalid' };
    intPart = left.replace(/\./g, '');
    fracPart = right;
  } else if (t.includes('.')) {
    const dots = t.split('.').length - 1;
    if (THOUSANDS.test(t) && !(dots === 1 && t.startsWith('0.'))) {
      intPart = t.replace(/\./g, '');
    } else if (dots === 1) {
      const [left, right] = t.split('.');
      if (!/^\d*$/.test(left) || !/^\d*$/.test(right) || right.length > 2) return { status: 'invalid' };
      intPart = left;
      fracPart = right;
    } else {
      return { status: 'invalid' };
    }
  } else {
    intPart = t;
  }
  if (intPart.length > 12) return { status: 'invalid' };
  const cents = parseInt(intPart || '0', 10) * 100 + parseInt((fracPart + '00').slice(0, 2), 10);
  return { status: 'ok', cents: negative && cents !== 0 ? -cents : cents };
}

/** Tipos de campo de dinheiro: preço (vazio = 0), custo (vazio = sem custo; 0 ou negativo = 0) e opcional (vazio = sem valor). */
export type MoneyFieldKind = 'price' | 'cost' | 'optional';

export type MoneyFieldParse = { ok: true; value: number | undefined } | { ok: false };

/** Texto digitado para o valor do campo; inválido não muda o valor gravado. */
export function parseMoneyField(kind: MoneyFieldKind, raw: string): MoneyFieldParse {
  const p = parseMoneyText(raw);
  if (p.status === 'invalid') return { ok: false };
  if (p.status === 'empty') return { ok: true, value: kind === 'price' ? 0 : undefined };
  if (kind === 'cost') return { ok: true, value: p.cents > 0 ? p.cents : 0 };
  return { ok: true, value: p.cents };
}

export const MONEY_INVALID_MESSAGE = 'Valor inválido. Use o formato 1.234,50';

/** Centavos para o campo de texto no formato pt-BR: 123450 vira "1.234,50", -500 vira "-5,00". */
export function centsToMoneyText(cents: number): string {
  const abs = Math.abs(Math.round(cents));
  const int = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const frac = String(abs % 100).padStart(2, '0');
  return `${cents < 0 && abs !== 0 ? '-' : ''}${int},${frac}`;
}

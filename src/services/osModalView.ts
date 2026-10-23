// Lógica pura da janela da OS: validação por campo e texto de dinheiro. Sem React.
import { Money } from '../utils/helpers';

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

/** Texto de dinheiro: só dígitos, vírgula e ponto (campo de texto no lugar do type=number). */
export function sanitizeMoneyText(raw: string): string {
  return raw.replace(/[^0-9.,]/g, '');
}

/** Texto de preço digitado (aceita vírgula) em centavos; vazio ou inválido = 0. Igual ao parse antigo da janela. */
export function parsePriceText(raw: string): number {
  return Money.fromFloat(parseFloat(raw.replace(',', '.')) || 0);
}

/** Centavos para o campo de texto (reais, vírgula decimal): 1250 vira "12,5". */
export function centsToMoneyText(cents: number): string {
  return String(Money.toFloat(cents)).replace('.', ',');
}

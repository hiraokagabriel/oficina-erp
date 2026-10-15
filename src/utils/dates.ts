// Datas sem deslocamento de fuso. Data só-dia ('YYYY-MM-DD') vira meio-dia LOCAL:
// assim o dia (e o mês) continua o mesmo ao converter para ISO/UTC em fusos brasileiros.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const isDateOnly = (value: string): boolean => DATE_ONLY.test(value);

// 'YYYY-MM-DD' -> Date em meio-dia local.
export const parseDateOnly = (value: string): Date => {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};

// Aceita data só-dia (meio-dia local) ou ISO completo (mantém o instante).
export const parseDateFlexible = (value: string): Date =>
  isDateOnly(value) ? parseDateOnly(value) : new Date(value);

// Converte para ISO: só-dia vira meio-dia local; ISO completo é só normalizado.
export const toISOFromDateInput = (value: string): string =>
  parseDateFlexible(value).toISOString();

// Soma meses com clamp no último dia do mês (31/jan + 1 = 28/fev ou 29/fev; 31/mar + 1 = 30/abr).
// Preserva a hora local.
export const addMonths = (date: Date, months: number): Date => {
  const result = new Date(date.getTime());
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
};

// Data local como 'YYYY-MM-DD'.
export const formatDateOnly = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

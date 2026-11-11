// Datas sem deslocamento de fuso. Data só-dia ('YYYY-MM-DD') vira meio-dia LOCAL:
// assim o dia (e o mês) continua o mesmo ao converter para ISO/UTC em fusos brasileiros.
//
// "Local" é o fuso do runtime (o PC, no app), a não ser que setDateTimeZone fixe outro.
// O servidor (Supabase Edge) roda sempre em UTC e ignora a variável TZ (docs/NUVEM-SPIKE.md seção 2):
// lá a função chama setDateTimeZone(workshops.tz) antes de usar os serviços, e estas funções
// passam a calcular o relógio da oficina por Intl, dando os mesmos instantes que o PC da oficina.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// Relógio de parede: campos de data e hora num fuso (mês de 0 a 11, como Date).
interface Wall { y: number; mo: number; d: number; h: number; mi: number; s: number; ms: number }

// null = fuso local do runtime.
let zoneFormat: Intl.DateTimeFormat | null = null;

// Fixa o fuso das datas (nome IANA, ex.: 'America/Sao_Paulo'); null volta ao fuso local do runtime.
// Nome inválido lança RangeError (do próprio Intl).
// Estado do módulo (vale para o isolate inteiro): no servidor, chame logo antes das funções puras,
// sem `await` no meio, para duas requisições de fusos diferentes não se misturarem.
export const setDateTimeZone = (timeZone: string | null): void => {
  zoneFormat = timeZone
    ? new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    })
    : null;
};

// Fuso em uso (o fixado ou o do runtime).
export const getDateTimeZone = (): string =>
  (zoneFormat ?? Intl.DateTimeFormat()).resolvedOptions().timeZone;

const toWall = (date: Date): Wall => {
  if (!zoneFormat || Number.isNaN(date.getTime())) {
    // Data inválida: os getters dão NaN, como no modo local (o Intl lançaria RangeError).
    return {
      y: date.getFullYear(), mo: date.getMonth(), d: date.getDate(),
      h: date.getHours(), mi: date.getMinutes(), s: date.getSeconds(), ms: date.getMilliseconds(),
    };
  }
  const part: Record<string, number> = {};
  for (const p of zoneFormat.formatToParts(date)) if (p.type !== 'literal') part[p.type] = Number(p.value);
  return {
    y: part.year, mo: part.month - 1, d: part.day, h: part.hour % 24, mi: part.minute, s: part.second,
    ms: date.getUTCMilliseconds(), // deslocamentos de fuso são em minutos inteiros: o milissegundo não muda
  };
};

// Diferença (ms) entre o relógio do fuso e o UTC no instante t.
const offsetAt = (t: number): number => {
  const w = toWall(new Date(t));
  return Date.UTC(w.y, w.mo, w.d, w.h, w.mi, w.s, w.ms) - t;
};

const DAY_MS = 86_400_000;

const sameWall = (a: Wall, b: Wall): boolean =>
  a.y === b.y && a.mo === b.mo && a.d === b.d && a.h === b.h && a.mi === b.mi && a.s === b.s;

// Igual ao Date local: hora repetida (fim do horário de verão) fica com o 1º instante;
// hora inexistente (início) usa o deslocamento de antes da troca, ou seja, avança o relógio.
// Campos fora da faixa (dia 30/fev) são normalizados como no Date.
const fromWall = (w: Wall): Date => {
  if (!zoneFormat) return new Date(w.y, w.mo, w.d, w.h, w.mi, w.s, w.ms);
  const asUtc = Date.UTC(w.y, w.mo, w.d, w.h, w.mi, w.s, w.ms);
  if (Number.isNaN(asUtc)) return new Date(NaN);
  const early = asUtc - offsetAt(asUtc - DAY_MS);
  if (sameWall(toWall(new Date(early)), w)) return new Date(early);
  const late = asUtc - offsetAt(asUtc + DAY_MS);
  if (sameWall(toWall(new Date(late)), w)) return new Date(late);
  return new Date(early);
};

export const isDateOnly = (value: string): boolean => DATE_ONLY.test(value);

// 'YYYY-MM-DD' -> Date em meio-dia local.
export const parseDateOnly = (value: string): Date => {
  const [y, m, d] = value.split('-').map(Number);
  return fromWall({ y, mo: m - 1, d, h: 12, mi: 0, s: 0, ms: 0 });
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
  const w = toWall(date);
  const first = new Date(Date.UTC(w.y, w.mo + months, 1));
  const y = first.getUTCFullYear();
  const mo = first.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  return fromWall({ ...w, y, mo, d: Math.min(w.d, lastDay) });
};

// Data local como 'YYYY-MM-DD'.
export const formatDateOnly = (date: Date): string => {
  const w = toWall(date);
  return `${w.y}-${String(w.mo + 1).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`;
};

// Catálogo de veículos do mercado brasileiro (base FIPE, tipo carros): tipos, parse dos nomes e índice.
// Puro: não lê arquivo nem rede. Quem chama carrega o JSON (ex.: `import('../data/veiculos-br.json')`)
// e passa para `buildIndex`. O JSON é gerado por `npm run vehicles:build` (scripts/build-vehicle-catalog.mjs).

/** Versão como gravada no JSON: [índice da marca, nome FIPE, anos em faixas ('2021,2023-2025'), códigos de combustível FIPE]. */
export type RawVehicleVersion = [number, string, string, string];

export interface RawVehicleCatalog {
  meta?: { source?: string; generatedAt?: string; brands?: number; versions?: number; failures?: number; partial?: boolean; pendingVersions?: number };
  brands: string[];
  versions: RawVehicleVersion[];
}

/** Resultado do parse do nome FIPE (ex.: 'Civic Sedan EXL 2.0 Flex 16V Aut.4p'). */
export interface ParsedVersionName {
  /** Modelo-família, ex.: 'Civic', 'Grand Siena', 'HB20'. */
  family: string;
  /** Restante do nome (acabamento, carroceria, câmbio...). */
  trim: string;
  /** Cilindrada com ponto, ex.: '2.0'. */
  displacement?: string;
  /** Número de válvulas, ex.: 16. */
  valves?: number;
  /** Potência em cv, quando o nome traz. */
  horsepower?: number;
  /** Combustíveis citados no nome (Flex, Gasolina, Diesel, Elétrico, Híbrido). */
  fuels: string[];
}

export interface VehicleVersion extends ParsedVersionName {
  brand: string;
  /** Nome completo como veio da FIPE. */
  detail: string;
  /** Anos-modelo existentes (ordenados, sem o 'zero km'). */
  years: number[];
}

/** Entrada agregada: marca + família + cilindrada + válvulas (acabamentos juntos). */
export interface CatalogEntry {
  id: string;
  brand: string;
  model: string;
  displacement?: string;
  valves?: number;
  years: number[];
  yearSet: ReadonlySet<number>;
  /** Quantidade de versões FIPE agregadas (popularidade). */
  versions: number;
  fuels: string[];
  /** Nomes FIPE completos agregados (amostra). */
  details: string[];
  /** Palavras normalizadas pesquisáveis (marca, família, acabamentos). */
  words: string[];
  /** Palavras normalizadas só da marca e da família. */
  coreWords: string[];
  /** Formas coladas ('hrv', 'landrover') para casar 'hrv' com 'HR-V'. */
  squashed: string[];
  label: string;
}

export interface VehicleCatalog {
  meta: RawVehicleCatalog['meta'];
  brands: string[];
  versions: VehicleVersion[];
  entries: CatalogEntry[];
}

// ---------------------------------------------------------------------------------------------
// Texto

/** Minúsculas, sem acento, sem pontuação; '2,0' vira '2.0'. Espaços colapsados. */
export const normalizeText = (s: string | null | undefined): string =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/(\d)\.o\b/g, '$1.0')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/(^|\s)\.+|\.+(?=\s|$)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

/** Normaliza e cola as palavras ('HR-V' -> 'hrv'). */
export const squashText = (s: string): string => normalizeText(s).replace(/ /g, '');

const formatDisplacement = (d: string | number): string => {
  if (typeof d === 'string') return d.replace(',', '.');
  const r = Math.round(d * 10) / 10;
  return Number.isInteger(r) ? `${r}.0` : String(r);
};

/** Texto final do veículo: MARCA MODELO MOTOR VÁLVULAS ANO ('Honda Civic 2.0 16v 2015'); partes ausentes são omitidas. */
export const formatVehicleLabel = (v: {
  brand?: string;
  model?: string;
  displacement?: string | number;
  valves?: number;
  year?: number;
}): string => {
  const parts: string[] = [];
  if (v.brand) parts.push(v.brand.trim());
  if (v.model) parts.push(v.model.trim());
  if (v.displacement !== undefined && v.displacement !== '') parts.push(formatDisplacement(v.displacement));
  if (v.valves) parts.push(`${v.valves}v`);
  if (v.year) parts.push(String(v.year));
  return parts.filter(Boolean).join(' ');
};

// ---------------------------------------------------------------------------------------------
// Parse do nome FIPE

/** Famílias de várias palavras (chave: palavras normalizadas). Ordem de preferência: a mais longa. */
const MULTI_WORD_FAMILIES: string[] = [
  'grand siena', 'grand livina', 'grand vitara', 'grand cherokee', 'grand caravan', 'grand blazer', 'grand scenic',
  'grand c4 picasso', 'grand santa fe', 'santa fe', 'land cruiser prado', 'land cruiser', 'range rover sport',
  'range rover evoque', 'range rover velar', 'range rover', 'cross fox', 'space fox', 'space cross', 'palio weekend',
  'new beetle', 'new fiesta', 'new civic', 'new fit', 'corolla cross', 'corsa classic', 'duster oroch', 'del rey',
  'hilux sw4', 'eclipse cross', 'pajero sport', 'pajero full', 'pajero tr4', 'discovery sport', 'c4 cactus', 'c4 pallas', 'c4 lounge',
  'c3 aircross', 'c4 picasso', 'xsara picasso', 'mini cooper', 'a3 sportback', 'doblo cargo', 'golf variant',
];

/** Primeira palavra que sempre pede a segunda ('Grand X', 'Santa Fe', 'New X'). */
const PREFIX_WORDS = new Set(['grand', 'santa', 'land', 'range', 'new', 'novo', 'nova']);

/** Segunda palavra que NUNCA estende a família: carroceria, câmbio, portas, motor, número. */
const NOT_FAMILY_EXTENSION = new Set([
  'sedan', 'sed', 'hatch', 'coupe', 'sw', 'wagon', 'cabrio', 'cabriolet', 'conversivel', 'cd', 'cs', 'ce', 'aut',
  'mec', 'flex', 'tb', 'turbo', '4p', '2p', '3p', '5p', '4x4', '4x2', '16v', '8v', 'diesel', 'van', 'pick', 'picape',
  'cabine', 'furgao', 'perua', 'minivan', 'suv', 'gasolina', 'alcool', 'eletrico', 'hibrido',
]);

/** Grafia de exibição de nomes que a FIPE escreve em caixa alta ou diferente. */
const FAMILY_DISPLAY: Record<string, string> = {
  fit: 'Fit', gol: 'Gol', uno: 'Uno', ka: 'Ka', fox: 'Fox', city: 'City', kicks: 'Kicks', s10: 'S10',
  d20: 'D20', a20: 'A20', c10: 'C10', f250: 'F-250', f1000: 'F-1000', f4000: 'F-4000', hrv: 'HR-V', crv: 'CR-V', wrv: 'WR-V',
  tcross: 'T-Cross', up: 'Up!', crossfox: 'Cross Fox', spacefox: 'Space Fox', spacecross: 'Space Cross',
};

const FUEL_BY_CODE: Record<string, string> = { '1': 'Gasolina', '2': 'Álcool', '3': 'Diesel', '4': 'Elétrico', '5': 'Flex', '6': 'Híbrido' };
const VALVE_COUNTS = new Set([4, 6, 8, 12, 16, 20, 24, 32]);

const tokenKey = (t: string): string => squashText(t);

const displayToken = (tok: string): string => {
  // '318i/iA', 'Deville/Eldorado': fica só a primeira variante
  const t = tok.includes('/') && tok.split('/')[0] ? tok.split('/')[0] : tok;
  const alias = FAMILY_DISPLAY[tokenKey(t)];
  if (alias) return alias;
  if (/^[A-ZÀ-Ý]{4,}$/.test(t)) return t.charAt(0) + t.slice(1).toLowerCase();
  return t;
};

/** Correções de grafia da FIPE aplicadas ao nome antes do parse (abreviações e hífens de modelos). */
const NAME_FIXES: Array<[RegExp, string]> = [
  [/^Range R\.\s?(?:EVOQ\.?|EVOQUE)(?![A-Za-z])\.?/i, 'Range Rover Evoque'],
  [/^Range R\.\s?(?:VEL\.?|VELAR)(?![A-Za-z])\.?/i, 'Range Rover Velar'],
  [/^Range R\.\s?/i, 'Range Rover '],
  [/^Classe\s+(?=[A-Za-z]{1,3}\s?\d)/i, ''],
  [/^Discovery Sp\.?(?=\s|$)/i, 'Discovery Sport'],
  [/^(?:Disc|Discov)\.\s?/i, 'Discovery '],
  [/^Defe\.\s?/i, 'Defender '],
  [/^Sprin\.\s?/i, 'Sprinter '],
];

const multiKeys = MULTI_WORD_FAMILIES.map(f => f.split(' ').map(squashText));

/** Quantas palavras iniciais formam a família. */
const familyLength = (tokens: string[]): number => {
  if (tokens.length < 2) return Math.min(1, tokens.length);
  const keys = tokens.slice(0, 3).map(tokenKey);
  let best = 0;
  for (const mk of multiKeys) {
    if (mk.length > keys.length || mk.length <= best) continue;
    if (mk.every((k, i) => k === keys[i])) best = mk.length;
  }
  if (best) return best;
  const [t1, t2] = tokens;
  const k2 = tokenKey(t2);
  if (PREFIX_WORDS.has(normalizeText(t1)) && /^[a-z]/.test(k2) && !NOT_FAMILY_EXTENSION.has(k2)) return 2;
  // 'A 200', 'C 180', 'SLK 230' (Mercedes): letras + número solto de 2 a 3 dígitos
  if (/^[A-Za-z]{1,4}$/.test(t1) && /^\d{2,3}$/.test(t2) && !/^(up|fit|ka|uno|gol|fox|city)$/i.test(t1)) return 2;
  return 1;
};

/** Cilindrada: 'd.d' (aceita vírgula e '2.O' com letra O), fora de 'cv'. Também '1000/1600/1800/2000' soltos. */
const parseDisplacement = (s: string): string | undefined => {
  const m = /(?<![\d,/])(?<!\d\.)(\d)[.,]([\dOo])(?![\d])/.exec(s.replace(/\d{2,4}\s?cv\b/gi, ' '));
  if (m) {
    const d = `${m[1]}.${m[2].toUpperCase() === 'O' ? '0' : m[2]}`;
    const n = Number(d);
    if (n >= 0.6 && n <= 8.5) return d;
  }
  const k = /(?<![\d.,])(1000|1300|1400|1500|1600|1800|2000)(?![\d.,])/.exec(s);
  if (k) return `${Number(k[1]) / 1000}`.replace(/^(\d)$/, '$1.0');
  return undefined;
};

const parseValves = (s: string): number | undefined => {
  const m = /(?<![\d.,])(\d{1,2})\s?[Vv]\b(?!\d)/.exec(s);
  if (!m) return undefined;
  const n = Number(m[1]);
  return VALVE_COUNTS.has(n) ? n : undefined;
};

const parseFuels = (s: string): string[] => {
  const out: string[] = [];
  if (/flex|bicombust/i.test(s)) out.push('Flex');
  if (/diesel|\btdi\b|\bcrdi\b|\bhdi\b|\bmultijet\b|\bjtd\b/i.test(s)) out.push('Diesel');
  if (/el[eé]tric/i.test(s)) out.push('Elétrico');
  if (/h[ií]brid|hybrid/i.test(s)) out.push('Híbrido');
  if (/gasolina/i.test(s)) out.push('Gasolina');
  return out;
};

/** Separa um nome de versão FIPE (sem a marca) em campos estruturados. `brand` só serve para descartar a marca repetida no começo. */
export const parseVersionName = (name: string, brand = ''): ParsedVersionName => {
  let clean = name.replace(/\s+/g, ' ').trim();
  for (const [re, to] of NAME_FIXES) {
    if (re.test(clean)) { clean = clean.replace(re, to).trim(); break; }
  }
  // Mercedes escreve 'C-180', 'SLK-320', 'CLS-500': vira 'C 180'.
  if (/mercedes/i.test(brand)) clean = clean.replace(/^([A-Za-z]{1,4})-(\d{2,3})\b/, '$1 $2');
  let tokens = clean.split(' ');
  const brandTokens = normalizeText(brand).split(' ').filter(Boolean);
  if (
    brandTokens.length > 0 && tokens.length > brandTokens.length &&
    brandTokens.every((b, i) => normalizeText(tokens[i]) === b)
  ) tokens = tokens.slice(brandTokens.length);

  const n = familyLength(tokens);
  const family = tokens.slice(0, n).map(displayToken).join(' ');
  const trim = tokens.slice(n).join(' ');
  const cv = /(\d{2,4})\s?cv\b/i.exec(clean);
  return {
    family,
    trim,
    displacement: parseDisplacement(clean),
    valves: parseValves(clean),
    horsepower: cv ? Number(cv[1]) : undefined,
    fuels: parseFuels(clean),
  };
};

/** '2021,2023-2025' -> [2021, 2023, 2024, 2025] */
export const parseYearRanges = (s: string): number[] => {
  const out: number[] = [];
  for (const part of s.split(',')) {
    const m = /^(\d{4})(?:-(\d{4}))?$/.exec(part.trim());
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let y = a; y <= b && y - a < 200; y++) out.push(y);
  }
  return out;
};

// ---------------------------------------------------------------------------------------------
// Índice

const wordsOf = (s: string): string[] => normalizeText(s).split(' ').filter(Boolean);

/** Monta o índice (versões parseadas + entradas agregadas) a partir do JSON bruto. */
export const buildIndex = (raw: RawVehicleCatalog): VehicleCatalog => {
  const versions: VehicleVersion[] = [];
  for (const [bi, name, yearsStr, codes] of raw.versions) {
    const brand = raw.brands[bi];
    if (!brand || !name) continue;
    const years = parseYearRanges(yearsStr);
    if (years.length === 0) continue;
    const parsed = parseVersionName(name, brand);
    const fuels = new Set(parsed.fuels);
    for (const c of codes ?? '') if (FUEL_BY_CODE[c]) fuels.add(FUEL_BY_CODE[c]);
    versions.push({ ...parsed, fuels: [...fuels], brand, detail: name, years });
  }

  interface Acc {
    brand: string; model: string; displacement?: string; valves?: number;
    years: Set<number>; versions: number; fuels: Set<string>; details: string[]; trimWords: Set<string>;
  }
  const groups = new Map<string, Acc>();
  for (const v of versions) {
    const key = `${normalizeText(v.brand)}|${squashText(v.family)}|${v.displacement ?? ''}|${v.valves ?? ''}`;
    let g = groups.get(key);
    if (!g) {
      g = { brand: v.brand, model: v.family, displacement: v.displacement, valves: v.valves,
        years: new Set(), versions: 0, fuels: new Set(), details: [], trimWords: new Set() };
      groups.set(key, g);
    }
    g.versions++;
    for (const y of v.years) g.years.add(y);
    for (const f of v.fuels) g.fuels.add(f);
    for (const w of wordsOf(v.trim)) g.trimWords.add(w);
    if (g.details.length < 12) g.details.push(v.detail);
  }

  // Descarta entradas sem válvulas (ou sem cilindrada) quando irmãs mais completas já cobrem todos os anos delas.
  const byFamily = new Map<string, Acc[]>();
  for (const g of groups.values()) {
    const fk = `${normalizeText(g.brand)}|${squashText(g.model)}`;
    (byFamily.get(fk) ?? byFamily.set(fk, []).get(fk)!).push(g);
  }
  const dropped = new Set<Acc>();
  for (const list of byFamily.values()) {
    for (const g of list) {
      if (g.valves !== undefined && g.displacement !== undefined) continue;
      const sibs = list.filter(o => o !== g && (g.displacement === undefined
        ? o.displacement !== undefined
        : o.displacement === g.displacement && o.valves !== undefined));
      if (sibs.length === 0) continue;
      const covered = new Set<number>();
      for (const s of sibs) for (const y of s.years) covered.add(y);
      if ([...g.years].every(y => covered.has(y))) dropped.add(g);
    }
  }

  const entries: CatalogEntry[] = [];
  for (const g of groups.values()) {
    if (dropped.has(g)) continue;
    const years = [...g.years].sort((a, b) => a - b);
    const core = [...wordsOf(g.brand), ...wordsOf(g.model)];
    const words = [...new Set([...core, ...g.trimWords])];
    entries.push({
      id: `${entries.length}`,
      brand: g.brand,
      model: g.model,
      displacement: g.displacement,
      valves: g.valves,
      years,
      yearSet: new Set(years),
      versions: g.versions,
      fuels: [...g.fuels],
      details: g.details,
      words,
      coreWords: [...new Set(core)],
      squashed: [...new Set([squashText(g.brand), squashText(g.model)])],
      label: formatVehicleLabel({ brand: g.brand, model: g.model, displacement: g.displacement, valves: g.valves }),
    });
  }
  return { meta: raw.meta, brands: raw.brands, versions, entries };
};

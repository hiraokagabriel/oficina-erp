// Busca de veículos em qualquer ordem de palavras, histórico da oficina e agrupamento de sugestões.
// Puro: recebe o índice de `buildIndex` (vehicleCatalog.ts). Sem interface nesta camada.
import type { Client, WorkOrder, Vehicle } from '../types';
import { splitVehicle } from '../utils/links';
import { formatVehicleLabel, normalizeText, squashText, type CatalogEntry, type VehicleCatalog } from './vehicleCatalog';

// ---------------------------------------------------------------------------------------------
// Consulta

/** Sinônimos de marca digitados no balcão. */
const BRAND_SYNONYMS: Record<string, string> = {
  vw: 'volkswagen', volks: 'volkswagen', gm: 'chevrolet', chevy: 'chevrolet', mb: 'mercedes', merc: 'mercedes',
  mercedez: 'mercedes', bmw: 'bmw', citroen: 'citroen', mmc: 'mitsubishi', ferrari: 'ferrari',
};
const LOOSE_VALVE_NUMBERS = new Set([8, 12, 16, 20, 24]);
const MIN_YEAR = 1950;
const MAX_YEAR = 2049;

interface ParsedQuery {
  words: string[];
  displacement?: string;
  valves?: number;
  /** Números de 4 dígitos: ano-modelo OU parte de um nome ('2008' do Peugeot). */
  yearTokens: number[];
  empty: boolean;
}

const parseQuery = (query: string): ParsedQuery => {
  let q = normalizeText(query);
  let valves: number | undefined;
  let displacement: string | undefined;

  const mv = /(?<![\d.])(\d{1,2}) ?v(?![a-z0-9])/.exec(q);
  if (mv) { valves = Number(mv[1]); q = q.replace(mv[0], ' '); }
  const md = /(?<![\d.])(\d\.\d)(?![\d])/.exec(q);
  if (md) { displacement = md[1]; q = q.replace(md[0], ' '); }

  const raw = q.split(' ').filter(Boolean);
  const words: string[] = [];
  const yearTokens: number[] = [];
  for (const t of raw) {
    if (/^\d{4}$/.test(t) && Number(t) >= MIN_YEAR && Number(t) <= MAX_YEAR) { yearTokens.push(Number(t)); continue; }
    if (valves === undefined && raw.length > 1 && /^\d{1,2}$/.test(t) && LOOSE_VALVE_NUMBERS.has(Number(t))) { valves = Number(t); continue; }
    words.push(BRAND_SYNONYMS[t] ?? t);
  }
  return { words, displacement, valves, yearTokens, empty: !words.length && !yearTokens.length && !displacement && valves === undefined };
};

const editDistanceAtMost1 = (a: string, b: string): boolean => {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true; // troca
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); // transposição
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
};

let fuzzyIndex: VehicleCatalog | null = null;
let fuzzyDistinct: string[] = [];
const fuzzyMemo = new Map<string, Set<string>>();

/** Palavras do catálogo (marca/família) a 1 erro de digitação do prefixo digitado; calculado uma vez por termo e índice. */
const fuzzyWords = (t: string): Set<string> => {
  const hit = fuzzyMemo.get(t);
  if (hit) return hit;
  const out = new Set<string>();
  for (const w of fuzzyDistinct) {
    if (w[0] !== t[0] || w.length < t.length - 1) continue;
    if (editDistanceAtMost1(t, w.slice(0, t.length)) || editDistanceAtMost1(t, w.slice(0, t.length - 1)) || editDistanceAtMost1(t, w.slice(0, t.length + 1))) out.add(w);
  }
  fuzzyMemo.set(t, out);
  return out;
};

const prepareFuzzy = (index: VehicleCatalog) => {
  if (fuzzyIndex === index) return;
  fuzzyIndex = index;
  fuzzyMemo.clear();
  const d = new Set<string>();
  for (const e of index.entries) for (const w of e.coreWords) d.add(w);
  fuzzyDistinct = [...d];
};

/** Pontuação de uma palavra da consulta contra a entrada (0 = não casa). */
const scoreWord = (t: string, e: CatalogEntry, fuzzy: boolean): number => {
  let best = 0;
  const core = e.coreWords;
  for (let i = 0; i < core.length; i++) {
    const w = core[i];
    if (w === t) return 4;
    if (w.startsWith(t)) best = Math.max(best, 3);
  }
  for (let i = 0; i < e.squashed.length; i++) if (t.length >= 2 && e.squashed[i].startsWith(t)) best = Math.max(best, 3);
  if (best) return best;
  const words = e.words;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w === t) best = Math.max(best, 2);
    else if (w.startsWith(t)) best = Math.max(best, 1.5);
  }
  if (best || !fuzzy || t.length < 4 || !/^[a-z]+$/.test(t)) return best;
  const near = fuzzyWords(t);
  for (let i = 0; i < core.length; i++) if (near.has(core[i])) return 1;
  return 0;
};

export interface VehicleSearchResult {
  brand: string;
  model: string;
  displacement?: string;
  valves?: number;
  /** Anos-modelo existentes para esta entrada. */
  years: number[];
  /** Ano digitado e casado (já incluído no label). */
  year?: number;
  label: string;
  /** Um nome completo da FIPE (versão), p.ex. 'Civic Sedan EXL 2.0 Flex 16V Aut.4p'. */
  detail: string;
  details: string[];
  score: number;
  /** true se algum termo só casou por tolerância a erro de digitação. */
  fuzzy: boolean;
}

interface Candidate { e: CatalogEntry; score: number; year?: number; fuzzy: boolean }

const searchPass = (index: VehicleCatalog, pq: ParsedQuery, fuzzy: boolean): Candidate[] => {
  const out: Candidate[] = [];
  for (const e of index.entries) {
    if (pq.displacement && e.displacement !== pq.displacement) continue;
    if (pq.valves !== undefined && e.valves !== pq.valves) continue;
    let score = 0;
    let usedFuzzy = false;
    let ok = true;
    for (const t of pq.words) {
      let s = scoreWord(t, e, false);
      if (!s && fuzzy) { s = scoreWord(t, e, true); if (s) usedFuzzy = true; }
      if (!s) { ok = false; break; }
      score += s;
    }
    if (!ok) continue;
    let year: number | undefined;
    for (const y of pq.yearTokens) {
      if (e.yearSet.has(y)) { score += 1; year ??= y; continue; }
      // não é ano desta entrada: pode ser parte do nome ('2008' do Peugeot)
      const asWord = scoreWord(String(y), e, false);
      if (asWord) { score += asWord; continue; }
      ok = false; break;
    }
    if (!ok) continue;
    if (pq.displacement) score += 1;
    if (pq.valves !== undefined) score += 1;
    out.push({ e, score, year, fuzzy: usedFuzzy });
  }
  return out;
};

const rank = (a: Candidate, b: Candidate): number =>
  b.score - a.score || b.e.versions - a.e.versions || b.e.years.length - a.e.years.length ||
  (a.e.label < b.e.label ? -1 : a.e.label > b.e.label ? 1 : 0);

/** Os `k` melhores em ordem, sem ordenar tudo (a consulta só por ano casa milhares de entradas). */
const topK = (list: Candidate[], k: number): Candidate[] => {
  if (k <= 0) return [];
  const top: Candidate[] = [];
  for (const c of list) {
    if (top.length === k && rank(c, top[k - 1]) >= 0) continue;
    let i = top.length;
    while (i > 0 && rank(c, top[i - 1]) < 0) i--;
    top.splice(i, 0, c);
    if (top.length > k) top.pop();
  }
  return top;
};

/**
 * Busca por tokens em qualquer ordem (todos precisam casar): ano, cilindrada, válvulas e palavras (prefixo em marca,
 * família e acabamento, sem acento, com sinônimos de marca). Sem resultado exato, tenta tolerar 1 erro de digitação
 * (palavras com 4+ letras, mesma primeira letra). Resultados agregados por marca+modelo+cilindrada+válvulas.
 * Ordem: pontuação (exato > prefixo), depois popularidade (nº de versões, nº de anos).
 */
export const searchVehicles = (index: VehicleCatalog, query: string, opts: { limit?: number } = {}): VehicleSearchResult[] => {
  const limit = opts.limit ?? 20;
  const pq = parseQuery(query);
  if (pq.empty) return [];
  let res = searchPass(index, pq, false);
  if (res.length === 0 && pq.words.some(w => w.length >= 4)) { prepareFuzzy(index); res = searchPass(index, pq, true); }
  return topK(res, limit).map(({ e, score, year, fuzzy }) => ({
    brand: e.brand, model: e.model, displacement: e.displacement, valves: e.valves, years: e.years, year,
    label: year ? formatVehicleLabel({ brand: e.brand, model: e.model, displacement: e.displacement, valves: e.valves, year }) : e.label,
    detail: e.details[0] ?? e.label, details: e.details, score, fuzzy,
  }));
};

/** Melhor entrada só quando é inequívoca (para o Enter): casamento sem erro de digitação e pontuação estritamente maior que a 2ª. */
export const bestMatch = (index: VehicleCatalog, query: string): VehicleSearchResult | null => {
  const res = searchVehicles(index, query, { limit: 2 });
  if (res.length === 0) return null;
  const [a, b] = res;
  if (a.fuzzy || a.score <= 0) return null;
  if (!b) return a;
  return a.score > b.score ? a : null;
};

// ---------------------------------------------------------------------------------------------
// Histórico da oficina

export interface ShopVehicle {
  /** Texto como foi digitado (primeira grafia vista). */
  text: string;
  norm: string;
  count: number;
}

/** Veículos já usados na oficina (modelos do cadastro de clientes e das OS, sem a placa), sem repetição e com contagem. */
export const collectShopVehicles = (
  clients: ReadonlyArray<Pick<Client, 'vehicles'>>,
  workOrders: ReadonlyArray<Pick<WorkOrder, 'vehicle'>>
): ShopVehicle[] => {
  const map = new Map<string, ShopVehicle>();
  const add = (raw: string | undefined | null) => {
    const text = (raw ?? '').trim();
    const norm = normalizeText(text);
    if (!norm) return;
    const cur = map.get(norm);
    if (cur) cur.count++;
    else map.set(norm, { text, norm, count: 1 });
  };
  for (const c of clients) for (const v of c.vehicles ?? []) add(v.model);
  for (const o of workOrders) add(splitVehicle(o.vehicle).model);
  return [...map.values()].sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, 'pt-BR'));
};

// ---------------------------------------------------------------------------------------------
// Sugestões agrupadas

export type SuggestionSource = 'cliente' | 'oficina' | 'base';

export interface VehicleSuggestion {
  label: string;
  source: SuggestionSource;
  /** Texto a gravar na OS (sem a placa). */
  vehicleText: string;
  /** Só para veículo do cliente. */
  plate?: string;
  /** Só para a base: anos existentes. */
  years?: number[];
  /** Só para a base: ano já definido (digitado na busca ou escolhido no seletor de anos). */
  year?: number;
  /** Só para a oficina: vezes usado. */
  count?: number;
}

export interface VehicleSuggestionGroup {
  id: 'cliente' | 'oficina' | 'base';
  title: string;
  items: VehicleSuggestion[];
}

const queryTokens = (query: string): string[] =>
  normalizeText(query).replace(/(\d{1,2}) v(?![a-z0-9])/g, '$1v').split(' ').filter(Boolean).map(t => BRAND_SYNONYMS[t] ?? t);

/** Todos os termos casam (prefixo de palavra, ou trecho colado) no texto. */
const textMatches = (text: string, tokens: string[]): boolean => {
  const norm = normalizeText(text);
  const words = norm.split(' ');
  const squashed = squashText(text);
  return tokens.every(t => words.some(w => w.startsWith(t)) || (t.length >= 3 && squashed.includes(t)));
};

export interface SuggestionInput {
  query: string;
  clientVehicles?: ReadonlyArray<Pick<Vehicle, 'model' | 'plate'>>;
  shopVehicles?: ReadonlyArray<ShopVehicle>;
  index?: VehicleCatalog | null;
  /** Máximo de itens por grupo da oficina e da base (padrão 8). Os do cliente vêm todos. */
  limit?: number;
}

/**
 * Grupos na ordem: Veículos do cliente (todos se a consulta estiver vazia; filtrados se houver consulta), Já cadastrados
 * na oficina, Base brasileira. Sem repetir o mesmo veículo entre grupos. Consulta vazia mostra só o grupo do cliente.
 */
export const buildVehicleSuggestions = ({ query, clientVehicles = [], shopVehicles = [], index, limit = 8 }: SuggestionInput): VehicleSuggestionGroup[] => {
  const tokens = queryTokens(query);
  const hasQuery = tokens.length > 0;
  const seen = new Set<string>();
  const groups: VehicleSuggestionGroup[] = [];

  const mine: VehicleSuggestion[] = [];
  for (const v of clientVehicles) {
    const model = (v.model ?? '').trim();
    if (!model) continue;
    if (hasQuery && !textMatches(`${model} ${v.plate ?? ''}`, tokens)) continue;
    const key = `${normalizeText(model)}|${normalizeText(v.plate ?? '')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    mine.push({ label: v.plate ? `${model} - ${v.plate}` : model, source: 'cliente', vehicleText: model, plate: v.plate || undefined });
  }
  if (mine.length) groups.push({ id: 'cliente', title: 'Veículos do cliente', items: mine });
  if (!hasQuery) return groups;

  const clientNorms = new Set(mine.map(m => normalizeText(m.vehicleText)));
  const shop: VehicleSuggestion[] = [];
  for (const s of shopVehicles) {
    if (shop.length >= limit) break;
    if (clientNorms.has(s.norm) || seen.has(s.norm)) continue;
    if (!textMatches(s.text, tokens)) continue;
    seen.add(s.norm);
    shop.push({ label: s.text, source: 'oficina', vehicleText: s.text, count: s.count });
  }
  if (shop.length) groups.push({ id: 'oficina', title: 'Já cadastrados na oficina', items: shop });

  if (index) {
    const base: VehicleSuggestion[] = [];
    for (const r of searchVehicles(index, query, { limit: limit * 3 })) {
      if (base.length >= limit) break;
      const norm = normalizeText(r.label);
      if (seen.has(norm) || clientNorms.has(norm)) continue;
      seen.add(norm);
      base.push({ label: r.label, source: 'base', vehicleText: r.label, years: r.years, year: r.year });
    }
    if (base.length) groups.push({ id: 'base', title: 'Base brasileira', items: base });
  }
  return groups;
};

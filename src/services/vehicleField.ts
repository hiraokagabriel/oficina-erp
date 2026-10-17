// Regras puras do campo de veículo (VehicleCombobox): montagem do valor com placa, lista plana de opções,
// destaque do texto casado, decisão do Enter e texto da atribuição da base. Sem React e sem I/O.
import { splitVehicle } from '../utils/links';
import { normalizeText, squashText, type RawVehicleCatalog, type VehicleCatalog } from './vehicleCatalog';
import { bestMatch, type VehicleSuggestion, type VehicleSuggestionGroup } from './vehicleSearch';

/** "modelo - PLACA" (ou só o modelo, sem placa). */
export const joinVehicleValue = (model: string, plate: string): string => {
  const m = model.trim();
  const p = plate.trim();
  return p ? `${m} - ${p}` : m;
};

/**
 * Valor do campo depois de escolher uma sugestão. Campo com placa embutida: preserva a placa já digitada.
 * Veículo do cliente traz a própria placa, exceto quando a placa do campo foi digitada à mão
 * (não é a de nenhum veículo do cliente, em `knownPlates`).
 */
export const valueAfterPick = (current: string, s: VehicleSuggestion, plateAware: boolean, knownPlates: ReadonlyArray<string> = []): string => {
  if (!plateAware) return s.vehicleText;
  const typed = splitVehicle(current).plate.trim();
  if (s.source === 'cliente') {
    const known = new Set(knownPlates.map(normalizeText));
    const keepTyped = typed !== '' && !known.has(normalizeText(typed));
    return joinVehicleValue(s.vehicleText, keepTyped ? typed : s.plate ?? '');
  }
  return joinVehicleValue(s.vehicleText, typed);
};

/** Troca só o modelo do valor "modelo - PLACA", mantendo a placa. */
export const replaceModelKeepingPlate = (current: string, model: string): string =>
  joinVehicleValue(model, splitVehicle(current).plate);

/** Parte do campo usada na busca: o modelo (sem a placa) quando a placa vive no mesmo texto. */
export const queryOf = (value: string, plateAware: boolean): string => (plateAware ? splitVehicle(value).model : value);

export interface FlatOption {
  suggestion: VehicleSuggestion;
  groupId: VehicleSuggestionGroup['id'];
  /** Posição na lista plana (índice do aria-activedescendant). */
  index: number;
}

export interface LimitedGroup {
  id: VehicleSuggestionGroup['id'];
  title: string;
  options: FlatOption[];
}

/** Limita o total de itens visíveis (grupos na ordem; grupo que fica vazio some) e numera as opções em sequência. */
export const limitGroups = (groups: ReadonlyArray<VehicleSuggestionGroup>, maxItems: number): LimitedGroup[] => {
  const out: LimitedGroup[] = [];
  let n = 0;
  for (const g of groups) {
    const room = maxItems - n;
    if (room <= 0) break;
    const options = g.items.slice(0, room).map((suggestion): FlatOption => ({ suggestion, groupId: g.id, index: n++ }));
    if (options.length) out.push({ id: g.id, title: g.title, options });
  }
  return out;
};

export const flattenOptions = (groups: ReadonlyArray<LimitedGroup>): FlatOption[] => groups.flatMap(g => g.options);

export interface TextPart { text: string; match: boolean }

/** Divide o rótulo em trechos para destacar o que o texto digitado casou (prefixo de palavra, sem acento). */
export const highlightParts = (label: string, query: string): TextPart[] => {
  const tokens = normalizeText(query).replace(/(\d{1,2}) v(?![a-z0-9])/g, '$1v').split(' ').filter(Boolean);
  if (!tokens.length || !label) return [{ text: label, match: false }];
  const parts: TextPart[] = [];
  const push = (text: string, match: boolean) => {
    if (!text) return;
    const last = parts[parts.length - 1];
    if (last && last.match === match) last.text += text;
    else parts.push({ text, match });
  };
  const re = /\S+/g;
  let pos = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(label)) !== null) {
    push(label.slice(pos, m.index), false);
    const word = m[0];
    const nw = normalizeText(word);
    const squashed = squashText(word);
    let len = 0;
    for (const t of tokens) {
      if (nw.startsWith(t) || squashed.startsWith(t)) len = Math.max(len, Math.min(word.length, t.length));
    }
    push(word.slice(0, len), true);
    push(word.slice(len), false);
    pos = m.index + word.length;
  }
  push(label.slice(pos), false);
  return parts;
};

export type EnterDecision =
  | { kind: 'pick'; suggestion: VehicleSuggestion }
  | { kind: 'label'; label: string }
  | { kind: 'keep' };

/**
 * Enter: sugestão destacada seleciona; sem destaque, usa o melhor casamento da base só quando é inequívoco
 * (`bestMatch`); senão mantém o texto digitado como veículo novo.
 */
export const decideEnter = (options: ReadonlyArray<FlatOption>, activeIndex: number, query: string, index: VehicleCatalog | null): EnterDecision => {
  const active = options[activeIndex];
  if (active) return { kind: 'pick', suggestion: active.suggestion };
  if (index && query.trim()) {
    const best = bestMatch(index, query);
    if (best) return { kind: 'label', label: best.label };
  }
  return { kind: 'keep' };
};

/** Linhas da atribuição da base na Configuração. */
export const describeCatalog = (meta: RawVehicleCatalog['meta'] | undefined): { details: string[]; warning?: string } => {
  const details: string[] = [];
  if (meta?.generatedAt) {
    const d = new Date(meta.generatedAt);
    if (!Number.isNaN(d.getTime())) details.push(`Gerada em ${d.toLocaleDateString('pt-BR')}`);
  }
  if (meta?.brands) details.push(`${meta.brands} marcas`);
  if (meta?.versions) details.push(`${meta.versions} versões`);
  return { details, warning: meta?.partial ? 'Base parcial: algumas marcas ainda não incluídas.' : undefined };
};

// ---------------------------------------------------------------------------------------------
// Segundo passo: escolha do ano da versão

/** Anos distintos, do mais novo ao mais antigo; ignora valores que não são ano de 4 dígitos (ex.: zero km). */
export const listYearsDesc = (years: ReadonlyArray<number> | undefined): number[] =>
  [...new Set((years ?? []).filter(y => Number.isInteger(y) && y >= 1000 && y <= 9999))].sort((a, b) => b - a);

/** Texto com o ano no fim; sem ano devolve o texto como está. */
export const labelWithYear = (label: string, year?: number): string => (year ? `${label} ${year}` : label);

/** Mesma sugestão com o ano escolhido (ou sem ano). */
export const suggestionWithYear = (s: VehicleSuggestion, year?: number): VehicleSuggestion =>
  year ? { ...s, label: labelWithYear(s.label, year), vehicleText: labelWithYear(s.vehicleText, year), year } : s;

export type PickResolution =
  | { kind: 'direct'; suggestion: VehicleSuggestion }
  | { kind: 'years'; suggestion: VehicleSuggestion; years: number[] };

/**
 * O que fazer ao escolher uma sugestão: só versão da base sem ano definido e com mais de um ano possível abre o seletor
 * de anos. Ano já digitado, texto pronto (cliente, oficina) ou versão de ano único preenchem direto.
 */
export const resolvePick = (s: VehicleSuggestion): PickResolution => {
  if (s.source !== 'base' || s.year) return { kind: 'direct', suggestion: s };
  const years = listYearsDesc(s.years);
  if (years.length === 0) return { kind: 'direct', suggestion: s };
  if (years.length === 1) return { kind: 'direct', suggestion: suggestionWithYear(s, years[0]) };
  return { kind: 'years', suggestion: s, years };
};

import { vehicleParts } from '../utils/links';
import { normalizeText, squashText } from './vehicleCatalog';

// Extração PURA de marca, modelo, ano, motor e válvulas do texto livre da OS ("VW Gol 1.0 8V 2012 - ABC1D23").
// Regra: nunca inventar. O que não for reconhecido fica vazio; sem marca nem modelo, o rótulo é o texto original.

export interface VehicleInfo {
  /** Texto original da OS (sem espaços nas pontas). */
  raw: string;
  plate: string;
  /** Marca reconhecida (grafia padrão) ou ''. */
  brand: string;
  /** O que sobra do texto depois de tirar marca, ano, motor, válvulas e placa. */
  model: string;
  year?: number;
  /** Cilindrada com ponto, ex.: "1.0". '' se ausente. */
  engine: string;
  valves?: number;
  /** "Marca Modelo Ano Motor Válvulas"; partes ausentes são omitidas. Sem marca e sem modelo: o texto original. */
  label: string;
  /** Chave de igualdade do carro (marca + modelo + ano + motor + válvulas), sem caixa nem acento. */
  key: string;
}

export const NO_VEHICLE_LABEL = 'Veículo não informado';

const BRANDS: Record<string, string> = {
  vw: 'VW', volkswagen: 'VW',
  gm: 'Chevrolet', chevrolet: 'Chevrolet', chevy: 'Chevrolet',
  fiat: 'Fiat', ford: 'Ford', honda: 'Honda', toyota: 'Toyota', hyundai: 'Hyundai', renault: 'Renault',
  peugeot: 'Peugeot', citroen: 'Citroën', nissan: 'Nissan', jeep: 'Jeep', mitsubishi: 'Mitsubishi', kia: 'Kia',
  bmw: 'BMW', mercedes: 'Mercedes-Benz', mercedesbenz: 'Mercedes-Benz', mb: 'Mercedes-Benz',
  audi: 'Audi', volvo: 'Volvo', suzuki: 'Suzuki', landrover: 'Land Rover', mini: 'Mini', chery: 'Chery',
  caoachery: 'Caoa Chery', jac: 'JAC', troller: 'Troller', subaru: 'Subaru', lifan: 'Lifan', ram: 'Ram',
  dodge: 'Dodge', chrysler: 'Chrysler', lexus: 'Lexus', porsche: 'Porsche', ssangyong: 'SsangYong',
  effa: 'Effa', daihatsu: 'Daihatsu', iveco: 'Iveco', agrale: 'Agrale', asia: 'Asia',
};

const VALVE_COUNTS = new Set([4, 6, 8, 12, 16, 20, 24, 32]);
const YEAR_PAIR_RE = /(?<![\d.,/])((?:19[5-9]|20[0-4])\d)\s?\/\s?((?:19[5-9]|20[0-4])\d)(?![\d.,])/;
const YEAR_RE = /(?<![\d.,/])(?:19[5-9]|20[0-4])\d(?![\d.,/])/g;
const VALVES_RE = /(?<![\d.,])(\d{1,2})\s?[Vv]\b(?!\d)/;
const ENGINE_RE = /(?<![\d.,])([1-8])[.,](\d)(?![\d])/;

const cut = (text: string, index: number, length: number): string =>
  `${text.slice(0, index)} ${text.slice(index + length)}`;

const tidy = (s: string): string => s.replace(/\s+/g, ' ').replace(/^[\s\-–,/]+|[\s\-–,/]+$/g, '').trim();

function takeBrand(text: string): { brand: string; rest: string } {
  const tokens = text.split(' ').filter(Boolean);
  for (const n of [2, 1]) {
    if (tokens.length < n) continue;
    const hit = BRANDS[squashText(tokens.slice(0, n).join(' '))];
    if (hit) return { brand: hit, rest: tokens.slice(n).join(' ') };
  }
  return { brand: '', rest: text };
}

/** Extrai os dados do carro do texto livre da OS. Nunca devolve "undefined" nem inventa campos. */
export function extractVehicleInfo(vehicle: string | undefined | null): VehicleInfo {
  const raw = (vehicle ?? '').trim();
  const { model: modelText, plate } = vehicleParts(raw);
  let text = modelText;

  let year: number | undefined;
  const pair = YEAR_PAIR_RE.exec(text);
  if (pair && pair.index !== undefined) {
    year = Number(pair[2]); // "2012/2013": vale o ano do modelo
    text = cut(text, pair.index, pair[0].length);
  } else {
    const all = [...text.matchAll(YEAR_RE)];
    const last = all[all.length - 1];
    if (last && last.index !== undefined) {
      year = Number(last[0]);
      text = cut(text, last.index, last[0].length);
    }
  }

  let valves: number | undefined;
  const v = VALVES_RE.exec(text);
  if (v && v.index !== undefined && VALVE_COUNTS.has(Number(v[1]))) {
    valves = Number(v[1]);
    text = cut(text, v.index, v[0].length);
  }

  let engine = '';
  const e = ENGINE_RE.exec(text);
  if (e && e.index !== undefined) {
    const n = Number(`${e[1]}.${e[2]}`);
    if (n >= 0.6 && n <= 8.5) {
      engine = `${e[1]}.${e[2]}`;
      text = cut(text, e.index, e[0].length);
    }
  }

  const { brand, rest } = takeBrand(tidy(text));
  const model = tidy(rest);

  const parts = [brand, model, year ? String(year) : '', engine, valves ? `${valves}V` : ''].filter(Boolean);
  const label = brand || model ? parts.join(' ') : (modelText.trim() || raw || NO_VEHICLE_LABEL);

  const key = brand || model
    ? [squashText(brand), squashText(model), year ?? '', engine, valves ?? ''].join('|')
    : `raw:${normalizeText(raw)}`;

  return { raw, plate, brand, model, year, engine, valves, label, key };
}

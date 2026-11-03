import { PART_CATEGORY_META } from '../types';
import type { OSStatus, PartCategory, WorkOrder } from '../types';
import { normalizeText } from './vehicleCatalog';
import { extractVehicleInfo } from './vehicleInfo';
import type { VehicleInfo } from './vehicleInfo';

// Lista "Peças a comprar" (impressão): lógica PURA. A tela escolhe as peças; aqui se agrupa e ordena.

export type PartsStatusFilter = 'ALL' | 'ORCAMENTO' | 'APROVADO';

/** Situações que a tela considera. */
export const PARTS_STATUSES: readonly OSStatus[] = ['ORCAMENTO', 'APROVADO'];

/** Sequência lógica do fluxo; o que não estiver aqui vai por último. */
const STATUS_FLOW: readonly OSStatus[] = ['ORCAMENTO', 'APROVADO', 'EM_SERVICO', 'AGUARDANDO_PAGAMENTO', 'FINALIZADO', 'ARQUIVADO'];

export const statusRank = (s: OSStatus): number => {
  const i = STATUS_FLOW.indexOf(s);
  return i < 0 ? STATUS_FLOW.length : i;
};

/** OS que entram na lista conforme o filtro da tela. */
export function filterOrdersForParts(orders: readonly WorkOrder[], filter: PartsStatusFilter): WorkOrder[] {
  return orders.filter(os => (filter === 'ALL' ? PARTS_STATUSES.includes(os.status) : os.status === filter));
}

export interface PartsSortKey {
  status: OSStatus;
  osNumber: number;
  year?: number;
}

/** Situação (fluxo) > número da OS (crescente) > ano do carro (mais novo primeiro; sem ano por último). */
export function comparePartsOrder(a: PartsSortKey, b: PartsSortKey): number {
  const s = statusRank(a.status) - statusRank(b.status);
  if (s !== 0) return s;
  if (a.osNumber !== b.osNumber) return a.osNumber - b.osNumber;
  if (a.year === b.year) return 0;
  if (a.year === undefined) return 1;
  if (b.year === undefined) return -1;
  return b.year - a.year;
}

export interface PartRow {
  /** Descrição normalizada (sem caixa, acento e espaços repetidos). */
  key: string;
  description: string;
  category?: PartCategory;
  quantity: number;
}

export interface PartsOSGroup {
  osNumber: number;
  status: OSStatus;
  clientName: string;
  vehicle: VehicleInfo;
  rows: PartRow[];
}

export interface PartsStatusSection {
  status: OSStatus;
  groups: PartsOSGroup[];
  /** Linhas (peças distintas por OS) e unidades da faixa. */
  itemCount: number;
  unitCount: number;
}

/** Mesma peça em mais de uma OS do mesmo carro (marca, modelo, ano, motor e válvulas): compra junta. */
export interface RepeatedPart {
  key: string;
  description: string;
  category?: PartCategory;
  vehicle: VehicleInfo;
  quantity: number;
  status: OSStatus;
  osNumber: number;
  orders: Array<{ osNumber: number; clientName: string }>;
}

export interface PartsToBuyPlan {
  sections: PartsStatusSection[];
  repeated: RepeatedPart[];
  totals: { distinct: number; units: number; orders: number };
}

export const normalizeDescription = (s: string): string => normalizeText(s) || s.trim().toLowerCase();

const FALLBACK_DESCRIPTION = 'Peça sem descrição';
const CATEGORY_ORDER = Object.keys(PART_CATEGORY_META) as PartCategory[];
const categoryRank = (c: PartCategory | undefined): number => {
  const i = c ? CATEGORY_ORDER.indexOf(c) : -1;
  return i < 0 ? CATEGORY_ORDER.length : i;
};

/**
 * Monta a lista: só as peças selecionadas (pela descrição exata, como na tela), agrupadas por Situação e por OS.
 * Dentro da OS, peças iguais somam a quantidade; ordem por categoria e descrição.
 */
export function buildPartsToBuy(orders: readonly WorkOrder[], selected: ReadonlySet<string>): PartsToBuyPlan {
  const groups: PartsOSGroup[] = [];
  for (const os of orders) {
    const byKey = new Map<string, PartRow>();
    for (const part of os.parts ?? []) {
      if (!selected.has(part.description)) continue;
      const description = part.description.trim() || FALLBACK_DESCRIPTION;
      const key = normalizeDescription(description);
      const row = byKey.get(key);
      if (row) row.quantity += 1;
      else byKey.set(key, { key, description, category: part.category, quantity: 1 });
    }
    if (byKey.size === 0) continue;
    const rows = [...byKey.values()].sort(
      (a, b) => categoryRank(a.category) - categoryRank(b.category) || a.description.localeCompare(b.description, 'pt-BR'),
    );
    groups.push({
      osNumber: os.osNumber,
      status: os.status,
      clientName: (os.clientName ?? '').trim(),
      vehicle: extractVehicleInfo(os.vehicle),
      rows,
    });
  }

  groups.sort((a, b) => comparePartsOrder(
    { status: a.status, osNumber: a.osNumber, year: a.vehicle.year },
    { status: b.status, osNumber: b.osNumber, year: b.vehicle.year },
  ));

  const sections: PartsStatusSection[] = [];
  for (const g of groups) {
    let sec = sections.find(s => s.status === g.status);
    if (!sec) {
      sec = { status: g.status, groups: [], itemCount: 0, unitCount: 0 };
      sections.push(sec);
    }
    sec.groups.push(g);
    sec.itemCount += g.rows.length;
    sec.unitCount += g.rows.reduce((n, r) => n + r.quantity, 0);
  }

  // Mesma peça + mesmo carro: soma entre as OS. Carros diferentes nunca se juntam.
  const merged = new Map<string, RepeatedPart>();
  for (const g of groups) {
    for (const r of g.rows) {
      const key = `${r.key}||${g.vehicle.key}`;
      const cur = merged.get(key);
      if (cur) {
        cur.quantity += r.quantity;
        if (!cur.orders.some(o => o.osNumber === g.osNumber)) cur.orders.push({ osNumber: g.osNumber, clientName: g.clientName });
      } else {
        merged.set(key, {
          key, description: r.description, category: r.category, vehicle: g.vehicle, quantity: r.quantity,
          status: g.status, osNumber: g.osNumber, orders: [{ osNumber: g.osNumber, clientName: g.clientName }],
        });
      }
    }
  }
  const all = [...merged.values()];
  const repeated = all
    .filter(p => p.orders.length > 1)
    .sort((a, b) => comparePartsOrder(
      { status: a.status, osNumber: a.osNumber, year: a.vehicle.year },
      { status: b.status, osNumber: b.osNumber, year: b.vehicle.year },
    ) || a.description.localeCompare(b.description, 'pt-BR'));

  return {
    sections,
    repeated,
    totals: {
      distinct: all.length,
      units: all.reduce((n, p) => n + p.quantity, 0),
      orders: groups.length,
    },
  };
}

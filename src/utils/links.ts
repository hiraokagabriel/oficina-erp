import type { CatalogItem, Client, OrderItem, Technician, Vehicle, WorkOrder } from '../types';

// Resolução PURA de vínculos por id (plano 4.6). Nada aqui grava, gera id aleatório ou usa relógio.
// Regra geral: nunca adivinhar. Sem correspondência única, devolve undefined e o texto gravado continua valendo.

/** Nome para comparar: sem espaços nas pontas, espaços repetidos viram um, minúsculas pt-BR, acentos preservados. */
export const normalizeName = (s: string | undefined | null): string =>
  (s ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');

/** Placa para comparar: só letras e números, maiúsculas ("abc-1d23" -> "ABC1D23"). */
export const normalizePlate = (s: string | undefined | null): string =>
  (s ?? '').replace(/[^\p{L}\p{N}]/gu, '').toLocaleUpperCase('pt-BR');

/** Só os dígitos de um telefone. */
export const phoneDigits = (s: string | undefined | null): string => (s ?? '').replace(/\D/g, '');

/**
 * Separa "modelo - PLACA" pelo ÚLTIMO " - ", como o OSModal faz ao desmontar a OS
 * (lá o separador só vale se estiver depois do primeiro caractere: sep > 0).
 * Sem " - ", a placa é vazia e o texto inteiro é o modelo.
 */
export const splitVehicle = (str: string | undefined | null): { model: string; plate: string } => {
  const v = str ?? '';
  const sep = v.lastIndexOf(' - ');
  if (sep > 0) return { model: v.substring(0, sep), plate: v.substring(sep + 3) };
  return { model: v, plate: '' };
};

const PLATE_RE = /[A-Z]{3}-?[0-9][A-Z0-9][0-9]{2}/i;

/** "modelo - PLACA" (como gravado na OS) vira { model, plate }. Sem " - ", procura uma placa no texto. */
export function vehicleParts(vehicle: string): { model: string; plate: string } {
  const split = splitVehicle(vehicle);
  if (split.plate.trim()) return { model: split.model.trim(), plate: split.plate.trim() };
  const text = split.model;
  const m = text.match(PLATE_RE);
  if (!m || m.index === undefined) return { model: text.trim(), plate: '' };
  const model = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).replace(/[\s\-–]+$/, '').replace(/\s{2,}/g, ' ').trim();
  return { model, plate: m[0] };
}

type OsClientRef = Pick<WorkOrder, 'clientName'> & Partial<Pick<WorkOrder, 'clientId' | 'clientPhone' | 'vehicle'>>;

/**
 * Cliente da OS: o clientId se existir no cadastro; senão o ÚNICO cliente de mesmo nome normalizado;
 * senão undefined (homônimos não são desempatados aqui; a migração usa matchClientId).
 */
export const resolveClientId = (os: OsClientRef, clients: Client[]): string | undefined => {
  if (os.clientId && clients.some(c => c.id === os.clientId)) return os.clientId;
  const name = normalizeName(os.clientName);
  if (!name) return undefined;
  const same = clients.filter(c => normalizeName(c.name) === name);
  return same.length === 1 ? same[0].id : undefined;
};

/** Prefixo da chave de agrupamento das OS que não resolvem para um cliente do cadastro. */
export const CLIENT_NAME_KEY_PREFIX = 'nome:';

/**
 * Chave para agrupar OS por cliente (CRM, dívida): o id do cliente resolvido; sem cliente resolvível
 * (homônimos sem id, cliente excluído, nome fora do cadastro) cai em `nome:<nome normalizado>`.
 */
export const clientGroupKey = (os: OsClientRef, clients: Client[]): string =>
  resolveClientId(os, clients) ?? `${CLIENT_NAME_KEY_PREFIX}${normalizeName(os.clientName)}`;

/**
 * A OS pertence a este cliente? Pelo id resolvido; se a OS não resolve para ninguém, reserva pelo texto
 * (nome normalizado igual ao do cliente), para o histórico não sumir.
 */
export const osBelongsToClient = (os: OsClientRef, client: Client, clients: Client[]): boolean => {
  const id = resolveClientId(os, clients);
  return id !== undefined ? id === client.id : normalizeName(os.clientName) === normalizeName(client.name);
};

/**
 * Como resolveClientId pela via do nome (ignora o clientId da OS), mas desempata homônimos:
 * primeiro pela placa da OS contra as placas dos veículos de cada cliente, depois pelos dígitos do telefone.
 * Se continuar empatado (ou nada casar), undefined: homônimos nunca se fundem sozinhos.
 */
export const matchClientId = (os: OsClientRef, clients: Client[]): string | undefined => {
  const name = normalizeName(os.clientName);
  if (!name) return undefined;
  let cands = clients.filter(c => normalizeName(c.name) === name);
  if (cands.length <= 1) return cands[0]?.id;

  const plate = normalizePlate(splitVehicle(os.vehicle).plate);
  if (plate) {
    const byPlate = cands.filter(c => (c.vehicles ?? []).some(v => normalizePlate(v.plate) === plate));
    if (byPlate.length === 1) return byPlate[0].id;
    if (byPlate.length > 1) cands = byPlate;
  }

  const phone = phoneDigits(os.clientPhone);
  if (phone) {
    const byPhone = cands.filter(c => phoneDigits(c.phone) === phone);
    if (byPhone.length === 1) return byPhone[0].id;
  }
  return undefined;
};

/**
 * Veículo da OS dentro do cadastro do cliente: pela placa normalizada; sem placa na OS, pelo modelo normalizado.
 * Vários casamentos só valem se forem idênticos (modelo e placa normalizados); senão undefined.
 * Veículo do cliente sem id não pode ser ligado.
 */
export const resolveVehicleId = (
  os: Pick<WorkOrder, 'vehicle'> & Partial<Pick<WorkOrder, 'vehicleId'>>,
  client: Client | undefined
): string | undefined => {
  if (!client) return undefined;
  const vehicles = client.vehicles ?? [];
  if (os.vehicleId && vehicles.some(v => v.id === os.vehicleId)) return os.vehicleId;

  const { model, plate } = splitVehicle(os.vehicle);
  const osPlate = normalizePlate(plate);
  const osModel = normalizeName(model);
  let hits: Vehicle[];
  if (osPlate) hits = vehicles.filter(v => normalizePlate(v.plate) === osPlate);
  else if (osModel) hits = vehicles.filter(v => normalizeName(v.model) === osModel);
  else return undefined;

  if (hits.length === 0) return undefined;
  const first = hits[0];
  const allSame = hits.every(
    v => normalizeName(v.model) === normalizeName(first.model) && normalizePlate(v.plate) === normalizePlate(first.plate)
  );
  return allSame ? first.id : undefined;
};

/** Item do catálogo pela descrição normalizada, só se o casamento for ÚNICO. */
export const resolveCatalogItemId = (
  item: Pick<OrderItem, 'description'> & Partial<Pick<OrderItem, 'catalogItemId'>>,
  catalog: CatalogItem[]
): string | undefined => {
  if (item.catalogItemId && catalog.some(c => c.id === item.catalogItemId)) return item.catalogItemId;
  const desc = normalizeName(item.description);
  if (!desc) return undefined;
  const same = catalog.filter(c => normalizeName(c.description) === desc);
  return same.length === 1 ? same[0].id : undefined;
};

/** Técnico pelo nome normalizado, só se único no catálogo. */
export const resolveTechnicianId = (name: string | undefined, technicians: Technician[]): string | undefined => {
  const n = normalizeName(name);
  if (!n) return undefined;
  const same = technicians.filter(t => normalizeName(t.name) === n);
  return same.length === 1 ? same[0].id : undefined;
};

// ---------------------------------------------------------------------------
// GRAVAÇÃO de vínculos ao salvar uma OS (plano 4.6, passo 3). Também puro: os ids novos vêm de `newId`.
// ---------------------------------------------------------------------------

export interface LinkClientInput {
  clients: Client[];
  clientName: string;
  clientPhone: string;
  /** "modelo - PLACA", como gravado na OS. */
  vehicle: string;
  clientNotes?: string;
  /** Cliente escolhido no modal (homônimos) ou mantido na edição. Se não existir mais, cai no nome. */
  clientId?: string;
  newId: () => string;
}

export type LinkClientResult =
  | { ambiguous?: false; clients: Client[]; clientId?: string; vehicleId?: string }
  | { ambiguous: true; candidates: Client[] };

/**
 * Liga a OS a um cliente e ao veículo dele, aprendendo telefone, notas e veículo como o antigo learnClientData.
 * Sem clientId válido: um cliente de mesmo nome normalizado -> usa; nenhum -> cria; vários -> { ambiguous: true }
 * sem tocar em `clients` (homônimos nunca se fundem sozinhos). Veículo já cadastrado (placa normalizada, ou
 * modelo se sem placa) mantém o id (e ganha um se era legado sem id); veículo novo recebe id novo.
 */
export const linkClient = ({ clients, clientName, clientPhone, vehicle, clientNotes, clientId, newId }: LinkClientInput): LinkClientResult => {
  const name = clientName.trim().replace(/\s+/g, ' ');
  if (!name) return { clients };

  let target: Client | undefined = clientId ? clients.find(c => c.id === clientId) : undefined;
  if (!target) {
    const same = clients.filter(c => normalizeName(c.name) === normalizeName(name));
    if (same.length > 1) return { ambiguous: true, candidates: same };
    target = same[0];
  }

  const { model, plate } = splitVehicle(vehicle);
  const hasVehicle = model.trim() !== '' || plate.trim() !== '';
  const osPlate = normalizePlate(plate);
  const osModel = normalizeName(model);
  const findVehicle = (list: Vehicle[]): Vehicle | undefined =>
    osPlate ? list.find(v => normalizePlate(v.plate) === osPlate) : list.find(v => normalizeName(v.model) === osModel);

  if (!target) {
    const veh: Vehicle | undefined = hasVehicle ? { id: newId(), model, plate } : undefined;
    const created: Client = { id: newId(), name, phone: clientPhone, notes: clientNotes || '', vehicles: veh ? [veh] : [] };
    return { clients: [...clients, created], clientId: created.id, vehicleId: veh?.id };
  }

  const current = target;
  let vehicles = current.vehicles ?? [];
  let vehicleId: string | undefined;
  if (hasVehicle) {
    const found = findVehicle(vehicles);
    if (found) {
      vehicleId = found.id ?? newId();
      if (!found.id) vehicles = vehicles.map(v => (v === found ? { ...v, id: vehicleId } : v));
    } else {
      vehicleId = newId();
      vehicles = [...vehicles, { id: vehicleId, model, plate }];
    }
  }
  const updated: Client = {
    ...current,
    phone: clientPhone || current.phone,
    notes: clientNotes || current.notes,
    vehicles,
  };
  return { clients: clients.map(c => (c.id === current.id ? updated : c)), clientId: current.id, vehicleId };
};

/**
 * Regra de edição da OS: o cliente escolhido no modal vale; senão, se o nome (normalizado) não mudou, mantém o
 * clientId da OS; se mudou, undefined (resolve de novo pelo nome).
 */
export const preferredClientId = (
  editing: Pick<WorkOrder, 'clientName'> & Partial<Pick<WorkOrder, 'clientId'>> | null | undefined,
  newClientName: string,
  chosenId?: string
): string | undefined => {
  if (chosenId) return chosenId;
  if (editing?.clientId && normalizeName(editing.clientName) === normalizeName(newClientName)) return editing.clientId;
  return undefined;
};

/**
 * Liga os itens da OS ao catálogo. Mantém o catalogItemId só se a entrada ainda existe com a mesma descrição;
 * senão pela descrição normalizada (um casamento único; duplicada no catálogo -> sem id); item novo cria a entrada
 * com id PRÓPRIO. Não atualiza preço/custo do catálogo; só completa a categoria que faltava.
 */
export const linkCatalogItems = ({ catalog, items, newId }: { catalog: CatalogItem[]; items: OrderItem[]; newId: () => string }): { catalog: CatalogItem[]; items: OrderItem[] } => {
  let working = catalog;
  const linked = items.map(item => {
    const { catalogItemId: stale, ...rest } = item;
    const desc = normalizeName(item.description);
    if (!desc) return rest as OrderItem;
    const kept = stale ? working.find(c => c.id === stale && normalizeName(c.description) === desc) : undefined;
    const same = working.filter(c => normalizeName(c.description) === desc);
    const hit = kept ?? (same.length === 1 ? same[0] : undefined);
    if (hit) {
      if (!hit.category && item.category) working = working.map(c => (c.id === hit.id ? { ...c, category: item.category } : c));
      return { ...rest, catalogItemId: hit.id };
    }
    if (same.length > 1) return rest as OrderItem;
    const entry: CatalogItem = { id: newId(), description: item.description, price: item.price };
    if (item.cost !== undefined) entry.cost = item.cost;
    if (item.category) entry.category = item.category;
    working = [...working, entry];
    return { ...rest, catalogItemId: entry.id };
  });
  return { catalog: working, items: linked };
};

/** Como learnTechnician, mas devolve também o id: um casado pelo nome normalizado; novo se não existir; homônimos -> sem id. */
export const linkTechnician = (
  technicians: Technician[],
  name: string | undefined,
  newId: () => string
): { technicians: Technician[]; technicianId?: string } => {
  const trimmed = (name ?? '').trim();
  const n = normalizeName(trimmed);
  if (!n) return { technicians };
  const same = technicians.filter(t => normalizeName(t.name) === n);
  if (same.length === 1) return { technicians, technicianId: same[0].id };
  if (same.length > 1) return { technicians };
  const created: Technician = { id: newId(), name: trimmed };
  return { technicians: [...technicians, created], technicianId: created.id };
};

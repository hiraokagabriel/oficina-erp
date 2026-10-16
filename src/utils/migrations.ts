import { CatalogItem, Client, DatabaseSchema, LedgerEntry, OrderItem, Technician, WorkOrder, WorkshopSettings } from '../types';

/** Settings de bancos v0 podiam ter `technician` (hoje é o catálogo de técnicos). */
type LegacySettings = WorkshopSettings & { technician?: unknown };
import { learnTechnician } from './helpers';
import { matchClientId, normalizeName, resolveCatalogItemId, resolveTechnicianId, resolveVehicleId } from './links';

// Versão do formato do banco. Subir aqui e acrescentar um passo em STEPS.
export const CURRENT_SCHEMA_VERSION = 2;

export interface MigrationResult {
  db: DatabaseSchema;
  /** Versão em que o banco estava (arquivo sem meta = 0). */
  from: number;
  /** true se o banco foi alterado (precisa de backup e de novo salvamento). */
  changed: boolean;
}

/** Versão gravada no banco; sem meta (ou meta sem versão válida) é v0. */
export function schemaVersionOf(db: Pick<DatabaseSchema, 'meta'>): number {
  const v = db.meta?.schemaVersion;
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0;
}

// v0 -> v1: reúne as migrações que viviam em App.tsx.
function v0ToV1(db: DatabaseSchema): DatabaseSchema {
  // (a) OS finalizada sem data de pagamento: usa a data de criação.
  const workOrders: WorkOrder[] = db.workOrders.map(os =>
    os.status === 'FINALIZADO' && !os.paymentDate ? { ...os, paymentDate: os.createdAt } : os
  );

  // (b) Lançamento de entrada sem data de pagamento: copia da OS vinculada.
  const ledger: LedgerEntry[] = db.ledger.map(entry => {
    if (entry.type === 'CREDIT' && !entry.paymentDate) {
      const linkedOS = workOrders.find(os => os.financialId === entry.id);
      if (linkedOS && linkedOS.paymentDate) return { ...entry, paymentDate: linkedOS.paymentDate };
    }
    return entry;
  });

  // (c) Técnico legado em settings.technician vira item do catálogo de técnicos.
  let catalogTechnicians = db.catalogTechnicians;
  let settings = db.settings;
  const legacySettings: LegacySettings = settings;
  const legacyTech = legacySettings?.technician;
  if (legacyTech && typeof legacyTech === 'string' && legacyTech.trim() !== '') {
    catalogTechnicians = learnTechnician(catalogTechnicians, legacyTech.trim());
    const copy: LegacySettings = { ...settings };
    delete copy.technician;
    settings = copy;
  }

  return { ...db, workOrders, ledger, catalogTechnicians, settings };
}

/** Devolve o mesmo objeto se nada mudou; senão uma cópia com a chave definida (ou removida, se value é undefined). */
function withLink<T extends object, K extends keyof T>(obj: T, key: K, value: T[K] | undefined): T {
  if (obj[key] === value) return obj;
  if (value === undefined) {
    if (!(key in obj)) return obj;
    const copy = { ...obj };
    delete copy[key];
    return copy;
  }
  return { ...obj, [key]: value };
}

const linkItems = (items: OrderItem[] | undefined, catalog: CatalogItem[]): OrderItem[] | undefined =>
  items?.map(it => withLink(it, 'catalogItemId', resolveCatalogItemId(it, catalog)));

/**
 * v1 -> v2 (PURA, registrada em STEPS).
 * Só ACRESCENTA ids (vehicles[].id, WorkOrder.clientId/vehicleId/technicianId, OrderItem.catalogItemId):
 * nunca altera nem normaliza o texto gravado, nunca apaga registro e não toca no ledger.
 * Decisão: as descrições do ledger NÃO são migradas (ficam como texto histórico).
 * Sem vínculo = o texto continua na OS e a leitura cai no nome. Homônimos nunca se fundem sozinhos.
 * Determinística (sem Date.now nem uuid) e idempotente: só preenche id que falta ou que aponta para algo inexistente.
 */
export const v1ToV2 = (db: DatabaseSchema): DatabaseSchema => {
  // 1. Veículos sem id: `${clientId}:v${índice}`.
  const clients: Client[] = db.clients.map(c => {
    if (!c.vehicles?.some(v => !v.id)) return c;
    return { ...c, vehicles: c.vehicles.map((v, i) => (v.id ? v : { ...v, id: `${c.id}:v${i}` })) };
  });
  const clientById = new Map(clients.map(c => [c.id, c]));

  const workOrders: WorkOrder[] = db.workOrders.map(os => {
    // 2. Cliente: mantém o id válido cujo nome ainda confere; senão resolve pelo nome (com desempate).
    const current = os.clientId ? clientById.get(os.clientId) : undefined;
    const keeps = !!current && normalizeName(current.name) === normalizeName(os.clientName);
    const clientId = keeps ? os.clientId : matchClientId(os, clients);
    let out = withLink(os, 'clientId', clientId);

    // 3. Veículo: só com cliente ligado; o id velho só vale se for veículo deste cliente.
    const client = clientId ? clientById.get(clientId) : undefined;
    out = withLink(out, 'vehicleId', resolveVehicleId(out, client));

    // 4. Itens pelo catálogo (casamento único).
    const parts = linkItems(out.parts, db.catalogParts);
    const services = linkItems(out.services, db.catalogServices);
    if (parts && parts.some((p, i) => p !== out.parts[i])) out = { ...out, parts };
    if (services && services.some((s, i) => s !== out.services[i])) out = { ...out, services };

    // 5. Técnico.
    return withLink(out, 'technicianId', resolveTechnicianId(out.technician, db.catalogTechnicians));
  });

  return { ...db, clients, workOrders };
};

export interface UnresolvedLinks {
  osSemCliente: number;
  osSemVeiculo: number;
  itensSemCatalogo: number;
  /** Só conta OS que tem técnico em texto. */
  osSemTecnico: number;
}

/** Quanto ficou sem vínculo válido (para avisar o usuário depois da migração). */
export const countUnresolvedLinks = (db: DatabaseSchema): UnresolvedLinks => {
  const clientById = new Map(db.clients.map(c => [c.id, c]));
  const partIds = new Set(db.catalogParts.map(c => c.id));
  const serviceIds = new Set(db.catalogServices.map(c => c.id));
  const techIds = new Set((db.catalogTechnicians as Technician[]).map(t => t.id));
  const r: UnresolvedLinks = { osSemCliente: 0, osSemVeiculo: 0, itensSemCatalogo: 0, osSemTecnico: 0 };

  for (const os of db.workOrders) {
    const client = os.clientId ? clientById.get(os.clientId) : undefined;
    if (!client) r.osSemCliente++;
    if (!client || !os.vehicleId || !client.vehicles?.some(v => v.id === os.vehicleId)) r.osSemVeiculo++;
    r.itensSemCatalogo += (os.parts ?? []).filter(i => !i.catalogItemId || !partIds.has(i.catalogItemId)).length;
    r.itensSemCatalogo += (os.services ?? []).filter(i => !i.catalogItemId || !serviceIds.has(i.catalogItemId)).length;
    if (normalizeName(os.technician) && (!os.technicianId || !techIds.has(os.technicianId))) r.osSemTecnico++;
  }
  return r;
};

// STEPS[n] leva da versão n para n+1.
const STEPS: Array<(db: DatabaseSchema) => DatabaseSchema> = [v0ToV1, v1ToV2];

/**
 * Migra o banco até CURRENT_SCHEMA_VERSION. Pura (não altera a entrada) e idempotente.
 * Banco de versão futura é devolvido intacto (changed = false): quem chama decide abrir só para leitura.
 * O meta devolvido só tem a versão atualizada; revision/history/savedAt/savedBy são do último salvamento
 * (e são refeitos a cada save).
 */
export function migrate(raw: DatabaseSchema): MigrationResult {
  const from = schemaVersionOf(raw);
  if (from >= CURRENT_SCHEMA_VERSION) return { db: raw, from, changed: false };

  let db = raw;
  for (let v = from; v < CURRENT_SCHEMA_VERSION; v++) db = STEPS[v](db);

  db = {
    ...db,
    meta: {
      revision: '',
      history: [],
      savedAt: '',
      savedBy: '',
      ...db.meta,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    },
  };
  return { db, from, changed: true };
}

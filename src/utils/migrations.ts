import { DatabaseSchema, LedgerEntry, WorkOrder } from '../types';
import { learnTechnician } from './helpers';

// Versão do formato do banco. Subir aqui e acrescentar um passo em STEPS.
export const CURRENT_SCHEMA_VERSION = 1;

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
  const legacyTech = (settings as any)?.technician;
  if (legacyTech && typeof legacyTech === 'string' && legacyTech.trim() !== '') {
    catalogTechnicians = learnTechnician(catalogTechnicians, legacyTech.trim());
    const copy: any = { ...settings };
    delete copy.technician;
    settings = copy;
  }

  return { ...db, workOrders, ledger, catalogTechnicians, settings };
}

// STEPS[n] leva da versão n para n+1.
const STEPS: Array<(db: DatabaseSchema) => DatabaseSchema> = [v0ToV1];

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

// Contrato entre o splitter (src/sync) e o SQL da nuvem (supabase/migrations). Só JSON puro em `data`.

export type CloudTable =
  | 'work_orders' | 'work_order_finance' | 'work_order_costs' | 'ledger' | 'clients'
  | 'catalog_parts' | 'catalog_services' | 'catalog_prices' | 'catalog_costs'
  | 'technicians' | 'appointments' | 'audit_log' | 'settings';

export interface CloudRow {
  table: CloudTable;
  /** Id do registro (texto). catalog_prices/catalog_costs: `${kind}:${itemId}`. settings: 'main'. */
  id: string;
  /** JSON puro. Nunca contém workshop_id, version nem updated_at (colunas do servidor). */
  data: unknown;
  /** Só em `ledger`: OS dona do lançamento; null = lançamento manual. */
  os_id?: string | null;
}

/** Papéis da nuvem (memberships.role). */
export type CloudRole = 'dono' | 'recepcao' | 'mecanico';

export type CatalogKind = 'part' | 'service';

/** Coleções de `DatabaseSchema` que sincronizam (tudo menos `meta`). */
export type CollectionKey =
  | 'workOrders' | 'ledger' | 'clients' | 'catalogParts' | 'catalogServices'
  | 'catalogTechnicians' | 'appointments' | 'auditLog' | 'settings';

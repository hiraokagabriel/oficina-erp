import { IMPORT_TABLES } from './importCheck';
import { PULL_PAGE } from './syncEngine';
import type { PullRequest, Transport } from './syncEngine';
import type { CloudRow, CloudTable } from './types';

// Leitura completa do servidor (docs/NUVEM-PR9.md, passos 8 e cópia diária): lê cada tabela, página a página,
// pela mesma chave de ordem do motor `(updated_at, id)`, até a página vir menor que o limite.

/**
 * Todas as linhas ativas das tabelas (padrão: as 13 da importação). Linhas apagadas (tombstone) ficam de fora.
 * `pageSize` existe só para os testes; o servidor real corta acima de `PULL_PAGE`.
 */
export async function pullAllRows(
  transport: Pick<Transport, 'pull'>,
  workshopId: string,
  opts: { tables?: readonly CloudTable[]; pageSize?: number } = {},
): Promise<CloudRow[]> {
  const tables = opts.tables ?? IMPORT_TABLES;
  const limit = Math.max(1, Math.min(opts.pageSize ?? PULL_PAGE, PULL_PAGE));
  const out: CloudRow[] = [];
  for (const table of tables) {
    const seen = new Set<string>();
    let req: PullRequest = { since: null, after: null, limit };
    for (;;) {
      const page = await transport.pull(workshopId, table, req);
      for (const r of page) {
        if (r.deleted_at !== null || seen.has(r.id)) continue;
        seen.add(r.id);
        const row: CloudRow = { table, id: r.id, data: r.data };
        if (table === 'ledger') row.os_id = r.os_id ?? null;
        out.push(row);
      }
      if (page.length < limit) break;
      const last = page[page.length - 1];
      req = { since: null, after: { updated_at: last.updated_at, id: last.id }, limit };
    }
  }
  return out;
}

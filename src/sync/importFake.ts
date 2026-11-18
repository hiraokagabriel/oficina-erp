import type { ImportTotals } from './importCheck';
import { IMPORT_TABLES, compareTotals } from './importCheck';
import type { PullRequest, PulledRow, Transport } from './syncEngine';
import { TransportError } from './syncEngine';
import type { CloudRow, CloudTable } from './types';

// Apoio dos testes da importação (NÃO é código de produção): servidor falso que imita `import_rows`,
// `import_finish` e `import_reset`, e `pull` por chave `(updated_at, id)`. Sem Vitest.

interface Stored { data: unknown; os_id: string | null; updated_at: string }

export type ImportState = 'vazio' | 'importando' | 'concluido';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export class FakeImportServer {
  state: ImportState = 'vazio';
  private tables = new Map<CloudTable, Map<string, Stored>>();
  private seq = 0;
  /** Chamadas de `import_rows` (inclusive as que falharam). */
  rowsCalls = 0;
  /** Tamanho de cada lote aceito. */
  accepted: number[] = [];
  /** Falha a chamada de nº k (1-based) ANTES de gravar, uma vez, com erro de rede. */
  failCall: number | null = null;
  /** Lote com mais linhas que isso estoura o tempo (57014). */
  timeoutOver: number | null = null;
  finishCalls: boolean[] = [];
  resetCalls = 0;
  /** Chamado dentro de `importFinish(false)`, antes de calcular os totais (para estragar dados). */
  beforeTotals: (() => void) | null = null;

  private t(table: CloudTable): Map<string, Stored> {
    let m = this.tables.get(table);
    if (!m) { m = new Map(); this.tables.set(table, m); }
    return m;
  }

  private stamp(): string { return new Date(Date.UTC(2026, 10, 17, 12, 0, 0) + ++this.seq).toISOString(); }

  count(table: CloudTable): number { return this.t(table).size; }
  get(table: CloudTable, id: string): Stored | undefined { return this.t(table).get(id); }
  /** Altera direto uma linha (dado estragado no servidor). */
  tamper(table: CloudTable, id: string, data: unknown): void {
    const cur = this.t(table).get(id);
    if (cur) this.t(table).set(id, { ...cur, data, updated_at: this.stamp() });
  }
  drop(table: CloudTable, id: string): void { this.t(table).delete(id); }

  async importRows(_ws: string, rows: CloudRow[]): Promise<void> {
    this.rowsCalls += 1;
    if (this.failCall === this.rowsCalls) { this.failCall = null; throw new TransportError('sem rede', 'network'); }
    if (this.state !== 'vazio' && this.state !== 'importando') throw new TransportError('import_bloqueado', 'auth', '42501');
    if (this.timeoutOver !== null && rows.length > this.timeoutOver) throw new TransportError('statement timeout', 'timeout', '57014');
    if (this.state === 'vazio') this.state = 'importando';
    for (const r of rows) {
      this.t(r.table).set(r.id, { data: JSON.parse(JSON.stringify(r.data)), os_id: r.os_id ?? null, updated_at: this.stamp() });
    }
    this.accepted.push(rows.length);
  }

  async importFinish(_ws: string, commit: boolean, expected?: ImportTotals | null): Promise<ImportTotals> {
    this.finishCalls.push(commit);
    if (commit) {
      if (this.state !== 'vazio' && this.state !== 'importando') throw new TransportError('import_bloqueado', 'auth', '42501');
    } else {
      this.beforeTotals?.();
    }
    const counts = Object.fromEntries(IMPORT_TABLES.map(t => [t, this.t(t).size])) as Record<CloudTable, number>;
    let ledgerSignedCents = 0;
    let paidEntries = 0;
    for (const { data } of this.t('ledger').values()) {
      if (!isObj(data)) continue;
      if (data.type === 'CREDIT') ledgerSignedCents += num(data.amount);
      else if (data.type === 'DEBIT') ledgerSignedCents -= num(data.amount);
      if (typeof data.paymentDate === 'string' && data.paymentDate !== '') paidEntries += 1;
    }
    let osTotalCents = 0;
    let advancesCents = 0;
    for (const { data } of this.t('work_order_finance').values()) {
      if (!isObj(data)) continue;
      osTotalCents += num(data.total);
      if (Array.isArray(data.advances)) for (const a of data.advances) advancesCents += num(isObj(a) ? a.amount : 0);
    }
    const totals: ImportTotals = { counts, ledgerSignedCents, osTotalCents, paidEntries, advancesCents };
    if (commit) {
      // Imita o SQL: commit exige `expected` e IGUAL aos totais calculados; senão recusa sem mudar o estado.
      if (!expected) throw new TransportError('expected_obrigatorio', 'server', '22023');
      if (compareTotals(expected, totals).length > 0) throw new TransportError('totais_divergentes', 'server', '22023');
      this.state = 'concluido';
    }
    return { ...totals, state: this.state };
  }

  async importReset(_ws: string): Promise<void> {
    this.resetCalls += 1;
    if (this.state !== 'importando') throw new TransportError('import_bloqueado', 'auth', '42501');
    this.tables.clear();
    this.state = 'vazio';
  }

  /** Só `pull` (o resto não é usado pela importação). */
  transport(): Pick<Transport, 'pull'> {
    return {
      pull: async (_ws: string, table: CloudTable, req: PullRequest): Promise<PulledRow[]> => {
        const cmp = (a: [string, Stored], b: [string, Stored]): number =>
          a[1].updated_at < b[1].updated_at ? -1 : a[1].updated_at > b[1].updated_at ? 1 : a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
        return [...this.t(table)]
          .filter(([id, r]) => !req.after || r.updated_at > req.after.updated_at || (r.updated_at === req.after.updated_at && id > req.after.id))
          .sort(cmp)
          .slice(0, req.limit)
          .map(([id, r]): PulledRow => {
            const row: PulledRow = { table, id, version: 1, data: JSON.parse(JSON.stringify(r.data)), deleted_at: null, updated_at: r.updated_at };
            if (table === 'ledger') row.os_id = r.os_id;
            return row;
          });
      },
    };
  }
}

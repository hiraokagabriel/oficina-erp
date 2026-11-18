import { describe, it, expect } from 'vitest';
import type { DatabaseSchema, LedgerEntry, WorkOrder } from '../types';
import { migrate } from '../utils/migrations';
import { Money } from '../utils/helpers';
import { joinDatabase, prepareForCloud, splitDatabase } from './split';
import { fixture } from './testKit';
import type { CloudRow } from './types';
import {
  buildBatches, checkImportable, compareTotals, describeProblem, expectedTotals, groupByTable, photoManifest,
  roundTripDiff,
} from './importCheck';
import type { ImportTotals } from './importCheck';

type Coll = Omit<DatabaseSchema, 'meta'>;
const good = (): Coll => prepareForCloud(migrate(fixture(5)).db);
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
/** Escreve valor de tipo errado de propósito (dado quebrado do arquivo). */
const set = (o: object, k: string, v: unknown): void => { (o as Record<string, unknown>)[k] = v; };
/** Cópia da fixture boa, editada por `fn`. */
const bad = (fn: (d: Coll) => void): Coll => {
  const d = clone(good());
  fn(d);
  return d;
};

describe('checkImportable', () => {
  it('fixture boa em todas as versões: sem problemas', () => {
    for (const v of [0, 1, 2, 3, 4, 5]) expect(checkImportable(prepareForCloud(migrate(fixture(v)).db))).toEqual([]);
  });

  it('id repetido por coleção (uma vez só) e id vazio', () => {
    const d = bad(x => {
      x.ledger[1].id = 'L1';
      x.ledger.push({ ...x.ledger[0] });
      x.clients[0].id = '  ';
      x.workOrders[1].id = 'W1';
    });
    const p = checkImportable(d);
    expect(p.filter(i => i.collection === 'ledger' && i.reason === 'identificador repetido')).toEqual([
      { collection: 'ledger', id: 'L1', reason: 'identificador repetido' },
    ]);
    expect(p).toContainEqual({ collection: 'clients', id: '', reason: 'sem identificador (registro nº 1 da lista)' });
    expect(p).toContainEqual({ collection: 'workOrders', id: 'W1', reason: 'identificador repetido' });
  });

  it('mesmo id em coleções diferentes é permitido', () => {
    const d = bad(x => { x.clients[0].id = 'W1'; });
    expect(checkImportable(d)).toEqual([]);
  });

  it('dinheiro em texto, quebrado ou não finito', () => {
    const d = bad(x => {
      set(x.ledger[0], 'amount', '100');
      set(x.ledger[1], 'amount', 10.5);
      
      set(x.ledger[3], 'amount', undefined);
      set(x.workOrders[0], 'total', '10000');
      set(x.workOrders[0].parts[0], 'price', 1.25);
      set(x.workOrders[2].advances![0], 'amount', '2000');
      set(x.workOrders[1].installmentConfig!, 'installmentAmount', 5000.5);
      set(x.catalogParts[0], 'price', 'abc');
      set(x.catalogParts[0], 'cost', 0.5);
    });
    const text = checkImportable(d).map(describeProblem).join('\n');
    expect(text).toContain('Lançamentos (L1): valor: o valor está em texto ("100")');
    expect(text).toContain('Lançamentos (L2): valor: o valor não está em centavos inteiros (10.5)');
    expect(text).toContain('Lançamentos (L4): valor: valor ausente');
    expect(text).toContain('Ordens de serviço (W1): total: o valor está em texto ("10000")');
    expect(text).toContain('Ordens de serviço (W1): peça 1, preço: o valor não está em centavos inteiros (1.25)');
    expect(text).toContain('Ordens de serviço (W3): adiantamento 1: o valor está em texto ("2000")');
    expect(text).toContain('Ordens de serviço (W2): parcelamento, valor da parcela');
    expect(text).toContain('Peças do catálogo (CP1): preço: o valor está em texto ("abc")');
    expect(text).toContain('Peças do catálogo (CP1): custo');
    // NaN e Infinity viram null no JSON do clone; checados direto, sem clone
    const d2 = good();
    d2.ledger[0] = { ...d2.ledger[0], amount: Number.NaN };
    d2.workOrders[0] = { ...d2.workOrders[0], totalCost: Infinity };
    const t2 = checkImportable(d2).map(describeProblem).join('\n');
    expect(t2).toContain('Lançamentos (L1): valor: o valor não é um número válido');
    expect(t2).toContain('Ordens de serviço (W1): custo total: o valor não é um número válido');
  });

  it('item sem preço ou custo é permitido (preço ausente é dado legado)', () => {
    expect(checkImportable(good())).toEqual([]);
  });

  it('type de lançamento fora de CREDIT/DEBIT', () => {
    const d = bad(x => { set(x.ledger[0], 'type', 'credit'); set(x.ledger[1], 'type', undefined); });
    const p = checkImportable(d);
    expect(p.map(describeProblem)).toContain('Lançamentos (L1): tipo inválido ("credit"); deve ser entrada ou saída');
    expect(p.some(i => i.id === 'L2' && i.reason.startsWith('tipo inválido'))).toBe(true);
  });

  it('caractere nulo em qualquer texto, inclusive aninhado, chave e configurações', () => {
    const d = bad(x => {
      x.clients[0].name = 'Fu\u0000lano';
      x.workOrders[0].parts[0].description = 'Pasti\u0000lha';
      set(x.catalogServices[0], 'chave\u0000', 1);
      x.settings.name = 'OF\u0000';
    });
    const p = checkImportable(d);
    const nul = (c: string, id: string) => p.some(i => i.collection === c && i.id === id && i.reason.includes('nulo'));
    expect(nul('clients', 'C1')).toBe(true);
    expect(nul('workOrders', 'W1')).toBe(true);
    expect(nul('catalogServices', 'CS1')).toBe(true);
    expect(nul('settings', 'main')).toBe(true);
    // texto com barra e "u0000" literal não é NUL
    const ok = bad(x => { x.clients[0].name = '\\u0000'; });
    expect(checkImportable(ok)).toEqual([]);
  });
});

describe('expectedTotals', () => {
  it('contagens por tabela vêm das linhas do split', () => {
    const t = expectedTotals(good());
    expect(t.counts).toEqual({
      work_orders: 3, work_order_finance: 3, work_order_costs: 2, ledger: 6, clients: 1,
      catalog_parts: 1, catalog_services: 2, catalog_prices: 3, catalog_costs: 1, technicians: 1,
      appointments: 1, audit_log: 1, settings: 1,
    });
  });

  it('somas em centavos com a regra do SQL', () => {
    const t = expectedTotals(good());
    // L1 +10000, L2 +500, L3 -300, L4 +5000, L5 +5000, L6 +2000
    expect(t.ledgerSignedCents).toBe(22200);
    expect(t.osTotalCents).toBe(30000);
    expect(t.paidEntries).toBe(3);
    expect(t.advancesCents).toBe(2000);
  });

  it('tipo desconhecido vale 0 e paymentDate vazio não conta', () => {
    const d = good();
    d.ledger = d.ledger.map(e => e.id === 'L1' ? ({ ...e, type: 'X' } as unknown as LedgerEntry) : e.id === 'L3' ? { ...e, paymentDate: '' } : e);
    const t = expectedTotals(d);
    expect(t.ledgerSignedCents).toBe(22200 - 10000);
    expect(t.paidEntries).toBe(2);
  });

  it('banco sem dados: settings = 1 e o resto 0', () => {
    const d = good();
    const empty: Coll = { ...d, ledger: [], workOrders: [], clients: [], catalogParts: [], catalogServices: [], catalogTechnicians: [], appointments: [], auditLog: [] };
    const t = expectedTotals(empty);
    expect(Object.values(t.counts).reduce((a, b) => a + b, 0)).toBe(1);
    expect(t.counts.settings).toBe(1);
    expect(t.ledgerSignedCents).toBe(0);
  });
});

describe('compareTotals', () => {
  const base = (): ImportTotals => expectedTotals(good());
  it('iguais: sem diferenças', () => {
    expect(compareTotals(base(), base())).toEqual([]);
  });
  it('contagem e valores com texto em pt-BR', () => {
    const got = base();
    got.counts.ledger = 5;
    got.counts.clients = 0;
    got.ledgerSignedCents -= 10000;
    got.advancesCents = 0;
    got.paidEntries = 2;
    const out = compareTotals(base(), got);
    expect(out).toContain('Lançamentos: o arquivo tem 6, a internet tem 5.');
    expect(out).toContain('Clientes: o arquivo tem 1, a internet tem 0.');
    expect(out).toContain(`Saldo dos lançamentos: o arquivo tem ${Money.format(22200)}, a internet tem ${Money.format(12200)}.`);
    expect(out).toContain(`Soma dos adiantamentos: o arquivo tem ${Money.format(2000)}, a internet tem ${Money.format(0)}.`);
    expect(out).toContain('Lançamentos pagos: o arquivo tem 3, a internet tem 2.');
    expect(out).toHaveLength(5);
  });
  it('contagem ausente no servidor conta como 0', () => {
    const got = base();
    delete (got.counts as Partial<typeof got.counts>).technicians;
    expect(compareTotals(base(), got)).toEqual(['Técnicos: o arquivo tem 1, a internet tem 0.']);
  });
});

describe('buildBatches', () => {
  const row = (table: CloudRow['table'], id: string, pad = ''): CloudRow => ({ table, id, data: { pad } });
  const many = (n: number): CloudRow[] => Array.from({ length: n }, (_, i) => row('ledger', `L${i}`));

  it('corta por 500 linhas, uma tabela por lote, na ordem do SQL', () => {
    const rows = groupByTable([...many(1201), row('work_orders', 'W1'), row('settings', 'main')]);
    const b = buildBatches(rows, { maxRows: 500, maxBytes: 1_000_000 });
    expect(b.map(x => [x[0].table, x.length])).toEqual([
      ['work_orders', 1], ['ledger', 500], ['ledger', 500], ['ledger', 201], ['settings', 1],
    ]);
    expect(b.flat().filter(r => r.table === 'ledger').map(r => r.id)).toEqual(many(1201).map(r => r.id));
  });

  it('corta por bytes do JSON serializado (UTF-8)', () => {
    const rows = groupByTable([row('clients', 'a', 'x'.repeat(400)), row('clients', 'b', 'x'.repeat(400)), row('clients', 'c', 'x'.repeat(400))]);
    const b = buildBatches(rows, { maxRows: 500, maxBytes: 1000 });
    expect(b.map(x => x.map(r => r.id))).toEqual([['a', 'b'], ['c']]);
    const acc = groupByTable([row('clients', 'a', 'é'.repeat(300)), row('clients', 'b', 'é'.repeat(300))]);
    // 300 "é" = 600 bytes cada: não cabem dois em 1000 bytes
    expect(buildBatches(acc, { maxRows: 500, maxBytes: 1000 })).toHaveLength(2);
  });

  it('linha maior que o limite vai sozinha', () => {
    const rows = groupByTable([row('clients', 'a'), row('clients', 'grande', 'x'.repeat(5000)), row('clients', 'b')]);
    const b = buildBatches(rows, { maxRows: 500, maxBytes: 1000 });
    expect(b.map(x => x.map(r => r.id))).toEqual([['a'], ['grande'], ['b']]);
  });

  it('sem linhas: sem lotes; padrão 500 / ~1 MB', () => {
    expect(buildBatches({})).toEqual([]);
    expect(buildBatches(groupByTable(many(501)))).toHaveLength(2);
  });

  it('o split da fixture sai inteiro nos lotes', () => {
    const rows = splitDatabase(good());
    expect(buildBatches(groupByTable(rows)).flat()).toHaveLength(rows.length);
  });
});

describe('photoManifest', () => {
  const os = (id: string, n: number, ids: string[]) => ({ id, osNumber: n, photos: ids.map(p => ({ id: p, createdAt: 'x' })) }) as Pick<WorkOrder, 'id' | 'osNumber' | 'photos'>;

  it('separa a enviar, ausentes, sobrando e soma bytes', () => {
    const m = photoManifest(
      [os('W1', 1, ['a', 'b']), os('W2', 2, ['c']), os('W3', 3, [])],
      [
        { osId: 'W1', photoId: 'a', bytes: 1000, hasThumb: true },
        { osId: 'W2', photoId: 'c', bytes: 500, hasThumb: false },
        { osId: 'W9', photoId: 'z', bytes: 7, hasThumb: true },
        { osId: 'W1', photoId: 'x', bytes: 9, hasThumb: true },
      ],
    );
    expect(m.toSend.map(p => `${p.osId}/${p.photoId}`)).toEqual(['W1/a', 'W2/c']);
    expect(m.toSend[0].osNumber).toBe(1);
    expect(m.toSend[1].hasThumb).toBe(false);
    expect(m.missing).toEqual([{ osId: 'W1', osNumber: 1, photoId: 'b', reason: 'arquivo não encontrado na pasta de fotos' }]);
    expect(m.extras.map(f => `${f.osId}/${f.photoId}`)).toEqual(['W9/z', 'W1/x']);
    expect(m.totalBytes).toBe(1500);
  });

  it('mesmo photoId em OS diferentes não se confunde; repetido na mesma OS conta uma vez', () => {
    const m = photoManifest(
      [os('W1', 1, ['a', 'a']), os('W2', 2, ['a'])],
      [{ osId: 'W2', photoId: 'a', bytes: 10, hasThumb: true }],
    );
    expect(m.toSend.map(p => p.osId)).toEqual(['W2']);
    expect(m.missing.map(p => p.osId)).toEqual(['W1']);
  });

  it('sem fotos e sem arquivos', () => {
    expect(photoManifest([], [])).toEqual({ toSend: [], missing: [], extras: [], totalBytes: 0 });
  });
});

describe('roundTripDiff', () => {
  it('volta idêntica pelo split e join: sem diferenças', () => {
    for (const v of [0, 3, 5]) {
      const p = prepareForCloud(migrate(fixture(v)).db);
      const wire = JSON.parse(JSON.stringify(splitDatabase(p, 'dono'))) as CloudRow[];
      expect(roundTripDiff(p, joinDatabase(wire))).toEqual([]);
    }
  });

  it('a ordem das chaves e das linhas não conta', () => {
    const l = good();
    const r = clone(l);
    r.ledger.reverse();
    r.clients[0] = Object.fromEntries(Object.entries(r.clients[0]).reverse()) as typeof r.clients[0];
    expect(roundTripDiff(l, r)).toEqual([]);
  });

  it('acusa diferente, faltando e sobrando, ordenados por id', () => {
    const l = good();
    const r = clone(l);
    r.ledger = r.ledger.filter(e => e.id !== 'L5');
    r.ledger[0] = { ...r.ledger[0], amount: r.ledger[0].amount + 1 };
    r.ledger[2] = { ...r.ledger[2], amount: r.ledger[2].amount + 1 };
    r.ledger.push({ ...r.ledger[0], id: 'Lz' }, { ...r.ledger[0], id: 'Lb' });
    r.settings = { ...r.settings, name: 'Outro' };
    expect(roundTripDiff(l, r)).toEqual([
      { collection: 'ledger', different: ['L1', 'L3'], missing: ['L5'], extra: ['Lb', 'Lz'] },
      { collection: 'settings', different: ['main'], missing: [], extra: [] },
    ]);
  });
});

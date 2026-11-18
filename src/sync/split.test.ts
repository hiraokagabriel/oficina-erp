import { describe, it, expect } from 'vitest';
import type { DatabaseSchema, WorkOrder, WorkshopSettings } from '../types';
import { migrate } from '../utils/migrations';
import { updateWorkOrderData } from '../utils/helpers';
import { mergeOSEdit } from '../services/osEditMerge';
import { parseDatabase } from '../context/DatabaseContext';
import {
  computeTotals, exportV5, joinDatabase, joinDatabaseReport, joinWorkOrder, ledgerOwnerIndex,
  prepareForCloud, splitDatabase, splitWorkOrder,
} from './split';
import type { CloudRow } from './types';
import { CAT_COST, CAT_PRICE, COST_A, PRICE_A, PRICE_B, fixture } from './testKit';

const noMeta = (db: DatabaseSchema): Omit<DatabaseSchema, 'meta'> => {
  const { meta, ...rest } = db;
  void meta;
  return rest;
};
const OPTS = { savedAt: '2026-01-01T00:00:00.000Z', savedBy: 'nuvem:teste', revision: 'rev-1' };

describe('volta completa prepareForCloud -> split -> join -> exportV5', () => {
  for (const v of [0, 1, 2, 3, 4, 5]) {
    it(`fixture v${v}`, () => {
      const migrated = migrate(fixture(v)).db;
      const prepared = prepareForCloud(migrated);
      const rows = splitDatabase(prepared, 'dono');
      // passa por JSON como se fosse pela rede
      const wire = JSON.parse(JSON.stringify(rows)) as CloudRow[];
      const { db: joined, skippedOrders } = joinDatabaseReport(wire);
      expect(skippedOrders).toEqual([]);
      const out = exportV5(joined, OPTS);
      expect(noMeta(out)).toEqual(noMeta(prepared));
      expect(out.meta).toEqual({ schemaVersion: 5, revision: 'rev-1', history: [], savedAt: OPTS.savedAt, savedBy: OPTS.savedBy });
    });
  }

  it('importação sem papel é igual a papel dono', () => {
    const p = prepareForCloud(migrate(fixture(5)).db);
    expect(splitDatabase(p)).toEqual(splitDatabase(p, 'dono'));
  });

  it('exportV5 -> parseDatabase -> migrate dá changed=false', () => {
    const p = prepareForCloud(migrate(fixture(5)).db);
    const out = exportV5(joinDatabase(splitDatabase(p)), OPTS);
    const fallback: WorkshopSettings = { name: 'X', cnpj: '', address: '', exportPath: '' };
    const parsed = parseDatabase(JSON.stringify(out), fallback);
    const r = migrate(parsed);
    expect(r.changed).toBe(false);
    expect(r.from).toBe(5);
    expect(parsed).toEqual(out);
  });
});

describe('prepareForCloud', () => {
  it('é idempotente e não muta a entrada', () => {
    const input = migrate(fixture(5)).db;
    const snapshot = JSON.stringify(input);
    const once = prepareForCloud(input);
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(prepareForCloud(once)).toEqual(once);
  });

  it('retira derivados de cliente, profitMargin e segredos', () => {
    const p = prepareForCloud(migrate(fixture(5)).db);
    const c = p.clients[0] as unknown as Record<string, unknown>;
    for (const k of ['totalSpent', 'serviceCount', 'lastServiceDate', 'averageTicket', 'vipStatus']) expect(k in c).toBe(false);
    expect('profitMargin' in p.workOrders[0]).toBe(false);
    expect(p.settings.googleDriveToken).toBeUndefined();
    expect(p.settings.googleApiKey).toBeUndefined();
    expect(p.settings.name).toBe('OFICINA');
  });

  it('ids repetidos ou faltando viram ${osId}-p${i} / -s${i}', () => {
    const p = prepareForCloud(migrate(fixture(5)).db);
    const w2 = p.workOrders.find(o => o.id === 'W2')!;
    expect(w2.parts.map(x => x.id)).toEqual(['dup', 'W2-p1']);
    expect(w2.services.map(x => x.id)).toEqual(['W2-s0', 'np']);
    // a descrição acompanha o item
    expect(w2.parts[1].description).toBe('Y');
  });

  it('id gerado que colide com um existente ganha sufixo e segue único', () => {
    const db = fixture(5);
    db.workOrders[0].parts = [{ id: '', description: 'a', price: 1 }, { id: 'W1-p0', description: 'b', price: 2 }];
    db.workOrders[0].services = [];
    const ids = prepareForCloud(db).workOrders[0].parts.map(x => x.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids[1]).toBe('W1-p0');
  });
});

describe('ledgerOwnerIndex', () => {
  it('liga por financialId, adiantamento (v5 e legado) e grupo de parcelas', () => {
    for (const v of [3, 5]) {
      const idx = ledgerOwnerIndex(migrate(fixture(v)).db);
      expect(idx.get('L1')).toBe('W1');
      expect(idx.get('L4')).toBe('W2');
      expect(idx.get('L5')).toBe('W2');
      expect(idx.get('L6')).toBe('W3');
      expect(idx.has('L2')).toBe(false);
      expect(idx.has('L3')).toBe(false);
    }
  });

  it('advanceEntryId legado sem advances também vale', () => {
    const db = fixture(5);
    db.workOrders[2].advances = undefined;
    db.workOrders[2].advanceEntryId = 'L6';
    expect(ledgerOwnerIndex(db).get('L6')).toBe('W3');
  });

  it('os_id nas linhas do ledger: dono da OS ou null', () => {
    const rows = splitDatabase(prepareForCloud(fixture(5)), 'dono').filter(r => r.table === 'ledger');
    const m = Object.fromEntries(rows.map(r => [r.id, r.os_id]));
    expect(m).toEqual({ L1: 'W1', L2: null, L3: null, L4: 'W2', L5: 'W2', L6: 'W3' });
  });
});

describe('splitWorkOrder / joinWorkOrder', () => {
  const os = (): WorkOrder => prepareForCloud(fixture(5)).workOrders[0];

  it('divide como na spec', () => {
    const s = splitWorkOrder(os(), 'dono');
    expect(s.main.parts).toEqual([{ id: 'a', description: 'Pastilha', category: 'FREIO' }]);
    expect(s.fin).toMatchObject({ prices: { a: PRICE_A, b: PRICE_B }, total: 10000, financialId: 'L1', paymentMethod: 'SINGLE' });
    expect(s.cost).toEqual({ costs: { a: COST_A }, totalCost: 3000, profit: 7000 });
    expect('total' in s.main).toBe(false);
  });

  it('sem custo nenhum: não emite cost e a junção deixa cost indefinido', () => {
    const w3 = prepareForCloud(fixture(5)).workOrders[2];
    const noCost: WorkOrder = { ...w3, parts: w3.parts.map(p => ({ ...p, cost: undefined })) };
    const s = splitWorkOrder(noCost, 'dono');
    expect(s.cost).toBeUndefined();
    expect(joinWorkOrder(s.main, s.fin)!.parts[0].cost).toBeUndefined();
  });

  it('sem finance: price 0 e total 0', () => {
    const s = splitWorkOrder(os(), 'mecanico');
    const j = joinWorkOrder(s.main)!;
    expect(j.total).toBe(0);
    expect([...j.parts, ...j.services].every(i => i.price === 0 && i.cost === undefined)).toBe(true);
    expect(j.status).toBe('FINALIZADO');
  });

  it('recepção: preços sim, custos não', () => {
    const j = joinWorkOrder(...(() => { const s = splitWorkOrder(os(), 'recepcao'); return [s.main, s.fin, s.cost] as const; })())!;
    expect(j.parts[0].price).toBe(PRICE_A);
    expect(j.parts[0].cost).toBeUndefined();
    expect(j.totalCost).toBeUndefined();
  });

  it('junta só quando os ids de main batem com as chaves de prices; senão null', () => {
    const s = splitWorkOrder(os(), 'dono');
    const staleFin = { ...s.fin!, prices: { a: 1, zzz: 2 } };
    expect(joinWorkOrder(s.main, staleFin, s.cost)).toBeNull();
    const fewer = { ...s.fin!, prices: { a: 1 } };
    expect(joinWorkOrder(s.main, fewer, s.cost)).toBeNull();
    expect(joinWorkOrder(s.main, s.fin, s.cost)).not.toBeNull();
  });

  it('joinDatabaseReport lista as OS que não juntam', () => {
    const rows = splitDatabase(prepareForCloud(fixture(5)), 'dono');
    const bad = rows.map(r => (r.table === 'work_order_finance' && r.id === 'W1' ? { ...r, data: { ...(r.data as object), prices: {} } } : r));
    const rep = joinDatabaseReport(bad);
    expect(rep.skippedOrders).toEqual(['W1']);
    expect(rep.db.workOrders.map(o => o.id)).toEqual(['W2', 'W3']);
  });
});

describe('contrato de linhas (CloudRow)', () => {
  const rows = splitDatabase(prepareForCloud(fixture(5)), 'dono');

  it('catálogo: ids e dados de preço e custo', () => {
    const price = rows.find(r => r.table === 'catalog_prices' && r.id === 'part:CP1')!;
    expect(price.data).toEqual({ kind: 'part', item_id: 'CP1', price: CAT_PRICE });
    expect(rows.find(r => r.table === 'catalog_costs' && r.id === 'part:CP1')!.data).toEqual({ kind: 'part', item_id: 'CP1', cost: CAT_COST });
    expect(rows.find(r => r.table === 'catalog_parts')!.data).toEqual({ description: 'Pastilha', category: 'FREIO' });
    expect(rows.some(r => r.table === 'catalog_costs' && r.id === 'service:CS1')).toBe(false);
    expect(rows.find(r => r.table === 'catalog_prices' && r.id === 'service:CS1')).toBeDefined();
  });

  it('settings única com id main; audit_log por evento; sem colunas do servidor', () => {
    expect(rows.filter(r => r.table === 'settings').map(r => r.id)).toEqual(['main']);
    expect(rows.filter(r => r.table === 'audit_log').map(r => r.id)).toEqual(['E1']);
    const text = JSON.stringify(rows.map(r => r.data));
    for (const k of ['workshop_id', 'updated_at', '"version"']) expect(text).not.toContain(k);
    expect(rows.filter(r => r.table !== 'ledger').every(r => r.os_id === undefined)).toBe(true);
  });

  it('data é JSON puro (sobrevive a JSON.stringify sem mudar)', () => {
    expect(JSON.parse(JSON.stringify(rows))).toEqual(rows);
  });
});

describe('item sem preço e chave desconhecida', () => {
  const p = prepareForCloud(fixture(5));

  it('item sem price mantém a chave em prices (null) e volta sem price', () => {
    const w2 = p.workOrders.find(o => o.id === 'W2')!;
    const s = splitWorkOrder(w2, 'dono');
    expect(s.fin!.prices.np).toBeNull();
    expect(Object.keys(s.fin!.prices).sort()).toEqual(['W2-p1', 'W2-s0', 'dup', 'np']);
    const j = joinWorkOrder(s.main, s.fin, s.cost)!;
    expect(j).not.toBeNull();
    expect('price' in j.services[1]).toBe(false);
    expect(j).toEqual(w2);
  });

  it('catalog_prices de item sem preço é JSON puro e volta sem price', () => {
    const row = splitDatabase(p).find(r => r.table === 'catalog_prices' && r.id === 'service:CS2')!;
    expect(row.data).toEqual({ kind: 'service', item_id: 'CS2', price: null });
    expect(JSON.parse(JSON.stringify(row.data))).toEqual(row.data);
    const cs2 = joinDatabase(splitDatabase(p)).catalogServices.find(c => c.id === 'CS2')!;
    expect('price' in cs2).toBe(false);
  });

  it('chave desconhecida da OS fica fora das linhas do mecânico e volta inteira para o dono', () => {
    const mech = JSON.stringify(splitDatabase(p, 'mecanico'));
    expect(mech).not.toContain('987654');
    expect(mech).not.toContain('desconto');
    expect(mech).not.toContain('obs interna');
    const rows = splitDatabase(p, 'dono');
    const main = rows.find(r => r.table === 'work_orders' && r.id === 'W1')!.data as Record<string, unknown>;
    expect('desconto' in main).toBe(false);
    expect((rows.find(r => r.table === 'work_order_finance' && r.id === 'W1')!.data as { extra: unknown }).extra)
      .toEqual({ desconto: 987654, notes: 'obs interna' });
    const w1 = joinDatabase(rows).workOrders[0] as unknown as Record<string, unknown>;
    expect(w1.desconto).toBe(987654);
    expect(w1.notes).toBe('obs interna');
  });
});

describe('permissões por papel', () => {
  const p = prepareForCloud(fixture(5));
  const tables = (role: 'dono' | 'recepcao' | 'mecanico') => new Set(splitDatabase(p, role).map(r => r.table));

  it('mecânico: sem finance, ledger, preços, custos nem auditoria', () => {
    const t = tables('mecanico');
    for (const x of ['work_order_finance', 'work_order_costs', 'ledger', 'catalog_prices', 'catalog_costs', 'audit_log'] as const) expect(t.has(x)).toBe(false);
    expect(t.has('work_orders')).toBe(true);
    expect(t.has('clients')).toBe(true);
    expect(t.has('appointments')).toBe(true);
  });

  it('mecânico: nenhum valor de preço ou custo aparece em nenhuma linha', () => {
    const text = JSON.stringify(splitDatabase(p, 'mecanico'));
    for (const n of [PRICE_A, PRICE_B, COST_A, CAT_PRICE, CAT_COST, 4000, 6000, 10000, 5000]) expect(text).not.toContain(String(n));
    expect(text).not.toContain('"price"');
    expect(text).not.toContain('"cost"');
    expect(text).not.toContain('"total"');
  });

  it('recepção: preços e ledger sim, custos não', () => {
    const t = tables('recepcao');
    expect(t.has('work_order_finance') && t.has('catalog_prices') && t.has('ledger')).toBe(true);
    expect(t.has('work_order_costs')).toBe(false);
    expect(t.has('catalog_costs')).toBe(false);
    const text = JSON.stringify(splitDatabase(p, 'recepcao'));
    for (const n of [COST_A, CAT_COST]) expect(text).not.toContain(String(n));
  });

  it('dono: tudo', () => {
    const t = tables('dono');
    for (const x of ['work_order_finance', 'work_order_costs', 'ledger', 'catalog_prices', 'catalog_costs', 'audit_log'] as const) expect(t.has(x)).toBe(true);
  });

  it('join de linhas do mecânico: preços 0, catálogo sem preço', () => {
    const j = joinDatabase(splitDatabase(p, 'mecanico'));
    expect(j.workOrders.every(o => o.total === 0)).toBe(true);
    expect(j.catalogParts[0].price).toBe(0);
    expect(j.ledger).toEqual([]);
  });
});

describe('computeTotals', () => {
  it('conta, soma com sinal, total das OS, pagos e adiantamentos', () => {
    const t = computeTotals(prepareForCloud(migrate(fixture(5)).db));
    expect(t.counts).toEqual({ ledger: 6, workOrders: 3, clients: 1, catalogParts: 1, catalogServices: 2, catalogTechnicians: 1, appointments: 1, auditLog: 1 });
    // 10000 + 500 - 300 + 5000 + 5000 + 2000
    expect(t.ledgerSignedCents).toBe(22200);
    expect(t.workOrdersTotalCents).toBe(30000);
    expect(t.paidEntries).toBe(3);
    expect(t.advancesCents).toBe(2000);
  });

  it('bate antes e depois da volta pela nuvem', () => {
    const p = prepareForCloud(migrate(fixture(2)).db);
    expect(computeTotals(joinDatabase(splitDatabase(p)))).toEqual(computeTotals(p));
  });
});

describe('ids estáveis: edição da Recepção preserva os custos do Dono', () => {
  it('fluxo completo split (dono) -> edição -> split (recepção) -> junção com o custo antigo', () => {
    const osDono: WorkOrder = {
      id: 'OSX', osNumber: 9, vehicle: 'Gol - AAA1111', clientName: 'Ana', clientPhone: '1', mileage: 1,
      status: 'EM_SERVICO', createdAt: '2026-01-10T12:00:00.000Z', total: 10000, totalCost: 3000, profit: 7000,
      parts: [{ id: 'p1', description: 'Filtro', price: 4000, cost: 1000 }, { id: 'p2', description: 'Óleo', price: 2000, cost: 500 }],
      services: [{ id: 's1', description: 'Troca', price: 4000, cost: 1500 }],
    };
    const dono = splitWorkOrder(osDono, 'dono');
    const custoAntigo = dono.cost!;
    expect(custoAntigo.costs).toEqual({ p1: 1000, p2: 500, s1: 1500 });

    // Recepção abre a OS (sem custos), muda o preço de p1, remove p2 e adiciona p3.
    const aberta = joinWorkOrder(dono.main, dono.fin)!;
    const p3 = { id: 'p3', description: 'Pastilha', price: 900 };
    const base = updateWorkOrderData(
      aberta, aberta.osNumber, aberta.vehicle, aberta.clientName, aberta.clientPhone, aberta.mileage,
      [{ ...aberta.parts[0], price: 4500 }, p3], aberta.services,
    );
    const r = mergeOSEdit({ opened: aberta, edited: base, current: aberta, drafts: undefined, today: '2026-03-15' });
    if (!r.ok) throw new Error('esperava ok');
    expect(r.base.parts.map(p => p.id)).toEqual(['p1', 'p3']);

    const rec = splitWorkOrder(r.base, 'recepcao');
    expect(rec.cost).toBeUndefined();
    const juntada = joinWorkOrder(rec.main, rec.fin, custoAntigo);
    expect(juntada).not.toBeNull();
    expect(juntada!.parts[0]).toMatchObject({ id: 'p1', price: 4500, cost: 1000 }); // custo mantido no item editado
    expect(juntada!.parts[1].id).toBe('p3');
    expect(juntada!.parts[1].cost).toBeUndefined(); // item novo: custo não informado
    expect(juntada!.services[0].cost).toBe(1500);
    expect(JSON.stringify(juntada)).not.toContain('"p2"'); // a chave órfã p2 do custo é ignorada
  });
});

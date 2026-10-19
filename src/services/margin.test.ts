import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TARGET_MARGIN, buildMarginReport, computeMargin, computeOSMargin, formatPct, getTargetMargin,
  hasCost, inPeriod, marginLabel, marginLevel, parseTargetMarginDraft, suggestPriceForTarget,
} from './margin';
import { CatalogItem, OrderItem, OSStatus, WorkOrder } from '../types';

const it$ = (price: number, cost?: number, o: Partial<OrderItem> = {}): OrderItem =>
  ({ id: `i${Math.random()}`, description: 'Item', price, cost, ...o });
const iso = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12).toISOString();
};
let seq = 0;
const os = (day: string, parts: OrderItem[], services: OrderItem[] = [], status: OSStatus = 'FINALIZADO'): WorkOrder => ({
  id: `o${++seq}`, osNumber: seq, vehicle: 'Gol - AAA1A11', clientName: 'Maria', clientPhone: '',
  mileage: 0, status, parts, services, total: 0, createdAt: iso(day),
});

describe('parseTargetMarginDraft', () => {
  it('vazio restaura o padrão', () => {
    expect(parseTargetMarginDraft('')).toEqual({ kind: 'empty' });
    expect(parseTargetMarginDraft('  ')).toEqual({ kind: 'empty' });
  });
  it('inteiro 1..99 é válido', () => {
    expect(parseTargetMarginDraft('1')).toEqual({ kind: 'valid', value: 1 });
    expect(parseTargetMarginDraft(' 70 ')).toEqual({ kind: 'valid', value: 70 });
    expect(parseTargetMarginDraft('99')).toEqual({ kind: 'valid', value: 99 });
  });
  it('parcial ou fora da faixa é inválido (nunca vira "7")', () => {
    for (const t of ['7,5', '7.5', '7,', '0', '100', '-5', 'abc', '1e1']) expect(parseTargetMarginDraft(t)).toEqual({ kind: 'invalid' });
  });
});

describe('getTargetMargin', () => {
  it('padrão 70 quando ausente ou inválido', () => {
    expect(DEFAULT_TARGET_MARGIN).toBe(70);
    for (const v of [undefined, 0, 100, -5, 50.5, NaN, Infinity]) expect(getTargetMargin({ targetMargin: v })).toBe(70);
    expect(getTargetMargin()).toBe(70);
    expect(getTargetMargin(null)).toBe(70);
  });
  it('aceita 1..99 inteiro', () => {
    expect(getTargetMargin({ targetMargin: 1 })).toBe(1);
    expect(getTargetMargin({ targetMargin: 55 })).toBe(55);
    expect(getTargetMargin({ targetMargin: 99 })).toBe(99);
  });
});

describe('hasCost / computeMargin', () => {
  it('custo indefinido ou 0 = sem custo', () => {
    expect(hasCost({})).toBe(false);
    expect(hasCost({ cost: 0 })).toBe(false);
    expect(hasCost({ cost: 1 })).toBe(true);
  });
  it('todos com custo', () => {
    const m = computeMargin([it$(10000, 3000), it$(5000, 2000)]);
    expect(m).toMatchObject({ revenue: 15000, costedRevenue: 15000, cost: 5000, profit: 10000, itemsWithoutCost: 0, revenueWithoutCost: 0, coveragePct: 100 });
    expect(m.marginPct).toBeCloseTo(66.6667, 3);
  });
  it('exato sem ruído de float (70%)', () => {
    expect(computeMargin([it$(10000, 3000)]).marginPct).toBe(70);
  });
  it('item sem custo fica fora da margem e é contado à parte', () => {
    const m = computeMargin([it$(10000, 4000), it$(10000), it$(10000, 0)]);
    expect(m).toMatchObject({ revenue: 30000, costedRevenue: 10000, cost: 4000, profit: 6000, itemsWithoutCost: 2, revenueWithoutCost: 20000 });
    expect(m.marginPct).toBe(60);
    expect(m.coveragePct).toBeCloseTo(33.333, 2);
  });
  it('só itens sem custo: margem null', () => {
    const m = computeMargin([it$(10000), it$(500, 0)]);
    expect(m.marginPct).toBeNull();
    expect(m.coveragePct).toBe(0);
    expect(m.revenue).toBe(10500);
  });
  it('receita 0 / lista vazia', () => {
    const m = computeMargin([]);
    expect(m).toMatchObject({ revenue: 0, costedRevenue: 0, profit: 0, marginPct: null, coveragePct: 0 });
    expect(computeMargin([it$(0, 100)]).marginPct).toBeNull();
  });
  it('prejuízo dá margem negativa', () => {
    expect(computeMargin([it$(1000, 1500)]).marginPct).toBe(-50);
  });
  it('computeOSMargin soma peças e serviços', () => {
    const m = computeOSMargin({ parts: [it$(6000, 3000)], services: [it$(4000, 1000)] });
    expect(m).toMatchObject({ revenue: 10000, cost: 4000, profit: 6000, marginPct: 60 });
  });
});

describe('marginLevel / marginLabel', () => {
  it('limites exatos', () => {
    expect(marginLevel(null, 70)).toBe('SEM_CUSTO');
    expect(marginLevel(70, 70)).toBe('NA_META');
    expect(marginLevel(69.99, 70)).toBe('ATENCAO');
    expect(marginLevel(35, 70)).toBe('ATENCAO');
    expect(marginLevel(34.99, 70)).toBe('ABAIXO');
    expect(marginLevel(-10, 70)).toBe('ABAIXO');
    expect(marginLevel(0, 70)).toBe('ABAIXO');
  });
  it('rótulos em pt-BR', () => {
    expect(marginLabel('NA_META', 72)).toBe('Margem 72%');
    expect(marginLabel('NA_META', 72.46)).toBe('Margem 72,5%');
    expect(marginLabel('ATENCAO', 45)).toBe('Atenção (45%)');
    expect(marginLabel('ABAIXO', 41.04)).toBe('Abaixo da meta (41%)');
    expect(marginLabel('SEM_CUSTO', null)).toBe('Sem custo');
  });
  it('formatPct', () => {
    expect(formatPct(70)).toBe('70');
    expect(formatPct(66.6667)).toBe('66,7');
  });
});

describe('suggestPriceForTarget', () => {
  it('atinge a meta', () => {
    expect(suggestPriceForTarget(3000, 70)).toBe(10000);
    expect(suggestPriceForTarget(1000, 50)).toBe(2000);
  });
  it('arredonda para cima, em centavos', () => {
    expect(suggestPriceForTarget(1000, 70)).toBe(3334);
    expect(suggestPriceForTarget(1001, 60)).toBe(2503);
  });
  it('o preço sugerido sempre atinge a meta (nunca fica abaixo)', () => {
    for (const target of [10, 33, 50, 70, 85, 99]) {
      for (let cost = 1; cost <= 500; cost++) {
        const price = suggestPriceForTarget(cost, target) as number;
        expect(((price - cost) * 100) / price).toBeGreaterThanOrEqual(target - 1e-9);
        expect(((price - 1 - cost) * 100) / (price - 1)).toBeLessThan(target);
      }
    }
  });
  it('alvo 99', () => expect(suggestPriceForTarget(100, 99)).toBe(10000));
  it('guardas: alvo >= 100 e custo <= 0', () => {
    expect(suggestPriceForTarget(100, 100)).toBeNull();
    expect(suggestPriceForTarget(100, 150)).toBeNull();
    expect(suggestPriceForTarget(0, 70)).toBeNull();
    expect(suggestPriceForTarget(-5, 70)).toBeNull();
  });
});

describe('inPeriod', () => {
  const o = (day: string) => ({ createdAt: iso(day) });
  it('mês', () => {
    expect(inPeriod(o('2026-03-10'), 'MONTH', '2026-03')).toBe(true);
    expect(inPeriod(o('2026-04-01'), 'MONTH', '2026-03')).toBe(false);
  });
  it('ano e virada de ano', () => {
    expect(inPeriod(o('2026-01-02'), 'YEAR', '2026-12')).toBe(true);
    expect(inPeriod(o('2025-12-30'), 'YEAR', '2026-01')).toBe(false);
    expect(inPeriod(o('2025-12-30'), 'MONTH', '2026-01')).toBe(false);
    expect(inPeriod(o('2025-12-30'), 'MONTH', '2025-12')).toBe(true);
  });
});

describe('buildMarginReport', () => {
  const catParts: CatalogItem[] = [{ id: 'cp1', description: 'Pastilha', price: 20000 }];
  const catServ: CatalogItem[] = [{ id: 'cs1', description: 'Alinhamento', price: 8000 }];
  const base = { mode: 'MONTH' as const, selectedMonth: '2026-09', catalogParts: catParts, catalogServices: catServ, today: '2026-10-16' };

  const pastilha = (price: number, cost?: number, extra: Partial<OrderItem> = {}) =>
    it$(price, cost, { catalogItemId: 'cp1', description: 'Pastilha', category: 'FREIO', ...extra });
  const alinh = (price: number, cost?: number) => it$(price, cost, { catalogItemId: 'cs1', description: 'Alinhamento' });

  const wos = [
    os('2026-09-05', [pastilha(20000, 5000)], [alinh(8000, 4000)]),                    // margem ~68%
    os('2026-09-06', [pastilha(10000, 9000)], [alinh(8000, 2000)], 'AGUARDANDO_PAGAMENTO'), // baixa
    os('2026-09-07', [pastilha(99999, 1)], [], 'ARQUIVADO'),                            // fora
    os('2026-09-08', [pastilha(99999, 1)], [], 'ORCAMENTO'),                            // fora
    os('2026-08-31', [pastilha(99999, 1)], [], 'FINALIZADO'),                           // fora do período
    os('2026-09-09', [it$(3000, undefined, { description: '  Lâmpada ' })], [it$(1000, undefined, { description: 'Lavagem' })]), // sem custo
    os('2026-09-10', [it$(2000, 500, { description: 'lâmpada' })]),                     // sem id, outro nome normalizado
  ];
  const r = buildMarginReport({ ...base, workOrders: wos, settings: { targetMargin: 70 } });

  it('escopo: só finalizadas e aguardando pagamento do período', () => {
    expect(r.target).toBe(70);
    expect(r.scopeCount).toBe(4);
  });
  it('totais', () => {
    // com custo: pastilha 20000/5000, alinh 8000/4000, pastilha 10000/9000, alinh 8000/2000, lâmpada 2000/500
    expect(r.totals.costedRevenue).toBe(48000);
    expect(r.totals.cost).toBe(20500);
    expect(r.totals.profit).toBe(27500);
    expect(r.totals.revenue).toBe(52000);
    expect(r.totals.itemsWithoutCost).toBe(2);
    expect(r.totals.revenueWithoutCost).toBe(4000);
  });
  it('OS abaixo da meta, pior primeiro; sem custo não entra', () => {
    const nums = r.osBelowTarget.map(x => x.os.osNumber);
    expect(nums.length).toBe(2);
    expect(r.osBelowTarget[0].margin.marginPct as number).toBeLessThanOrEqual(r.osBelowTarget[1].margin.marginPct as number);
    expect(r.osBelowTarget.every(x => x.margin.marginPct !== null && x.margin.marginPct < 70)).toBe(true);
    expect(r.osBelowTarget[0].os.parts[0].price).toBe(10000);
  });
  it('agrupa peças por catalogItemId e por descrição normalizada', () => {
    const past = r.byPart.find(x => x.key === 'cp1');
    expect(past).toMatchObject({ count: 2, revenue: 30000, cost: 14000, profit: 16000, catalogPrice: 20000 });
    const lamp = r.byPart.filter(x => x.key === 'lâmpada');
    expect(lamp.length).toBe(1);
    expect(lamp[0]).toMatchObject({ count: 2, revenue: 5000, cost: 500, profit: 1500, catalogPrice: null });
    expect(lamp[0].marginPct).toBe(75);
    expect(lamp[0].coveragePct).toBe(40);
  });
  it('ordena da pior margem para a melhor; null por último', () => {
    expect(r.byPart.map(x => x.key)).toEqual(['cp1', 'lâmpada']);
    expect(r.byService.map(x => x.key)).toEqual(['cs1', 'lavagem']);
    expect(r.byService[1].marginPct).toBeNull();
    expect(r.byService[0].catalogPrice).toBe(8000);
  });
  it('mediana histórica só com 3+ vendas finalizadas', () => {
    // pastilha finalizada: 20000, 99999 (ago) , 99999 (arquivada não) => finalizadas na janela: 20000 e 99999(31/08) = 2
    expect(r.byPart.find(x => x.key === 'cp1')?.medianPrice).toBeNull();
    const many = [1, 2, 3].map(n => os(`2026-09-0${n}`, [pastilha(1000 * n, 100)]));
    const r2 = buildMarginReport({ ...base, workOrders: many });
    expect(r2.byPart[0].medianPrice).toBe(2000);
  });
  it('categorias: peças por categoria (OUTROS por padrão) e serviços como Mão de obra', () => {
    const byKey = Object.fromEntries(r.byCategory.map(x => [x.key, x]));
    expect(byKey.FREIO.description).toBe('Freio');
    expect(byKey.FREIO.count).toBe(2);
    expect(byKey.OUTROS.description).toBe('Outros');
    expect(byKey.OUTROS.count).toBe(2);
    expect(byKey.MAO_DE_OBRA.description).toBe('Mão de obra');
    expect(byKey.MAO_DE_OBRA.count).toBe(3);
    expect(byKey.MAO_DE_OBRA.revenue).toBe(17000);
  });
  it('itens sem custo listados por receita', () => {
    expect(r.itemsWithoutCost).toEqual([
      { key: 'lâmpada', description: '  Lâmpada ', kind: 'PART', occurrences: 1, revenue: 3000 },
      { key: 'lavagem', description: 'Lavagem', kind: 'SERVICE', occurrences: 1, revenue: 1000 },
    ]);
  });
  it('relatório do ano e meta padrão', () => {
    const y = buildMarginReport({ ...base, mode: 'YEAR', selectedMonth: '2026-01', workOrders: wos });
    expect(y.target).toBe(70);
    expect(y.scopeCount).toBe(5);
  });
  it('sem OS no escopo', () => {
    const e = buildMarginReport({ ...base, workOrders: [] });
    expect(e.scopeCount).toBe(0);
    expect(e.totals.marginPct).toBeNull();
    expect(e.byPart).toEqual([]);
  });
});

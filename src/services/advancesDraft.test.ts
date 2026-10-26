import { describe, expect, it } from 'vitest';
import type { WorkOrder } from '../types';
import {
  advanceRowError, advanceRowsToPayload, advanceTotals, buildAdvanceRows, firstInvalidAdvanceRow,
  removeAdvanceRow, sortAdvanceRows, upsertAdvanceRow,
} from './advancesDraft';
import { parseDateOnly } from '../utils/dates';

const noon = (d: string) => parseDateOnly(d).toISOString();
const os = (extra: Partial<WorkOrder>): WorkOrder => ({ id: 'o1', createdAt: noon('2026-10-01'), total: 100000, ...extra } as WorkOrder);
const TODAY = '2026-10-23';

describe('advancesDraft', () => {
  it('monta linhas v4 ordenadas por data', () => {
    const rows = buildAdvanceRows(os({ advances: [
      { id: 'b', date: noon('2026-10-10'), amount: 5000, entryId: 'e2' },
      { id: 'a', date: noon('2026-10-05'), amount: 20000, entryId: 'e1' },
    ] }), TODAY);
    expect(rows.map(r => [r.id, r.date, r.amount])).toEqual([['a', '2026-10-05', 20000], ['b', '2026-10-10', 5000]]);
  });

  it('OS legada vira uma linha sem id, na data de criação', () => {
    const rows = buildAdvanceRows(os({ advanceAmount: 15000 }), TODAY);
    expect(rows).toEqual([{ key: 'legado', date: '2026-10-01', amount: 15000 }]);
  });

  it('sem adiantamento ou sem OS: lista vazia', () => {
    expect(buildAdvanceRows(os({}), TODAY)).toEqual([]);
    expect(buildAdvanceRows(null, TODAY)).toEqual([]);
  });

  it('total e restante; restante nunca negativo; aviso quando passa', () => {
    expect(advanceTotals([{ amount: 20000 }, { amount: 5000 }], 100000)).toEqual({ sum: 25000, remaining: 75000, exceeds: false });
    expect(advanceTotals([{ amount: 120000 }], 100000)).toEqual({ sum: 120000, remaining: 0, exceeds: true });
    expect(advanceTotals([], 100000)).toEqual({ sum: 0, remaining: 100000, exceeds: false });
  });

  it('valida valor, data inválida e data futura', () => {
    expect(advanceRowError({ date: TODAY, amount: 100 }, TODAY)).toBeUndefined();
    expect(advanceRowError({ date: '2026-10-22', amount: 100 }, TODAY)).toBeUndefined();
    expect(advanceRowError({ date: '2026-10-24', amount: 100 }, TODAY)).toMatch(/futura/);
    expect(advanceRowError({ date: '2026-02-31', amount: 100 }, TODAY)).toMatch(/válida/);
    expect(advanceRowError({ date: TODAY, amount: 0 }, TODAY)).toMatch(/maior que zero/);
    expect(advanceRowError({ date: TODAY, amount: undefined }, TODAY)).toMatch(/maior que zero/);
  });

  it('payload leva todos, id só nos existentes, por data', () => {
    const rows = [
      { key: 'novo-1', date: '2026-10-20', amount: 3000 },
      { key: 'a', id: 'a', date: '2026-10-05', amount: 20000 },
    ];
    expect(advanceRowsToPayload(rows)).toEqual([
      { id: 'a', date: '2026-10-05', amount: 20000 },
      { date: '2026-10-20', amount: 3000 },
    ]);
  });

  it('upsert troca pela key e reordena; remove tira só a linha', () => {
    const base = [{ key: 'a', id: 'a', date: '2026-10-05', amount: 100 }, { key: 'b', id: 'b', date: '2026-10-10', amount: 200 }];
    const edited = upsertAdvanceRow(base, { key: 'a', id: 'a', date: '2026-10-15', amount: 150 });
    expect(edited.map(r => r.key)).toEqual(['b', 'a']);
    expect(upsertAdvanceRow(base, { key: 'novo-1', date: '2026-10-01', amount: 50 }).map(r => r.key)).toEqual(['novo-1', 'a', 'b']);
    expect(removeAdvanceRow(base, 'a').map(r => r.key)).toEqual(['b']);
    expect(base).toHaveLength(2);
  });

  it('empate de data mantém a ordem; achar primeira linha inválida', () => {
    const rows = [{ key: 'x', date: '2026-10-05', amount: 1 }, { key: 'y', date: '2026-10-05', amount: 2 }];
    expect(sortAdvanceRows(rows).map(r => r.key)).toEqual(['x', 'y']);
    expect(firstInvalidAdvanceRow(rows, TODAY)).toBeUndefined();
    expect(firstInvalidAdvanceRow(rows, '2026-10-01')?.key).toBe('x');
  });
});

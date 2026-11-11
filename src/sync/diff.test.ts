import { describe, it, expect } from 'vitest';
import type { InstallmentConfig, WorkOrder } from '../types';
import { classify, diffById } from './diff';
import type { SeenEntry } from './diff';

const os = (over: Partial<WorkOrder> = {}): WorkOrder => ({
  id: 'W1', osNumber: 1, vehicle: 'Uno - AAA1111', clientName: 'Ana', clientPhone: '1', mileage: 10,
  status: 'EM_SERVICO', createdAt: '2026-01-01T15:00:00.000Z', total: 1000,
  parts: [{ id: 'p1', description: 'Filtro', price: 1000 }], services: [], ...over,
});

interface Rec { id: string; x?: number; y?: number }

describe('diffById', () => {
  const a: Rec = { id: 'a', x: 1, y: 2 };
  const seenOf = (items: Rec[]): Map<string, SeenEntry<Rec>> => diffById(new Map<string, SeenEntry<Rec>>(), items).next;

  it('primeira vez: tudo é upsert novo', () => {
    const d = diffById(new Map<string, SeenEntry<Rec>>(), [a]);
    expect(d.upserts).toEqual([{ id: 'a', value: a, before: null }]);
    expect(d.deletes).toEqual([]);
  });

  it('mesma referência é pulada', () => {
    const seen = seenOf([a]);
    const d = diffById(seen, [a]);
    expect(d.upserts).toEqual([]);
    expect(d.next.get('a')).toBe(seen.get('a'));
  });

  it('referência nova com mesmo JSON (ordem de chaves diferente) não gera upsert', () => {
    const seen = seenOf([a]);
    const b: Rec = { y: 2, x: 1, id: 'a' };
    const d = diffById(seen, [b]);
    expect(d.upserts).toEqual([]);
    expect(d.next.get('a')?.ref).toBe(b);
  });

  it('conteúdo diferente vira upsert com o antes', () => {
    const seen = seenOf([a]);
    const b: Rec = { id: 'a', x: 9, y: 2 };
    expect(diffById(seen, [b]).upserts).toEqual([{ id: 'a', value: b, before: a }]);
  });

  it('id que sumiu vira delete; a entrada não é mutada', () => {
    const seen = seenOf([a, { id: 'b' }]);
    const d = diffById(seen, [a]);
    expect(d.deletes).toEqual([{ id: 'b', before: { id: 'b' } }]);
    expect(seen.size).toBe(2);
    expect(d.next.has('b')).toBe(false);
  });
});

describe('classify', () => {
  it('Mecânico: status e km passam; cliente, item, total não; não cria nem exclui OS', () => {
    const o = os({ total: 0, parts: [{ id: 'p1', description: 'Filtro', price: 0 }] });
    expect(classify('mecanico', 'workOrders', o, { ...o, status: 'APROVADO', mileage: 20 })).toBe('ok');
    expect(classify('mecanico', 'workOrders', o, { ...o, clientName: 'Outro' })).toBe('denied');
    expect(classify('mecanico', 'workOrders', o, { ...o, parts: [] })).toBe('denied');
    expect(classify('mecanico', 'workOrders', o, { ...o, total: 5 })).toBe('denied');
    expect(classify('mecanico', 'workOrders', null, o)).toBe('denied');
    expect(classify('mecanico', 'workOrders', o, null)).toBe('denied');
  });

  it('barra dinheiro plano (Recepção: money_op; Mecânico: denied)', () => {
    const o = os();
    const patches: Partial<WorkOrder>[] = [
      { financialId: 'L1' }, { paymentDate: '2026-02-01' }, { paymentMethod: 'SINGLE' },
      { advances: [{ id: 'A', date: 'd', amount: 1, entryId: 'L' }] }, { advanceAmount: 5 }, { advanceEntryId: 'L' },
      { installmentConfig: { groupId: 'G' } as unknown as InstallmentConfig },
    ];
    for (const patch of patches) {
      expect(classify('recepcao', 'workOrders', o, { ...o, ...patch })).toBe('money_op');
      expect(classify('dono', 'workOrders', o, { ...o, ...patch })).toBe('money_op');
      expect(classify('mecanico', 'workOrders', o, { ...o, ...patch })).toBe('denied');
    }
  });

  it('description do installmentConfig e advances vazio contra ausente não contam', () => {
    const ic = { groupId: 'G', description: 'a' } as unknown as InstallmentConfig;
    const o = os({ installmentConfig: ic, financialId: 'L1', advances: [] });
    const p = os({ installmentConfig: { ...ic, description: 'b' } as unknown as InstallmentConfig, financialId: 'L1' });
    expect(classify('recepcao', 'workOrders', o, p)).toBe('ok');
  });

  it('total e preços: livres sem receita; dinheiro com receita ou finalizada', () => {
    const o = os();
    const cheaper = { total: 500, parts: [{ id: 'p1', description: 'Filtro', price: 500 }] };
    expect(classify('recepcao', 'workOrders', o, { ...o, ...cheaper })).toBe('ok');
    const withReceipt = os({ financialId: 'L1' });
    expect(classify('recepcao', 'workOrders', withReceipt, { ...withReceipt, ...cheaper })).toBe('money_op');
    const done = os({ status: 'FINALIZADO' });
    expect(classify('dono', 'workOrders', done, { ...done, total: 1 })).toBe('money_op');
    const renamed = { ...withReceipt, parts: [{ id: 'p1', description: 'Filtro novo', price: 1000 }] };
    expect(classify('recepcao', 'workOrders', withReceipt, renamed)).toBe('ok');
  });

  it('transições de status do guard_work_orders', () => {
    const o = os();
    expect(classify('recepcao', 'workOrders', o, { ...o, status: 'FINALIZADO' })).toBe('money_op');
    const fin = os({ status: 'FINALIZADO' });
    expect(classify('recepcao', 'workOrders', fin, { ...fin, status: 'EM_SERVICO' })).toBe('money_op');
    expect(classify('recepcao', 'workOrders', fin, { ...fin, status: 'ARQUIVADO' })).toBe('ok');
    const arq = os({ status: 'ARQUIVADO' });
    expect(classify('recepcao', 'workOrders', arq, { ...arq, status: 'APROVADO' })).toBe('money_op');
    const ag = os({ status: 'AGUARDANDO_PAGAMENTO', financialId: 'L1' });
    expect(classify('recepcao', 'workOrders', ag, { ...ag, status: 'EM_SERVICO' })).toBe('money_op');
    const ag2 = os({ status: 'AGUARDANDO_PAGAMENTO' });
    expect(classify('recepcao', 'workOrders', ag2, { ...ag2, status: 'EM_SERVICO' })).toBe('ok');
  });

  it('OS: criar e excluir', () => {
    const o = os();
    expect(classify('recepcao', 'workOrders', null, o)).toBe('ok');
    expect(classify('recepcao', 'workOrders', null, os({ status: 'FINALIZADO' }))).toBe('money_op');
    expect(classify('recepcao', 'workOrders', null, os({ financialId: 'L' }))).toBe('money_op');
    expect(classify('recepcao', 'workOrders', o, null)).toBe('money_op');
  });

  it('coleção proibida para o papel', () => {
    const r = { id: 'x' };
    const r2 = { id: 'x', n: 1 };
    expect(classify('mecanico', 'ledger', null, r)).toBe('denied');
    expect(classify('recepcao', 'ledger', r, null)).toBe('denied');
    expect(classify('dono', 'ledger', r, null)).toBe('online_only');
    expect(classify('mecanico', 'clients', null, r)).toBe('ok');
    expect(classify('mecanico', 'clients', r, r2)).toBe('denied');
    expect(classify('recepcao', 'settings', r, r2)).toBe('denied');
    expect(classify('dono', 'settings', r, r2)).toBe('ok');
    expect(classify('dono', 'auditLog', null, r)).toBe('denied');
    expect(classify('recepcao', 'catalogParts', r, null)).toBe('denied');
    expect(classify('mecanico', 'appointments', r, r2)).toBe('ok');
    expect(classify('mecanico', 'appointments', r, null)).toBe('denied');
  });

  it('item 3: sem os.seePrices, sair de AGUARDANDO_PAGAMENTO é denied (cache sem finance)', () => {
    const ag = os({ status: 'AGUARDANDO_PAGAMENTO', total: 0 });
    expect(classify('mecanico', 'workOrders', ag, { ...ag, status: 'EM_SERVICO' })).toBe('denied');
    expect(classify('mecanico', 'workOrders', os({ status: 'APROVADO' }), os({ status: 'EM_SERVICO' }))).toBe('ok');
  });

  it('item 12: installmentConfig que não é objeto é comparado inteiro', () => {
    const arr = (d: string) => [{ description: d }] as unknown as InstallmentConfig;
    const o = os({ installmentConfig: arr('a') });
    expect(classify('recepcao', 'workOrders', o, { ...o, installmentConfig: arr('b') })).toBe('money_op');
  });
});

describe('classify: ledger (item 10)', () => {
  const l = { id: 'L1', description: 'a', amount: 5 };
  it('lançamento manual novo, editado ou excluído: online_only', () => {
    expect(classify('recepcao', 'ledger', null, l)).toBe('online_only');
    expect(classify('recepcao', 'ledger', l, { ...l, amount: 6 })).toBe('online_only');
    expect(classify('dono', 'ledger', l, null)).toBe('online_only');
    expect(classify('recepcao', 'ledger', l, null)).toBe('denied');
    expect(classify('mecanico', 'ledger', null, l)).toBe('denied');
  });
  it('paymentDate muda: money_op, manual ou de OS', () => {
    expect(classify('recepcao', 'ledger', l, { ...l, paymentDate: '2026-01-01' })).toBe('money_op');
    expect(classify('dono', 'ledger', l, { ...l, paymentDate: '2026-01-01' }, { ledgerOsId: 'W1' })).toBe('money_op');
  });
  it('lançamento de OS: só description é livre; o resto e a exclusão são money_op', () => {
    const ctx = { ledgerOsId: 'W1' };
    expect(classify('recepcao', 'ledger', l, { ...l, description: 'b' }, ctx)).toBe('ok');
    expect(classify('recepcao', 'ledger', l, { ...l, amount: 9 }, ctx)).toBe('money_op');
    expect(classify('dono', 'ledger', l, null, ctx)).toBe('money_op');
  });
});

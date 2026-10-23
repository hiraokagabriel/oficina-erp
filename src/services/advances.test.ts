import { describe, expect, it } from 'vitest';
import {
  advancesExceedTotal, findAdvanceOwner, removeAllAdvances, sumAdvances, syncAdvances, validateAdvance,
} from './advances';
import { buildInstallmentEntries, getRemainingAmount, refreshFinishedReceipt } from './osFinanceService';
import type { InstallmentConfig, LedgerEntry, OSAdvance, WorkOrder } from '../types';

// Fixtures sintéticas.
const NOW = '2026-03-15T15:00:00.000Z';
const noon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).toISOString();
const seq = (prefix = 'id') => { let n = 0; return () => `${prefix}${++n}`; };

const os = (over: Partial<WorkOrder> = {}): WorkOrder => ({
  id: 'os1', osNumber: 7, vehicle: 'Gol - AAA-0001', clientName: 'Cliente Teste', clientPhone: '1',
  mileage: 0, status: 'APROVADO', parts: [], services: [], total: 10000,
  createdAt: '2026-01-10T12:00:00.000Z', ...over,
});
const adv = (id: string, amount: number, date: string, entryId = `e-${id}`): OSAdvance => ({ id, amount, date, entryId });
const entry = (id: string, over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id, description: 'x', amount: 1000, type: 'CREDIT',
  effectiveDate: '2026-01-10T12:00:00.000Z', createdAt: '2026-01-10T12:00:00.000Z', ...over,
});
const receipt = (a: OSAdvance, description = 'Adiantamento OS #7 - Cliente Teste'): LedgerEntry => ({
  id: a.entryId, description, amount: a.amount, type: 'CREDIT', effectiveDate: a.date, createdAt: NOW, paymentDate: a.date,
});
const run = (o: WorkOrder, drafts: { id?: string; date: string; amount: number }[], ledger: LedgerEntry[], extra: { now?: string } = {}) =>
  syncAdvances({ os: o, drafts, ledger, now: extra.now ?? NOW, newId: seq(), machine: 'PC-OFICINA' });

describe('sumAdvances / getRemainingAmount / advancesExceedTotal', () => {
  it('soma e restante com advances; nunca negativo', () => {
    const o = os({ total: 10000, advances: [adv('a', 3000, noon(2026, 3, 1)), adv('b', 2000, noon(2026, 3, 2))] });
    expect(sumAdvances(o)).toBe(5000);
    expect(getRemainingAmount(o)).toBe(5000);
    expect(getRemainingAmount({ ...o, total: 4000 })).toBe(0);
  });
  it('advances vazio: restante = total; sem advances usa a regra legada', () => {
    expect(getRemainingAmount(os({ advances: [] }))).toBe(10000);
    expect(getRemainingAmount(os({ advanceAmount: 3000, advanceEntryId: 'x' }))).toBe(7000);
    expect(getRemainingAmount(os({ advanceAmount: 3000 }))).toBe(10000);
    expect(sumAdvances(os())).toBe(0);
  });
  it('advances manda sobre os campos legados', () => {
    expect(getRemainingAmount(os({ advances: [adv('a', 1000, noon(2026, 3, 1))], advanceAmount: 9000, advanceEntryId: 'x' }))).toBe(9000);
  });
  it('aviso quando a soma passa do total (igual não avisa)', () => {
    expect(advancesExceedTotal(os({ total: 1000, advances: [adv('a', 1001, noon(2026, 3, 1))] }))).toBe(true);
    expect(advancesExceedTotal(os({ total: 1000, advances: [adv('a', 1000, noon(2026, 3, 1))] }))).toBe(false);
    expect(advancesExceedTotal(os())).toBe(false);
  });
});

describe('validateAdvance', () => {
  const today = '2026-03-15';
  it('aceita hoje e passado', () => {
    expect(validateAdvance({ date: '2026-03-15', amount: 100 }, today)).toEqual({ valid: true });
    expect(validateAdvance({ date: '2025-12-31', amount: 100 }, today).valid).toBe(true);
  });
  it('recusa data futura', () => {
    expect(validateAdvance({ date: '2026-03-16', amount: 100 }, today))
      .toEqual({ valid: false, error: 'A data do adiantamento não pode ser futura.' });
  });
  it('recusa data inválida ou inexistente no calendário', () => {
    for (const d of ['', 'lixo', '2026-02-31', '2026-13-01']) {
      expect(validateAdvance({ date: d, amount: 100 }, today).valid).toBe(false);
    }
  });
  it('recusa valor zero, negativo, fracionado ou NaN', () => {
    for (const a of [0, -1, 10.5, NaN, Infinity]) {
      expect(validateAdvance({ date: today, amount: a }, today).valid).toBe(false);
    }
  });
  it('aceita ISO e compara pelo dia local', () => {
    expect(validateAdvance({ date: noon(2026, 3, 15), amount: 1 }, today).valid).toBe(true);
    expect(validateAdvance({ date: noon(2026, 3, 16), amount: 1 }, today).valid).toBe(false);
  });
});

describe('syncAdvances: criar', () => {
  it('rascunho novo cria lançamento recebido + evento CRIADO', () => {
    const base = entry('outro');
    const r = run(os(), [{ date: '2026-03-10', amount: 3000 }], [base]);
    expect(r.advances).toEqual([{ id: 'id1', date: noon(2026, 3, 10), amount: 3000, entryId: 'id2' }]);
    expect(r.ledger).toHaveLength(2);
    expect(r.ledger[0]).toEqual({
      id: 'id2', description: 'Adiantamento OS #7 - Cliente Teste', amount: 3000, type: 'CREDIT',
      effectiveDate: noon(2026, 3, 10), createdAt: NOW, paymentDate: noon(2026, 3, 10),
    });
    expect(r.ledger[1]).toBe(base);
    expect(r.events).toEqual([{
      id: 'id3', at: NOW, machine: 'PC-OFICINA', action: 'ADIANTAMENTO_CRIADO', osId: 'os1', osNumber: 7,
      advanceId: 'id1', after: { date: noon(2026, 3, 10), amount: 3000 },
    }]);
    expect(r.events[0].before).toBeUndefined();
  });
  it('id desconhecido no rascunho conta como novo (e não reaproveita o id)', () => {
    const r = run(os(), [{ id: 'fantasma', date: '2026-03-10', amount: 500 }], []);
    expect(r.advances[0].id).not.toBe('fantasma');
    expect(r.events.map(e => e.action)).toEqual(['ADIANTAMENTO_CRIADO']);
  });
  it('vários adiantamentos na mesma chamada, na ordem do rascunho', () => {
    const r = run(os(), [{ date: '2026-03-01', amount: 1000 }, { date: '2026-03-05', amount: 2000 }], []);
    expect(r.advances.map(a => a.amount)).toEqual([1000, 2000]);
    expect(r.ledger.map(e => e.amount)).toEqual([1000, 2000]);
    expect(r.events).toHaveLength(2);
  });
});

describe('syncAdvances: alterar, remover e igual', () => {
  const a1 = adv('a1', 3000, noon(2026, 3, 1));
  const a2 = adv('a2', 2000, noon(2026, 3, 2));
  const base = os({ advances: [a1, a2] });
  const ledger = [receipt(a1), receipt(a2), entry('outro')];

  it('valor ou data mudou: atualiza lançamento + ALTERADO com before/after', () => {
    const r = run(base, [{ id: 'a1', date: '2026-03-03', amount: 3500 }, { id: 'a2', date: '2026-03-02', amount: 2000 }], ledger);
    expect(r.advances[0]).toEqual({ id: 'a1', date: noon(2026, 3, 3), amount: 3500, entryId: 'e-a1' });
    expect(r.advances[1]).toBe(a2);
    expect(r.ledger.find(e => e.id === 'e-a1')).toEqual({
      ...receipt(a1), amount: 3500, effectiveDate: noon(2026, 3, 3), paymentDate: noon(2026, 3, 3),
    });
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({
      action: 'ADIANTAMENTO_ALTERADO', advanceId: 'a1',
      before: { date: noon(2026, 3, 1), amount: 3000 }, after: { date: noon(2026, 3, 3), amount: 3500 },
    });
  });
  it('sumiu da lista: remove o lançamento + REMOVIDO com before', () => {
    const r = run(base, [{ id: 'a2', date: '2026-03-02', amount: 2000 }], ledger);
    expect(r.advances).toEqual([a2]);
    expect(r.ledger.map(e => e.id)).toEqual(['e-a2', 'outro']);
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({ action: 'ADIANTAMENTO_REMOVIDO', advanceId: 'a1', before: { date: noon(2026, 3, 1), amount: 3000 } });
    expect(r.events[0].after).toBeUndefined();
    expect(r.events[0].reason).toBeUndefined();
  });
  it('lista vazia remove todos', () => {
    const r = run(base, [], ledger);
    expect(r.advances).toEqual([]);
    expect(r.ledger.map(e => e.id)).toEqual(['outro']);
    expect(r.events.map(e => e.action)).toEqual(['ADIANTAMENTO_REMOVIDO', 'ADIANTAMENTO_REMOVIDO']);
  });
  it('igual: ledger e advances intactos, sem evento (mesmas referências)', () => {
    const same = [{ id: 'a1', date: '2026-03-01', amount: 3000 }, { id: 'a2', date: '2026-03-02', amount: 2000 }];
    const r = run(base, same, ledger);
    expect(r.events).toEqual([]);
    expect(r.ledger).toBe(ledger);
    expect(r.advances).toEqual([a1, a2]);
  });
  it('cliente renomeado: só acerta a descrição, sem evento', () => {
    const r = run({ ...base, clientName: 'Outro Nome' }, [{ id: 'a1', date: '2026-03-01', amount: 3000 }, { id: 'a2', date: '2026-03-02', amount: 2000 }], ledger);
    expect(r.events).toEqual([]);
    expect(r.ledger.find(e => e.id === 'e-a1')!.description).toBe('Adiantamento OS #7 - Outro Nome');
    expect(r.ledger.find(e => e.id === 'outro')).toBe(ledger[2]);
  });
  it('lançamento sumido do caixa: recria com o mesmo entryId e SEM evento de criação', () => {
    const r = run(base, [{ id: 'a1', date: '2026-03-01', amount: 3000 }, { id: 'a2', date: '2026-03-02', amount: 2000 }], [entry('outro')]);
    expect(r.events).toEqual([]);
    expect(r.ledger.map(e => e.id).sort()).toEqual(['e-a1', 'e-a2', 'outro']);
    expect(r.ledger.find(e => e.id === 'e-a1')).toMatchObject({ amount: 3000, paymentDate: noon(2026, 3, 1), type: 'CREDIT' });
  });
  it('rascunho inválido com id conhecido mantém o existente; sem id é ignorado', () => {
    const r = run(base, [{ id: 'a1', date: 'lixo', amount: 3000 }, { id: 'a2', date: '2026-03-02', amount: -5 }, { date: '2026-03-02', amount: 0 }], ledger);
    expect(r.advances).toEqual([a1, a2]);
    expect(r.ledger).toBe(ledger);
    expect(r.events).toEqual([]);
  });
  it('data só-dia e ISO do mesmo dia são iguais (sem evento)', () => {
    const r = run(base, [{ id: 'a1', date: noon(2026, 3, 1), amount: 3000 }, { id: 'a2', date: '2026-03-02', amount: 2000 }], ledger);
    expect(r.events).toEqual([]);
  });
  it('não muta as entradas', () => {
    const o = JSON.stringify(base); const l = JSON.stringify(ledger);
    run(base, [{ id: 'a1', date: '2026-03-04', amount: 1 }, { date: '2026-03-05', amount: 9 }], ledger);
    expect(JSON.stringify(base)).toBe(o);
    expect(JSON.stringify(ledger)).toBe(l);
  });
});

describe('syncAdvances: travada e idempotência', () => {
  const a1 = adv('a1', 3000, noon(2026, 3, 1));
  const ledger = [receipt(a1)];
  it('OS travada: tudo intacto e nenhum evento', () => {
    const locked: WorkOrder[] = [
      os({ status: 'FINALIZADO', advances: [a1] }),
      os({ status: 'ARQUIVADO', financialId: 'f', advances: [a1] }),
      os({ status: 'APROVADO', financialId: 'f', advances: [a1] }),
    ];
    for (const o of locked) {
      const r = run(o, [{ date: '2026-03-02', amount: 777 }], ledger);
      expect(r.ledger).toBe(ledger);
      expect(r.advances).toEqual([a1]);
      expect(r.events).toEqual([]);
    }
  });
  it('OS travada sem advances devolve lista vazia', () => {
    expect(run(os({ status: 'FINALIZADO' }), [{ date: '2026-03-02', amount: 1 }], []).advances).toEqual([]);
  });
  it('chamada repetida com a OS já atualizada e as mesmas entradas não cria nada novo', () => {
    const first = run(os(), [{ date: '2026-03-10', amount: 3000 }, { date: '2026-03-11', amount: 1000 }], [entry('outro')]);
    const o2 = os({ advances: first.advances });
    const drafts = first.advances.map(a => ({ id: a.id, date: a.date, amount: a.amount }));
    const second = run(o2, drafts, first.ledger);
    expect(second.events).toEqual([]);
    expect(second.ledger).toBe(first.ledger);
    expect(second.advances).toEqual(first.advances);
  });
  it('relógio e gerador injetáveis: mesma entrada, mesma saída', () => {
    const a = run(os(), [{ date: '2026-03-10', amount: 3000 }], []);
    const b = run(os(), [{ date: '2026-03-10', amount: 3000 }], []);
    expect(a).toEqual(b);
    expect(run(os(), [{ date: '2026-03-10', amount: 3000 }], [], { now: '2030-01-01T00:00:00.000Z' }).events[0].at).toBe('2030-01-01T00:00:00.000Z');
  });
});

describe('removeAllAdvances', () => {
  const a1 = adv('a1', 3000, noon(2026, 3, 1));
  const a2 = adv('a2', 2000, noon(2026, 3, 2));
  it('remove os lançamentos e gera REMOVIDO com reason OS_EXCLUIDA', () => {
    const o = os({ advances: [a1, a2] });
    const ledger = [receipt(a1), receipt(a2), entry('outro')];
    const r = removeAllAdvances({ os: o, ledger, now: NOW, newId: seq('ev'), machine: 'PC-2' });
    expect(r.ledger.map(e => e.id)).toEqual(['outro']);
    expect(r.events).toEqual([
      { id: 'ev1', at: NOW, machine: 'PC-2', action: 'ADIANTAMENTO_REMOVIDO', osId: 'os1', osNumber: 7, advanceId: 'a1', before: { date: a1.date, amount: 3000 }, reason: 'OS_EXCLUIDA' },
      { id: 'ev2', at: NOW, machine: 'PC-2', action: 'ADIANTAMENTO_REMOVIDO', osId: 'os1', osNumber: 7, advanceId: 'a2', before: { date: a2.date, amount: 2000 }, reason: 'OS_EXCLUIDA' },
    ]);
  });
  it('vale também para OS finalizada (excluir é sempre permitido)', () => {
    const o = os({ status: 'FINALIZADO', financialId: 'f', advances: [a1] });
    const r = removeAllAdvances({ os: o, ledger: [receipt(a1), entry('f')], machine: 'PC' });
    expect(r.ledger.map(e => e.id)).toEqual(['f']);
    expect(r.events).toHaveLength(1);
  });
  it('legado: remove advanceEntryId sem evento; OS sem adiantamento não muda o ledger', () => {
    const ledger = [entry('L'), entry('outro')];
    const r = removeAllAdvances({ os: os({ advanceEntryId: 'L', advanceAmount: 100 }), ledger, machine: 'PC' });
    expect(r.ledger.map(e => e.id)).toEqual(['outro']);
    expect(r.events).toEqual([]);
    expect(removeAllAdvances({ os: os(), ledger, machine: 'PC' }).ledger).toBe(ledger);
  });
});

describe('findAdvanceOwner', () => {
  it('acha a OS por advances[].entryId ou pelo advanceEntryId legado', () => {
    const a = os({ id: 'A', advances: [adv('x', 1, noon(2026, 3, 1), 'E1'), adv('y', 1, noon(2026, 3, 1), 'E2')] });
    const b = os({ id: 'B', advanceEntryId: 'E3', advanceAmount: 5 });
    const c = os({ id: 'C' });
    expect(findAdvanceOwner([c, a, b], 'E2')?.id).toBe('A');
    expect(findAdvanceOwner([c, a, b], 'E3')?.id).toBe('B');
    expect(findAdvanceOwner([c, a, b], 'nada')).toBeUndefined();
  });
});

describe('refreshFinishedReceipt (defeito 1: OS finalizada editada)', () => {
  const a1 = adv('a1', 3000, noon(2026, 3, 1));
  const fin = os({ status: 'FINALIZADO', financialId: 'f', total: 12000, osNumber: 9, clientName: 'Novo Nome', advances: [a1] });
  const ledger = [entry('f', { amount: 7000 }), receipt(a1), entry('outro')];
  it('à vista: lançamento vira restante (total - adiantamentos), não o total', () => {
    const r = refreshFinishedReceipt(fin, ledger);
    expect(r.find(e => e.id === 'f')).toMatchObject({
      amount: 9000, effectiveDate: fin.createdAt, description: 'Receita OS #9 - Novo Nome',
    });
    expect(r.find(e => e.id === 'e-a1')).toBe(ledger[1]);
    expect(r.find(e => e.id === 'outro')).toBe(ledger[2]);
  });
  it('OS legada com advanceEntryId também desconta', () => {
    const r = refreshFinishedReceipt(os({ financialId: 'f', total: 5000, advanceAmount: 2000, advanceEntryId: 'z' }), ledger);
    expect(r.find(e => e.id === 'f')!.amount).toBe(3000);
  });
  it('parcelada (paymentMethod INSTALLMENT) nunca é tocada', () => {
    const p = { ...fin, paymentMethod: 'INSTALLMENT' as const };
    expect(refreshFinishedReceipt(p, ledger)).toBe(ledger);
  });
  it('lançamento com grupo de parcelas nunca é tocado', () => {
    const l = [entry('f', { installmentGroupId: 'g' })];
    expect(refreshFinishedReceipt(fin, l)[0]).toBe(l[0]);
  });
  it('sem financialId ou lançamento ausente: ledger igual', () => {
    expect(refreshFinishedReceipt({ ...fin, financialId: undefined }, ledger)).toBe(ledger);
    expect(refreshFinishedReceipt({ ...fin, financialId: 'sumiu' }, ledger).map(e => e.id)).toEqual(['f', 'e-a1', 'outro']);
  });
});

describe('parcelamento com restante 0', () => {
  const config = (over: Partial<InstallmentConfig> = {}): InstallmentConfig => ({
    totalAmount: 0, installments: 2, installmentAmount: 0, lastInstallmentAmount: 0,
    firstPaymentDate: '2026-05-10', groupId: 'g1', description: 'Receita OS #1 - Fulano', ...over,
  });
  it('totalAmount 0 não gera parcelas zeradas', () => {
    expect(buildInstallmentEntries(config(), { now: NOW, newId: seq() })).toEqual([]);
  });
  it('totalAmount > 0 continua gerando', () => {
    expect(buildInstallmentEntries(config({ totalAmount: 100, installmentAmount: 50, lastInstallmentAmount: 50 }), { now: NOW, newId: seq() })).toHaveLength(2);
  });
});

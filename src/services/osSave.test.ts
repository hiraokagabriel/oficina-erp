import { describe, expect, it } from 'vitest';
import { prepareOSSave, advanceLockedMessage } from './osSave';
import { getClientReceivables } from './receivables';
import { finalizeOSSingle } from './osFinanceService';
import type { LedgerEntry, OSAdvance, WorkOrder } from '../types';

// Fixtures sintéticas.
const NOW = '2026-03-15T15:00:00.000Z';
const TODAY = '2026-03-15';
const seq = () => { let n = 0; return () => `n${++n}`; };
const os = (over: Partial<WorkOrder> = {}): WorkOrder => ({
  id: 'os1', osNumber: 7, vehicle: 'Gol', clientName: 'Cliente Teste', clientPhone: '1', mileage: 0,
  status: 'APROVADO', parts: [], services: [], total: 10000, createdAt: '2026-01-10T12:00:00.000Z', ...over,
});
const entry = (id: string, over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id, description: 'x', amount: 1000, type: 'CREDIT',
  effectiveDate: '2026-01-10T12:00:00.000Z', createdAt: '2026-01-10T12:00:00.000Z', ...over,
});
const adv = (id: string, amount: number, entryId = `e-${id}`): OSAdvance => ({ id, amount, date: new Date(2026, 2, 1, 12).toISOString(), entryId });
const run = (p: Partial<Parameters<typeof prepareOSSave>[0]> & { base: WorkOrder }) =>
  prepareOSSave({ ledger: [], today: TODAY, now: NOW, newId: seq(), machine: 'PC-1', ...p });

describe('prepareOSSave', () => {
  it('OS nova com 2 adiantamentos: lançamentos, advances e eventos de criação', () => {
    const r = run({ base: os(), drafts: [{ date: '2026-03-01', amount: 2000 }, { date: '2026-03-10', amount: 1000 }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.os.advances).toHaveLength(2);
    expect(r.ledger).toHaveLength(2);
    expect(r.events.map(e => e.action)).toEqual(['ADIANTAMENTO_CRIADO', 'ADIANTAMENTO_CRIADO']);
    expect(r.events[0].machine).toBe('PC-1');
    expect(r.exceedsTotal).toBe(false);
  });

  it('data futura ou valor inválido: erro e nada muda', () => {
    const fut = run({ base: os(), drafts: [{ date: '2026-03-16', amount: 2000 }] });
    expect(fut).toEqual({ ok: false, error: 'A data do adiantamento não pode ser futura.' });
    const zero = run({ base: os(), drafts: [{ date: '2026-03-01', amount: 0 }] });
    expect(zero.ok).toBe(false);
  });

  it('um draft inválido entre válidos bloqueia tudo (sem estado parcial)', () => {
    const r = run({ base: os(), drafts: [{ date: '2026-03-01', amount: 2000 }, { date: '2026-03-20', amount: 5 }] });
    expect(r.ok).toBe(false);
  });

  it('soma maior que o total: salva e sinaliza', () => {
    const r = run({ base: os({ total: 1000 }), drafts: [{ date: '2026-03-01', amount: 1500 }] });
    expect(r.ok && r.exceedsTotal).toBe(true);
  });

  it('editar e remover geram eventos; drafts undefined mantém tudo sem eventos', () => {
    const a = adv('a1', 2000); const b = adv('a2', 1000);
    const o = os({ advances: [a, b] });
    const ledger = [entry('e-a1', { amount: 2000 }), entry('e-a2', { amount: 1000 })];
    const keep = run({ base: o, previous: o, ledger });
    expect(keep.ok && keep.events).toEqual([]);
    const r = run({ base: o, previous: o, ledger, drafts: [{ id: 'a1', date: '2026-03-02', amount: 2500 }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.events.map(e => e.action).sort()).toEqual(['ADIANTAMENTO_ALTERADO', 'ADIANTAMENTO_REMOVIDO']);
    expect(r.os.advances).toHaveLength(1);
    expect(r.ledger.map(e => e.id)).toEqual(['e-a1']);
  });

  it('OS travada: drafts ignorados, sem eventos; à vista vira o restante', () => {
    const o = os({ status: 'FINALIZADO', financialId: 'fin', advances: [adv('a1', 3000)], total: 12000 });
    const ledger = [entry('fin', { amount: 7000 }), entry('e-a1', { amount: 3000 })];
    const r = run({ base: o, previous: o, ledger, drafts: [{ date: '2026-03-01', amount: 99 }, { date: '2099-01-01', amount: 1 }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.events).toEqual([]);
    expect(r.os.advances).toEqual(o.advances);
    expect(r.ledger.find(e => e.id === 'fin')?.amount).toBe(9000);
    expect(r.ledger.find(e => e.id === 'e-a1')?.amount).toBe(3000);
  });

  it('OS finalizada parcelada: lançamento das parcelas intacto', () => {
    const o = os({ status: 'AGUARDANDO_PAGAMENTO', financialId: 'p1', paymentMethod: 'INSTALLMENT', total: 12000 });
    const ledger = [entry('p1', { amount: 5000, installmentGroupId: 'g' })];
    const r = run({ base: o, previous: o, ledger });
    expect(r.ok && r.ledger).toEqual(ledger);
  });

  it('OS legada (advanceAmount + advanceEntryId): converte para advances[0] sem evento de criação', () => {
    const o = os({ advanceAmount: 3000, advanceEntryId: 'leg' });
    const ledger = [entry('leg', { amount: 3000, effectiveDate: '2026-02-05T12:00:00.000Z' })];
    const r = run({ base: o, previous: o, ledger, drafts: [{ id: 'os1:a0', date: '2026-02-05', amount: 3500 }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.os.advanceAmount).toBeUndefined();
    expect(r.os.advanceEntryId).toBeUndefined();
    expect(r.os.advances?.[0]).toMatchObject({ id: 'os1:a0', amount: 3500, entryId: 'leg' });
    expect(r.events.map(e => e.action)).toEqual(['ADIANTAMENTO_ALTERADO']);
    expect(r.ledger.find(e => e.id === 'leg')?.amount).toBe(3500);
  });

  it('OS legada sem drafts: só converte, nenhum evento', () => {
    const o = os({ advanceAmount: 3000, advanceEntryId: 'leg' });
    const r = run({ base: o, previous: o, ledger: [entry('leg', { amount: 3000 })] });
    expect(r.ok && r.events).toEqual([]);
    expect(r.ok && r.os.advances).toHaveLength(1);
  });

  it('OS sem adiantamento algum e sem drafts não ganha advances', () => {
    const r = run({ base: os(), previous: os() });
    expect(r.ok && 'advances' in r.os).toBe(false);
  });

  it('mensagem de recusa do lançamento travado', () => {
    expect(advanceLockedMessage(12)).toBe('Este lançamento é um adiantamento. Edite pela OS #12.');
  });
});

describe('OS finalizada sem financialId (restante 0)', () => {
  it('finalizar com adiantamento cobrindo o total não cria lançamento', () => {
    const o = os({ total: 5000, advances: [adv('a1', 5000)] });
    const { entry: e, os: fin } = finalizeOSSingle(o, { now: NOW, newId: seq() });
    expect(e).toBeUndefined();
    expect(fin.status).toBe('FINALIZADO');
    expect(fin.financialId).toBeUndefined();
  });
  it('recebíveis por cliente ignoram a OS sem financialId e o adiantamento já recebido', () => {
    const o = os({ status: 'FINALIZADO', total: 5000, advances: [adv('a1', 5000)] });
    const ledger = [entry('e-a1', { amount: 5000, paymentDate: '2026-03-01T12:00:00.000Z' })];
    const r = getClientReceivables([o], ledger, '2026-03-15');
    expect(r.ranking).toEqual([]);
  });
});

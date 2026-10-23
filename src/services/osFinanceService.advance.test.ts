import { describe, expect, it } from 'vitest';
import {
  finalizeOSSingle, getRemainingAmount, isAdvanceSyncLocked, restoreFinancial, statusChangeEffects,
  syncAdvanceEntry, togglePayment,
} from './osFinanceService';
import type { InstallmentConfig, LedgerEntry, WorkOrder } from '../types';

// Fixtures sintéticas (5.1, 5.2, 5.4). Complementa osFinanceService.test.ts.
const NOW = '2026-03-15T15:00:00.000Z';
const LATER = '2026-03-20T15:00:00.000Z';

const config = (over: Partial<InstallmentConfig> = {}): InstallmentConfig => ({
  totalAmount: 10000, installments: 2, installmentAmount: 5000, lastInstallmentAmount: 5000,
  firstPaymentDate: '2026-05-10', groupId: 'g1', description: 'Receita OS #1 - Fulano', ...over,
});
const os = (over: Partial<WorkOrder> = {}): WorkOrder => ({
  id: 'os1', osNumber: 1, vehicle: 'Gol - AAA-0001', clientName: 'Fulano Teste', clientPhone: '1',
  mileage: 0, status: 'EM_SERVICO', parts: [], services: [], total: 10000,
  createdAt: '2026-01-10T12:00:00.000Z', ...over,
});
const entry = (id: string, over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id, description: 'x', amount: 1000, type: 'CREDIT',
  effectiveDate: '2026-01-10T12:00:00.000Z', createdAt: '2026-01-10T12:00:00.000Z', ...over,
});

describe('getRemainingAmount', () => {
  it('sem advanceEntryId usa o total cheio (OS legada, D3)', () => {
    expect(getRemainingAmount(os({ total: 10000, advanceAmount: 3000 }))).toBe(10000);
  });
  it('com advanceEntryId desconta o adiantamento', () => {
    expect(getRemainingAmount(os({ total: 10000, advanceAmount: 3000, advanceEntryId: 'a1' }))).toBe(7000);
  });
  it('nunca negativo e tolera advanceAmount ausente', () => {
    expect(getRemainingAmount(os({ total: 1000, advanceAmount: 5000, advanceEntryId: 'a1' }))).toBe(0);
    expect(getRemainingAmount(os({ total: 1000, advanceEntryId: 'a1' }))).toBe(1000);
  });
});

describe('finalizeOSSingle com adiantamento', () => {
  it('receita à vista = total - adiantamento', () => {
    const r = finalizeOSSingle(os({ total: 10000, advanceAmount: 3000, advanceEntryId: 'a1' }), { now: NOW, newId: () => 'n' });
    expect(r.entry!.amount).toBe(7000);
  });
  it('OS legada com adiantamento sem advanceEntryId usa o total cheio', () => {
    expect(finalizeOSSingle(os({ total: 10000, advanceAmount: 3000 }), { now: NOW, newId: () => 'n' }).entry!.amount).toBe(10000);
  });
  // CORRIGIDO (adiantamentos v4): restante 0 não cria lançamento de R$ 0,00.
  it('restante 0: fecha a OS sem criar lançamento zerado', () => {
    const r = finalizeOSSingle(os({ total: 3000, advanceAmount: 3000, advanceEntryId: 'a1' }), { now: NOW, newId: () => 'n' });
    expect(r.entry).toBeUndefined();
    expect(r.os).toMatchObject({ status: 'FINALIZADO', financialId: undefined, paymentDate: NOW });
  });
  it('restante 0 com advances (v4): sem lançamento; restante > 0: lançamento do restante', () => {
    const adv = (amount: number) => [{ id: 'a', date: '2026-03-01T15:00:00.000Z', amount, entryId: 'e' }];
    expect(finalizeOSSingle(os({ total: 3000, advances: adv(3000) }), { now: NOW }).entry).toBeUndefined();
    expect(finalizeOSSingle(os({ total: 3000, advances: adv(5000) }), { now: NOW }).entry).toBeUndefined();
    expect(finalizeOSSingle(os({ total: 3000, advances: adv(1000) }), { now: NOW, newId: () => 'n' }).entry!.amount).toBe(2000);
  });
});

describe('syncAdvanceEntry', () => {
  const other = entry('outro');
  const base = os({ status: 'APROVADO', osNumber: 7, clientName: 'Cliente Teste' });

  it('cria CREDIT já recebido, com dia local ao meio-dia', () => {
    const r = syncAdvanceEntry({ os: base, advanceAmount: 10000, ledger: [other], now: NOW, newId: () => 'adv1' });
    expect(r.advanceEntryId).toBe('adv1');
    expect(r.ledger).toHaveLength(2);
    expect(r.ledger[0]).toMatchObject({
      id: 'adv1', description: 'Adiantamento OS #7 - Cliente Teste', amount: 10000,
      type: 'CREDIT', createdAt: NOW, paymentDate: NOW,
    });
    const d = new Date(r.ledger[0].effectiveDate);
    const n = new Date(NOW);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([n.getFullYear(), n.getMonth(), n.getDate(), 12]);
  });

  it('atualiza valor e descrição mantendo datas e paymentDate', () => {
    const created = syncAdvanceEntry({ os: base, advanceAmount: 10000, ledger: [], now: NOW, newId: () => 'adv1' });
    const withId = { ...base, advanceEntryId: 'adv1', clientName: 'Outro Nome' };
    const r = syncAdvanceEntry({ os: withId, advanceAmount: 15000, ledger: created.ledger, now: '2026-04-01T10:00:00.000Z' });
    expect(r.advanceEntryId).toBe('adv1');
    expect(r.ledger).toHaveLength(1);
    expect(r.ledger[0]).toMatchObject({
      amount: 15000, description: 'Adiantamento OS #7 - Outro Nome',
      createdAt: NOW, paymentDate: NOW, effectiveDate: created.ledger[0].effectiveDate,
    });
  });

  it('zerado ou indefinido remove o lançamento e limpa o id', () => {
    const led = [entry('adv1'), other];
    const w = { ...base, advanceEntryId: 'adv1' };
    for (const amount of [0, undefined]) {
      const r = syncAdvanceEntry({ os: w, advanceAmount: amount, ledger: led, now: NOW });
      expect(r.ledger).toEqual([other]);
      expect(r.advanceEntryId).toBeUndefined();
    }
  });

  it('sem lançamento e sem adiantamento: ledger intacto', () => {
    const led = [other];
    const r = syncAdvanceEntry({ os: base, advanceAmount: undefined, ledger: led, now: NOW });
    expect(r.ledger).toBe(led);
    expect(r.advanceEntryId).toBeUndefined();
  });

  it('advanceEntryId órfão (lançamento sumiu) com valor: cria um novo', () => {
    const r = syncAdvanceEntry({ os: { ...base, advanceEntryId: 'sumiu' }, advanceAmount: 500, ledger: [], now: NOW, newId: () => 'novo' });
    expect(r.advanceEntryId).toBe('novo');
    expect(r.ledger).toHaveLength(1);
  });

  it('D3: OS FINALIZADO, com financialId ou ARQUIVADO com financeiro não sincroniza', () => {
    const led = [entry('adv1')];
    const cases = [
      os({ status: 'FINALIZADO', advanceEntryId: 'adv1' }),
      os({ status: 'AGUARDANDO_PAGAMENTO', financialId: 'f1', advanceEntryId: 'adv1' }),
      os({ status: 'ARQUIVADO', financialId: 'f1', advanceEntryId: 'adv1' }),
    ];
    for (const c of cases) {
      expect(isAdvanceSyncLocked(c)).toBe(true);
      const r = syncAdvanceEntry({ os: c, advanceAmount: 99999, ledger: led, now: NOW });
      expect(r.ledger).toBe(led);
      expect(r.advanceEntryId).toBe('adv1');
    }
    expect(isAdvanceSyncLocked(os({ status: 'ARQUIVADO' }))).toBe(false);
  });

  it('não muta o ledger de entrada', () => {
    const led = [entry('adv1')];
    syncAdvanceEntry({ os: { ...base, advanceEntryId: 'adv1' }, advanceAmount: 1, ledger: led, now: NOW });
    expect(led[0].amount).toBe(1000);
  });
});

describe('restoreFinancial e adiantamento', () => {
  it('reabrir OS não apaga o lançamento de adiantamento e mantém advanceEntryId', () => {
    const adv = entry('adv1', { description: 'Adiantamento OS #1 - x' });
    const g = [entry('p1', { groupId: 'g1', installmentGroupId: 'g1' }), entry('p2', { groupId: 'g1', installmentGroupId: 'g1' })];
    const o = os({
      status: 'AGUARDANDO_PAGAMENTO', financialId: 'p1', paymentMethod: 'INSTALLMENT',
      installmentConfig: config(), advanceAmount: 3000, advanceEntryId: 'adv1',
    });
    const r = restoreFinancial([adv, ...g], o);
    expect(r.ledger).toEqual([adv]);
    expect(r.os.advanceEntryId).toBe('adv1');
    expect(r.os.advanceAmount).toBe(3000);
    const single = restoreFinancial([adv, entry('s1')], { ...o, financialId: 's1', paymentMethod: undefined, installmentConfig: undefined });
    expect(single.ledger).toEqual([adv]);
  });
});

describe('togglePayment: OS parcelada derivada de todas as parcelas (5.4)', () => {
  const p1 = entry('p1', { groupId: 'g1', installmentGroupId: 'g1' });
  const p2 = entry('p2', { groupId: 'g1', installmentGroupId: 'g1' });
  const inst = os({ status: 'AGUARDANDO_PAGAMENTO', financialId: 'p1', paymentMethod: 'INSTALLMENT', installmentConfig: config() });

  it('parcial: OS não muda, em qualquer parcela', () => {
    const r2 = togglePayment([p1, p2], [inst], 'p2', NOW)!;
    expect(r2.ledger[1].paymentDate).toBe(NOW);
    expect(r2.workOrders[0]).toBe(inst);
    expect(r2.osEffect).toBeUndefined();
    const r1 = togglePayment([p1, p2], [inst], 'p1', NOW)!;
    expect(r1.workOrders[0]).toBe(inst);
  });

  it('todas pagas: finaliza com o paymentDate mais recente (em qualquer ordem)', () => {
    const a = togglePayment([p1, p2], [inst], 'p2', NOW)!;
    const b = togglePayment(a.ledger, a.workOrders, 'p1', LATER)!;
    expect(b.workOrders[0]).toMatchObject({ status: 'FINALIZADO', paymentDate: LATER });
    expect(b.osEffect).toEqual({ osNumber: 1, kind: 'finalized' });
    const c = togglePayment([p1, p2], [inst], 'p1', LATER)!;
    const d = togglePayment(c.ledger, c.workOrders, 'p2', NOW)!;
    expect(d.workOrders[0].paymentDate).toBe(LATER);
  });

  it('OS finalizada com uma parcela desmarcada volta a AGUARDANDO_PAGAMENTO sem paymentDate', () => {
    const paid = [{ ...p1, paymentDate: NOW }, { ...p2, paymentDate: NOW }];
    const fin = { ...inst, status: 'FINALIZADO' as const, paymentDate: NOW };
    const r = togglePayment(paid, [fin], 'p2', LATER)!;
    expect(r.paid).toBe(false);
    expect(r.workOrders[0].status).toBe('AGUARDANDO_PAGAMENTO');
    expect(r.workOrders[0].paymentDate).toBeUndefined();
    expect(r.osEffect).toEqual({ osNumber: 1, kind: 'reopened' });
  });

  it('DEBIT do mesmo grupo é ignorado; OS arquivada só recebe o paymentDate', () => {
    const debit = entry('d1', { type: 'DEBIT', installmentGroupId: 'g1' });
    const arq = { ...inst, status: 'ARQUIVADO' as const };
    const r = togglePayment([{ ...p1, paymentDate: NOW }, p2, debit], [arq], 'p2', LATER)!;
    expect(r.workOrders[0]).toMatchObject({ status: 'ARQUIVADO', paymentDate: LATER });
    expect(r.osEffect).toBeUndefined();
  });

  it('OS à vista segue o lançamento ligado por financialId, sem osEffect', () => {
    const single = os({ status: 'FINALIZADO', financialId: 's1' });
    const r = togglePayment([entry('s1')], [single], 's1', NOW)!;
    expect(r.workOrders[0]).toMatchObject({ status: 'FINALIZADO', paymentDate: NOW });
    expect(r.osEffect).toBeUndefined();
  });
});

describe('statusChangeEffects: arquivar e desarquivar (D7)', () => {
  it('FINALIZADO com financialId para ARQUIVADO só muda o status', () => {
    expect(statusChangeEffects(os({ status: 'FINALIZADO', financialId: 'f1', paymentDate: NOW }), 'ARQUIVADO', NOW))
      .toEqual({ kind: 'update', updates: { status: 'ARQUIVADO' } });
  });
  it('desarquivar para FINALIZADO com paymentDate não o sobrescreve', () => {
    const r = statusChangeEffects(os({ status: 'ARQUIVADO', financialId: 'f1', paymentDate: NOW }), 'FINALIZADO', LATER);
    expect(r).toEqual({ kind: 'update', updates: { status: 'FINALIZADO', paymentDate: NOW } });
  });
  it('desarquivar para ORCAMENTO mantém o financeiro (só status)', () => {
    expect(statusChangeEffects(os({ status: 'ARQUIVADO', financialId: 'f1', paymentDate: NOW }), 'ORCAMENTO', NOW))
      .toEqual({ kind: 'update', updates: { status: 'ORCAMENTO' } });
  });
});

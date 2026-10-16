import { describe, expect, it } from 'vitest';
import {
  formatDueDate, getClientReceivables, getDaysOverdue, getReceivableLabel, summarizeReceivables,
} from './receivables';
import type { InstallmentConfig, LedgerEntry, WorkOrder } from '../types';

// Fixtures sintéticas. Datas em meio-dia local: o dia local não depende do fuso do teste.
const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();
const TODAY = new Date(2026, 5, 15, 9); // 15/06/2026 local

const e = (id: string, over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id, description: id, amount: 1000, type: 'CREDIT',
  effectiveDate: day(2026, 6, 15), createdAt: day(2026, 1, 1), ...over,
});
const os = (id: string, clientName: string, over: Partial<WorkOrder> = {}): WorkOrder => ({
  id, osNumber: 1, vehicle: 'Gol', clientName, clientPhone: '1', mileage: 0,
  status: 'AGUARDANDO_PAGAMENTO' as WorkOrder['status'], parts: [], services: [], total: 0,
  createdAt: day(2026, 1, 1), ...over,
});
const cfg = (groupId: string): InstallmentConfig => ({
  totalAmount: 3000, installments: 3, installmentAmount: 1000, lastInstallmentAmount: 1000,
  firstPaymentDate: day(2026, 5, 10), groupId, description: 'x',
});

describe('formatDueDate / getDaysOverdue / getReceivableLabel', () => {
  it('formata dd/mm/aaaa pelo dia local (também com data só-dia)', () => {
    expect(formatDueDate(e('a', { dueDate: day(2026, 3, 5) }))).toBe('05/03/2026');
    expect(formatDueDate(e('b', { dueDate: '2026-12-31' }))).toBe('31/12/2026');
    expect(formatDueDate(e('c', { effectiveDate: day(2026, 1, 9, 23) }))).toBe('09/01/2026');
  });
  it('texto: A receber / Atrasado há N dia(s); vazio para pago e DEBIT', () => {
    expect(getReceivableLabel(e('a', { dueDate: day(2026, 6, 15) }), TODAY)).toBe('A receber');
    expect(getReceivableLabel(e('b', { dueDate: day(2026, 6, 14) }), TODAY)).toBe('Atrasado há 1 dia');
    expect(getReceivableLabel(e('c', { dueDate: day(2026, 6, 5, 23) }), TODAY)).toBe('Atrasado há 10 dias');
    expect(getReceivableLabel(e('d', { dueDate: day(2026, 1, 1), paymentDate: day(2026, 1, 2) }), TODAY)).toBe('');
    expect(getReceivableLabel(e('e', { type: 'DEBIT' }), TODAY)).toBe('');
    expect(getDaysOverdue(e('f', { dueDate: day(2026, 6, 20) }), TODAY)).toBe(0);
  });
  it('conta dias de calendário atravessando mudança de mês/ano', () => {
    expect(getDaysOverdue(e('a', { dueDate: day(2025, 12, 31, 23) }), new Date(2026, 0, 2, 1))).toBe(2);
  });
});

describe('lista A receber (summarizeReceivables)', () => {
  it('ordena do mais atrasado ao mais distante e traz totais/contagens gerais', () => {
    const ledger = [
      e('futuro', { amount: 300, dueDate: day(2026, 8, 1) }),
      e('velho', { amount: 500, dueDate: day(2026, 3, 1) }),
      e('hoje', { amount: 200, dueDate: day(2026, 6, 15) }),
      e('pago', { amount: 900, dueDate: day(2026, 1, 1), paymentDate: day(2026, 1, 2) }),
      e('debito', { type: 'DEBIT', dueDate: day(2026, 1, 1) }),
    ];
    const s = summarizeReceivables(ledger, TODAY);
    expect(s.items.map(i => i.id)).toEqual(['velho', 'hoje', 'futuro']);
    expect([s.totalAReceber, s.countAReceber, s.totalAtrasado, s.countAtrasado]).toEqual([500, 2, 500, 1]);
  });
  it('ledger vazio', () => {
    const s = summarizeReceivables([], TODAY);
    expect(s.items).toEqual([]);
    expect(s.totalAReceber + s.totalAtrasado + s.countAReceber + s.countAtrasado).toBe(0);
  });
});

describe('getClientReceivables', () => {
  it('liga por financialId (à vista / 1ª parcela) e por installmentGroupId (parcelas)', () => {
    const works = [
      os('o1', 'Ana', { financialId: 'f1' }),
      os('o2', 'Bia', { installmentConfig: cfg('g2') }),
    ];
    const ledger = [
      e('f1', { amount: 700, dueDate: day(2026, 6, 20) }),
      e('p1', { amount: 1000, dueDate: day(2026, 5, 10), installmentGroupId: 'g2' }), // atrasada
      e('p2', { amount: 1000, dueDate: day(2026, 7, 10), installmentGroupId: 'g2' }),
      e('p3', { amount: 1000, dueDate: day(2026, 6, 1), installmentGroupId: 'g2', paymentDate: day(2026, 6, 2) }), // paga
    ];
    const { byClient } = getClientReceivables(works, ledger, TODAY);
    expect(byClient.get('nome:ana')).toEqual({ clientName: 'Ana', emAberto: 700, atrasado: 0, countAberto: 1, countAtrasado: 0 });
    expect(byClient.get('nome:bia')).toEqual({ clientName: 'Bia', emAberto: 2000, atrasado: 1000, countAberto: 2, countAtrasado: 1 });
  });
  it('1ª parcela ligada por financialId e as demais pelo grupo somam no mesmo cliente', () => {
    const works = [os('o1', 'Ana', { financialId: 'p1', installmentConfig: cfg('g1') })];
    const ledger = [
      e('p1', { amount: 1000, dueDate: day(2026, 6, 1), installmentGroupId: 'g1' }),
      e('p2', { amount: 1000, dueDate: day(2026, 7, 1), installmentGroupId: 'g1' }),
    ];
    expect(getClientReceivables(works, ledger, TODAY).byClient.get('nome:ana')?.emAberto).toBe(2000);
  });
  it('ignora lançamento manual sem OS e DEBIT', () => {
    const works = [os('o1', 'Ana', { financialId: 'f1' })];
    const ledger = [
      e('manual', { amount: 999, dueDate: day(2026, 1, 1) }),
      e('f1', { type: 'DEBIT', dueDate: day(2026, 1, 1) }),
    ];
    const r = getClientReceivables(works, ledger, TODAY);
    expect(r.byClient.size).toBe(0);
    expect(r.ranking).toEqual([]);
  });
  it('sem cadastro (clients omitido): mesmo nome se soma na chave nome:', () => {
    const works = [os('o1', 'João', { financialId: 'f1' }), os('o2', 'João', { financialId: 'f2' })];
    const ledger = [e('f1', { amount: 100 }), e('f2', { amount: 250, dueDate: day(2026, 1, 1) })];
    expect(getClientReceivables(works, ledger, TODAY).byClient.get('nome:joão'))
      .toEqual({ clientName: 'João', emAberto: 350, atrasado: 250, countAberto: 2, countAtrasado: 1 });
  });
  it('ranking: maior dívida primeiro, empate por nome; quem não deve fica de fora', () => {
    const works = [
      os('o1', 'Zé', { financialId: 'f1' }), os('o2', 'Ana', { financialId: 'f2' }),
      os('o3', 'Rico', { financialId: 'f3' }), os('o4', 'Quite', { financialId: 'f4' }),
    ];
    const ledger = [
      e('f1', { amount: 500 }), e('f2', { amount: 500 }), e('f3', { amount: 900 }),
      e('f4', { amount: 800, paymentDate: day(2026, 6, 1) }),
    ];
    expect(getClientReceivables(works, ledger, TODAY).ranking.map(c => c.clientName)).toEqual(['Rico', 'Ana', 'Zé']);
  });
  it('ledger e OS vazios', () => {
    const r = getClientReceivables([], [], TODAY);
    expect(r.byClient.size).toBe(0);
    expect(r.ranking).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { computeFinanceKpis, expensePaidDay, isExpensePaid, osRevenueDay, type FinancePeriod } from './financeKpis';

// Regra de despesa paga só por paymentDate (a decisão final é do arquiteto): isola os testes da regra provisória.
const byPaymentDate = (en: { paymentDate?: string }) => !!en.paymentDate;
import type { LedgerEntry, WorkOrder } from '../types';

// Fixtures sintéticas. Datas em meio-dia local: o dia local não depende do fuso do teste.
const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();
const TODAY = new Date(2026, 5, 15, 9); // 15/06/2026 local
const JUNE: FinancePeriod = { mode: 'MONTH', month: '2026-06' };

const e = (id: string, over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id, description: id, amount: 1000, type: 'CREDIT',
  effectiveDate: day(2026, 6, 10), createdAt: day(2026, 1, 1), ...over,
});

const os = (id: string, over: Partial<WorkOrder> = {}): WorkOrder => ({
  id, osNumber: 1, vehicle: 'Carro', clientName: 'Cli', clientPhone: '', mileage: 0,
  status: 'FINALIZADO', parts: [{ id: 'p', description: 'p', quantity: 1, price: 300 }],
  services: [{ id: 's', description: 's', quantity: 1, price: 700 }],
  total: 1000, createdAt: day(2026, 1, 1), ...over,
} as WorkOrder);

const run = (ledger: LedgerEntry[], workOrders: WorkOrder[] = [], period = JUNE) =>
  computeFinanceKpis({ ledger, workOrders, period, today: TODAY, isExpensePaid: byPaymentDate });

describe('receitas, despesas e saldo (só o que entrou)', () => {
  it('parcela não paga fica fora da receita', () => {
    const r = run([e('a', { paymentDate: day(2026, 6, 12) }), e('b')]);
    expect(r.receitas).toBe(1000);
  });
  it('paga em outro mês conta no mês do pagamento, não no do vencimento', () => {
    const ledger = [e('a', { effectiveDate: day(2026, 5, 20), paymentDate: day(2026, 6, 2) })];
    expect(run(ledger).receitas).toBe(1000);
    expect(run(ledger, [], { mode: 'MONTH', month: '2026-05' }).receitas).toBe(0);
  });
  it('modo ano soma pagamentos do ano todo', () => {
    const ledger = [e('a', { paymentDate: day(2026, 1, 5) }), e('b', { paymentDate: day(2026, 12, 31) }), e('c', { paymentDate: day(2025, 12, 31) })];
    expect(run(ledger, [], { mode: 'YEAR', month: '2026-06' }).receitas).toBe(2000);
  });
  it('despesa paga entra pelo paymentDate; não paga não entra', () => {
    const ledger = [
      e('d1', { type: 'DEBIT', amount: 400, paymentDate: day(2026, 6, 3) }),
      e('d2', { type: 'DEBIT', amount: 900 }),
      e('c1', { paymentDate: day(2026, 6, 4) }),
    ];
    const r = run(ledger);
    expect(r.despesas).toBe(400);
    expect(r.saldo).toBe(600);
  });
  it('isPaid obsoleto é ignorado', () => {
    expect(run([e('a', { isPaid: true })]).receitas).toBe(0);
  });
  it('adiantamento já recebido conta uma vez (é só um lançamento pago)', () => {
    const ledger = [e('adv', { amount: 300, paymentDate: day(2026, 6, 1) }), e('rest', { amount: 700, paymentDate: day(2026, 6, 20) })];
    expect(run(ledger).receitas).toBe(1000);
  });
  it('dia local: pagamento 31/05 23:30 local fica em maio', () => {
    const ledger = [e('a', { paymentDate: new Date(2026, 4, 31, 23, 30).toISOString() })];
    expect(run(ledger).receitas).toBe(0);
    expect(run(ledger, [], { mode: 'MONTH', month: '2026-05' }).receitas).toBe(1000);
  });
});

describe('peças x serviços e ticket médio', () => {
  it('OS em orçamento/aberta fica fora', () => {
    const wos = [os('a', { status: 'ORCAMENTO' }), os('b', { status: 'EM_SERVICO' }), os('c', { status: 'AGUARDANDO_PAGAMENTO' })];
    const r = run([], wos);
    expect(r.pie).toEqual({ parts: 0, services: 0 });
    expect(r.ticketMedio).toBe(0);
  });
  it('finalizada entra pelo paymentDate da OS', () => {
    const r = run([], [os('a', { paymentDate: day(2026, 6, 9), createdAt: day(2026, 1, 1) })]);
    expect(r.pie).toEqual({ parts: 300, services: 700 });
    expect(r.ticketMedio).toBe(1000);
  });
  it('sem paymentDate usa o recebimento mais recente do lançamento ligado', () => {
    const ledger = [e('l1', { paymentDate: day(2026, 6, 8) })];
    const r = run(ledger, [os('a', { financialId: 'l1' })]);
    expect(r.pie.parts).toBe(300);
  });
  it('sem nada usa o vencimento do lançamento ligado, e por fim createdAt', () => {
    expect(osRevenueDay(os('a', { financialId: 'l1' }), [e('l1', { effectiveDate: day(2026, 6, 10) })])).toBe('2026-06-10');
    expect(osRevenueDay(os('a', { createdAt: day(2026, 3, 3) }), [])).toBe('2026-03-03');
  });
  it('finalizada em outro mês fica fora', () => {
    expect(run([], [os('a', { paymentDate: day(2026, 5, 31) })]).pie.parts).toBe(0);
  });
  it('arquivada com receita entra; arquivada sem receita (era orçamento) não', () => {
    const wos = [
      os('a', { status: 'ARQUIVADO', financialId: 'l1', paymentDate: day(2026, 6, 9) }),
      os('b', { status: 'ARQUIVADO', createdAt: day(2026, 6, 9) }),
    ];
    const r = run([], wos);
    expect(r.pie.parts).toBe(300);
    expect(r.ticketMedio).toBe(1000);
  });
  it('ticket médio é a média inteira em centavos', () => {
    const wos = [os('a', { total: 1000, paymentDate: day(2026, 6, 9) }), os('b', { total: 1001, paymentDate: day(2026, 6, 9) })];
    expect(run([], wos).ticketMedio).toBe(1001);
  });
});

describe('despesas previstas', () => {
  const d = (id: string, due: string, over: Partial<LedgerEntry> = {}) =>
    e(id, { type: 'DEBIT', amount: 500, effectiveDate: due, ...over });

  it('não pagas com vencimento no período entram; pagas e créditos não', () => {
    const ledger = [
      d('a', day(2026, 6, 20)),
      d('b', day(2026, 6, 22), { paymentDate: day(2026, 6, 1) }),
      e('c', { effectiveDate: day(2026, 6, 25) }),
    ];
    const r = run(ledger).expectedExpenses;
    expect(r.periodTotal).toBe(500);
    expect(r.items.map(i => i.entry.id)).toEqual(['a']);
    expect(r.overdueTotal).toBe(0);
  });
  it('vencida de período anterior entra no total vencido e na lista, mas não no total do período', () => {
    const ledger = [d('old', day(2026, 3, 10)), d('fut', day(2026, 6, 30))];
    const r = run(ledger).expectedExpenses;
    expect(r.overdueTotal).toBe(500);
    expect(r.overdueCount).toBe(1);
    expect(r.periodTotal).toBe(500);
    expect(r.items.map(i => i.entry.id)).toEqual(['old', 'fut']);
    expect(r.items[0].overdue).toBe(true);
    expect(r.items[1].overdue).toBe(false);
  });
  it('vence hoje não é vencida; ontem é', () => {
    const ledger = [d('hoje', day(2026, 6, 15, 0)), d('ontem', day(2026, 6, 14, 23))];
    const r = run(ledger).expectedExpenses;
    expect(r.items.find(i => i.entry.id === 'hoje')?.overdue).toBe(false);
    expect(r.items.find(i => i.entry.id === 'ontem')?.overdue).toBe(true);
    expect(r.overdueTotal).toBe(500);
  });
  it('vencida dentro do período conta nos dois totais; usa dueDate quando existe', () => {
    const ledger = [d('x', day(2026, 5, 1), { dueDate: day(2026, 6, 5) })];
    const r = run(ledger).expectedExpenses;
    expect(r.periodTotal).toBe(500);
    expect(r.overdueTotal).toBe(500);
  });
  it('ordenada por vencimento', () => {
    const ledger = [d('c', day(2026, 6, 28)), d('a', day(2026, 2, 1)), d('b', day(2026, 6, 16))];
    expect(run(ledger).expectedExpenses.items.map(i => i.entry.id)).toEqual(['a', 'b', 'c']);
  });
  it('modo ano considera o ano inteiro', () => {
    const ledger = [d('a', day(2026, 11, 20)), d('b', day(2027, 1, 20))];
    const r = run(ledger, [], { mode: 'YEAR', month: '2026-06' }).expectedExpenses;
    expect(r.periodTotal).toBe(500);
  });
});

describe('regra provisória de despesa paga (isExpensePaid)', () => {
  const d = (id: string, due: string, over: Partial<LedgerEntry> = {}) =>
    e(id, { type: 'DEBIT', amount: 500, effectiveDate: due, ...over });
  it('despesa antiga sem paymentDate e já vencida conta como paga; futura é prevista', () => {
    expect(isExpensePaid(d('a', day(2026, 6, 10)), '2026-06-15')).toBe(true);
    expect(isExpensePaid(d('b', day(2026, 6, 15)), '2026-06-15')).toBe(true);
    expect(isExpensePaid(d('c', day(2026, 6, 16)), '2026-06-15')).toBe(false);
    expect(isExpensePaid(d('d', day(2026, 6, 20), { paymentDate: day(2026, 6, 1) }), '2026-06-15')).toBe(true);
  });
  it('KPIs com a regra padrão: antiga entra em despesas pelo vencimento; futura vai a previstas', () => {
    const r = computeFinanceKpis({ ledger: [d('a', day(2026, 6, 10)), d('b', day(2026, 6, 20))], workOrders: [], period: JUNE, today: TODAY });
    expect(r.despesas).toBe(500);
    expect(r.expectedExpenses.periodTotal).toBe(500);
    expect(r.expectedExpenses.overdueTotal).toBe(0);
    expect(expensePaidDay(d('a', day(2026, 6, 10)))).toBe('2026-06-10');
  });
});

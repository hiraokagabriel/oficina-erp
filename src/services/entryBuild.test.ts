import { describe, expect, it } from 'vitest';
import { applyEntryEdit, buildEntries, paymentToast, validateEntryDraft } from './entryBuild';
import type { LedgerEntry } from '../types';
import { createEntry } from '../utils/helpers';
import { toLocalDay } from './expenseStatus';

const TODAY = '2026-11-18';
const base = { desc: 'Aluguel', totalCents: 90000, today: TODAY, groupId: 'g1' } as const;

describe('createEntry: pending', () => {
  it('sem pending não grava a chave; com pending grava true', () => {
    expect('pending' in createEntry('a', 100, 'DEBIT', '2026-11-20')).toBe(false);
    expect(createEntry('a', 100, 'DEBIT', '2026-11-20', undefined, undefined, true).pending).toBe(true);
    expect('pending' in createEntry('a', 100, 'DEBIT', '2026-11-20', undefined, undefined, false)).toBe(false);
  });
});

describe('buildEntries: despesa', () => {
  it('"Vou pagar em": único fica pending, sem paymentDate', () => {
    const [e] = buildEntries({ ...base, type: 'DEBIT', dateStr: '2026-11-25', recurrence: 'SINGLE', count: 1, pending: true });
    expect(e.pending).toBe(true);
    expect(e.paymentDate).toBeUndefined();
    expect(toLocalDay(e.effectiveDate)).toBe('2026-11-25');
  });
  it('"Já paguei": único com paymentDate = a data e sem pending', () => {
    const [e] = buildEntries({ ...base, type: 'DEBIT', dateStr: '2026-11-10', recurrence: 'SINGLE', count: 1 });
    expect('pending' in e).toBe(false);
    expect(toLocalDay(e.paymentDate as string)).toBe('2026-11-10');
  });
  it('"Já paguei" com data de hoje conta como paga', () => {
    const [e] = buildEntries({ ...base, type: 'DEBIT', dateStr: TODAY, recurrence: 'SINGLE', count: 1 });
    expect(toLocalDay(e.paymentDate as string)).toBe(TODAY);
  });
  it('"Já paguei" com data futura não vira paga: fica pending', () => {
    const [e] = buildEntries({ ...base, type: 'DEBIT', dateStr: '2026-11-19', recurrence: 'SINGLE', count: 1 });
    expect(e.pending).toBe(true);
    expect(e.paymentDate).toBeUndefined();
  });
  it('"Já paguei" mensal: 1ª paga, as futuras pending', () => {
    const r = buildEntries({ ...base, type: 'DEBIT', dateStr: '2026-11-10', recurrence: 'RECURRING', count: 3 });
    expect(r).toHaveLength(3);
    expect(toLocalDay(r[0].paymentDate as string)).toBe('2026-11-10');
    expect('pending' in r[0]).toBe(false);
    expect(r[1].pending).toBe(true);
    expect(r[2].pending).toBe(true);
    expect(r[1].paymentDate).toBeUndefined();
    expect(r.every(e => e.groupId === 'g1' && e.amount === 90000)).toBe(true);
  });
  it('"Já paguei" parcelado: soma exata, 1ª paga, resto pending', () => {
    const r = buildEntries({ ...base, totalCents: 10000, type: 'DEBIT', dateStr: '2026-11-10', recurrence: 'INSTALLMENT', count: 3 });
    expect(r.map(e => e.amount)).toEqual([3333, 3333, 3334]);
    expect(r[0].paymentDate).toBeDefined();
    expect(r[1].pending && r[2].pending).toBe(true);
    expect(r[1].description).toBe('Aluguel (2/3)');
  });
  it('"Vou pagar em" mensal: todas pending', () => {
    const r = buildEntries({ ...base, type: 'DEBIT', dateStr: '2026-11-25', recurrence: 'RECURRING', count: 3, pending: true });
    expect(r.every(e => e.pending === true && e.paymentDate === undefined)).toBe(true);
  });
});


describe('buildEntries: "Já paguei" com recorrência e 1ª data no passado (B1)', () => {
  it('mensal com 1ª em 10/set: as de data até hoje ficam pagas, só as futuras pending', () => {
    const r = buildEntries({ ...base, type: 'DEBIT', dateStr: '2026-09-10', recurrence: 'RECURRING', count: 5 });
    // 10/set, 10/out, 10/nov (pagas), 10/dez, 10/jan (futuras)
    expect(r.slice(0, 3).every(e => !('pending' in e))).toBe(true);
    expect(r.slice(0, 3).map(e => toLocalDay(e.paymentDate as string))).toEqual(['2026-09-10', '2026-10-10', '2026-11-10']);
    expect(r.slice(3).every(e => e.pending === true && e.paymentDate === undefined)).toBe(true);
  });
  it('parcelado no passado: parcelas vencidas pagas', () => {
    const r = buildEntries({ ...base, totalCents: 9000, type: 'DEBIT', dateStr: '2026-10-05', recurrence: 'INSTALLMENT', count: 3 });
    expect(toLocalDay(r[0].paymentDate as string)).toBe('2026-10-05');
    expect(toLocalDay(r[1].paymentDate as string)).toBe('2026-11-05');
    expect(r[2].pending).toBe(true);
  });
  it('"Vou pagar em" continua tudo pending mesmo no passado', () => {
    const r = buildEntries({ ...base, type: 'DEBIT', dateStr: '2026-09-10', recurrence: 'RECURRING', count: 3, pending: true });
    expect(r.every(e => e.pending === true && e.paymentDate === undefined)).toBe(true);
  });
});

describe('buildEntries: receita (B2)', () => {
  it('"Já recebi" único: paymentDate = a data, sem pending', () => {
    const [e] = buildEntries({ ...base, type: 'CREDIT', dateStr: '2026-11-10', recurrence: 'SINGLE', count: 1 });
    expect('pending' in e).toBe(false);
    expect(toLocalDay(e.paymentDate as string)).toBe('2026-11-10');
  });
  it('"Já recebi" com data futura: sem paymentDate e nunca pending', () => {
    const [e] = buildEntries({ ...base, type: 'CREDIT', dateStr: '2026-11-25', recurrence: 'SINGLE', count: 1 });
    expect('pending' in e).toBe(false);
    expect(e.paymentDate).toBeUndefined();
  });
  it('"Já recebi" mensal: as futuras sem paymentDate', () => {
    const r = buildEntries({ ...base, type: 'CREDIT', dateStr: '2026-10-10', recurrence: 'RECURRING', count: 3 });
    expect(toLocalDay(r[0].paymentDate as string)).toBe('2026-10-10');
    expect(toLocalDay(r[1].paymentDate as string)).toBe('2026-11-10');
    expect(r[2].paymentDate).toBeUndefined();
    expect(r.every(e => !('pending' in e))).toBe(true);
  });
  it('"Vou receber em": sem paymentDate nem pending', () => {
    const r = buildEntries({ ...base, type: 'CREDIT', dateStr: '2026-11-10', recurrence: 'RECURRING', count: 2, pending: true });
    expect(r.every(e => !('pending' in e) && e.paymentDate === undefined)).toBe(true);
  });
  it('único sem grupo quando count é 1', () => {
    const [e] = buildEntries({ ...base, type: 'CREDIT', dateStr: '2026-11-10', recurrence: 'SINGLE', count: 1 });
    expect(e.groupId).toBeUndefined();
  });
});

describe('applyEntryEdit (M1)', () => {
  const mk = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
    id: 'x', description: 'Luz', amount: 5000, type: 'DEBIT',
    effectiveDate: '2026-11-05T12:00:00.000Z', createdAt: '2026-11-01T12:00:00.000Z', ...over,
  });
  const edit = (e: LedgerEntry, over: Partial<Parameters<typeof applyEntryEdit>[1]> = {}) =>
    applyEntryEdit(e, { desc: 'Luz 2', amountCents: 6000, type: 'DEBIT', dateStr: '2026-11-08', today: TODAY, ...over });
  const day = (iso?: string) => (iso ? toLocalDay(iso) : undefined);

  it('despesa paga (paymentDate): nova data vira paymentDate e effectiveDate', () => {
    const r = edit(mk({ paymentDate: '2026-11-05T12:00:00.000Z' }));
    expect(day(r.paymentDate)).toBe('2026-11-08');
    expect(day(r.effectiveDate)).toBe('2026-11-08');
    expect('pending' in r).toBe(false);
    expect(r.description).toBe('Luz 2');
    expect(r.amount).toBe(6000);
  });
  it('despesa legada paga (sem paymentDate nem pending): ganha paymentDate = nova data', () => {
    const r = edit(mk());
    expect(day(r.paymentDate)).toBe('2026-11-08');
    expect(day(r.effectiveDate)).toBe('2026-11-08');
  });
  it('paga com data futura: não grava paymentDate futuro; fica prevista', () => {
    const r = edit(mk({ paymentDate: '2026-11-05T12:00:00.000Z' }), { dateStr: '2026-12-01' });
    expect(r.pending).toBe(true);
    expect(r.paymentDate).toBeUndefined();
  });
  it('despesa prevista: data é vencimento, pending mantido, sem paymentDate', () => {
    const r = edit(mk({ pending: true, effectiveDate: '2026-12-05T12:00:00.000Z' }), { dateStr: '2026-12-20' });
    expect(r.pending).toBe(true);
    expect(r.paymentDate).toBeUndefined();
    expect(day(r.effectiveDate)).toBe('2026-12-20');
  });
  it('prevista com dueDate: dueDate acompanha a nova data', () => {
    const r = edit(mk({ pending: true, dueDate: '2026-12-05T12:00:00.000Z' }), { dateStr: '2026-12-20' });
    expect(day(r.dueDate)).toBe('2026-12-20');
  });
  it('receita: só a data efetiva muda, paymentDate preservado, pending nunca', () => {
    const c = mk({ type: 'CREDIT', paymentDate: '2026-11-06T12:00:00.000Z' });
    const r = edit(c, { type: 'CREDIT' });
    expect(r.paymentDate).toBe(c.paymentDate);
    expect(day(r.effectiveDate)).toBe('2026-11-08');
    expect('pending' in r).toBe(false);
  });
  it('despesa prevista trocada para receita perde o pending', () => {
    const r = edit(mk({ pending: true }), { type: 'CREDIT' });
    expect('pending' in r).toBe(false);
    expect(r.type).toBe('CREDIT');
  });
  it('não altera o original', () => {
    const e = mk({ paymentDate: '2026-11-05T12:00:00.000Z' });
    edit(e);
    expect(day(e.paymentDate)).toBe('2026-11-05');
  });
});

describe('validateEntryDraft (M1/M3)', () => {
  const ok = { desc: 'Luz', cents: 5000, date: '2026-11-10', payLater: false, type: 'DEBIT' as const, isNew: true };
  it('válido: sem erros', () => expect(validateEntryDraft(ok)).toEqual({}));
  it('descrição vazia ou só espaços', () => {
    expect(validateEntryDraft({ ...ok, desc: '  ' }).desc).toBe('Informe a descrição.');
  });
  it('valor ausente ou zero', () => {
    expect(validateEntryDraft({ ...ok, cents: undefined }).amount).toBe('Informe um valor maior que zero.');
    expect(validateEntryDraft({ ...ok, cents: 0 }).amount).toBe('Informe um valor maior que zero.');
  });
  it('"Vou pagar em" sem data: mensagem de pagamento; receita: de recebimento', () => {
    expect(validateEntryDraft({ ...ok, payLater: true, date: '' }).date).toBe('Escolha a data de pagamento.');
    expect(validateEntryDraft({ ...ok, payLater: true, date: '', type: 'CREDIT' }).date).toBe('Escolha a data de recebimento.');
  });
  it('data vazia em qualquer lançamento é erro; edição também', () => {
    expect(validateEntryDraft({ ...ok, date: '', isNew: false }).date).toBe('Escolha a data.');
  });
});

describe('paymentToast', () => {
  const fmt = (c: number) => `R$ ${(c / 100).toFixed(2).replace('.', ',')}`;
  const e = (type: 'CREDIT' | 'DEBIT'): LedgerEntry => ({ id: 'x', description: 'Aluguel', amount: 60000, type, effectiveDate: '2026-11-05T12:00:00.000Z', createdAt: '2026-11-05T12:00:00.000Z' });
  it('textos', () => {
    expect(paymentToast(e('DEBIT'), true, fmt)).toBe('Pago: Aluguel - R$ 600,00');
    expect(paymentToast(e('CREDIT'), true, fmt)).toBe('Recebido: Aluguel - R$ 600,00');
    expect(paymentToast(e('DEBIT'), false, fmt)).toBe('Pagamento desfeito: Aluguel - R$ 600,00');
    expect(paymentToast(e('CREDIT'), false, fmt)).toBe('Recebimento desfeito: Aluguel - R$ 600,00');
  });
});

import { describe, expect, it } from 'vitest';
import type { LedgerEntry, WorkOrder } from '../types';
import { classify } from '../sync/diff';
import { ledgerTouched, moneyBusyLabel, saveNeedsMoney, statusNeedsMoneyOp } from './moneyRoute';
import { statusChangeEffects } from './osFinanceService';
import { prepareOSSave } from './osSave';

const os = (over: Partial<WorkOrder> = {}): WorkOrder => ({
  id: 'o1', osNumber: 1, vehicle: 'Gol', clientName: 'Ana', clientPhone: '1', mileage: 1, status: 'EM_SERVICO',
  createdAt: '2026-11-01T15:00:00.000Z', publicNotes: '',
  parts: [{ id: 'p0', description: 'Filtro', price: 4000 }], services: [{ id: 's0', description: 'Troca', price: 6000 }], total: 10000, ...over,
});
const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: 'e1', description: 'x', amount: 10000, type: 'CREDIT', effectiveDate: '2026-11-01T15:00:00.000Z', createdAt: '2026-11-01T15:00:00.000Z', ...over,
});

describe('moneyRoute: status', () => {
  it('só status simples vai pelo setX; Finalizado, receita a acertar e saída do arquivo vão pelo servidor', () => {
    const a = os();
    expect(statusNeedsMoneyOp(a, 'APROVADO', statusChangeEffects(a, 'APROVADO', '2026-11-12T12:00:00.000Z', []))).toBe(false);
    const wait = os({ status: 'AGUARDANDO_PAGAMENTO', financialId: 'e1', paymentMethod: 'SINGLE' });
    const eff = statusChangeEffects(wait, 'FINALIZADO', '2026-11-12T12:00:00.000Z', [entry()]);
    expect(statusNeedsMoneyOp(wait, 'FINALIZADO', eff)).toBe(true);
    const arch = os({ status: 'ARQUIVADO' });
    expect(statusNeedsMoneyOp(arch, 'ORCAMENTO', statusChangeEffects(arch, 'ORCAMENTO', '2026-11-12T12:00:00.000Z', []))).toBe(true);
    const fin = os({ status: 'FINALIZADO', financialId: 'e1' });
    expect(statusNeedsMoneyOp(fin, 'ARQUIVADO', statusChangeEffects(fin, 'ARQUIVADO', '2026-11-12T12:00:00.000Z', [entry()]))).toBe(false);
  });
});

describe('moneyRoute: caixa e salvar OS', () => {
  it('ledgerTouched ignora objeto novo com o mesmo conteúdo e vê mudança real', () => {
    const l = [entry(), entry({ id: 'e2' })];
    expect(ledgerTouched([{ ...l[0] }, l[1]], l)).toBe(false);
    expect(ledgerTouched([{ ...l[0], amount: 1 }, l[1]], l)).toBe(true);
    expect(ledgerTouched([l[0]], l)).toBe(true);
  });

  it('ledgerTouched: mudar só a descrição do lançamento não é dinheiro (o servidor libera, como a cascata)', () => {
    const l = [entry({ osId: 'o1' } as Partial<LedgerEntry>)];
    expect(ledgerTouched([{ ...l[0], description: 'Adiantamento OS #1 - Ana' }], l)).toBe(false);
    expect(ledgerTouched([{ ...l[0], description: 'outro', amount: 5 }], l)).toBe(true);
    expect(ledgerTouched([{ ...l[0], description: 'outro', paymentDate: '2026-11-02T15:00:00.000Z' }], l)).toBe(true);
  });

  it('salvar só o km de OS com adiantamento antigo (descrição do lançamento desatualizada) não vira operação de dinheiro', () => {
    const noon = new Date(2026, 10, 1, 12).toISOString(); // data só-dia = meio-dia local, em qualquer fuso
    const adv = entry({ id: 'adv1', description: 'Adiantamento antigo', amount: 3000, effectiveDate: noon, paymentDate: noon, groupId: 'o1' });
    const a = os({ advances: [{ id: 'adv1', amount: 3000, date: noon, entryId: 'adv1' }] } as Partial<WorkOrder>);
    const saved = prepareOSSave({ base: { ...a, mileage: 999 }, previous: a, ledger: [adv], today: '2026-11-12', now: '2026-11-12T12:00:00.000Z', newId: () => 'n1', machine: 'm' });
    if (!saved.ok) throw new Error(saved.error);
    expect(saved.ledger.some(e => e.description !== adv.description)).toBe(true); // o salvar ressincroniza a descrição
    expect(saveNeedsMoney({ role: 'recepcao', previous: a, saved, ledger: [adv] })).toBe(false);
  });

  const run = (previous: WorkOrder | undefined, base: WorkOrder, ledger: LedgerEntry[], drafts?: { date: string; amount: number }[]) => {
    const saved = prepareOSSave({ base, previous, drafts, ledger, today: '2026-11-12', now: '2026-11-12T12:00:00.000Z', newId: () => 'n1', machine: 'm' });
    if (!saved.ok) throw new Error(saved.error);
    return saveNeedsMoney({ role: 'recepcao', previous, saved, ledger });
  };

  it('edição comum não precisa do servidor', () => {
    const a = os();
    expect(run(a, { ...a, clientName: 'Ana Maria' }, [])).toBe(false);
  });

  it('adiantamento novo (OS nova ou existente) precisa do servidor', () => {
    const a = os();
    expect(run(undefined, a, [], [{ date: '2026-11-10', amount: 1000 }])).toBe(true);
    expect(run(a, a, [], [{ date: '2026-11-10', amount: 1000 }])).toBe(true);
  });

  it('preço de OS já lançada precisa do servidor (receita à vista muda junto)', () => {
    const a = os({ status: 'FINALIZADO', financialId: 'e1', paymentMethod: 'SINGLE', paymentDate: '2026-11-10T12:00:00.000Z' });
    const b = { ...a, services: [{ id: 's0', description: 'Troca', price: 8000 }], total: 12000 };
    expect(run(a, b, [entry({ paymentDate: '2026-11-10T12:00:00.000Z' })])).toBe(true);
  });

  it('o classify do motor continua barrando o money_op que escapar por setX', () => {
    const a = os({ status: 'AGUARDANDO_PAGAMENTO', financialId: 'e1' });
    expect(classify('recepcao', 'workOrders', a, { ...a, status: 'FINALIZADO', paymentDate: '2026-11-12T12:00:00.000Z' })).toBe('money_op');
    expect(classify('recepcao', 'ledger', entry(), entry({ paymentDate: '2026-11-12T12:00:00.000Z' }), { ledgerOsId: 'o1' })).toBe('money_op');
  });
});

describe('moneyBusyLabel', () => {
  it('texto de andamento por operação; sem texto onde a tela já tem o seu', () => {
    expect(moneyBusyLabel('os.finalizeSingle')).toBe('Finalizando...');
    expect(moneyBusyLabel('os.installment')).toBe('Finalizando...');
    expect(moneyBusyLabel('os.delete')).toBe('Excluindo...');
    expect(moneyBusyLabel('os.restore')).toBe('Reabrindo...');
    expect(moneyBusyLabel('os.status', 'FINALIZADO')).toBe('Finalizando...');
    expect(moneyBusyLabel('os.status', 'AGUARDANDO_PAGAMENTO')).toBe('Finalizando...');
    expect(moneyBusyLabel('os.status', 'EM_SERVICO')).toBeNull();
    expect(moneyBusyLabel('os.save')).toBeNull();
    expect(moneyBusyLabel('ledger.toggle')).toBeNull();
  });
});

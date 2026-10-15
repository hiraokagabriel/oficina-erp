import { describe, expect, it } from 'vitest';
import {
  applyInstallmentToOS, buildInstallmentEntries, finalizeOSSingle, restoreFinancial,
  statusChangeEffects, togglePayment,
} from './osFinanceService';
import type { InstallmentConfig, LedgerEntry, WorkOrder } from '../types';

// Fixtures sintéticas.
const NOW = '2026-03-15T15:00:00.000Z';
const seqId = () => { let n = 0; return () => `id-${++n}`; };

const config = (over: Partial<InstallmentConfig> = {}): InstallmentConfig => ({
  totalAmount: 10000, installments: 3, installmentAmount: 3333, lastInstallmentAmount: 3334,
  firstPaymentDate: new Date(2026, 4, 10, 12).toISOString(), groupId: 'g1', description: 'Receita OS #1 - Fulano', ...over,
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

describe('buildInstallmentEntries', () => {
  it('gera N parcelas CREDIT não pagas, com grupo, numeração e descrição', () => {
    const r = buildInstallmentEntries(config(), { now: NOW, newId: seqId() });
    expect(r).toHaveLength(3);
    expect(r.map(e => e.id)).toEqual(['id-1', 'id-2', 'id-3']);
    r.forEach((e, i) => {
      expect(e).toMatchObject({
        description: `Receita OS #1 - Fulano - Parcela ${i + 1}/3`,
        type: 'CREDIT', createdAt: NOW, groupId: 'g1', installmentGroupId: 'g1',
        installmentNumber: i + 1, totalInstallments: 3, isPaid: false,
      });
      expect(e.effectiveDate).toBe(e.dueDate);
      expect(e.paymentDate).toBeUndefined();
    });
  });

  it('a última parcela usa lastInstallmentAmount', () => {
    const r = buildInstallmentEntries(config(), { now: NOW, newId: seqId() });
    expect(r.map(e => e.amount)).toEqual([3333, 3333, 3334]);
    expect(r.reduce((a, e) => a + e.amount, 0)).toBe(10000);
  });

  it('1 parcela: usa lastInstallmentAmount, não installmentAmount', () => {
    const r = buildInstallmentEntries(config({ installments: 1, installmentAmount: 10000, lastInstallmentAmount: 9999 }), { now: NOW, newId: seqId() });
    expect(r).toHaveLength(1);
    expect(r[0].amount).toBe(9999);
    expect(r[0].description).toBe('Receita OS #1 - Fulano - Parcela 1/1');
  });

  it('vencimentos mensais a partir da primeira data', () => {
    const r = buildInstallmentEntries(config(), { now: NOW, newId: seqId() });
    const months = r.map(e => new Date(e.dueDate!)).map(d => [d.getMonth(), d.getDate()]);
    expect(months).toEqual([[4, 10], [5, 10], [6, 10]]);
  });

  // COMPORTAMENTO ATUAL (suspeito): setMonth estoura o mês: 31/jan + 1 mês = 03/mar (fev/2026 tem 28 dias),
  // a parcela 2 pula fevereiro. Teste independente de fuso (datas locais ao meio-dia).
  it('parcela do dia 31 pula de mês', () => {
    const r = buildInstallmentEntries(
      config({ installments: 3, firstPaymentDate: new Date(2026, 0, 31, 12).toISOString() }),
      { now: NOW, newId: seqId() }
    );
    const d = r.map(e => new Date(e.dueDate!));
    expect([d[0].getMonth(), d[0].getDate()]).toEqual([0, 31]);
    expect([d[1].getMonth(), d[1].getDate()]).toEqual([2, 3]); // março, não fevereiro
    expect([d[2].getMonth(), d[2].getDate()]).toEqual([2, 31]); // i=2 parte de 31/jan: 31/mar
  });

  // COMPORTAMENTO ATUAL (suspeito): config sem validação. 0 parcelas = lista vazia (e o App
  // depois lê newEntries[0].id); valores negativos/NaN são aceitos como estão.
  it('config sem validação: 0 parcelas gera lista vazia', () => {
    expect(buildInstallmentEntries(config({ installments: 0 }), { now: NOW, newId: seqId() })).toEqual([]);
  });
  it('config sem validação: data inválida gera RangeError em toISOString', () => {
    expect(() => buildInstallmentEntries(config({ firstPaymentDate: 'lixo' }), { now: NOW, newId: seqId() })).toThrow(RangeError);
  });
  it('config sem validação: valores negativos e descrição vazia são aceitos', () => {
    const r = buildInstallmentEntries(config({ installments: 2, installmentAmount: -5, lastInstallmentAmount: -7, description: '' }), { now: NOW, newId: seqId() });
    expect(r.map(e => e.amount)).toEqual([-5, -7]);
    expect(r[0].description).toBe(' - Parcela 1/2');
  });

  it('sem injeção usa uuid e data atual', () => {
    const r = buildInstallmentEntries(config({ installments: 2 }));
    expect(r[0].id).not.toBe(r[1].id);
    expect(Number.isNaN(Date.parse(r[0].createdAt))).toBe(false);
  });
});

describe('applyInstallmentToOS', () => {
  it('AGUARDANDO_PAGAMENTO, financialId da 1ª parcela, método INSTALLMENT, sem paymentDate', () => {
    const c = config();
    const r = applyInstallmentToOS(os({ paymentDate: NOW }), c, 'id-1');
    expect(r).toMatchObject({ status: 'AGUARDANDO_PAGAMENTO', financialId: 'id-1', paymentMethod: 'INSTALLMENT', installmentConfig: c });
    expect(r.paymentDate).toBeUndefined();
    expect(r.osNumber).toBe(1);
  });
  it('não muta a OS original', () => {
    const o = os();
    applyInstallmentToOS(o, config(), 'id-1');
    expect(o.status).toBe('EM_SERVICO');
    expect(o.financialId).toBeUndefined();
  });
});

describe('restoreFinancial', () => {
  const group = [
    entry('p1', { groupId: 'g1', installmentGroupId: 'g1' }),
    entry('p2', { groupId: 'g1', installmentGroupId: 'g1' }),
    entry('p3', { groupId: 'g1', installmentGroupId: 'g1' }),
  ];
  const other = entry('outro');
  const paidOS = os({ status: 'AGUARDANDO_PAGAMENTO', financialId: 'p1', paymentMethod: 'INSTALLMENT', installmentConfig: config(), paymentDate: NOW });

  it('grupo de parcelas: remove todas e reabre a OS', () => {
    const r = restoreFinancial([other, ...group], paidOS);
    expect(r.ledger).toEqual([other]);
    expect(r.removedCount).toBe(3);
    expect(r.removedGroup).toBe(true);
    expect(r.os).toMatchObject({ status: 'EM_SERVICO' });
    expect(r.os.financialId).toBeUndefined();
    expect(r.os.paymentMethod).toBeUndefined();
    expect(r.os.installmentConfig).toBeUndefined();
    expect(r.os.paymentDate).toBeUndefined();
  });

  it('lançamento único (sem grupo): remove só ele', () => {
    const single = entry('s1');
    const r = restoreFinancial([single, other], os({ status: 'FINALIZADO', financialId: 's1', paymentDate: NOW }));
    expect(r.ledger).toEqual([other]);
    expect(r.removedCount).toBe(1);
    expect(r.removedGroup).toBe(false);
    expect(r.os.status).toBe('EM_SERVICO');
  });

  it('OS sem financialId: ledger intacto, OS reaberta', () => {
    const led = [other];
    const r = restoreFinancial(led, os({ status: 'FINALIZADO' }));
    expect(r.ledger).toBe(led);
    expect(r.removedCount).toBe(0);
    expect(r.removedGroup).toBe(false);
    expect(r.os.status).toBe('EM_SERVICO');
  });

  // COMPORTAMENTO ATUAL (suspeito): financialId órfão (lançamento já apagado) reabre a OS em silêncio.
  it('financialId sem lançamento correspondente: nada removido, OS reaberta', () => {
    const r = restoreFinancial([other], os({ status: 'FINALIZADO', financialId: 'sumiu' }));
    expect(r.ledger).toEqual([other]);
    expect(r.removedCount).toBe(0);
    expect(r.os.status).toBe('EM_SERVICO');
  });

  // COMPORTAMENTO ATUAL (suspeito): remove por groupId OU installmentGroupId; um lançamento de OUTRA OS
  // que compartilhe o groupId (ex.: groupId manual de createEntry) também seria apagado.
  it('apaga qualquer lançamento com o mesmo groupId, mesmo de outra origem', () => {
    const foreign = entry('manual', { groupId: 'g1' });
    const r = restoreFinancial([...group, foreign, other], paidOS);
    expect(r.ledger).toEqual([other]);
    expect(r.removedCount).toBe(4);
  });

  it('não muta o ledger de entrada', () => {
    const led = [...group, other];
    restoreFinancial(led, paidOS);
    expect(led).toHaveLength(4);
  });
});

describe('togglePayment', () => {
  const p1 = entry('p1', { groupId: 'g1', installmentGroupId: 'g1' });
  const p2 = entry('p2', { groupId: 'g1', installmentGroupId: 'g1' });
  const linked = os({ status: 'AGUARDANDO_PAGAMENTO', financialId: 'p1' });

  it('pendente vira pago em now e sincroniza a OS ligada', () => {
    const r = togglePayment([p1, p2], [linked], 'p1', NOW)!;
    expect(r.paid).toBe(true);
    expect(r.ledger[0].paymentDate).toBe(NOW);
    expect(r.ledger[1].paymentDate).toBeUndefined();
    expect(r.workOrders[0].paymentDate).toBe(NOW);
  });

  it('pago volta a pendente e limpa a OS', () => {
    const r = togglePayment([{ ...p1, paymentDate: NOW }], [{ ...linked, paymentDate: NOW }], 'p1', NOW)!;
    expect(r.paid).toBe(false);
    expect(r.ledger[0].paymentDate).toBeUndefined();
    expect(r.workOrders[0].paymentDate).toBeUndefined();
  });

  it('id inexistente: null', () => {
    expect(togglePayment([p1], [linked], 'nada', NOW)).toBeNull();
  });

  it('DEBIT: null (só CREDIT alterna)', () => {
    expect(togglePayment([entry('d1', { type: 'DEBIT' })], [], 'd1', NOW)).toBeNull();
  });

  it('sem OS ligada: só o ledger muda', () => {
    const wos = [os({ financialId: 'outro' })];
    const r = togglePayment([p1], wos, 'p1', NOW)!;
    expect(r.ledger[0].paymentDate).toBe(NOW);
    expect(r.workOrders).toBe(wos);
  });

  // COMPORTAMENTO ATUAL (suspeito): a OS só é sincronizada pela parcela ligada por financialId (a 1ª).
  // Pagar a parcela 2 não toca na OS; e desmarcar a 1ª limpa o paymentDate da OS mesmo com as outras pagas.
  it('parcela que não é a ligada não sincroniza a OS', () => {
    const r = togglePayment([p1, p2], [linked], 'p2', NOW)!;
    expect(r.ledger[1].paymentDate).toBe(NOW);
    expect(r.workOrders[0].paymentDate).toBeUndefined();
  });

  // COMPORTAMENTO ATUAL (suspeito): a OS continua AGUARDANDO_PAGAMENTO mesmo com todas as parcelas pagas
  // (togglePayment não muda o status da OS).
  it('pagar todas as parcelas não finaliza a OS', () => {
    const a = togglePayment([p1, p2], [linked], 'p1', NOW)!;
    const b = togglePayment(a.ledger, a.workOrders, 'p2', NOW)!;
    expect(b.workOrders[0].status).toBe('AGUARDANDO_PAGAMENTO');
  });

  it('não muta as listas de entrada', () => {
    const led = [p1]; const wos = [linked];
    togglePayment(led, wos, 'p1', NOW);
    expect(led[0].paymentDate).toBeUndefined();
    expect(wos[0].paymentDate).toBeUndefined();
  });
});

describe('statusChangeEffects', () => {
  it('status igual: noop', () => {
    expect(statusChangeEffects(os({ status: 'APROVADO' }), 'APROVADO', NOW)).toEqual({ kind: 'noop' });
  });
  it('virar FINALIZADO sem financialId: pergunta como receber', () => {
    expect(statusChangeEffects(os(), 'FINALIZADO', NOW)).toEqual({ kind: 'ask-finish' });
  });
  it('sair de FINALIZADO com financialId: pergunta se reabre', () => {
    expect(statusChangeEffects(os({ status: 'FINALIZADO', financialId: 'f1' }), 'EM_SERVICO', NOW)).toEqual({ kind: 'ask-restore' });
  });
  it('virar FINALIZADO com financialId já existente: atualiza com paymentDate = now', () => {
    expect(statusChangeEffects(os({ status: 'AGUARDANDO_PAGAMENTO', financialId: 'f1' }), 'FINALIZADO', NOW))
      .toEqual({ kind: 'update', updates: { status: 'FINALIZADO', paymentDate: NOW } });
  });
  it('sair de FINALIZADO sem financialId: atualiza e zera paymentDate', () => {
    const r = statusChangeEffects(os({ status: 'FINALIZADO', paymentDate: NOW }), 'APROVADO', NOW);
    expect(r).toEqual({ kind: 'update', updates: { status: 'APROVADO', paymentDate: undefined } });
    expect(r.kind === 'update' && 'paymentDate' in r.updates).toBe(true);
  });
  it('mudança comum: só status', () => {
    const r = statusChangeEffects(os({ status: 'ORCAMENTO' }), 'APROVADO', NOW);
    expect(r).toEqual({ kind: 'update', updates: { status: 'APROVADO' } });
    expect(r.kind === 'update' && 'paymentDate' in r.updates).toBe(false);
  });
  // COMPORTAMENTO ATUAL (suspeito): ARQUIVADO a partir de FINALIZADO com financialId também pede para
  // restaurar o financeiro (apagando as receitas) - o fluxo de arquivar passa por aqui.
  it('FINALIZADO com financialId para ARQUIVADO pede restauração', () => {
    expect(statusChangeEffects(os({ status: 'FINALIZADO', financialId: 'f1' }), 'ARQUIVADO', NOW)).toEqual({ kind: 'ask-restore' });
  });
});

describe('finalizeOSSingle', () => {
  it('cria receita à vista já paga e finaliza a OS', () => {
    const o = os({ createdAt: '2026-01-10T12:00:00.000Z', total: 25000 });
    const r = finalizeOSSingle(o, { now: NOW, newId: () => 'novo' });
    expect(r.entry).toMatchObject({
      id: 'novo', description: 'Receita OS #1 - Fulano Teste', amount: 25000, type: 'CREDIT',
      effectiveDate: '2026-01-10T12:00:00.000Z', createdAt: NOW, paymentDate: NOW,
    });
    expect(r.entry.groupId).toBeUndefined();
    expect(r.os).toMatchObject({ status: 'FINALIZADO', financialId: 'novo', paymentDate: NOW });
    expect(o.status).toBe('EM_SERVICO');
  });

  // COMPORTAMENTO ATUAL (suspeito): a competência (effectiveDate) da receita é o createdAt da OS,
  // não a data do pagamento. OS aberta em janeiro e paga em março cai em janeiro nos relatórios.
  it('usa createdAt da OS como effectiveDate, não a data de pagamento', () => {
    const r = finalizeOSSingle(os({ createdAt: '2026-01-10T12:00:00.000Z' }), { now: NOW, newId: () => 'n' });
    expect(r.entry.effectiveDate).toBe('2026-01-10T12:00:00.000Z');
    expect(r.entry.effectiveDate).not.toBe(r.entry.paymentDate);
  });

  // COMPORTAMENTO ATUAL (suspeito): a OS não guarda paymentMethod 'SINGLE' ao finalizar à vista
  // (o tipo existe, mas esse fluxo não o preenche) e valor total 0 gera receita de 0.
  it('não define paymentMethod; total 0 gera lançamento de 0', () => {
    const r = finalizeOSSingle(os({ total: 0 }), { now: NOW, newId: () => 'n' });
    expect(r.os.paymentMethod).toBeUndefined();
    expect(r.entry.amount).toBe(0);
  });

  it('equivale ao createEntry original (mesmos campos)', async () => {
    const { createEntry } = await import('../utils/helpers');
    const o = os();
    const a = finalizeOSSingle(o, { now: new Date().toISOString(), newId: () => 'x' }).entry;
    const b = createEntry(`Receita OS #${o.osNumber} - ${o.clientName}`, o.total, 'CREDIT', o.createdAt, undefined, a.paymentDate);
    expect({ ...a, id: '', createdAt: '' }).toEqual({ ...b, id: '', createdAt: '' });
  });

  it('sem injeção gera id e now automáticos', () => {
    const r = finalizeOSSingle(os());
    expect(r.entry.id).toBeTruthy();
    expect(r.os.financialId).toBe(r.entry.id);
  });
});

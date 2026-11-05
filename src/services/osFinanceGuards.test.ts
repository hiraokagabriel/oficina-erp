import { describe, expect, it } from 'vitest';
import {
  editWarning, findReceiptOwner, getOSReceipt, planDeleteOS, planReceiveOS, planReopenOS, receiptLockedMessage, removeOSReceipt, settleOpenReceipt,
} from './osFinanceGuards';
import { reopenOS, restoreFinancial, statusChangeEffects } from './osFinanceService';
import type { InstallmentConfig, LedgerEntry, WorkOrder } from '../types';

// Fixtures sintéticas.
const NOW = '2026-03-15T15:00:00.000Z';
const config = (): InstallmentConfig => ({
  totalAmount: 9000, installments: 3, installmentAmount: 3000, lastInstallmentAmount: 3000,
  firstPaymentDate: '2026-04-10T15:00:00.000Z', groupId: 'g1', description: 'Receita OS #5',
});
const os = (over: Partial<WorkOrder> = {}): WorkOrder => ({
  id: 'os1', osNumber: 5, vehicle: 'Gol - AAA-0001', clientName: 'Fulano Teste', clientPhone: '1',
  mileage: 0, status: 'AGUARDANDO_PAGAMENTO', parts: [], services: [], total: 9000,
  createdAt: '2026-01-10T12:00:00.000Z', ...over,
});
const entry = (id: string, over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id, description: 'x', amount: 3000, type: 'CREDIT',
  effectiveDate: '2026-01-10T12:00:00.000Z', createdAt: '2026-01-10T12:00:00.000Z', ...over,
});
const parcel = (id: string, paid = false): LedgerEntry =>
  entry(id, { groupId: 'g1', installmentGroupId: 'g1', ...(paid ? { paymentDate: NOW } : {}) });
const instOS = (over: Partial<WorkOrder> = {}) =>
  os({ financialId: 'p1', paymentMethod: 'INSTALLMENT', installmentConfig: config(), ...over });
const other = entry('outro', { groupId: 'g2' });

describe('getOSReceipt', () => {
  it('parcelada: todas as parcelas do grupo, sem lançamentos de fora', () => {
    const r = getOSReceipt(instOS(), [other, parcel('p1'), parcel('p2'), parcel('p3')]);
    expect(r.entries.map(e => e.id)).toEqual(['p1', 'p2', 'p3']);
    expect(r.grouped).toBe(true);
  });
  it('financialId sumido mas grupo da config presente: acha as parcelas pelo grupo', () => {
    const r = getOSReceipt(instOS({ financialId: 'sumiu' }), [parcel('p2'), parcel('p3')]);
    expect(r.entries).toHaveLength(2);
  });
  it('à vista: só o lançamento; sem nada: vazio', () => {
    expect(getOSReceipt(os({ financialId: 's1' }), [entry('s1'), other])).toEqual({ entries: [entry('s1')], grouped: false });
    expect(getOSReceipt(os(), [other])).toEqual({ entries: [], grouped: false });
  });
});

describe('planReceiveOS (item 3)', () => {
  it('parcelada com parcelas abertas: bloqueia e diz quantas e quanto', () => {
    const r = planReceiveOS(instOS(), [parcel('p1', true), parcel('p2'), parcel('p3')]);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('OS #5');
    expect(r.message).toContain('2 parcelas');
    expect(r.message).toContain('60,00');
  });
  it('parcelada com tudo pago, à vista ou sem parcelamento: livre', () => {
    expect(planReceiveOS(instOS(), [parcel('p1', true), parcel('p2', true), parcel('p3', true)]).ok).toBe(true);
    expect(planReceiveOS(os({ financialId: 's1' }), [entry('s1')]).ok).toBe(true);
    expect(planReceiveOS(os(), []).ok).toBe(true);
  });
});

describe('statusChangeEffects com ledger (itens 3 e 4)', () => {
  const open = [parcel('p1'), parcel('p2'), parcel('p3')];
  it('Receber em parcelada com parcelas abertas: blocked, nada muda', () => {
    expect(statusChangeEffects(instOS(), 'FINALIZADO', NOW, open)).toMatchObject({ kind: 'blocked' });
  });
  it('desarquivar para FINALIZADO com parcela aberta também bloqueia', () => {
    expect(statusChangeEffects(instOS({ status: 'ARQUIVADO' }), 'FINALIZADO', NOW, open)).toMatchObject({ kind: 'blocked' });
  });
  it('voltar de Aguardando Pagamento parcelada sem pagas: pergunta e diz o que apaga', () => {
    const r = statusChangeEffects(instOS(), 'EM_SERVICO', NOW, open);
    expect(r).toMatchObject({ kind: 'ask-restore', target: 'EM_SERVICO' });
    expect(r.kind === 'ask-restore' && r.message).toContain('desfazer o parcelamento');
    expect(r.kind === 'ask-restore' && r.message).toContain('3 parcelas');
  });
  it('voltar com parcela paga: blocked com o valor recebido', () => {
    const r = statusChangeEffects(instOS(), 'APROVADO', NOW, [parcel('p1', true), parcel('p2'), parcel('p3')]);
    expect(r.kind).toBe('blocked');
    expect(r.kind === 'blocked' && r.message).toContain('30,00');
  });
  it('voltar de Aguardando sem financeiro nenhum: só muda o status', () => {
    expect(statusChangeEffects(os(), 'EM_SERVICO', NOW, [])).toEqual({ kind: 'update', updates: { status: 'EM_SERVICO' } });
  });
  it('Aguardando -> Arquivado não desfaz o parcelamento', () => {
    expect(statusChangeEffects(instOS(), 'ARQUIVADO', NOW, open)).toEqual({ kind: 'update', updates: { status: 'ARQUIVADO' } });
  });
  it('finalizada parcelada (tudo pago): reabrir é bloqueado', () => {
    const paid = [parcel('p1', true), parcel('p2', true), parcel('p3', true)];
    const r = statusChangeEffects(instOS({ status: 'FINALIZADO', paymentDate: NOW }), 'EM_SERVICO', NOW, paid);
    expect(r.kind).toBe('blocked');
    expect(r.kind === 'blocked' && r.message).toContain('90,00');
  });
  it('finalizada à vista: reabrir pergunta e avisa a receita que será apagada', () => {
    const r = statusChangeEffects(os({ status: 'FINALIZADO', financialId: 's1' }), 'EM_SERVICO', NOW,
      [entry('s1', { amount: 9000, paymentDate: NOW })]);
    expect(r.kind === 'ask-restore' && r.message).toContain('90,00');
    expect(r.kind === 'ask-restore' && r.message).toContain('já recebida');
  });
});

describe('restoreFinancial / reopenOS com destino', () => {
  it('reabre no status pedido e apaga o grupo todo', () => {
    const led = [other, parcel('p1'), parcel('p2'), parcel('p3')];
    const r = restoreFinancial(led, instOS(), 'APROVADO');
    expect(r.os.status).toBe('APROVADO');
    expect(r.ledger).toEqual([other]);
    expect(r.removedCount).toBe(3);
    expect(r.removedGroup).toBe(true);
    expect(r.os.installmentConfig).toBeUndefined();
  });
  it('padrão continua EM_SERVICO', () => {
    expect(reopenOS(os()).status).toBe('EM_SERVICO');
  });
});

describe('planReopenOS', () => {
  it('sem lançamento: diz que nada será apagado', () => {
    const r = planReopenOS(os(), [], 'EM_SERVICO');
    expect(r.ok).toBe(true);
    expect(r.message).toContain('Nenhum lançamento');
  });
});

describe('planDeleteOS / removeOSReceipt (item 2)', () => {
  const open = [other, parcel('p1'), parcel('p2'), parcel('p3')];
  it('removeOSReceipt tira TODAS as parcelas, não só a ligada (defeito corrigido)', () => {
    expect(removeOSReceipt(instOS(), open)).toEqual([other]);
  });
  it('parcelas em aberto: confirma e diz quantas e quanto sai', () => {
    const r = planDeleteOS(instOS(), open);
    expect(r.ok).toBe(true);
    expect(r.message).toContain('3 parcelas');
    expect(r.message).toContain('90,00');
  });
  it('parcela já recebida: bloqueia e informa o valor recebido', () => {
    const r = planDeleteOS(instOS(), [parcel('p1', true), parcel('p2'), parcel('p3')]);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('1 parcela já recebida');
    expect(r.message).toContain('30,00');
  });
  it('à vista recebida: só confirma, com o valor', () => {
    const r = planDeleteOS(os({ status: 'FINALIZADO', financialId: 's1' }), [entry('s1', { amount: 7000, paymentDate: NOW })]);
    expect(r.ok).toBe(true);
    expect(r.message).toContain('70,00');
    expect(r.message).toContain('já recebida');
  });
  it('menciona os adiantamentos que também saem', () => {
    const r = planDeleteOS(os({ advances: [{ id: 'a', amount: 1500, date: NOW, entryId: 'ea' }] }), []);
    expect(r.message).toContain('15,00');
  });
  it('OS sem financeiro: só a frase de exclusão', () => {
    expect(planDeleteOS(os(), [])).toEqual({ ok: true, message: 'Vai excluir a OS #5.' });
  });
});

describe('findReceiptOwner (item 5)', () => {
  it('acha a OS dona da receita à vista, da 1ª parcela e das demais', () => {
    const i = instOS();
    expect(findReceiptOwner([os({ id: 'x' }), i], parcel('p1'))?.id).toBe('os1');
    expect(findReceiptOwner([i], parcel('p3'))?.id).toBe('os1');
    expect(findReceiptOwner([os({ financialId: 's1' })], entry('s1'))?.id).toBe('os1');
  });
  it('lançamento manual ou de outro grupo: sem dono', () => {
    expect(findReceiptOwner([instOS()], entry('manual'))).toBeUndefined();
    expect(findReceiptOwner([instOS()], other)).toBeUndefined();
  });
  it('mensagem orienta a usar a OS', () => {
    expect(receiptLockedMessage(5)).toContain('OS #5');
  });
});

describe('editWarning', () => {
  const base = os({ status: 'FINALIZADO', financialId: 's1', total: 10000, parts: [{ id: '1', description: 'Filtro', price: 10000 }] });
  it('OS ainda não lançada: sem aviso', () => {
    expect(editWarning(os({ status: 'EM_SERVICO', total: 100 }), os({ status: 'EM_SERVICO', total: 200 }))).toBeNull();
  });
  it('finalizada sem mudança de valor ou itens: sem aviso (ids novos não contam)', () => {
    expect(editWarning(base, { ...base, parts: [{ id: 'novo', description: 'Filtro', price: 10000 }] })).toBeNull();
  });
  it('total mudou: avisa de/para e que a receita será atualizada', () => {
    const m = editWarning(base, { ...base, total: 12000 })!;
    expect(m).toContain('100,00');
    expect(m).toContain('120,00');
    expect(m).toContain('receita lançada');
  });
  it('item mudou com o mesmo total: avisa dos itens', () => {
    expect(editWarning(base, { ...base, parts: [{ id: '1', description: 'Óleo', price: 10000 }] })).toContain('itens mudaram');
  });
  it('parcelada: avisa que as parcelas não mudam', () => {
    const p = instOS({ total: 9000 });
    expect(editWarning(p, { ...p, total: 9500 })).toContain('NÃO mudam');
  });
});

describe('Restaurar do arquivo (reabertura)', () => {
  it('ARQUIVADO parcelada com parcela paga -> ORCAMENTO: bloqueia', () => {
    const r = statusChangeEffects(instOS({ status: 'ARQUIVADO' }), 'ORCAMENTO', NOW,
      [parcel('p1', true), parcel('p2'), parcel('p3')]);
    expect(r.kind).toBe('blocked');
  });
  it('ARQUIVADO parcelada aberta -> ORCAMENTO: pede confirmação e desfaz o parcelamento', () => {
    const r = statusChangeEffects(instOS({ status: 'ARQUIVADO' }), 'ORCAMENTO', NOW,
      [parcel('p1'), parcel('p2'), parcel('p3')]);
    expect(r.kind).toBe('ask-restore');
    if (r.kind === 'ask-restore') {
      expect(r.target).toBe('ORCAMENTO');
      expect(r.message).toContain('desfazer o parcelamento');
    }
  });
  it('ARQUIVADO à vista finalizada -> ORCAMENTO: pede confirmação e apaga a receita', () => {
    const r = statusChangeEffects(os({ status: 'ARQUIVADO', financialId: 's1' }), 'ORCAMENTO', NOW, [entry('s1')]);
    expect(r.kind).toBe('ask-restore');
    if (r.kind === 'ask-restore') expect(r.message).toContain('apagar do caixa');
  });
  it('ARQUIVADO sem financeiro -> ORCAMENTO: atualiza direto', () => {
    expect(statusChangeEffects(os({ status: 'ARQUIVADO' }), 'ORCAMENTO', NOW, []).kind).toBe('update');
  });
});

describe('parcelada sem financialId (item 8)', () => {
  it('receber com parcela aberta: bloqueia mesmo sem financialId', () => {
    const o = instOS({ financialId: undefined });
    expect(statusChangeEffects(o, 'FINALIZADO', NOW, [parcel('p1', true), parcel('p2'), parcel('p3')]).kind).toBe('blocked');
  });
  it('receber com tudo pago: não pergunta a forma de pagamento (não duplica a receita)', () => {
    const o = instOS({ financialId: undefined });
    const r = statusChangeEffects(o, 'FINALIZADO', NOW, [parcel('p1', true), parcel('p2', true), parcel('p3', true)]);
    expect(r.kind).toBe('update');
  });
});

describe('findReceiptOwner por groupId', () => {
  it('parcela só com groupId acha a OS dona', () => {
    expect(findReceiptOwner([instOS()], entry('x', { groupId: 'g1' }))?.id).toBe('os1');
  });
});

describe('editWarning sem lançamento (adiantamentos cobriram o total)', () => {
  const fechada = os({
    status: 'FINALIZADO', financialId: undefined, total: 10000,
    advances: [{ id: 'a1', amount: 10000, date: NOW, entryId: 'ea1' }],
  });
  it('total aumentado: avisa que a diferença NÃO será lançada', () => {
    const m = editWarning(fechada, { ...fechada, total: 15000 })!;
    expect(m).toContain('NÃO será lançada');
    expect(m).toContain('50,00');
  });
  it('total reduzido: sem frase da diferença', () => {
    expect(editWarning(fechada, { ...fechada, total: 8000 })!).not.toContain('NÃO será lançada');
  });
});

describe('OS à vista volta a FINALIZADO com a receita em aberto (achado 7)', () => {
  it('desarquivar: o lançamento aberto é marcado como recebido na mesma data da OS', () => {
    const o = os({ status: 'ARQUIVADO', financialId: 's1', paymentDate: '2026-02-01T15:00:00.000Z' });
    const r = statusChangeEffects(o, 'FINALIZADO', NOW, [entry('s1')]);
    expect(r).toEqual({
      kind: 'update',
      updates: { status: 'FINALIZADO', paymentDate: '2026-02-01T15:00:00.000Z' },
      settleEntry: { entryId: 's1', paymentDate: '2026-02-01T15:00:00.000Z' },
    });
  });
  it('sem paymentDate na OS: usa o agora nos dois', () => {
    const r = statusChangeEffects(os({ status: 'ARQUIVADO', financialId: 's1' }), 'FINALIZADO', NOW, [entry('s1')]);
    expect(r).toMatchObject({ updates: { paymentDate: NOW }, settleEntry: { entryId: 's1', paymentDate: NOW } });
  });
  it('lançamento já recebido: nada a acertar', () => {
    const r = statusChangeEffects(os({ status: 'ARQUIVADO', financialId: 's1' }), 'FINALIZADO', NOW, [entry('s1', { paymentDate: NOW })]);
    expect(r).not.toHaveProperty('settleEntry');
  });
  it('settleOpenReceipt marca só o aberto e não mexe no já recebido', () => {
    const l = [entry('s1'), entry('s2', { paymentDate: '2026-01-01T12:00:00.000Z' })];
    const out = settleOpenReceipt(l, 's1', NOW);
    expect(out[0].paymentDate).toBe(NOW);
    expect(settleOpenReceipt(l, 's2', NOW)[1].paymentDate).toBe('2026-01-01T12:00:00.000Z');
  });
});

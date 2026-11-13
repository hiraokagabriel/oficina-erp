import { describe, expect, it } from 'vitest';
import { handleMoneyOp } from './moneyHandler';
import { MoneyStoreError } from './moneyHandler';
import { MemoryMoneyStore, OP, baseOS, makeMoney } from './moneyTestKit';
import { MECH, OWNER, RECEP, auth } from './testKit';
import type { LedgerEntry, WorkOrder } from '../types';

// `handleMoneyOp(store, req)` com loja em memória: cada kind, idempotência, conflito, papéis e fuso.
// Relógio do servidor: 2026-11-12T12:00Z (= 09:00 em São Paulo). Rode também com TZ=UTC.

const TODAY = '2026-11-12';

type Body = Record<string, unknown>;

function setup() {
  const m = makeMoney();
  let n = 100;
  const call = async (kind: string, body: Body = {}, who: string = RECEP, opts: { op?: string; authorization?: string | null } = {}) => {
    const r = await handleMoneyOp(m.deps, {
      authorization: opts.authorization === undefined ? auth(who) : opts.authorization,
      body: { opId: opts.op ?? OP(n++), kind, today: TODAY, osId: 'os1', ...body },
    });
    return { status: r.status, body: r.body as Record<string, unknown> };
  };
  return { ...m, call };
}

const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: 'e1', description: 'Receita OS #7 - Ana', amount: 10000, type: 'CREDIT',
  effectiveDate: '2026-11-01T15:00:00.000Z', createdAt: '2026-11-10T12:00:00.000Z', ...over,
});

const osRows = (store: MemoryMoneyStore, id = 'os1') => ({
  main: store.get('work_orders', id), fin: store.get('work_order_finance', id), cost: store.get('work_order_costs', id),
});
const finOf = (store: MemoryMoneyStore, id = 'os1') => osRows(store, id).fin?.data as Record<string, unknown>;
const statusOf = (store: MemoryMoneyStore, id = 'os1') => (osRows(store, id).main?.data as { status: string }).status;

describe('money: os.finalizeSingle', () => {
  it('cria a receita à vista e finaliza a OS (3 linhas coerentes, os_id gravado)', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    const r = await t.call('os.finalizeSingle');
    expect(r.status).toBe(200);
    const led = t.store.ledgerAlive();
    expect(led).toHaveLength(1);
    expect(led[0].amount).toBe(10000);
    expect(led[0].paymentDate).toBeTruthy();
    expect(t.store.get('ledger', led[0].id)?.osId).toBe('os1');
    expect(statusOf(t.store)).toBe('FINALIZADO');
    expect(finOf(t.store).financialId).toBe(led[0].id);
    expect(finOf(t.store).paymentDate).toBe('2026-11-12T12:00:00.000Z');
    expect((r.body.info as { amount: number }).amount).toBe(10000);
  });

  it('desconta adiantamentos; restante 0 fecha sem lançamento', async () => {
    const t = setup();
    t.store.seedOS(baseOS({ advances: [{ id: 'a1', date: '2026-11-05T15:00:00.000Z', amount: 3000, entryId: 'ea1' }] }),
      [entry({ id: 'ea1', amount: 3000, description: 'Adiantamento OS #7 - Ana', paymentDate: '2026-11-05T15:00:00.000Z' })]);
    await t.call('os.finalizeSingle');
    const fresh = t.store.ledgerAlive().filter(e => e.id !== 'ea1');
    expect(fresh).toHaveLength(1);
    expect(fresh[0].amount).toBe(7000);

    const t2 = setup();
    t2.store.seedOS(baseOS({ advances: [{ id: 'a1', date: '2026-11-05T15:00:00.000Z', amount: 10000, entryId: 'ea1' }] }),
      [entry({ id: 'ea1', amount: 10000, paymentDate: '2026-11-05T15:00:00.000Z' })]);
    const r = await t2.call('os.finalizeSingle');
    expect(r.status).toBe(200);
    expect(t2.store.ledgerAlive()).toHaveLength(1);
    expect(statusOf(t2.store)).toBe('FINALIZADO');
    expect(finOf(t2.store).financialId).toBeUndefined();
  });

  it('OS já finalizada: 409 estado_mudou e nada gravado', async () => {
    const t = setup();
    t.store.seedOS(baseOS({ status: 'FINALIZADO', financialId: 'e1', paymentDate: '2026-11-10T12:00:00.000Z' }), [entry({ paymentDate: '2026-11-10T12:00:00.000Z' })]);
    const r = await t.call('os.finalizeSingle');
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('estado_mudou');
    expect(t.store.applyCalls).toBe(0);
  });

  it('OS inexistente: 404', async () => {
    const t = setup();
    expect((await t.call('os.finalizeSingle')).status).toBe(404);
  });

  it('OS sem a linha de preços (metade que ainda não chegou): 409 registro_incompleto', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    t.store.cells.delete('work_order_finance:os1');
    const r = await t.call('os.finalizeSingle');
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('registro_incompleto');
  });
});

describe('money: os.installment', () => {
  const cfg = (over: Body = {}) => ({ config: { installments: 3, firstPaymentDate: '2026-12-05', description: 'Parcelamento OS #7', totalAmount: 10000, ...over } });

  it('cria as parcelas pelo relógio da oficina (15:00Z) e deixa a OS em Aguardando Pagamento', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    const r = await t.call('os.installment', { payload: cfg() });
    expect(r.status).toBe(200);
    const parcelas = t.store.ledgerAlive().sort((a, b) => (a.installmentNumber ?? 0) - (b.installmentNumber ?? 0));
    expect(parcelas.map(p => p.amount)).toEqual([3333, 3333, 3334]);
    expect(parcelas.map(p => p.dueDate)).toEqual(['2026-12-05T15:00:00.000Z', '2027-01-05T15:00:00.000Z', '2027-02-05T15:00:00.000Z']);
    expect(parcelas.every(p => t.store.get('ledger', p.id)?.osId === 'os1' && !p.paymentDate)).toBe(true);
    expect(statusOf(t.store)).toBe('AGUARDANDO_PAGAMENTO');
    const fin = finOf(t.store) as { paymentMethod: string; installmentConfig: { groupId: string }; financialId: string };
    expect(fin.paymentMethod).toBe('INSTALLMENT');
    expect(fin.financialId).toBe(parcelas[0].id);
    expect(parcelas.every(p => p.installmentGroupId === fin.installmentConfig.groupId)).toBe(true);
  });

  it('o servidor decide o valor: total que o cliente achava diferente dá 409 valor_mudou', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    const r = await t.call('os.installment', { payload: cfg({ totalAmount: 9999 }) });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('valor_mudou');
    expect(t.store.ledgerAlive()).toHaveLength(0);
  });

  it('parcela só o restante depois dos adiantamentos', async () => {
    const t = setup();
    t.store.seedOS(baseOS({ advances: [{ id: 'a1', date: '2026-11-05T15:00:00.000Z', amount: 4000, entryId: 'ea1' }] }),
      [entry({ id: 'ea1', amount: 4000, paymentDate: '2026-11-05T15:00:00.000Z' })]);
    const r = await t.call('os.installment', { payload: cfg({ installments: 2, totalAmount: 6000 }) });
    expect(r.status).toBe(200);
    expect(t.store.ledgerAlive().filter(e => e.installmentNumber).map(e => e.amount)).toEqual([3000, 3000]);
  });

  it('validações: parcelas fora de 1..60, data inválida e OS que já tem receita', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    expect((await t.call('os.installment', { payload: cfg({ installments: 0 }) })).status).toBe(400);
    expect((await t.call('os.installment', { payload: cfg({ installments: 61 }) })).status).toBe(400);
    expect((await t.call('os.installment', { payload: cfg({ firstPaymentDate: '2026-02-31' }) })).status).toBe(400);
    await t.call('os.installment', { payload: cfg() });
    const again = await t.call('os.installment', { payload: cfg() });
    expect(again.status).toBe(409);
    expect(t.store.ledgerAlive()).toHaveLength(3);
  });
});

describe('money: ledger.toggle (receber parcela)', () => {
  async function parcelada() {
    const t = setup();
    t.store.seedOS(baseOS());
    await t.call('os.installment', { payload: { config: { installments: 2, firstPaymentDate: '2026-12-05', totalAmount: 10000 } } });
    const ids = t.store.ledgerAlive().sort((a, b) => (a.installmentNumber ?? 0) - (b.installmentNumber ?? 0)).map(e => e.id);
    return { t, ids };
  }

  it('marca uma parcela; ao pagar a última a OS finaliza; desmarcar reabre para Aguardando Pagamento', async () => {
    const { t, ids } = await parcelada();
    let r = await t.call('ledger.toggle', { osId: undefined, entryId: ids[0] });
    expect(r.status).toBe(200);
    expect(t.store.get('ledger', ids[0])?.data.paymentDate).toBe('2026-11-12T12:00:00.000Z');
    expect(statusOf(t.store)).toBe('AGUARDANDO_PAGAMENTO');
    r = await t.call('ledger.toggle', { osId: undefined, entryId: ids[1] });
    expect((r.body.info as { osEffect: { kind: string } }).osEffect.kind).toBe('finalized');
    expect(statusOf(t.store)).toBe('FINALIZADO');
    expect(finOf(t.store).paymentDate).toBe('2026-11-12T12:00:00.000Z');
    r = await t.call('ledger.toggle', { osId: undefined, entryId: ids[1] });
    expect((r.body.info as { osEffect: { kind: string } }).osEffect.kind).toBe('reopened');
    expect(statusOf(t.store)).toBe('AGUARDANDO_PAGAMENTO');
    expect(t.store.get('ledger', ids[1])?.data.paymentDate).toBeUndefined();
  });

  it('receita à vista: o paymentDate da OS acompanha o lançamento', async () => {
    const t = setup();
    t.store.seedOS(baseOS({ status: 'AGUARDANDO_PAGAMENTO', financialId: 'e1', paymentMethod: 'SINGLE' }), [entry()]);
    await t.call('ledger.toggle', { osId: undefined, entryId: 'e1' });
    expect(finOf(t.store).paymentDate).toBe('2026-11-12T12:00:00.000Z');
  });

  it('lançamento manual (sem OS) também alterna', async () => {
    const t = setup();
    t.store.put('ledger', 'm1', entry({ id: 'm1', description: 'Venda balcão' }), null);
    const r = await t.call('ledger.toggle', { osId: undefined, entryId: 'm1' });
    expect(r.status).toBe(200);
    expect(t.store.get('ledger', 'm1')?.data.paymentDate).toBeTruthy();
  });

  it('adiantamento é travado (422) e lançamento inexistente dá 404', async () => {
    const t = setup();
    t.store.seedOS(baseOS({ advances: [{ id: 'a1', date: '2026-11-05T15:00:00.000Z', amount: 4000, entryId: 'ea1' }] }),
      [entry({ id: 'ea1', amount: 4000, paymentDate: '2026-11-05T15:00:00.000Z' })]);
    const r = await t.call('ledger.toggle', { osId: undefined, entryId: 'ea1' });
    expect(r.status).toBe(422);
    expect((await t.call('ledger.toggle', { osId: undefined, entryId: 'nao-existe' })).status).toBe(404);
  });
});

describe('money: os.status', () => {
  it('receber OS à vista em Aguardando Pagamento: finaliza e marca o lançamento como recebido', async () => {
    const t = setup();
    t.store.seedOS(baseOS({ status: 'AGUARDANDO_PAGAMENTO', financialId: 'e1', paymentMethod: 'SINGLE' }), [entry()]);
    const r = await t.call('os.status', { payload: { newStatus: 'FINALIZADO' } });
    expect(r.status).toBe(200);
    expect(statusOf(t.store)).toBe('FINALIZADO');
    expect(t.store.get('ledger', 'e1')?.data.paymentDate).toBe('2026-11-12T12:00:00.000Z');
    expect(finOf(t.store).paymentDate).toBe('2026-11-12T12:00:00.000Z');
  });

  it('receber OS parcelada com parcela aberta: 422 bloqueado, nada gravado', async () => {
    const t = setup();
    t.store.seedOS(baseOS({
      status: 'AGUARDANDO_PAGAMENTO', financialId: 'p1', paymentMethod: 'INSTALLMENT',
      installmentConfig: { totalAmount: 10000, installments: 2, installmentAmount: 5000, lastInstallmentAmount: 5000, firstPaymentDate: '2026-12-05', groupId: 'g1', description: 'x' },
    }), [entry({ id: 'p1', amount: 5000, installmentGroupId: 'g1', groupId: 'g1' }), entry({ id: 'p2', amount: 5000, installmentGroupId: 'g1', groupId: 'g1' })]);
    const r = await t.call('os.status', { payload: { newStatus: 'FINALIZADO' } });
    expect(r.status).toBe(422);
    expect(r.body.error).toBe('bloqueado');
    expect(String(r.body.message)).toContain('parcelas');
    expect(t.store.applyCalls).toBe(0);
  });

  it('status que pede confirmação (finalizar sem receita) não passa por aqui: 409', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    const r = await t.call('os.status', { payload: { newStatus: 'FINALIZADO' } });
    expect(r.status).toBe(409);
  });

  it('arquivar OS finalizada só muda o status; status inválido dá 400', async () => {
    const t = setup();
    t.store.seedOS(baseOS({ status: 'FINALIZADO', financialId: 'e1', paymentMethod: 'SINGLE', paymentDate: '2026-11-10T12:00:00.000Z' }), [entry({ paymentDate: '2026-11-10T12:00:00.000Z' })]);
    expect((await t.call('os.status', { payload: { newStatus: 'ARQUIVADO' } })).status).toBe(200);
    expect(statusOf(t.store)).toBe('ARQUIVADO');
    expect(finOf(t.store).financialId).toBe('e1');
    expect((await t.call('os.status', { payload: { newStatus: 'VOANDO' } })).status).toBe(400);
  });
});

describe('money: os.restore (reabrir)', () => {
  it('apaga a receita à vista e reabre a OS', async () => {
    const t = setup();
    t.store.seedOS(baseOS({ status: 'FINALIZADO', financialId: 'e1', paymentMethod: 'SINGLE', paymentDate: '2026-11-10T12:00:00.000Z' }), [entry({ paymentDate: '2026-11-10T12:00:00.000Z' })]);
    const r = await t.call('os.restore', { payload: { target: 'EM_SERVICO' } });
    expect(r.status).toBe(200);
    expect(statusOf(t.store)).toBe('EM_SERVICO');
    expect(t.store.ledgerAlive()).toHaveLength(0);
    expect(t.store.get('ledger', 'e1')?.deletedAt).toBeTruthy();
    const fin = finOf(t.store);
    expect(fin.financialId).toBeUndefined();
    expect(fin.paymentDate).toBeUndefined();
    expect((r.body.info as { removedCount: number }).removedCount).toBe(1);
  });

  it('parcela já recebida bloqueia a reabertura (422)', async () => {
    const t = setup();
    t.store.seedOS(baseOS({
      status: 'AGUARDANDO_PAGAMENTO', financialId: 'p1', paymentMethod: 'INSTALLMENT',
      installmentConfig: { totalAmount: 10000, installments: 2, installmentAmount: 5000, lastInstallmentAmount: 5000, firstPaymentDate: '2026-12-05', groupId: 'g1', description: 'x' },
    }), [entry({ id: 'p1', amount: 5000, installmentGroupId: 'g1', groupId: 'g1', paymentDate: '2026-11-11T12:00:00.000Z' }), entry({ id: 'p2', amount: 5000, installmentGroupId: 'g1', groupId: 'g1' })]);
    const r = await t.call('os.restore', { payload: { target: 'EM_SERVICO' } });
    expect(r.status).toBe(422);
    expect(t.store.ledgerAlive()).toHaveLength(2);
  });

  it('parcelamento sem parcela paga é desfeito por inteiro', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    await t.call('os.installment', { payload: { config: { installments: 3, firstPaymentDate: '2026-12-05', totalAmount: 10000 } } });
    const r = await t.call('os.restore', { payload: { target: 'EM_SERVICO' } });
    expect(r.status).toBe(200);
    expect(t.store.ledgerAlive()).toHaveLength(0);
    expect(statusOf(t.store)).toBe('EM_SERVICO');
    expect(finOf(t.store).installmentConfig).toBeUndefined();
  });
});

describe('money: os.delete', () => {
  it('apaga a OS (3 linhas), a receita e os adiantamentos, com auditoria', async () => {
    const t = setup();
    t.store.seedOS(baseOS({
      status: 'FINALIZADO', financialId: 'e1', paymentMethod: 'SINGLE', paymentDate: '2026-11-10T12:00:00.000Z',
      advances: [{ id: 'a1', date: '2026-11-05T15:00:00.000Z', amount: 3000, entryId: 'ea1' }],
    }), [entry({ amount: 7000, paymentDate: '2026-11-10T12:00:00.000Z' }), entry({ id: 'ea1', amount: 3000, paymentDate: '2026-11-05T15:00:00.000Z' })]);
    const r = await t.call('os.delete', { machine: 'Balcão' });
    expect(r.status).toBe(200);
    const { main, fin, cost } = osRows(t.store);
    expect([main, fin, cost].every(c => !!c?.deletedAt)).toBe(true);
    expect(t.store.ledgerAlive()).toHaveLength(0);
    expect(t.store.audit).toHaveLength(1);
    const ev = t.store.audit[0].data as { action: string; machine: string; reason: string };
    expect(ev.action).toBe('ADIANTAMENTO_REMOVIDO');
    expect(ev.machine).toBe('Balcão');
    expect(ev.reason).toBe('OS_EXCLUIDA');
  });

  it('parcela recebida bloqueia (422) e nada é apagado', async () => {
    const t = setup();
    t.store.seedOS(baseOS({
      status: 'AGUARDANDO_PAGAMENTO', financialId: 'p1', paymentMethod: 'INSTALLMENT',
      installmentConfig: { totalAmount: 10000, installments: 2, installmentAmount: 5000, lastInstallmentAmount: 5000, firstPaymentDate: '2026-12-05', groupId: 'g1', description: 'x' },
    }), [entry({ id: 'p1', amount: 5000, installmentGroupId: 'g1', groupId: 'g1', paymentDate: '2026-11-11T12:00:00.000Z' }), entry({ id: 'p2', amount: 5000, installmentGroupId: 'g1', groupId: 'g1' })]);
    const r = await t.call('os.delete');
    expect(r.status).toBe(422);
    expect(osRows(t.store).main?.deletedAt).toBeNull();
    expect(t.store.ledgerAlive()).toHaveLength(2);
  });
});

describe('money: os.save', () => {
  const draftDate = '2026-11-05';

  it('OS nova com adiantamento: cria as 3 linhas e o lançamento já pago, com auditoria', async () => {
    const t = setup();
    const base = baseOS({ id: 'os9', status: 'ORCAMENTO' });
    const r = await t.call('os.save', { osId: 'os9', machine: 'Ana (PC)', payload: { isNew: true, base, drafts: [{ date: draftDate, amount: 2500 }] } });
    expect(r.status).toBe(200);
    expect(osRows(t.store, 'os9').main?.version).toBe(1);
    const led = t.store.ledgerAlive();
    expect(led).toHaveLength(1);
    expect(led[0]).toMatchObject({ amount: 2500, type: 'CREDIT' });
    expect(led[0].paymentDate).toBeTruthy();
    expect(t.store.get('ledger', led[0].id)?.osId).toBe('os9');
    const adv = (finOf(t.store, 'os9').advances as { entryId: string; amount: number }[]);
    expect(adv).toHaveLength(1);
    expect(adv[0].entryId).toBe(led[0].id);
    expect(t.store.audit).toHaveLength(1);
    expect((t.store.audit[0].data as { action: string; machine: string }).action).toBe('ADIANTAMENTO_CRIADO');
  });

  it('OS nova não nasce finalizada nem com dinheiro gravado, e o id da URL tem que bater', async () => {
    const t = setup();
    const sneaky = baseOS({ id: 'os9', status: 'FINALIZADO', financialId: 'x', paymentDate: '2026-11-01T00:00:00.000Z', paymentMethod: 'SINGLE' });
    await t.call('os.save', { osId: 'os9', payload: { isNew: true, base: sneaky } });
    expect(statusOf(t.store, 'os9')).toBe('ORCAMENTO');
    expect(finOf(t.store, 'os9').financialId).toBeUndefined();
    expect(finOf(t.store, 'os9').paymentDate).toBeUndefined();
    expect((await t.call('os.save', { osId: 'os8', payload: { isNew: true, base: sneaky } })).status).toBe(400);
  });

  it('editar preço de OS finalizada: total e receita à vista acompanham (refreshFinishedReceipt)', async () => {
    const t = setup();
    t.store.seedOS(baseOS({ status: 'FINALIZADO', financialId: 'e1', paymentMethod: 'SINGLE', paymentDate: '2026-11-10T12:00:00.000Z' }), [entry({ paymentDate: '2026-11-10T12:00:00.000Z' })]);
    const opened = baseOS({ status: 'FINALIZADO', financialId: 'e1', paymentMethod: 'SINGLE', paymentDate: '2026-11-10T12:00:00.000Z' });
    const edited: WorkOrder = { ...opened, services: [{ id: 'os1-s0', description: 'Troca', price: 8000 }], total: 12000 };
    const r = await t.call('os.save', { payload: { opened, base: edited } });
    expect(r.status).toBe(200);
    expect(finOf(t.store).total).toBe(12000);
    expect((finOf(t.store).prices as Record<string, number>)['os1-s0']).toBe(8000);
    expect(t.store.get('ledger', 'e1')?.data.amount).toBe(12000);
    expect(statusOf(t.store)).toBe('FINALIZADO');
  });

  it('editar não mexe em status nem na receita ligada, mesmo que o corpo tente', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    const opened = baseOS();
    const edited: WorkOrder = { ...opened, status: 'FINALIZADO', financialId: 'fake', paymentDate: '2026-11-12T00:00:00.000Z', clientName: 'Ana Maria' };
    await t.call('os.save', { payload: { opened, base: edited } });
    expect(statusOf(t.store)).toBe('EM_SERVICO');
    expect(finOf(t.store).financialId).toBeUndefined();
    expect((osRows(t.store).main?.data as { clientName: string }).clientName).toBe('Ana Maria');
  });

  it('adiantamento com data futura: 422, nada gravado', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    const base = baseOS();
    const r = await t.call('os.save', { payload: { opened: base, base, drafts: [{ date: '2026-12-31', amount: 1000 }] } });
    expect(r.status).toBe(422);
    expect(t.store.applyCalls).toBe(0);
  });

  it('a Recepção editando um item não apaga o custo do Dono', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    const opened = baseOS();
    const noCost: WorkOrder = { ...opened, parts: [{ id: 'os1-p0', description: 'Filtro de óleo', price: 4500 }], total: 10500 };
    await t.call('os.save', { payload: { opened, base: noCost } }, RECEP);
    expect((osRows(t.store).cost?.data as { costs: Record<string, number> }).costs['os1-p0']).toBe(1000);
    expect(finOf(t.store).total).toBe(10500);
  });

  it('OS excluída em outro aparelho: 404 (edição) e preço não numérico: 400', async () => {
    const t = setup();
    const base = baseOS();
    expect((await t.call('os.save', { payload: { opened: base, base } })).status).toBe(404);
    t.store.seedOS(base);
    const bad = { ...base, parts: [{ id: 'os1-p0', description: 'x', price: '4000' }] };
    expect((await t.call('os.save', { payload: { opened: base, base: bad } })).status).toBe(400);
  });
});

describe('money: idempotência por op_id', () => {
  it('repetir o mesmo op_id devolve o resultado gravado e não duplica o lançamento', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    const first = await t.call('os.finalizeSingle', {}, RECEP, { op: OP(1) });
    const second = await t.call('os.finalizeSingle', {}, RECEP, { op: OP(1) });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.replay).toBe(true);
    expect(second.body.rows).toEqual(first.body.rows);
    expect(t.store.ledgerAlive()).toHaveLength(1);
    expect(t.store.applyCalls).toBe(1);
  });

  it('op_id novo na OS já finalizada é recusado (a guarda barra, não duplica)', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    await t.call('os.finalizeSingle');
    const r = await t.call('os.finalizeSingle');
    expect(r.status).toBe(409);
    expect(t.store.ledgerAlive()).toHaveLength(1);
  });

  it('op_id de outra pessoa ou de outro kind: 409 op_id_reutilizado', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    await t.call('os.finalizeSingle', {}, RECEP, { op: OP(5) });
    const otherUser = await t.call('os.finalizeSingle', {}, OWNER, { op: OP(5) });
    expect(otherUser.status).toBe(409);
    expect(otherUser.body.error).toBe('op_id_reutilizado');
    const otherKind = await t.call('os.delete', {}, RECEP, { op: OP(5) });
    expect(otherKind.status).toBe(409);
    expect(otherKind.body.error).toBe('op_id_reutilizado');
  });

  it('erro de op_id da função SQL vira 409; outro erro vira 500 genérico', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    t.store.applyError = new MoneyStoreError('op_id_reutilizado');
    expect((await t.call('os.finalizeSingle')).status).toBe(409);
    t.store.applyError = new MoneyStoreError('outra_coisa');
    const r = await t.call('os.finalizeSingle');
    expect(r.status).toBe(500);
    expect(r.body.error).toBe('erro_interno');
  });
});

describe('money: conflito de versão', () => {
  it('cliente com versão velha (known): 409 com as linhas atuais e nada gravado', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    t.store.bump('work_orders', 'os1');
    const r = await t.call('os.finalizeSingle', { known: { 'work_orders:os1': 1, 'work_order_finance:os1': 1 } });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('conflito_versao');
    const rows = r.body.rows as { table: string; id: string; version: number }[];
    expect(rows.find(x => x.table === 'work_orders')?.version).toBe(2);
    expect(t.store.ledgerAlive()).toHaveLength(0);
    expect(statusOf(t.store)).toBe('EM_SERVICO');
  });

  it('known atual passa', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    const r = await t.call('os.finalizeSingle', { known: { 'work_orders:os1': 1, 'work_order_finance:os1': 1, 'work_order_costs:os1': 1 } });
    expect(r.status).toBe(200);
  });

  it('outra pessoa grava entre a leitura e a gravação: 409 do banco, nada gravado', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    t.store.beforeApply = () => { t.store.bump('work_order_finance', 'os1'); };
    const r = await t.call('os.finalizeSingle');
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('conflito_versao');
    expect((r.body.rows as unknown[]).length).toBeGreaterThan(0);
    expect(t.store.ledgerAlive()).toHaveLength(0);
    expect(t.store.ops.size).toBe(0);
  });
});

describe('money: papéis e autenticação', () => {
  it('Mecânico: 403 sem_permissao em todos os kinds, nada gravado', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    for (const kind of ['os.finalizeSingle', 'os.installment', 'os.status', 'os.restore', 'os.delete', 'os.save']) {
      const r = await t.call(kind, {}, MECH);
      expect(r.status, kind).toBe(403);
      expect(r.body.error).toBe('sem_permissao');
    }
    const r = await t.call('ledger.toggle', { osId: undefined, entryId: 'e1' }, MECH);
    expect(r.status).toBe(403);
    expect(t.store.applyCalls).toBe(0);
  });

  it('sem JWT ou JWT inválido: 401', async () => {
    const t = setup();
    expect((await t.call('os.delete', {}, RECEP, { authorization: null })).status).toBe(401);
    expect((await t.call('os.delete', {}, RECEP, { authorization: 'Bearer lixo' })).status).toBe(401);
  });

  it('membro desativado: 403 sem_acesso', async () => {
    const t = setup();
    t.s.members.get(RECEP)!.active = false;
    const r = await t.call('os.delete');
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('sem_acesso');
  });

  it('Dono com TOTP exige aal2 (como requireOwner); com aal2 passa', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    t.s.totp.add(OWNER);
    const r1 = await t.call('os.finalizeSingle', {}, OWNER);
    expect(r1.status).toBe(403);
    expect(r1.body.error).toBe('exige_mfa');
    const r2 = await t.call('os.finalizeSingle', {}, OWNER, { authorization: auth(OWNER, { aal: 'aal2' }) });
    expect(r2.status).toBe(200);
  });

  it('Dono sem TOTP e Recepção operam; a Recepção não tem kind para excluir lançamento avulso', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    expect((await t.call('os.finalizeSingle', {}, OWNER)).status).toBe(200);
    const t2 = setup();
    t2.store.put('ledger', 'm1', entry({ id: 'm1' }), null);
    const r = await t2.call('ledger.delete', { osId: undefined, entryId: 'm1' }, RECEP);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('acao_invalida');
    expect(t2.store.get('ledger', 'm1')?.deletedAt).toBeNull();
  });

  it('a oficina vem da membership, nunca do corpo', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    const seen: string[] = [];
    const orig = t.store.loadOS.bind(t.store);
    t.store.loadOS = async (ws: string, id: string) => { seen.push(ws); return orig(ws, id); };
    await t.call('os.finalizeSingle', { workshopId: 'bbbbbbbb-0000-0000-0000-000000000009', workshop_id: 'outra' });
    expect(seen).toEqual([t.WS]);
  });

  it('corpo inválido: 400 (kind, opId, today, osId)', async () => {
    const t = setup();
    expect((await t.call('os.nada')).status).toBe(400);
    expect((await t.call('os.delete', { opId: 'x' })).status).toBe(400);
    expect((await t.call('os.delete', { today: '12/11/2026' })).status).toBe(400);
    expect((await t.call('os.delete', { osId: '../x' })).status).toBe(400);
  });
});

describe('money: fuso e today', () => {
  it('fuso inválido da oficina: 500 fuso_do_servidor e nada gravado', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    t.store.tz = 'Marte/Olympus';
    const r = await t.call('os.finalizeSingle');
    expect(r.status).toBe(500);
    expect(r.body.error).toBe('fuso_do_servidor');
    expect(t.store.applyCalls).toBe(0);
    t.store.tz = null;
    expect((await t.call('os.finalizeSingle')).status).toBe(500);
  });

  it('outro fuso da oficina muda o instante das parcelas (Tóquio: 03:00Z)', async () => {
    const t = setup();
    t.store.tz = 'Asia/Tokyo';
    t.store.seedOS(baseOS());
    await t.call('os.installment', { payload: { config: { installments: 2, firstPaymentDate: '2026-12-05', totalAmount: 10000 } } });
    const due = t.store.ledgerAlive().map(e => e.dueDate).sort();
    expect(due).toEqual(['2026-12-05T03:00:00.000Z', '2027-01-05T03:00:00.000Z']);
  });

  it('o fuso é devolvido ao normal depois de cada chamada (nada vaza para a próxima)', async () => {
    const { getDateTimeZone } = await import('../utils/dates');
    const before = getDateTimeZone();
    const t = setup();
    t.store.seedOS(baseOS());
    await t.call('os.finalizeSingle');
    expect(getDateTimeZone()).toBe(before);
    t.store.tz = 'Marte/Olympus';
    await t.call('os.finalizeSingle');
    expect(getDateTimeZone()).toBe(before);
  });

  it('today do cliente aceito a ±1 dia; 2 dias de diferença: 400 data_invalida', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    expect((await t.call('os.restore', { today: '2026-11-11', payload: { target: 'EM_SERVICO' } })).status).toBe(409); // passou da data; falhou por outro motivo (estado)
    expect((await t.call('os.restore', { today: '2026-11-13', payload: { target: 'EM_SERVICO' } })).status).toBe(409);
    const r = await t.call('os.restore', { today: '2026-11-10', payload: { target: 'EM_SERVICO' } });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('data_invalida');
    expect((await t.call('os.restore', { today: '2026-11-14', payload: { target: 'EM_SERVICO' } })).status).toBe(400);
  });
});

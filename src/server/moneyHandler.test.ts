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
    // `known` é obrigatório no servidor: por padrão o teste manda a versão atual da OS (ou do lançamento), como o app faz.
    // Para testar a falta dele, passe `known: undefined` (a chave presente vence o padrão).
    const merged: Body = { osId: 'os1', ...body };
    const target = kind === 'ledger.toggle' ? `ledger:${String(merged.entryId)}` : `work_orders:${String(merged.osId)}`;
    const cur = m.store.get(target.startsWith('ledger') ? 'ledger' : 'work_orders', target.slice(target.indexOf(':') + 1));
    const known = 'known' in body ? body.known : { [target]: cur?.version ?? 1 };
    const r = await handleMoneyOp(m.deps, {
      authorization: opts.authorization === undefined ? auth(who) : opts.authorization,
      body: { opId: opts.op ?? OP(n++), kind, today: TODAY, ...merged, known },
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

describe('money: revisão do PR 6', () => {
  const costOf = (store: MemoryMoneyStore) => osRows(store).cost?.data as { costs: Record<string, number>; totalCost?: number; profit?: number };

  it('B1: mesmo op_id com corpo diferente é 409 op_id_reutilizado; com o mesmo corpo é replay', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    const a = await t.call('os.status', { payload: { newStatus: 'AGUARDANDO_PAGAMENTO' } }, RECEP, { op: OP(9) });
    expect(a.status).toBe(200);
    const other = await t.call('os.status', { payload: { newStatus: 'ARQUIVADO' } }, RECEP, { op: OP(9) });
    expect(other.status).toBe(409);
    expect(other.body.error).toBe('op_id_reutilizado');
    const otherOs = await t.call('os.status', { osId: 'os2', payload: { newStatus: 'AGUARDANDO_PAGAMENTO' } }, RECEP, { op: OP(9) });
    expect(otherOs.body.error).toBe('op_id_reutilizado');
    const same = await t.call('os.status', { payload: { newStatus: 'AGUARDANDO_PAGAMENTO' } }, RECEP, { op: OP(9) });
    expect(same.status).toBe(200);
    expect(same.body.replay).toBe(true);
    expect(statusOf(t.store)).toBe('AGUARDANDO_PAGAMENTO');
  });

  it('mesmo op_id e mesmo corpo com `known` diferente (ou versão 0) é replay, sem gravar de novo', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    const a = await t.call('os.finalizeSingle', {}, RECEP, { op: OP(9) });
    expect(a.status).toBe(200);
    const applied = t.store.applyCalls;
    const b = await t.call('os.finalizeSingle', { known: { 'work_orders:os1': 0 } }, RECEP, { op: OP(9) });
    expect(b.status).toBe(200);
    expect(b.body.replay).toBe(true);
    const c = await t.call('os.finalizeSingle', { known: { 'work_orders:os1': 77, 'work_order_finance:os1': 5 } }, RECEP, { op: OP(9) });
    expect(c.body.replay).toBe(true);
    expect(t.store.applyCalls).toBe(applied);
  });

  it('op_id NOVO com `known` 0 (retry de op que nunca chegou) é 409 de versão e não grava', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    const r = await t.call('os.finalizeSingle', { known: { 'work_orders:os1': 0 } }, RECEP, { op: OP(10) });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('conflito_versao');
    expect(t.store.applyCalls).toBe(0);
  });

  it('B1: o hash do corpo vai para o banco (reqHash)', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    await t.call('os.finalizeSingle', {}, RECEP, { op: OP(9) });
    expect(t.store.ops.get(OP(9))?.reqHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('I2: o replay devolve o mesmo info da primeira resposta', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    const first = await t.call('os.finalizeSingle', {}, RECEP, { op: OP(9) });
    const second = await t.call('os.finalizeSingle', {}, RECEP, { op: OP(9) });
    expect(second.body.replay).toBe(true);
    expect(second.body.info).toEqual(first.body.info);
    expect(second.body.info).toMatchObject({ osNumber: 7, amount: 10000 });
  });

  it('I3: 409 para a Recepção não traz work_order_costs; o Dono vê', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    t.store.bump('work_orders', 'os1');
    const stale = { known: { 'work_orders:os1': 1, 'work_order_costs:os1': 0 } };
    const rec = await t.call('os.finalizeSingle', stale, RECEP);
    expect(rec.body.error).toBe('conflito_versao');
    const recRows = rec.body.rows as { table: string }[];
    expect(recRows.length).toBeGreaterThan(0);
    expect(recRows.some(x => x.table === 'work_order_costs')).toBe(false);
    const owner = await t.call('os.finalizeSingle', stale, OWNER);
    expect((owner.body.rows as { table: string }[]).some(x => x.table === 'work_order_costs')).toBe(true);
  });

  it('I3: conflito detectado pelo banco (corrida) também sai sem work_order_costs para a Recepção', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    t.store.beforeApply = () => { t.store.bump('work_order_finance', 'os1'); };
    const r = await t.call('os.finalizeSingle', {}, RECEP);
    expect(r.body.error).toBe('conflito_versao');
    expect((r.body.rows as { table: string }[]).some(x => x.table === 'work_order_costs')).toBe(false);
  });

  it('I4: sem `known` da OS (ou do lançamento) é 400; OS nova não precisa', async () => {
    const t = setup();
    t.store.seedOS(baseOS(), [entry()]);
    const base = baseOS();
    const cases: [string, Body][] = [
      ['os.finalizeSingle', {}], ['os.status', { payload: { newStatus: 'APROVADO' } }], ['os.delete', {}],
      ['os.restore', { payload: { target: 'EM_SERVICO' } }], ['os.save', { payload: { opened: base, base } }],
    ];
    for (const [kind, body] of cases) {
      const r = await t.call(kind, { ...body, known: undefined });
      expect(r.status, kind).toBe(400);
    }
    expect((await t.call('os.finalizeSingle', { known: { 'ledger:e1': 1 } })).status).toBe(400);
    expect((await t.call('ledger.toggle', { osId: undefined, entryId: 'e1', known: undefined })).status).toBe(400);
    expect((await t.call('ledger.toggle', { osId: undefined, entryId: 'e1', known: { 'work_orders:os1': 1 } })).status).toBe(400);
    expect(t.store.applyCalls).toBe(0);
    const fresh = baseOS({ id: 'os9', status: 'ORCAMENTO' });
    expect((await t.call('os.save', { osId: 'os9', known: undefined, payload: { isNew: true, base: fresh } })).status).toBe(200);
  });

  it('I4: os.save com `known` velho é 409 (a concorrência vale)', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    t.store.bump('work_orders', 'os1');
    const base = baseOS();
    const r = await t.call('os.save', { known: { 'work_orders:os1': 1 }, payload: { opened: base, base: { ...base, clientName: 'Outra' } } });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('conflito_versao');
  });

  it('M1: itens nulos, escalares inválidos, createdAt inválido e id de foto inseguro: 400', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    const base = baseOS();
    const bads: Record<string, unknown>[] = [
      { ...base, parts: [null] }, { ...base, services: [{ id: 'x', description: 5, price: 1 }] },
      { ...base, clientName: 5 }, { ...base, osNumber: 'sete' }, { ...base, mileage: 'x' },
      { ...base, createdAt: 'ontem' }, { ...base, photos: [{ id: '../x', createdAt: '2026-11-01T12:00:00.000Z' }] },
    ];
    for (const b of bads) expect((await t.call('os.save', { payload: { opened: base, base: b } })).status).toBe(400);
    expect(t.store.applyCalls).toBe(0);
    const ok = { ...base, photos: [{ id: 'f-1', createdAt: '2026-11-01T12:00:00.000Z' }] };
    expect((await t.call('os.save', { payload: { opened: base, base: ok } })).status).toBe(200);
  });

  it('A1: OS antiga (sem publicNotes, technician null, sem clientPhone/mileage/campos opcionais) como opened e base: 200', async () => {
    const t = setup();
    const old = baseOS();
    const raw: Record<string, unknown> = { ...old, technician: null };
    delete raw.publicNotes; delete raw.clientPhone; delete raw.mileage;
    t.store.seedOS(old);
    const r = await t.call('os.save', { payload: { opened: raw, base: { ...raw, clientName: 'Ana Maria' } } });
    expect(r.status).toBe(200);
    expect((osRows(t.store).main?.data as { clientName: string }).clientName).toBe('Ana Maria');
    const bad = await t.call('os.save', { payload: { opened: { ...raw, publicNotes: 5 }, base: raw } });
    expect(bad.status).toBe(400);
  });

  it('M-b: info do os.save traz os ids das fotos cortadas pelo limite', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    const base = baseOS();
    const photos = Array.from({ length: 25 }, (_, i) => ({ id: `f-${i}`, createdAt: '2026-11-01T12:00:00.000Z' }));
    const r = await t.call('os.save', { payload: { opened: base, base: { ...base, photos } } });
    expect(r.status).toBe(200);
    const info = r.body.info as { photosTrimmed: boolean; trimmedPhotoIds: string[] };
    expect(info.photosTrimmed).toBe(true);
    expect(info.trimmedPhotoIds).toEqual(['f-20', 'f-21', 'f-22', 'f-23', 'f-24']);
  });

  it('baixo 3: `rows` do sucesso e do replay também saem sem work_order_costs para a Recepção', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    const opened = baseOS();
    const edited: WorkOrder = { ...opened, parts: [{ id: 'os1-p0', description: 'Filtro', price: 5000 }], total: 11000 };
    const rec = await t.call('os.save', { payload: { opened, base: edited } }, RECEP, { op: OP(31) });
    expect(rec.status).toBe(200);
    expect((rec.body.rows as { table: string }[]).some(x => x.table === 'work_order_costs')).toBe(false);
    const again = await t.call('os.save', { payload: { opened, base: edited } }, RECEP, { op: OP(31) });
    expect(again.body.replay).toBe(true);
    expect((again.body.rows as { table: string }[]).some(x => x.table === 'work_order_costs')).toBe(false);
    const t2 = setup();
    t2.store.seedOS(baseOS());
    const own = await t2.call('os.save', { payload: { opened, base: edited } }, OWNER, { op: OP(32) });
    expect((own.body.rows as { table: string }[]).some(x => x.table === 'work_order_costs')).toBe(true);
  });

  it('M2: adiantamento de amanhã (today do cliente adiantado 1 dia) é recusado pelo dia da oficina', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    const base = baseOS();
    const r = await t.call('os.save', { today: '2026-11-13', payload: { opened: base, base, drafts: [{ date: '2026-11-13', amount: 1000 }] } });
    expect(r.status).toBe(422);
    const ok = await t.call('os.save', { today: '2026-11-13', payload: { opened: base, base, drafts: [{ date: '2026-11-12', amount: 1000 }] } });
    expect(ok.status).toBe(200);
  });

  it('M3: a Recepção muda o preço: totalCost e profit são refeitos com os custos repostos', async () => {
    const t = setup();
    t.store.seedOS(baseOS({ totalCost: 1000, profit: 9000 }));
    const opened = baseOS();
    const edited: WorkOrder = { ...opened, parts: [{ id: 'os1-p0', description: 'Filtro', price: 5000 }], total: 11000 };
    const r = await t.call('os.save', { payload: { opened, base: edited } }, RECEP);
    expect(r.status).toBe(200);
    expect(costOf(t.store).costs['os1-p0']).toBe(1000);
    expect(costOf(t.store).totalCost).toBe(1000);
    expect(costOf(t.store).profit).toBe(10000);
  });

  it('M4: a Recepção (opened sem custos) editando peças não gera falso conflito nem "mudou em outro aparelho"', async () => {
    const t = setup();
    t.store.seedOS(baseOS({ totalCost: 1000, profit: 9000 }));
    const { cost: _c, ...part } = baseOS().parts[0];
    const opened: WorkOrder = { ...baseOS(), parts: [part] };
    const edited: WorkOrder = { ...opened, parts: [{ ...part, description: 'Filtro de ar' }] };
    const r = await t.call('os.save', { payload: { opened, base: edited } }, RECEP);
    expect(r.status).toBe(200);
    const info = r.body.info as { conflicts: string[]; changedElsewhere: boolean };
    expect(info.conflicts).toEqual([]);
    expect(info.changedElsewhere).toBe(false);
    expect(costOf(t.store).costs['os1-p0']).toBe(1000);
  });

  it('M4: conflito real (outro aparelho mexeu nas peças) vem em info.conflicts, do servidor', async () => {
    const t = setup();
    const opened = baseOS();
    t.store.seedOS({ ...opened, parts: [{ id: 'os1-p0', description: 'Filtro azul', price: 4000, cost: 1000 }] });
    const edited: WorkOrder = { ...opened, parts: [{ id: 'os1-p0', description: 'Filtro verde', price: 4000, cost: 1000 }] };
    const r = await t.call('os.save', { payload: { opened, base: edited } }, OWNER);
    expect(r.status).toBe(200);
    const info = r.body.info as { conflicts: string[]; changedElsewhere: boolean };
    expect(info.conflicts).toContain('peças');
    expect(info.changedElsewhere).toBe(true);
  });

  it('M5: fuso da oficina gravado como alias (Brazil/East) funciona', async () => {
    const t = setup();
    t.store.tz = 'Brazil/East';
    t.store.seedOS(baseOS());
    expect((await t.call('os.finalizeSingle')).status).toBe(200);
  });

  it('M6: firstPaymentDate só aceita AAAA-MM-DD', async () => {
    const t = setup();
    t.store.seedOS(baseOS());
    const iso = { config: { installments: 2, firstPaymentDate: '2026-12-05T12:00:00.000Z', totalAmount: 10000 } };
    expect((await t.call('os.installment', { payload: iso })).status).toBe(400);
    const ok = { config: { installments: 2, firstPaymentDate: '2026-12-05', totalAmount: 10000 } };
    expect((await t.call('os.installment', { payload: ok })).status).toBe(200);
  });
});

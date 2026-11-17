import { describe, expect, it } from 'vitest';
import {
  CONFLICT_MESSAGE, DELETED_ELSEWHERE_MESSAGE, NETWORK_MESSAGE, PENDING_MESSAGE, createMoneyClient,
  type MoneyEngine, type MoneyHttpResult,
} from './moneyClient';
import { MONEY_OFFLINE_TOAST } from '../utils/cloudStatus';

// Cliente da função `money` com motor e HTTP falsos.

function setup(opts: { prep?: Awaited<ReturnType<MoneyEngine['prepareMoney']>>; prepSeq?: Awaited<ReturnType<MoneyEngine['prepareMoney']>>[]; responses?: (MoneyHttpResult | null)[] } = {}) {
  const calls: Record<string, unknown>[] = [];
  const log: string[] = [];
  const responses = [...(opts.responses ?? [])];
  const prepSeq = [...(opts.prepSeq ?? [])];
  let n = 0;
  const engine: MoneyEngine = {
    prepareMoney: async ref => {
      log.push('prepare');
      const key = ref.entryId ? `ledger:${ref.entryId}` : `work_orders:${ref.osId}`;
      return prepSeq.shift() ?? opts.prep ?? { ok: true, known: { [key]: 3 } };
    },
    afterMoney: async () => { log.push('pull'); },
  };
  const busy: string[][] = [];
  const client = createMoneyClient({
    invoke: async (body) => { calls.push(body); log.push('invoke'); return responses.length ? responses.shift()! : { status: 200, body: { ok: true, kind: body.kind, info: {} } }; },
    engine: () => engine, newId: () => `op-${++n}`, today: () => '2026-11-12', machine: () => 'Ana (PC)', deviceId: 'dev1',
    onBusy: b => busy.push(b),
  });
  return { client, calls, log, busy };
}

describe('moneyClient', () => {
  it('sem internet: recusa na hora, sem chamar o servidor', async () => {
    const t = setup({ prep: { ok: false, reason: 'offline' } });
    const r = await t.client.run('os.finalizeSingle', { osId: 'os1' });
    expect(r).toEqual({ ok: false, code: 'offline', message: MONEY_OFFLINE_TOAST });
    expect(t.calls).toHaveLength(0);
  });

  it('op pendente do registro não enviada: não chama (pendente)', async () => {
    const t = setup({ prep: { ok: false, reason: 'pendente' } });
    const r = await t.client.run('os.delete', { osId: 'os1' });
    expect(r).toEqual({ ok: false, code: 'pendente', message: PENDING_MESSAGE });
    expect(t.calls).toHaveLength(0);
  });

  it('sucesso: descarrega a pendente ANTES, manda versões e aplica o resultado puxando DEPOIS', async () => {
    const t = setup({ responses: [{ status: 200, body: { ok: true, kind: 'os.finalizeSingle', info: { osNumber: 7 } } }] });
    const r = await t.client.run('os.finalizeSingle', { osId: 'os1' });
    expect(r).toEqual({ ok: true, info: { osNumber: 7 }, replay: false });
    expect(t.log).toEqual(['prepare', 'invoke', 'pull']);
    expect(t.calls[0]).toMatchObject({
      opId: 'op-1', kind: 'os.finalizeSingle', osId: 'os1', today: '2026-11-12', machine: 'Ana (PC)', deviceId: 'dev1',
      known: { 'work_orders:os1': 3 }, payload: {},
    });
  });

  it('409 de versão: puxa os dados e pede para repetir, sem reaproveitar o op_id', async () => {
    const t = setup({ responses: [{ status: 409, body: { ok: false, error: 'conflito_versao', message: 'x' } }] });
    const r = await t.client.run('os.status', { osId: 'os1', payload: { newStatus: 'FINALIZADO' } });
    expect(r).toEqual({ ok: false, code: 'conflito', message: CONFLICT_MESSAGE });
    expect(t.log).toEqual(['prepare', 'invoke', 'pull']);
    await t.client.run('os.status', { osId: 'os1', payload: { newStatus: 'FINALIZADO' } });
    expect(t.calls.map(c => c.opId)).toEqual(['op-1', 'op-2']);
  });

  it('internet cai no meio: a falha traz o opId; "Tentar de novo" (retryOpId) reusa; clique novo usa op_id novo', async () => {
    const t = setup({ responses: [null] });
    const r1 = await t.client.run('ledger.toggle', { entryId: 'e1' });
    expect(r1).toEqual({ ok: false, code: 'rede', message: NETWORK_MESSAGE, opId: 'op-1' });
    expect(t.log).not.toContain('pull');
    const r2 = await t.client.run('ledger.toggle', { entryId: 'e1' }, { retryOpId: 'op-1' });
    expect(r2.ok).toBe(true);
    expect(t.calls.map(c => c.opId)).toEqual(['op-1', 'op-1']);
    await t.client.run('ledger.toggle', { entryId: 'e1' });
    expect(t.calls[2].opId).toBe('op-2');
  });

  it('depois de `rede`, o retry com versão nova (pull do Realtime) reusa o MESMO op_id; um clique novo usa outro', async () => {
    const v = (n: number) => ({ ok: true as const, known: { 'ledger:e1': n } });
    const t = setup({ responses: [null], prepSeq: [v(1), v(2), v(2)] });
    const r1 = await t.client.run('ledger.toggle', { entryId: 'e1' });
    const opId = (r1 as { opId?: string }).opId;
    await t.client.run('ledger.toggle', { entryId: 'e1' }, { retryOpId: opId });
    expect(t.calls.map(c => c.opId)).toEqual(['op-1', 'op-1']);
    expect(t.calls[1].known).toEqual({ 'ledger:e1': 2 });
    await t.client.run('ledger.toggle', { entryId: 'e1' }); // clique novo (ex.: desfazer)
    expect(t.calls[2].opId).toBe('op-2');
  });

  it('erro 5xx traz o opId; sem retryOpId cada chamada é outra operação', async () => {
    const t = setup({ responses: [{ status: 500, body: { ok: false, error: 'erro_interno' } }] });
    const r = await t.client.run('os.installment', { osId: 'os1', payload: { config: { installments: 3 } } });
    expect(r).toMatchObject({ ok: false, code: 'erro', opId: 'op-1' });
    await t.client.run('os.installment', { osId: 'os1', payload: { config: { installments: 3 } } }, { retryOpId: 'op-1' });
    await t.client.run('os.installment', { osId: 'os1', payload: { config: { installments: 4 } } });
    expect(t.calls.map(c => c.opId)).toEqual(['op-1', 'op-1', 'op-2']);
  });

  it('I4: registro fora do cache local (excluído em outro aparelho): recusa antes, em pt-BR, sem chamar o servidor', async () => {
    const t = setup({ prep: { ok: true, known: {} } });
    const r = await t.client.run('os.finalizeSingle', { osId: 'os1' });
    expect(r).toEqual({ ok: false, code: 'mudou', message: DELETED_ELSEWHERE_MESSAGE });
    expect(t.calls).toHaveLength(0);
    const l = await t.client.run('ledger.toggle', { entryId: 'e1' });
    expect(l).toMatchObject({ ok: false, code: 'mudou' });
    // OS nova não tem versão: segue
    await t.client.run('os.save', { osId: 'os9', payload: { isNew: true } });
    expect(t.calls).toHaveLength(1);
  });

  it('retry (retryOpId) com o registro já fora do cache: não recusa antes, manda versão 0 e o mesmo op_id', async () => {
    const t = setup({ prep: { ok: true, known: {} } });
    const r = await t.client.run('os.delete', { osId: 'os1' }, { retryOpId: 'op-9' });
    expect(r.ok).toBe(true);
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0].opId).toBe('op-9');
    expect(t.calls[0].known).toEqual({ 'work_orders:os1': 0 });
    const l = await t.client.run('ledger.toggle', { entryId: 'e1' }, { retryOpId: 'op-8' });
    expect(l.ok).toBe(true);
    expect(t.calls[1].known).toEqual({ 'ledger:e1': 0 });
  });

  it('retry que cai em offline ou pendente mantém o opId para outro "Tentar de novo"', async () => {
    const off = setup({ prep: { ok: false, reason: 'offline' } });
    expect(await off.client.run('os.delete', { osId: 'os1' }, { retryOpId: 'op-5' })).toEqual({ ok: false, code: 'offline', message: MONEY_OFFLINE_TOAST, opId: 'op-5' });
    const pen = setup({ prep: { ok: false, reason: 'pendente' } });
    expect(await pen.client.run('os.delete', { osId: 'os1' }, { retryOpId: 'op-5' })).toEqual({ ok: false, code: 'pendente', message: PENDING_MESSAGE, opId: 'op-5' });
    // clique novo: sem opId
    expect(await pen.client.run('os.delete', { osId: 'os1' })).toEqual({ ok: false, code: 'pendente', message: PENDING_MESSAGE, opId: undefined });
  });

  it('regra do servidor (422) devolve a mensagem pronta; 409 de estado puxa os dados', async () => {
    const t = setup({ responses: [
      { status: 422, body: { ok: false, error: 'bloqueado', message: 'Não dá para excluir a OS #7.' } },
      { status: 409, body: { ok: false, error: 'estado_mudou', message: 'Esta OS mudou em outro aparelho.' } },
      { status: 403, body: { ok: false, error: 'sem_permissao', message: 'Só a Recepção ou o Dono mexem com dinheiro.' } },
      { status: 403, body: { ok: false, error: 'exige_mfa', message: 'Confirme o código do autenticador para continuar.' } },
      { status: 401, body: { ok: false, error: 'nao_autenticado', message: 'Entre novamente.' } },
    ] });
    expect(await t.client.run('os.delete', { osId: 'os1' })).toEqual({ ok: false, code: 'bloqueado', message: 'Não dá para excluir a OS #7.' });
    expect(t.log).not.toContain('pull');
    expect(await t.client.run('os.restore', { osId: 'os1', payload: { target: 'EM_SERVICO' } })).toMatchObject({ code: 'mudou' });
    expect(t.log.filter(x => x === 'pull')).toHaveLength(1);
    expect(await t.client.run('os.finalizeSingle', { osId: 'os1' })).toMatchObject({ code: 'sem_permissao' });
    expect(await t.client.run('os.finalizeSingle', { osId: 'os1' })).toMatchObject({ code: 'sessao', message: 'Confirme o código do autenticador para continuar.' });
    expect(await t.client.run('os.finalizeSingle', { osId: 'os1' })).toMatchObject({ code: 'sessao' });
  });

  it('uma operação por vez e o estado ocupado é por registro (osId), não global', async () => {
    const t = setup();
    const [a, b] = await Promise.all([t.client.run('os.finalizeSingle', { osId: 'os1' }), t.client.run('os.delete', { osId: 'os2' })]);
    expect(a.ok && b.ok).toBe(true);
    expect(t.log).toEqual(['prepare', 'invoke', 'pull', 'prepare', 'invoke', 'pull']);
    expect(t.busy[0]).toEqual(['os1']);
    expect(t.busy).toContainEqual(['os1', 'os2']);
    expect(t.busy[t.busy.length - 1]).toEqual([]);
    expect(t.client.isBusy()).toBe(false);
  });

  it('motor ausente (provider desmontando): offline, sem lançar', async () => {
    const c = createMoneyClient({ invoke: async () => null, engine: () => null, newId: () => 'x', today: () => '2026-11-12', machine: () => 'm' });
    expect(await c.run('os.delete', { osId: 'os1' })).toMatchObject({ ok: false, code: 'offline' });
  });

  it('replay do servidor (op_id já gravado) volta como sucesso com replay: true', async () => {
    const t = setup({ responses: [{ status: 200, body: { ok: true, replay: true, rows: [], info: {} } }] });
    expect(await t.client.run('os.finalizeSingle', { osId: 'os1' })).toEqual({ ok: true, info: {}, replay: true });
  });
});

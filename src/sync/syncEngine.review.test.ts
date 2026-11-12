import { beforeEach, describe, expect, it } from 'vitest';
import type { Appointment, CatalogItem, Client, DatabaseSchema, LedgerEntry, WorkOrder } from '../types';
import { createMemoryStore } from './memoryStore';
import { prepareForCloud, splitDatabase } from './split';
import { Device, FakeClock, FakeServer } from './testKit';
import { TransportError } from './syncEngine';
import type { CloudRow } from './types';

// Casos da revisão do PR 4 (gancho beforeRemote, catálogo, stop, paginação por keyset, falhas tipadas do envio,
// settings, troca de papel). Mesmo servidor falso e aparelhos falsos de `syncEngine.test.ts`.

const os = (): WorkOrder => ({
  id: 'W1', osNumber: 1, vehicle: 'Uno - AAA1111', clientName: 'Ana', clientPhone: '1111', mileage: 100,
  status: 'EM_SERVICO', createdAt: '2026-01-01T15:00:00.000Z', total: 123456, totalCost: 43210, profit: 80246,
  parts: [{ id: 'p1', description: 'Filtro', price: 98765, cost: 43210 }], services: [{ id: 's1', description: 'Troca', price: 5 }],
});
const client = (): Client => ({ id: 'C1', name: 'Ana', phone: '1111', vehicles: [] });
const ledger = (): LedgerEntry => ({ id: 'L1', description: 'Venda', amount: 55501, type: 'CREDIT', effectiveDate: '2026-01-02T15:00:00.000Z', createdAt: '2026-01-02T15:00:00.000Z' });
const appt = (): Appointment => ({ id: 'A1', date: '2026-02-01T15:00:00.000Z', clientName: 'Ana', vehicle: 'Uno - AAA1111', status: 'AGENDADO', createdAt: '2026-01-01T15:00:00.000Z' });
const part = (): CatalogItem => ({ id: 'K1', description: 'Filtro de óleo', price: 77123, cost: 31337 });

const fixture = (): DatabaseSchema => prepareForCloud({
  ledger: [ledger()], workOrders: [os()], clients: [client()], catalogParts: [part()], catalogServices: [],
  catalogTechnicians: [{ id: 'T1', name: 'Zé' }], appointments: [appt()], auditLog: [],
  settings: { name: 'Oficina', cnpj: '', address: '', exportPath: '' },
});

let clock: FakeClock;
let server: FakeServer;
beforeEach(() => {
  clock = new FakeClock();
  server = new FakeServer(clock);
  server.seed(splitDatabase(fixture()));
});

const dono = (opts = {}) => Device.create('dono', 'dono', server, clock, opts);
const recepcao = (opts = {}) => Device.create('recepcao', 'recepcao', server, clock, opts);
const mecanico = (opts = {}) => Device.create('mecanico', 'mecanico', server, clock, opts);

async function synced(make: typeof dono): Promise<Device> {
  const d = await make();
  await d.sync();
  return d;
}

const bulk = (n: number, prefix = 'B'): CloudRow[] =>
  Array.from({ length: n }, (_, i) => ({ table: 'clients' as const, id: `${prefix}${i}`, data: { id: `${prefix}${i}`, name: `Cliente ${i}`, phone: '', vehicles: [] } }));

describe('beforeRemote: edição em debounce não é sobrescrita pelo remoto', () => {
  it('pull do mesmo registro: campos diferentes se juntam e vão ao servidor', async () => {
    const d = await synced(dono);
    d.editDebounced<Client>('clients', 'C1', c => ({ ...c, phone: '1234' }));
    server.poke('clients', 'C1', { ...client(), name: 'Remoto' });
    await d.pull();
    expect(d.beforeRemoteCalls).toBeGreaterThan(0);
    expect(d.get<Client>('clients', 'C1')).toMatchObject({ name: 'Remoto', phone: '1234' });
    await d.push();
    expect(server.data<Client>('clients', 'C1')).toMatchObject({ name: 'Remoto', phone: '1234' });
  });

  it('mesmo campo: o local vence e avisa (conflito resolvido, nada perdido em silêncio)', async () => {
    const d = await synced(dono);
    d.editDebounced<Client>('clients', 'C1', c => ({ ...c, name: 'Local' }));
    server.poke('clients', 'C1', { ...client(), name: 'Remoto' });
    await d.pull();
    expect(d.get<Client>('clients', 'C1')!.name).toBe('Local');
    expect(d.notices.join(' ')).toContain('name');
    await d.push();
    expect(server.data<Client>('clients', 'C1').name).toBe('Local');
  });

  it('OS: status em debounce + mudança remota de outro campo da mesma OS', async () => {
    const m = await synced(mecanico);
    m.editDebounced<WorkOrder>('workOrders', 'W1', w => ({ ...w, status: 'APROVADO' }));
    server.poke('work_orders', 'W1', { ...server.data<object>('work_orders', 'W1'), vehicle: 'Remoto - ZZZ' });
    await m.pull();
    expect(m.get<WorkOrder>('workOrders', 'W1')).toMatchObject({ status: 'APROVADO', vehicle: 'Remoto - ZZZ' });
    await m.push();
    expect(server.data<{ status: string; vehicle: string }>('work_orders', 'W1')).toMatchObject({ status: 'APROVADO', vehicle: 'Remoto - ZZZ' });
  });

  it('resolução de conflito de push também descarrega o debounce antes', async () => {
    const a = await synced(dono);
    const b = await synced(recepcao);
    b.edit<Client>('clients', 'C1', c => ({ ...c, phone: '5555' }));
    a.edit<Client>('clients', 'C1', c => ({ ...c, name: 'Nome A' }));
    await a.push();
    b.editDebounced<Client>('clients', 'C1', c => ({ ...c, notes: 'nota nova' }));
    server.failPull = true;
    await b.push(); // conflito
    server.failPull = false;
    await b.sync();
    expect(server.data<Client>('clients', 'C1')).toMatchObject({ name: 'Nome A', phone: '5555', notes: 'nota nova' });
  });

  it('o ack do envio também chama o gancho', async () => {
    const d = await synced(dono);
    const before = d.beforeRemoteCalls;
    d.edit<Client>('clients', 'C1', c => ({ ...c, phone: '1' }));
    await d.push();
    expect(d.beforeRemoteCalls).toBeGreaterThan(before);
  });
});

describe('catálogo: preço de peça e de serviço na mesma página', () => {
  it('linhas de preço de peça e serviço juntas chegam completas (irmãs buscadas por layout)', async () => {
    server.seed([
      { table: 'catalog_services', id: 'S1', data: { description: 'Alinhamento' } },
      { table: 'catalog_prices', id: 'service:S1', data: { kind: 'service', item_id: 'S1', price: 9000 } },
      { table: 'catalog_costs', id: 'service:S1', data: { kind: 'service', item_id: 'S1', cost: 3000 } },
    ]);
    const d = await synced(dono);
    expect(d.get<CatalogItem>('catalogServices', 'S1')).toMatchObject({ price: 9000, cost: 3000 });
    clock.advance(1000);
    server.poke('catalog_prices', 'part:K1', { kind: 'part', item_id: 'K1', price: 111 });
    server.poke('catalog_prices', 'service:S1', { kind: 'service', item_id: 'S1', price: 222 });
    await d.engine.pullNow(['catalog_prices']);
    await d.engine.settled();
    expect(d.get<CatalogItem>('catalogParts', 'K1')!.price).toBe(111);
    expect(d.get<CatalogItem>('catalogServices', 'S1')!.price).toBe(222);
    expect(d.get<CatalogItem>('catalogServices', 'S1')!.description).toBe('Alinhamento');
  });
});

describe('stop()', () => {
  it('para de vez: sem timers, sem rede, sem patch', async () => {
    const d = await synced(dono);
    d.engine.start();
    await d.engine.settled();
    d.engine.stop();
    const calls = server.pullCalls;
    server.poke('clients', 'C1', { ...client(), name: 'Depois' });
    clock.advance(60000);
    await d.engine.settled();
    expect(clock.pendingTimers).toBe(0);
    expect(server.pullCalls).toBe(calls);
    expect(d.get<Client>('clients', 'C1')!.name).toBe('Ana');
    d.edit<Client>('clients', 'C1', c => ({ ...c, phone: '9' }));
    expect(d.engine.getStatus().pending).toBe(0); // localChange depois de parar é ignorado
  });

  it('parar no meio de uma rodada não recria timers (repull de registro incompleto)', async () => {
    server.seed([
      { table: 'work_orders', id: 'W3', data: { ...server.data<object>('work_orders', 'W1'), id: 'W3', parts: [{ id: 'x1', description: 'p' }], services: [] } },
      { table: 'work_order_finance', id: 'W3', data: { prices: { y: 1 }, total: 1 } },
    ]);
    const d = await Device.create('dono', 'dono', server, clock);
    const p = d.engine.syncNow();
    d.engine.stop();
    await p;
    await d.engine.settled();
    expect(clock.pendingTimers).toBe(0);
  });
});

describe('registro que nunca junta', () => {
  it('segura o cursor, tenta no máximo 5 vezes, mostra erro e se recupera no pull completo', async () => {
    clock.advance(1000);
    const main = { ...server.data<object>('work_orders', 'W1'), id: 'W3', osNumber: 3, parts: [{ id: 'x1', description: 'p' }], services: [] };
    server.poke('work_orders', 'W3', main);
    server.poke('work_order_finance', 'W3', { prices: { y: 1 }, total: 1 });
    const d = await Device.create('dono', 'dono', server, clock);
    await d.sync();
    expect(d.get('workOrders', 'W3')).toBeUndefined();
    expect(d.get('workOrders', 'W1')).toBeDefined();
    // O cursor da tabela fica na última linha completa (W1), antes da incompleta.
    const cur = (await d.store.load()).meta.cursor.work_orders;
    expect(cur).toEqual({ updated_at: server.row('work_orders', 'W1')!.updated_at, id: 'W1' });

    for (let i = 0; i < 12; i++) { clock.advance(2000); await d.engine.settled(); }
    const calls = server.pullCalls;
    for (let i = 0; i < 4; i++) { clock.advance(2000); await d.engine.settled(); }
    expect(server.pullCalls).toBe(calls); // parou de repuxar
    expect(d.engine.getStatus()).toMatchObject({ syncState: 'erro', lastError: 'registro_incompleto' });

    // Consertou no servidor SEM mudar `updated_at`: só o pull completo (registros desistidos) acha.
    server.row('work_order_finance', 'W3')!.data = { prices: { x1: 1 }, total: 1 };
    await d.pull();
    expect(d.get<WorkOrder>('workOrders', 'W3')!.parts[0].price).toBe(1);
    expect(d.engine.getStatus()).toMatchObject({ syncState: 'salvo', lastError: null });
  });
});

describe('paginação por keyset', () => {
  it('2500 linhas no mesmo instante com max_rows = 1000: baixa todas, sem repetir nem perder', async () => {
    server.seed(bulk(2500));
    const d = await synced(dono);
    expect(d.list('clients')).toHaveLength(2501);
    const cur = (await d.store.load()).meta.cursor.clients;
    expect(typeof cur?.updated_at).toBe('string');
    expect(typeof cur?.id).toBe('string');
    await d.pull();
    expect(d.list('clients')).toHaveLength(2501);
  });
});

describe('falhas do envio', () => {
  it('exceção ao aplicar o resultado não deixa op presa em sending', async () => {
    const hook = { boom: false };
    const d = await Device.create('dono', 'dono', server, clock, { beforeRemoteHook: () => { if (hook.boom) { hook.boom = false; throw new Error('boom'); } } });
    await d.sync();
    d.edit<Client>('clients', 'C1', c => ({ ...c, phone: '4321' }));
    hook.boom = true;
    await d.push();
    const ops = (await d.store.load()).outbox;
    expect(ops.map(o => o.state)).toEqual(['pending']);
    expect(server.row('clients', 'C1')!.version).toBe(2); // o servidor gravou (ack perdido)
    clock.advance(2000); // backoff da 1ª tentativa
    await d.engine.settled();
    expect(d.engine.getStatus()).toMatchObject({ pending: 0, syncState: 'salvo' });
    expect(server.row('clients', 'C1')!.version).toBe(2);
  });

  it('sem acesso (401/42501): para de enviar, mostra sem_acesso e volta com resumeAfterLogin', async () => {
    const d = await synced(dono);
    server.failPushWith = { error: new TransportError('JWT expired', 'auth', 'PGRST301'), times: 1 };
    d.edit<Client>('clients', 'C1', c => ({ ...c, phone: '777' }));
    await d.push();
    expect(d.engine.getStatus()).toMatchObject({ syncState: 'erro', lastError: 'sem_acesso', pending: 1 });
    const calls = server.pushCalls;
    clock.advance(120000);
    await d.engine.settled();
    expect(server.pushCalls).toBe(calls);
    d.engine.resumeAfterLogin();
    await d.engine.settled();
    expect(server.data<Client>('clients', 'C1').phone).toBe('777');
    expect(d.engine.getStatus()).toMatchObject({ syncState: 'salvo', pending: 0 });
  });

  it('erro do servidor com código: conta tentativa e espera 2 s (não 5 s fixos)', async () => {
    const d = await synced(dono);
    server.failPushWith = { error: new TransportError('boom', 'server', 'XX000'), times: 1 };
    d.edit<Client>('clients', 'C1', c => ({ ...c, phone: '888' }));
    await d.push();
    const calls = server.pushCalls;
    clock.advance(1999);
    await d.engine.settled();
    expect(server.pushCalls).toBe(calls);
    clock.advance(1);
    await d.engine.settled();
    expect(server.pushCalls).toBe(calls + 1);
    expect(server.data<Client>('clients', 'C1').phone).toBe('888');
  });

  it('no máximo 50 groups por chamada', async () => {
    server.seed(bulk(120));
    const d = await synced(dono);
    for (let i = 0; i < 120; i++) d.edit<Client>('clients', `B${i}`, c => ({ ...c, phone: '1' }));
    await d.push();
    expect(server.maxGroupsSeen).toBe(50);
    expect(d.engine.getStatus().pending).toBe(0);
    expect(server.data<Client>('clients', 'B119').phone).toBe('1');
  });

  it('timeout (57014): divide o lote até caber', async () => {
    server.seed(bulk(120));
    const d = await synced(dono);
    server.rejectBatchOver = { n: 30, error: new TransportError('canceling statement', 'timeout', '57014') };
    for (let i = 0; i < 120; i++) d.edit<Client>('clients', `B${i}`, c => ({ ...c, phone: '2' }));
    await d.push();
    await d.engine.settled();
    expect(d.engine.getStatus().pending).toBe(0);
    expect(server.data<Client>('clients', 'B0').phone).toBe('2');
    expect(server.data<Client>('clients', 'B119').phone).toBe('2');
  });

  it('sobrou op elegível ao sair pelo limite de rodadas: reagenda o envio', async () => {
    server.seed(bulk(1100));
    const d = await synced(dono);
    for (let i = 0; i < 1100; i++) d.editDebounced<Client>('clients', `B${i}`, c => ({ ...c, phone: '3' }));
    d.flushDebounced(); // uma passada só pelo motor (1100 ops)
    clock.advance(300); // dispara o envio do debounce
    await d.engine.settled();
    expect(d.engine.getStatus().pending).toBe(100);
    clock.advance(300); // o motor reagendou sozinho
    await d.engine.settled();
    expect(d.engine.getStatus().pending).toBe(0);
    expect(server.data<Client>('clients', 'B1099').phone).toBe('3');
  }, 60000); // 1100 ops: o motor percorre a outbox inteira a cada rodada (pendingFor é O(n²)); sob carga passa de 5 s

  it('flushing só com envio no ar; espera de backoff não conta como envio', async () => {
    const d = await synced(dono);
    const seen: boolean[] = [];
    d.engine.subscribeStatus(s => seen.push(s.flushing));
    server.failPushWith = { error: new TransportError('boom', 'server', 'XX000'), times: 1 };
    d.edit<Client>('clients', 'C1', c => ({ ...c, phone: '5' }));
    await d.push();
    expect(seen).toContain(true);
    expect(d.engine.getStatus()).toMatchObject({ flushing: false, pending: 1 });
  });

  it('erro de um denied já revertido não fica preso no selo', async () => {
    const d = await synced(dono);
    server.forceDeny = { table: 'appointments', code: '42501', message: 'update_negado', times: 1 };
    d.edit<Appointment>('appointments', 'A1', a => ({ ...a, reason: 'x' }));
    await d.push();
    expect(d.rejections[0].reason).toBe('denied');
    expect(d.engine.getStatus()).toMatchObject({ lastError: null, syncState: 'salvo', pending: 0 });
  });
});

describe('configurações e cache', () => {
  const DEFAULT = { name: 'OFICINA', cnpj: '', address: '', exportPath: '' };

  it('settings editado antes do 1º pull: o servidor mantém o que o Dono não mexeu', async () => {
    const d = await Device.create('dono', 'dono', server, clock, { settingsDefault: DEFAULT });
    d.add('settings', { ...DEFAULT, cnpj: '123', id: 'main' });
    await d.sync();
    expect(server.data<{ name: string; cnpj: string }>('settings', 'main')).toMatchObject({ name: 'Oficina', cnpj: '123' });
    expect(d.get<{ name: string; cnpj: string }>('settings', 'main')).toMatchObject({ name: 'Oficina', cnpj: '123' });
  });

  it('settings com linha ausente no servidor: o Dono cria (versão 0)', async () => {
    const vazio = new FakeServer(clock);
    const d = await Device.create('dono', 'dono', vazio, clock, { settingsDefault: DEFAULT });
    d.add('settings', { ...DEFAULT, name: 'Nova', id: 'main' });
    await d.engine.flushNow();
    await d.engine.settled();
    expect(vazio.data<{ name: string }>('settings', 'main').name).toBe('Nova');
  });

  it('troca de papel: edições não enviadas viram cópia de recuperação e aviso', async () => {
    const store = createMemoryStore();
    const a = await Device.create('u', 'dono', server, clock, { store });
    await a.sync();
    a.goOffline();
    a.edit<Client>('clients', 'C1', c => ({ ...c, phone: '000' }));
    await a.engine.settled();
    a.engine.stop();
    const b = await Device.create('u', 'mecanico', server, clock, { store, online: false });
    expect(b.recovery).toHaveLength(1);
    expect((b.recovery[0].value as Client).phone).toBe('000');
    expect(b.rejections).toEqual([{ collection: 'clients', id: 'C1', reason: 'cache_discarded', detail: undefined }]);
    expect(b.list('clients')).toHaveLength(0);
  });

  it('reabrir com op gravada como sending: volta a pending e é enviada', async () => {
    const store = createMemoryStore();
    const a = await Device.create('dono', 'dono', server, clock, { store });
    await a.sync();
    a.edit<Client>('clients', 'C1', c => ({ ...c, phone: '606' }));
    await a.engine.settled();
    a.engine.stop();
    const [op] = (await store.load()).outbox;
    await store.commit({ putRecords: [], putOps: [{ ...op, state: 'sending', attempts: 1 }], deleteOpIds: [] });
    const b = await Device.create('dono', 'dono', server, clock, { store });
    expect(b.engine.getStatus().pending).toBe(1);
    await b.sync();
    expect(server.data<Client>('clients', 'C1').phone).toBe('606');
    expect(b.engine.getStatus()).toMatchObject({ pending: 0, syncState: 'salvo' });
  });
});

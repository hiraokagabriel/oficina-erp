import { beforeEach, describe, expect, it } from 'vitest';
import type { Appointment, CatalogItem, Client, DatabaseSchema, LedgerEntry, WorkOrder } from '../types';
import { createMemoryStore } from './memoryStore';
import { prepareForCloud, splitDatabase } from './split';
import { Device, FakeClock, FakeServer } from './testKit';
import { SyncEngine, visibleTables } from './syncEngine';
import type { WorkOrderFinance } from './split';

// Motor com 2 aparelhos falsos e um servidor falso que imita o `sync_push` (versão esperada, conflito com a linha
// atual, `denied` por papel, tombstone, filtro por papel no pull). Nada de rede, IndexedDB ou relógio real.

// Valores que o Mecânico NUNCA pode ver passar pelo transporte (preço, custo, total).
const PRICE = 98765;
const COST = 43210;
const TOTAL = 123456;
const CATALOG_PRICE = 77123;
const CATALOG_COST = 31337;
const LEDGER_AMOUNT = 55501;

const os = (): WorkOrder => ({
  id: 'W1', osNumber: 1, vehicle: 'Uno - AAA1111', clientName: 'Ana', clientPhone: '1111', mileage: 100,
  status: 'EM_SERVICO', createdAt: '2026-01-01T15:00:00.000Z', total: TOTAL, totalCost: COST, profit: TOTAL - COST,
  parts: [{ id: 'p1', description: 'Filtro', price: PRICE, cost: COST }], services: [{ id: 's1', description: 'Troca', price: 5 }],
});

const client = (): Client => ({ id: 'C1', name: 'Ana', phone: '1111', vehicles: [] });
const ledger = (): LedgerEntry => ({ id: 'L1', description: 'Venda', amount: LEDGER_AMOUNT, type: 'CREDIT', effectiveDate: '2026-01-02T15:00:00.000Z', createdAt: '2026-01-02T15:00:00.000Z' });
const appt = (): Appointment => ({ id: 'A1', date: '2026-02-01T15:00:00.000Z', clientName: 'Ana', vehicle: 'Uno - AAA1111', status: 'AGENDADO', createdAt: '2026-01-01T15:00:00.000Z' });
const part = (): CatalogItem => ({ id: 'K1', description: 'Filtro de óleo', price: CATALOG_PRICE, cost: CATALOG_COST });

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

/** Aparelho que já baixou tudo. */
async function synced(make: typeof dono): Promise<Device> {
  const d = await make();
  await d.sync();
  return d;
}

describe('abertura e pull', () => {
  it('primeira rodada baixa tudo e junta a OS por papel', async () => {
    const d = await synced(dono);
    const w = d.get<WorkOrder>('workOrders', 'W1')!;
    expect(w.parts[0].price).toBe(PRICE);
    expect(w.parts[0].cost).toBe(COST);
    expect(w.total).toBe(TOTAL);
    expect(d.list('clients')).toHaveLength(1);
    expect(d.list('ledger')).toHaveLength(1);
    expect(d.get<CatalogItem>('catalogParts', 'K1')).toMatchObject({ price: CATALOG_PRICE, cost: CATALOG_COST });
    expect(d.get('settings', 'main')).toMatchObject({ name: 'Oficina' });
    expect(d.engine.getStatus()).toMatchObject({ syncState: 'salvo', pending: 0, online: true });
  });

  it('Recepção vê preço mas não custo; Mecânico não vê nenhum dos dois', async () => {
    const r = await synced(recepcao);
    const wr = r.get<WorkOrder>('workOrders', 'W1')!;
    expect(wr.parts[0].price).toBe(PRICE);
    expect(wr.parts[0].cost).toBeUndefined();
    expect(r.list('ledger')).toHaveLength(1);
    const m = await synced(mecanico);
    const wm = m.get<WorkOrder>('workOrders', 'W1')!;
    expect(wm.parts[0].price).toBe(0);
    expect(wm.total).toBe(0);
    expect(m.list('ledger')).toHaveLength(0);
    expect(m.get<CatalogItem>('catalogParts', 'K1')!.price).toBe(0);
  });

  it('mecânico não pede tabelas de dinheiro', () => {
    const t = visibleTables('mecanico');
    for (const x of ['work_order_finance', 'work_order_costs', 'ledger', 'catalog_prices', 'catalog_costs', 'audit_log'] as const) {
      expect(t).not.toContain(x);
    }
    expect(visibleTables('recepcao')).not.toContain('work_order_costs');
    expect(visibleTables('dono')).toContain('catalog_costs');
  });

  it('funciona offline a partir do cache e envia o que ficou na fila ao voltar', async () => {
    const store = createMemoryStore();
    const a = await Device.create('dono', 'dono', server, clock, { store });
    await a.sync();
    a.goOffline();
    a.edit<Client>('clients', 'C1', c => ({ ...c, phone: '9999' }));
    await a.engine.settled();
    a.engine.stop();

    // "Reabriu o app" sem internet: estado do cache + edição pendente.
    const b = await Device.create('dono', 'dono', server, clock, { store, online: false });
    expect(b.get<Client>('clients', 'C1')!.phone).toBe('9999');
    expect(b.engine.getStatus()).toMatchObject({ syncState: 'offline', pending: 1 });
    expect(server.data<Client>('clients', 'C1').phone).toBe('1111');
    await b.goOnline();
    await b.sync();
    expect(server.data<Client>('clients', 'C1').phone).toBe('9999');
    expect(b.engine.getStatus()).toMatchObject({ syncState: 'salvo', pending: 0 });
  });

  it('cache de outro papel é descartado', async () => {
    const store = createMemoryStore();
    const a = await Device.create('u', 'dono', server, clock, { store });
    await a.sync();
    expect(a.get<WorkOrder>('workOrders', 'W1')!.parts[0].cost).toBe(COST);
    const b = await Device.create('u', 'mecanico', server, clock, { store, online: false });
    expect(b.list('workOrders')).toHaveLength(0);
  });
});

describe('primeira abertura (hasPulled)', () => {
  it('cache vazio: não puxou ainda; depois do primeiro pull completo, sim; reabrir com o cache: já puxou', async () => {
    const store = createMemoryStore();
    const a = await Device.create('dono', 'dono', server, clock, { store });
    expect(a.engine.hasPulled()).toBe(false);
    await a.sync();
    expect(a.engine.hasPulled()).toBe(true);
    await a.engine.settled();
    a.engine.stop();
    const b = await Device.create('dono', 'dono', server, clock, { store });
    expect(b.engine.hasPulled()).toBe(true);
  });
  it('pull que falha (ou sem internet) não conta como primeiro pull', async () => {
    const a = await Device.create('dono', 'dono', server, clock, { online: false });
    await a.engine.pullNow();
    expect(a.engine.hasPulled()).toBe(false);
    server.failPull = true;
    await a.goOnline();
    await a.engine.pullNow();
    expect(a.engine.hasPulled()).toBe(false);
    server.failPull = false;
    await a.engine.pullNow();
    expect(a.engine.hasPulled()).toBe(true);
  });
});

describe('edição offline e reconexão', () => {
  it('enfileira offline (selo offline + N guardadas) e envia ao reconectar', async () => {
    const d = await synced(dono);
    d.goOffline();
    d.edit<Client>('clients', 'C1', c => ({ ...c, name: 'Ana Maria' }));
    d.edit<Client>('clients', 'C1', c => ({ ...c, phone: '2222' })); // coalesce: 1 op
    await d.engine.settled();
    expect(d.engine.getStatus()).toMatchObject({ syncState: 'offline', pending: 1 });
    expect(server.data<Client>('clients', 'C1').name).toBe('Ana');
    await d.goOnline();
    await d.push();
    expect(server.data<Client>('clients', 'C1')).toMatchObject({ name: 'Ana Maria', phone: '2222' });
    expect(server.row('clients', 'C1')!.version).toBe(2);
    expect(d.engine.getStatus()).toMatchObject({ syncState: 'salvo', pending: 0 });
  });

  it('o outro aparelho recebe a mudança sem eco', async () => {
    const a = await synced(dono);
    const b = await synced(recepcao);
    a.edit<Client>('clients', 'C1', c => ({ ...c, name: 'Beto' }));
    await a.push();
    await b.pull();
    expect(b.get<Client>('clients', 'C1')!.name).toBe('Beto');
    // O que b recebeu não vira op de volta.
    b.engine.localChange('clients', b.list('clients'));
    expect(b.engine.getStatus().pending).toBe(0);
    await b.pull();
    expect(server.row('clients', 'C1')!.version).toBe(2);
  });

  it('mudança remota nova: realtime vira pull com debounce de 300 ms', async () => {
    const a = await synced(dono);
    a.engine.start();
    await a.engine.settled();
    server.poke('clients', 'C1', { ...client(), name: 'Remoto' });
    clock.advance(299);
    await a.engine.settled();
    expect(a.get<Client>('clients', 'C1')!.name).toBe('Ana');
    clock.advance(1);
    await a.engine.settled();
    expect(a.get<Client>('clients', 'C1')!.name).toBe('Remoto');
    a.engine.stop();
  });

  it('lançamento manual só online: offline é desfeito', async () => {
    const d = await synced(dono);
    d.goOffline();
    d.add<LedgerEntry>('ledger', { ...ledger(), id: 'L2', description: 'Manual' });
    expect(d.get('ledger', 'L2')).toBeUndefined();
    expect(d.rejections).toEqual([{ collection: 'ledger', id: 'L2', reason: 'offline', detail: undefined }]);
    await d.goOnline();
    d.add<LedgerEntry>('ledger', { ...ledger(), id: 'L2', description: 'Manual' });
    await d.push();
    expect(server.data<LedgerEntry>('ledger', 'L2').description).toBe('Manual');
    expect(server.row('ledger', 'L2')!.os_id).toBeNull();
  });
});

describe('conflito', () => {
  async function twoStale(): Promise<{ a: Device; b: Device }> {
    const a = await synced(dono);
    const b = await synced(recepcao);
    return { a, b };
  }

  it('campos diferentes: os dois valem', async () => {
    const { a, b } = await twoStale();
    a.edit<Client>('clients', 'C1', c => ({ ...c, name: 'Nome A' }));
    await a.push();
    b.goOffline();
    b.edit<Client>('clients', 'C1', c => ({ ...c, phone: '5555' }));
    // b ainda não viu o nome novo; ao reconectar o pull já traz e funde (rebase), sem conflito no push.
    await b.goOnline();
    await b.sync();
    expect(server.data<Client>('clients', 'C1')).toMatchObject({ name: 'Nome A', phone: '5555' });
    expect(b.get<Client>('clients', 'C1')).toMatchObject({ name: 'Nome A', phone: '5555' });
    expect(b.notices).toEqual([]);
  });

  it('conflito real no push (versão velha): funde por campo e reenvia', async () => {
    const { a, b } = await twoStale();
    // b edita; antes de b enviar, a grava. O push de b volta `conflict` (pull de b falha).
    b.edit<Client>('clients', 'C1', c => ({ ...c, phone: '5555' }));
    a.edit<Client>('clients', 'C1', c => ({ ...c, name: 'Nome A' }));
    await a.push();
    server.failPull = true;
    await b.push();
    server.failPull = false;
    await b.sync();
    expect(server.data<Client>('clients', 'C1')).toMatchObject({ name: 'Nome A', phone: '5555' });
    expect(b.get<Client>('clients', 'C1')).toMatchObject({ name: 'Nome A', phone: '5555' });
    expect(b.engine.getStatus().pending).toBe(0);
  });

  it('mesmo campo: o local vence e avisa', async () => {
    const { a, b } = await twoStale();
    a.edit<Client>('clients', 'C1', c => ({ ...c, name: 'Do A' }));
    await a.push();
    b.edit<Client>('clients', 'C1', c => ({ ...c, name: 'Do B' }));
    await b.sync();
    expect(server.data<Client>('clients', 'C1').name).toBe('Do B');
    expect(b.notices.join(' ')).toContain('name');
    await a.pull();
    expect(a.get<Client>('clients', 'C1')!.name).toBe('Do B');
  });

  it('OS: campos diferentes (status x cliente) se juntam', async () => {
    const { a, b } = await twoStale();
    a.edit<WorkOrder>('workOrders', 'W1', w => ({ ...w, vehicle: 'Gol - BBB2222' }));
    await a.push();
    b.edit<WorkOrder>('workOrders', 'W1', w => ({ ...w, status: 'APROVADO' }));
    await b.sync();
    const s = server.data<{ vehicle: string; status: string }>('work_orders', 'W1');
    expect(s).toMatchObject({ vehicle: 'Gol - BBB2222', status: 'APROVADO' });
  });

  it('servidor apagou e local editou: a exclusão vence e avisa', async () => {
    const { a, b } = await twoStale();
    a.remove('clients', 'C1');
    await a.push();
    b.goOffline();
    b.edit<Client>('clients', 'C1', c => ({ ...c, phone: '7' }));
    await b.goOnline();
    await b.sync();
    expect(b.get('clients', 'C1')).toBeUndefined();
    expect(b.rejections.map(r => r.reason)).toEqual(['server_deleted']);
    expect(b.engine.getStatus().pending).toBe(0);
  });
});

describe('tombstone', () => {
  it('exclusão chega ao outro aparelho, sai do estado e não volta pela janela de 5 s', async () => {
    const a = await synced(dono);
    const b = await synced(recepcao);
    a.remove('clients', 'C1');
    await a.push();
    expect(server.row('clients', 'C1')!.deleted_at).not.toBeNull();
    await b.pull();
    expect(b.get('clients', 'C1')).toBeUndefined();
    await b.pull(); // a mesma linha volta na janela e é descartada pela versão
    clock.advance(2000);
    await b.pull();
    expect(b.list('clients')).toHaveLength(0);
    // Reabrir com o cache: tombstone não ressuscita.
    const c = await Device.create('recepcao', 'recepcao', server, clock, { store: b.store, online: false });
    expect(c.list('clients')).toHaveLength(0);
  });

  it('excluir registro criado offline nunca vai ao servidor', async () => {
    const d = await synced(dono);
    d.goOffline();
    d.add<Client>('clients', { id: 'C9', name: 'Novo', phone: '1', vehicles: [] });
    d.remove('clients', 'C9');
    expect(d.engine.getStatus().pending).toBe(0);
    await d.goOnline();
    await d.sync();
    expect(server.row('clients', 'C9')).toBeUndefined();
  });
});

describe('ack perdido', () => {
  it('servidor gravou e a resposta não chegou: não duplica nem gera conflito falso', async () => {
    const d = await synced(dono);
    d.edit<Client>('clients', 'C1', c => ({ ...c, name: 'Gravou' }));
    server.dropResponses = 1;
    await d.push();
    expect(server.row('clients', 'C1')!.version).toBe(2); // o servidor gravou
    expect(d.engine.getStatus()).toMatchObject({ pending: 1, syncState: 'erro' });
    clock.advance(6000); // espera da falha de rede
    await d.push();
    expect(server.row('clients', 'C1')!.version).toBe(2); // não gravou de novo
    expect(d.engine.getStatus()).toMatchObject({ pending: 0, syncState: 'salvo' });
    expect(d.notices).toEqual([]);
    expect(d.rejections).toEqual([]);
    expect(d.recovery).toEqual([]);
    expect(d.get<Client>('clients', 'C1')!.name).toBe('Gravou');
    await d.pull();
    expect(server.row('clients', 'C1')!.version).toBe(2);
  });

  it('o mesmo vale para OS (3 linhas) e para novo registro', async () => {
    const d = await synced(dono);
    d.edit<WorkOrder>('workOrders', 'W1', w => ({ ...w, parts: [{ ...w.parts[0], price: 111 }], total: 116 }));
    // total/preço em OS com dinheiro: aqui não há receita nem FINALIZADO, então vai por sync_push.
    d.add<Client>('clients', { id: 'C2', name: 'Novo', phone: '1', vehicles: [] });
    server.dropResponses = 1;
    await d.push();
    const v = server.row('work_order_finance', 'W1')!.version;
    expect(server.row('clients', 'C2')!.version).toBe(1);
    clock.advance(6000);
    await d.push();
    expect(server.row('work_order_finance', 'W1')!.version).toBe(v);
    expect(server.row('clients', 'C2')!.version).toBe(1);
    expect(d.engine.getStatus().pending).toBe(0);
    expect(d.notices).toEqual([]);
  });
});

describe('edição depois de pull com op pendente (rebase)', () => {
  it('voltar a um valor antigo depois do rebase ainda é enviado', async () => {
    const a = await synced(dono);
    const b = await synced(recepcao);
    // b edita o nome, mas o envio falha (rede); op fica pendente.
    server.failPush = 1;
    b.edit<Client>('clients', 'C1', c => ({ ...c, name: 'Temp' }));
    await b.push();
    expect(b.engine.getStatus().pending).toBe(1);
    // a muda o telefone; b faz pull: a op de b é rebaseada sobre o servidor.
    a.edit<Client>('clients', 'C1', c => ({ ...c, phone: '8888' }));
    await a.push();
    await b.pull();
    expect(b.get<Client>('clients', 'C1')).toMatchObject({ name: 'Temp', phone: '8888' });
    // b volta o nome ao original ("Ana"): sem rebase a linha seria igual à base velha e não iria.
    b.edit<Client>('clients', 'C1', c => ({ ...c, name: 'Ana' }));
    clock.advance(6000);
    await b.push();
    expect(server.data<Client>('clients', 'C1')).toMatchObject({ name: 'Ana', phone: '8888' });
    expect(b.engine.getStatus().pending).toBe(0);
  });

  it('o que o outro aparelho mudou não é sobrescrito por edição pendente antiga', async () => {
    const a = await synced(dono);
    const b = await synced(recepcao);
    server.failPush = 1;
    b.edit<Client>('clients', 'C1', c => ({ ...c, name: 'B mudou' }));
    await b.push();
    a.edit<Client>('clients', 'C1', c => ({ ...c, phone: '4444' }));
    await a.push();
    await b.pull();
    clock.advance(6000);
    await b.push();
    expect(server.data<Client>('clients', 'C1')).toMatchObject({ name: 'B mudou', phone: '4444' });
  });
});

describe('papéis: dinheiro nunca passa para quem não pode', () => {
  const secrets = [String(PRICE), String(COST), String(TOTAL), String(CATALOG_PRICE), String(CATALOG_COST), String(LEDGER_AMOUNT)];

  it('mecânico nunca recebe nem envia preço, custo, total ou lançamento', async () => {
    const m = await synced(mecanico);
    m.edit<WorkOrder>('workOrders', 'W1', w => ({ ...w, status: 'APROVADO', mileage: 150 }));
    m.edit<Client>('clients', 'C1', c => c); // sem mudança
    m.add<Client>('clients', { id: 'C5', name: 'Cliente do pátio', phone: '1', vehicles: [] });
    await m.push();
    await m.pull();
    const wire = server.wire.mecanico.join('\n');
    for (const s of secrets) expect(wire).not.toContain(s);
    expect(wire).not.toContain('work_order_finance');
    expect(wire).not.toContain('work_order_costs');
    expect(wire).not.toContain('"ledger"');
    expect(server.data<{ status: string; mileage: number }>('work_orders', 'W1')).toMatchObject({ status: 'APROVADO', mileage: 150 });
    // A linha de preço do servidor não foi tocada.
    expect(server.row('work_order_finance', 'W1')!.version).toBe(1);
    expect(server.data<WorkOrderFinance>('work_order_finance', 'W1').total).toBe(TOTAL);
    // O cache do mecânico também não tem os valores.
    const snap = JSON.stringify(await m.store.load());
    for (const s of secrets) expect(snap).not.toContain(s);
  });

  it('recepção nunca recebe nem envia custo', async () => {
    const r = await synced(recepcao);
    r.edit<WorkOrder>('workOrders', 'W1', w => ({ ...w, vehicle: 'Gol - CCC3333' }));
    r.edit<CatalogItem>('catalogParts', 'K1', p => ({ ...p, description: 'Filtro novo' }));
    await r.push();
    await r.pull();
    const wire = server.wire.recepcao.join('\n');
    expect(wire).not.toContain(String(COST));
    expect(wire).not.toContain(String(CATALOG_COST));
    expect(wire).not.toContain('work_order_costs');
    expect(wire).not.toContain('catalog_costs');
    // Os custos do Dono seguem intactos no servidor.
    expect(server.row('work_order_costs', 'W1')!.version).toBe(1);
    expect(server.data<{ costs: Record<string, number> }>('work_order_costs', 'W1').costs.p1).toBe(COST);
  });

  it('Dono edita custo e preço do catálogo (3 linhas)', async () => {
    const d = await synced(dono);
    d.edit<CatalogItem>('catalogParts', 'K1', p => ({ ...p, price: 1000, cost: 400 }));
    await d.push();
    expect(server.data<{ price: number }>('catalog_prices', 'part:K1').price).toBe(1000);
    expect(server.data<{ cost: number }>('catalog_costs', 'part:K1').cost).toBe(400);
    const r = await synced(recepcao);
    expect(r.get<CatalogItem>('catalogParts', 'K1')).toMatchObject({ price: 1000 });
    expect(r.get<CatalogItem>('catalogParts', 'K1')!.cost).toBeUndefined();
  });

  it('OS nova com itens sobe main + finance', async () => {
    const r = await synced(recepcao);
    r.add<WorkOrder>('workOrders', { ...os(), id: 'W2', osNumber: 2, total: 500, totalCost: undefined, profit: undefined, parts: [{ id: 'q1', description: 'Vela', price: 500 }], services: [] });
    await r.push();
    expect(server.data<WorkOrderFinance>('work_order_finance', 'W2').prices).toEqual({ q1: 500 });
    const d = await synced(dono);
    expect(d.get<WorkOrder>('workOrders', 'W2')!.total).toBe(500);
  });
});

describe('barreiras locais', () => {
  it('money_op (finalizar) é desfeito, sem op e com motivo', async () => {
    const r = await synced(recepcao);
    r.edit<WorkOrder>('workOrders', 'W1', w => ({ ...w, status: 'FINALIZADO' }));
    expect(r.get<WorkOrder>('workOrders', 'W1')!.status).toBe('EM_SERVICO');
    expect(r.rejections).toEqual([{ collection: 'workOrders', id: 'W1', reason: 'money_op', detail: undefined }]);
    expect(r.engine.getStatus().pending).toBe(0);
    await r.push();
    expect(server.pushCalls).toBe(0);
  });

  it('pagar lançamento (money_op) e papel sem permissão (denied) são desfeitos', async () => {
    const r = await synced(recepcao);
    r.edit<LedgerEntry>('ledger', 'L1', l => ({ ...l, paymentDate: '2026-02-01T15:00:00.000Z' }));
    expect(r.get<LedgerEntry>('ledger', 'L1')!.paymentDate).toBeUndefined();
    const m = await synced(mecanico);
    m.edit<WorkOrder>('workOrders', 'W1', w => ({ ...w, clientName: 'Outro' }));
    expect(m.get<WorkOrder>('workOrders', 'W1')!.clientName).toBe('Ana');
    expect(m.rejections[0].reason).toBe('denied_local');
    m.remove('clients', 'C1');
    expect(m.get('clients', 'C1')).toBeDefined();
    expect(m.engine.getStatus().pending).toBe(0);
  });

  it('criar registro negado volta a sumir da tela', async () => {
    const m = await synced(mecanico);
    m.add<WorkOrder>('workOrders', { ...os(), id: 'W7' });
    expect(m.get('workOrders', 'W7')).toBeUndefined();
    expect(m.rejections[0]).toMatchObject({ id: 'W7', reason: 'denied_local' });
  });
});

describe('denied/failed do servidor', () => {
  it('denied: reverte ao confirmado, guarda cópia de recuperação e avisa', async () => {
    const d = await synced(dono);
    server.forceDeny = { table: 'appointments', code: '42501', message: 'update_negado', times: 1 };
    d.edit<Appointment>('appointments', 'A1', a => ({ ...a, reason: 'Revisão' }));
    await d.push();
    expect(d.get<Appointment>('appointments', 'A1')!.reason).toBeUndefined();
    expect(d.rejections).toEqual([{ collection: 'appointments', id: 'A1', reason: 'denied', detail: 'update_negado' }]);
    expect(d.recovery).toHaveLength(1);
    expect((d.recovery[0].value as Appointment).reason).toBe('Revisão');
    expect(d.engine.getStatus().pending).toBe(0);
    // Não reenvia a mudança proibida.
    const calls = server.pushCalls;
    await d.push();
    expect(server.pushCalls).toBe(calls);
  });

  it('failed (erro de dados): idem; registro novo some da tela', async () => {
    const d = await synced(dono);
    server.forceDeny = { table: 'clients', code: '23502', message: 'null value', times: 1 };
    d.add<Client>('clients', { id: 'C8', name: 'X', phone: '1', vehicles: [] });
    await d.push();
    expect(d.get('clients', 'C8')).toBeUndefined();
    expect(d.rejections[0]).toMatchObject({ id: 'C8', reason: 'failed' });
    expect(d.recovery).toHaveLength(1);
  });

  it('mudança remota em campo que o mecânico não edita chega a ele (pull só da linha principal)', async () => {
    const m = await synced(mecanico);
    server.poke('work_orders', 'W1', { ...server.data<object>('work_orders', 'W1'), vehicle: 'Servidor' });
    await m.pull();
    expect(m.get<WorkOrder>('workOrders', 'W1')!.vehicle).toBe('Servidor');
  });
});

describe('retentativa com backoff (relógio falso)', () => {
  it('erro transitório do servidor: 2 s, depois 4 s', async () => {
    const d = await synced(dono);
    server.forceDeny = { table: 'clients', code: '40001', message: 'serialization_failure', times: 2 };
    d.edit<Client>('clients', 'C1', c => ({ ...c, name: 'Retry' }));
    await d.push();
    expect(server.pushCalls).toBe(1);
    expect(d.engine.getStatus()).toMatchObject({ pending: 1 });
    clock.advance(1999);
    await d.engine.settled();
    expect(server.pushCalls).toBe(1);
    clock.advance(1);
    await d.engine.settled();
    expect(server.pushCalls).toBe(2); // 2ª tentativa falha de novo
    clock.advance(3999);
    await d.engine.settled();
    expect(server.pushCalls).toBe(2);
    clock.advance(1);
    await d.engine.settled();
    expect(server.pushCalls).toBe(3); // 3ª passa
    expect(server.data<Client>('clients', 'C1').name).toBe('Retry');
    expect(d.engine.getStatus()).toMatchObject({ pending: 0, syncState: 'salvo' });
  });

  it('falha de rede: espera fixa de 5 s e não conta tentativa', async () => {
    const d = await synced(dono);
    server.failPush = 3;
    d.edit<Client>('clients', 'C1', c => ({ ...c, name: 'Rede' }));
    await d.push();
    expect(d.engine.getStatus()).toMatchObject({ pending: 1, syncState: 'erro' });
    for (let i = 0; i < 2; i++) {
      clock.advance(4999);
      await d.engine.settled();
      const calls = server.pushCalls;
      clock.advance(1);
      await d.engine.settled();
      expect(server.pushCalls).toBe(calls + 1);
    }
    clock.advance(5000);
    await d.engine.settled();
    expect(server.data<Client>('clients', 'C1').name).toBe('Rede');
    expect(d.engine.getStatus().syncState).toBe('salvo');
  });
});

describe('selo (estado exposto)', () => {
  it('assinatura recebe as mudanças: enviando, salvo, offline', async () => {
    const d = await synced(dono);
    const seen: string[] = [];
    d.engine.subscribeStatus(s => seen.push(`${s.syncState}:${s.pending}`));
    d.edit<Client>('clients', 'C1', c => ({ ...c, name: 'Selo' }));
    await d.push();
    d.goOffline();
    expect(seen[0]).toBe('enviando:1');
    expect(seen).toContain('salvo:0');
    expect(seen[seen.length - 1]).toBe('offline:0');
  });

  it('o debounce de 300 ms dispara o envio sozinho', async () => {
    const d = await synced(dono);
    d.edit<Client>('clients', 'C1', c => ({ ...c, name: 'Auto' }));
    clock.advance(299);
    await d.engine.settled();
    expect(server.data<Client>('clients', 'C1').name).toBe('Ana');
    clock.advance(1);
    await d.engine.settled();
    expect(server.data<Client>('clients', 'C1').name).toBe('Auto');
  });

  it('falha ao gravar o cache aparece como erro e se recupera', async () => {
    const store = createMemoryStore();
    const d = await Device.create('dono', 'dono', server, clock, { store });
    await d.sync();
    store.failNext = 1;
    d.edit<Client>('clients', 'C1', c => ({ ...c, name: 'Disco' }));
    await d.engine.settled();
    expect(d.engine.getStatus().syncState).toBe('erro');
    d.edit<Client>('clients', 'C1', c => ({ ...c, name: 'Disco 2' }));
    await d.push();
    expect(d.engine.getStatus().syncState).toBe('salvo');
  });
});

describe('construção direta', () => {
  it('open() em oficina vazia devolve listas vazias e settings null', async () => {
    const e = new SyncEngine({
      transport: server.transport('dono'), store: createMemoryStore(), workshopId: 'ws', actor: 'u', deviceId: 'd', role: 'dono',
      now: clock.now, newId: () => 'x', timers: clock.timersApi,
    });
    const s = await e.open();
    expect(s.workOrders).toEqual([]);
    expect(s.settings).toBeNull();
  });
});

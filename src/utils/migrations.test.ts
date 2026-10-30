import { describe, it, expect } from 'vitest';
import { CURRENT_SCHEMA_VERSION, migrate, v1ToV2, v2ToV3, v3ToV4, v4ToV5, countUnresolvedLinks } from './migrations';
import { diffLocalChanges } from './conflictDiff';
import type { DatabaseSchema } from '../types';

// Fixtures sintéticas (nada do banco real).
// Bancos antigos não têm `appointments` (schema v3): o literal é tipado sem ele e convertido aqui.
const legacy = (d: Omit<DatabaseSchema, 'appointments' | 'auditLog'>): DatabaseSchema => d as DatabaseSchema;

const v0 = (): DatabaseSchema => legacy({
  ledger: [
    { id: 'L1', description: 'Entrada OS 1', amount: 10000, type: 'CREDIT', effectiveDate: '2025-01-10', createdAt: '2025-01-10' },
    { id: 'L2', description: 'Entrada sem OS', amount: 500, type: 'CREDIT', effectiveDate: '2025-01-11', createdAt: '2025-01-11' },
    { id: 'L3', description: 'Despesa', amount: 300, type: 'DEBIT', effectiveDate: '2025-01-12', createdAt: '2025-01-12' },
  ],
  workOrders: [
    { id: 'W1', osNumber: 1, status: 'FINALIZADO', createdAt: '2025-01-10', financialId: 'L1' },
    { id: 'W2', osNumber: 2, status: 'FINALIZADO', createdAt: '2025-01-11', paymentDate: '2025-01-20' },
    { id: 'W3', osNumber: 3, status: 'EM_ANDAMENTO', createdAt: '2025-01-12' },
  ] as any,
  clients: [{ id: 'C1', name: 'Fulano' }] as any,
  catalogParts: [],
  catalogServices: [],
  catalogTechnicians: [{ id: 'T1', name: 'Ana' }],
  settings: { name: 'OFICINA', cnpj: '', address: '', exportPath: '', googleDriveToken: 'tok', googleApiKey: 'key', technician: 'Beto' } as any,
});

describe('migrate v0 -> v3', () => {
  it('aplica as três migrações e marca a versão', () => {
    const input = v0();
    const { db, from, changed } = migrate(input);
    expect(from).toBe(0);
    expect(changed).toBe(true);
    expect(db.meta?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

    // (a) OS finalizada sem paymentDate = createdAt; as demais ficam como estavam
    expect(db.workOrders[0].paymentDate).toBe('2025-01-10');
    expect(db.workOrders[1].paymentDate).toBe('2025-01-20');
    expect(db.workOrders[2].paymentDate).toBeUndefined();

    // (b) lançamento CREDIT herda paymentDate da OS vinculada; sem OS vinculada ou DEBIT não mudam
    expect(db.ledger[0].paymentDate).toBe('2025-01-10');
    expect(db.ledger[1].paymentDate).toBeUndefined();
    expect(db.ledger[2].paymentDate).toBeUndefined();

    // (c) técnico legado vai para o catálogo e sai de settings; tokens do Drive permanecem (passo 7)
    expect(db.catalogTechnicians.map(t => t.name)).toEqual(['Ana', 'Beto']);
    expect((db.settings as any).technician).toBeUndefined();
    expect(db.settings.googleDriveToken).toBe('tok');
    expect(db.settings.googleApiKey).toBe('key');
  });

  it('não repete técnico que já existe no catálogo (sem diferenciar maiúsculas)', () => {
    const input = v0();
    (input.settings as any).technician = '  ana ';
    expect(migrate(input).db.catalogTechnicians).toHaveLength(1);
  });

  it('é pura: não altera a entrada', () => {
    const input = v0();
    const antes = JSON.stringify(input);
    migrate(input);
    expect(JSON.stringify(input)).toBe(antes);
  });

  it('é idempotente: migrar de novo não muda nada', () => {
    const primeira = migrate(v0());
    const segunda = migrate(primeira.db);
    expect(segunda.changed).toBe(false);
    expect(segunda.from).toBe(CURRENT_SCHEMA_VERSION);
    expect(JSON.stringify(segunda.db)).toBe(JSON.stringify(primeira.db));
  });

  it('banco v0 vazio só ganha a versão', () => {
    const vazio: DatabaseSchema = legacy({ ledger: [], workOrders: [], clients: [], catalogParts: [], catalogServices: [], catalogTechnicians: [], settings: { name: 'X' } as any });
    const r = migrate(vazio);
    expect(r.changed).toBe(true);
    expect(r.db.ledger).toEqual([]);
    expect(r.db.meta?.schemaVersion).toBe(5);
    expect(r.db.appointments).toEqual([]);
    expect(r.db.auditLog).toEqual([]);
  });

  it('preserva o meta existente (revision/history) ao subir a versão', () => {
    const input = v0();
    input.meta = { schemaVersion: 0, revision: 'r1', history: ['r0'], savedAt: 't', savedBy: 'PC' };
    const { db } = migrate(input);
    expect(db.meta).toEqual({ schemaVersion: 5, revision: 'r1', history: ['r0'], savedAt: 't', savedBy: 'PC' });
  });
});

describe('migrate com versão futura', () => {
  it('devolve o banco intacto e sem changed', () => {
    const futuro: DatabaseSchema = { ...v0(), meta: { schemaVersion: CURRENT_SCHEMA_VERSION + 1, revision: 'r', history: [], savedAt: 't', savedBy: 'PC' } };
    const antes = JSON.stringify(futuro);
    const r = migrate(futuro);
    expect(r.changed).toBe(false);
    expect(r.from).toBe(CURRENT_SCHEMA_VERSION + 1);
    expect(r.db).toBe(futuro);
    expect(JSON.stringify(r.db)).toBe(antes);
    expect((r.db.settings as any).technician).toBe('Beto');
  });
});

describe('diffLocalChanges', () => {
  it('lista o que mudou desde a base', () => {
    const base = v0();
    const atual = v0();
    atual.workOrders[2] = { ...atual.workOrders[2], status: 'FINALIZADO' } as any;
    atual.ledger.push({ id: 'L9', description: 'Nova', amount: 1, type: 'DEBIT', effectiveDate: 'x', createdAt: 'x' });
    atual.clients = [];
    const r = diffLocalChanges(JSON.stringify(base), atual).map(c => `${c.kind}:${c.group}:${c.id}`);
    expect(r).toEqual(['alterado:OS:W3', 'novo:Lançamento:L9', 'removido:Cliente:C1']);
  });

  it('sem base ou base ilegível devolve lista vazia', () => {
    expect(diffLocalChanges(null, v0())).toEqual([]);
    expect(diffLocalChanges('{nao-json', v0())).toEqual([]);
  });
});

// ---- v1 -> v2 (função pura, registrada em STEPS) ----
const vazioV1 = (): DatabaseSchema => legacy({ ledger: [], workOrders: [], clients: [], catalogParts: [], catalogServices: [], catalogTechnicians: [], settings: { name: 'X' } as any });
const mkOS = (over: Record<string, unknown> = {}) => ({
  id: 'W', osNumber: 1, vehicle: 'Gol - AAA-1111', clientName: 'Maria', clientPhone: '', mileage: 0,
  status: 'ORCAMENTO', parts: [], services: [], total: 0, createdAt: '2025-01-01', ...over,
});
const dbV1 = (over: Partial<DatabaseSchema> = {}): DatabaseSchema => ({
  ...vazioV1(),
  ledger: [{ id: 'L1', description: 'Entrada OS 1 - Maria', amount: 100, type: 'CREDIT', effectiveDate: '2025-01-01', createdAt: '2025-01-01' }],
  clients: [{ id: 'C1', name: 'Maria', phone: '(11) 9', vehicles: [{ model: 'Gol', plate: 'AAA1111' }, { model: 'Uno', plate: '' }] }],
  catalogParts: [{ id: 'P1', description: 'Filtro', price: 1 }, { id: 'P2', description: 'Vela', price: 1 }, { id: 'P3', description: 'vela', price: 1 }],
  catalogServices: [{ id: 'S1', description: 'Troca de óleo', price: 1 }],
  catalogTechnicians: [{ id: 'T1', name: 'Ana' }],
  workOrders: [mkOS()] as any,
  ...over,
});
const os0 = (db: DatabaseSchema) => db.workOrders[0];

describe('v1ToV2: veículos do cliente', () => {
  it('veículo sem id recebe `${cliente}:v${índice}`; com id mantém', () => {
    const db = dbV1();
    db.clients[0].vehicles[1].id = 'meu-id';
    const r = v1ToV2(db);
    expect(r.clients[0].vehicles.map(v => v.id)).toEqual(['C1:v0', 'meu-id']);
  });
});

describe('v1ToV2: cliente da OS', () => {
  it('cliente único com caixa e espaços diferentes', () => {
    const r = v1ToV2(dbV1({ workOrders: [mkOS({ clientName: '  MARIA ' })] as any }));
    expect(os0(r).clientId).toBe('C1');
    expect(os0(r).clientName).toBe('  MARIA ');
  });
  it('cliente inexistente: sem id e texto intacto', () => {
    const r = v1ToV2(dbV1({ workOrders: [mkOS({ clientName: 'Fantasma' })] as any }));
    expect(os0(r).clientId).toBeUndefined();
    expect('clientId' in os0(r)).toBe(false);
    expect(os0(r).clientName).toBe('Fantasma');
  });
  const homonimos = (): DatabaseSchema => dbV1({
    clients: [
      { id: 'A', name: 'Ana', phone: '(11) 90000-0001', vehicles: [{ model: 'Gol', plate: 'AAA1111' }] },
      { id: 'B', name: 'ana', phone: '(11) 90000-0002', vehicles: [{ model: 'Uno', plate: 'BBB2222' }] },
    ],
  });
  it('homônimos desempatados pela placa', () => {
    const db = homonimos();
    db.workOrders = [mkOS({ clientName: 'Ana', vehicle: 'Uno - BBB-2222' })] as any;
    const r = v1ToV2(db);
    expect(os0(r).clientId).toBe('B');
    expect(os0(r).vehicleId).toBe('B:v0');
  });
  it('homônimos desempatados pelo telefone', () => {
    const db = homonimos();
    db.workOrders = [mkOS({ clientName: 'Ana', vehicle: 'Fusca', clientPhone: '11 90000-0001' })] as any;
    expect(os0(v1ToV2(db)).clientId).toBe('A');
  });
  it('homônimos empatados: sem id', () => {
    const db = homonimos();
    db.workOrders = [mkOS({ clientName: 'Ana', vehicle: 'Fusca' })] as any;
    const r = v1ToV2(db);
    expect(os0(r).clientId).toBeUndefined();
    expect(os0(r).vehicleId).toBeUndefined();
  });
});

describe('v1ToV2: veículo da OS', () => {
  it('casa pela placa; sem placa, pelo modelo', () => {
    const r = v1ToV2(dbV1({ workOrders: [mkOS(), mkOS({ id: 'W2', vehicle: 'uno' })] as any }));
    expect(r.workOrders[0].vehicleId).toBe('C1:v0');
    expect(r.workOrders[1].vehicleId).toBe('C1:v1');
  });
  it('veículo que não casa: sem id e sem acrescentar veículo ao cliente', () => {
    const r = v1ToV2(dbV1({ workOrders: [mkOS({ vehicle: 'Fusca - ZZZ-9999' })] as any }));
    expect(os0(r).vehicleId).toBeUndefined();
    expect(r.clients[0].vehicles).toHaveLength(2);
  });
  it('duplicado idêntico liga ao primeiro; duplicado diferente não liga', () => {
    const ident = dbV1();
    ident.clients[0].vehicles = [{ model: 'Gol', plate: 'AAA1111' }, { model: 'gol', plate: 'aaa-1111' }];
    expect(os0(v1ToV2(ident)).vehicleId).toBe('C1:v0');
    const dif = dbV1();
    dif.clients[0].vehicles = [{ model: 'Gol', plate: 'AAA1111' }, { model: 'Palio', plate: 'AAA1111' }];
    expect(os0(v1ToV2(dif)).vehicleId).toBeUndefined();
  });
});

describe('v1ToV2: itens e técnico', () => {
  it('item único liga; fora do catálogo e duplicado no catálogo ficam sem id', () => {
    const item = (id: string, description: string) => ({ id, description, price: 1 });
    const r = v1ToV2(dbV1({
      workOrders: [mkOS({
        parts: [item('i1', ' FILTRO '), item('i2', 'Peça avulsa'), item('i3', 'Vela')],
        services: [item('i4', 'Troca de óleo')],
        technician: 'ana',
      })] as any,
    }));
    const o = os0(r);
    expect(o.parts.map(p => p.catalogItemId)).toEqual(['P1', undefined, undefined]);
    expect(o.services[0].catalogItemId).toBe('S1');
    expect(o.technicianId).toBe('T1');
    expect(o.parts[0].description).toBe(' FILTRO ');
  });
  it('técnico ausente ou desconhecido: sem id', () => {
    const r = v1ToV2(dbV1({ workOrders: [mkOS(), mkOS({ id: 'W2', technician: 'Zeca' })] as any }));
    expect(r.workOrders[0].technicianId).toBeUndefined();
    expect(r.workOrders[1].technicianId).toBeUndefined();
  });
  it('técnico duplicado no catálogo: sem id', () => {
    const r = v1ToV2(dbV1({ catalogTechnicians: [{ id: 'T1', name: 'Ana' }, { id: 'T2', name: 'ANA' }], workOrders: [mkOS({ technician: 'Ana' })] as any }));
    expect(os0(r).technicianId).toBeUndefined();
  });
});

describe('v1ToV2: ids existentes', () => {
  it('ids válidos preexistentes são mantidos', () => {
    const db = dbV1();
    db.clients[0].vehicles[0].id = 'VX';
    db.workOrders = [mkOS({ clientId: 'C1', vehicleId: 'VX', technicianId: 'T1', technician: 'Ana', parts: [{ id: 'i', description: 'Filtro', price: 1, catalogItemId: 'P1' }] })] as any;
    const r = v1ToV2(db);
    expect(os0(r)).toEqual(db.workOrders[0]);
  });
  it('ids pendurados são refeitos', () => {
    const db = dbV1();
    db.workOrders = [mkOS({
      clientId: 'MORTO', vehicleId: 'MORTO', technicianId: 'MORTO', technician: 'Ana',
      parts: [{ id: 'i', description: 'Filtro', price: 1, catalogItemId: 'MORTO' }],
    })] as any;
    const o = os0(v1ToV2(db));
    expect(o.clientId).toBe('C1');
    expect(o.vehicleId).toBe('C1:v0');
    expect(o.technicianId).toBe('T1');
    expect(o.parts[0].catalogItemId).toBe('P1');
  });
  it('id pendurado sem solução é removido', () => {
    const db = dbV1({ workOrders: [mkOS({ clientName: 'Fantasma', clientId: 'MORTO', vehicleId: 'MORTO' })] as any });
    const o = os0(v1ToV2(db));
    expect('clientId' in o).toBe(false);
    expect('vehicleId' in o).toBe(false);
  });
  it('clientId válido mas com nome que não confere é refeito pelo nome', () => {
    const db = dbV1({
      clients: [{ id: 'C1', name: 'Maria', phone: '', vehicles: [] }, { id: 'C2', name: 'Joana', phone: '', vehicles: [] }],
      workOrders: [mkOS({ clientId: 'C1', clientName: 'Joana', vehicle: 'Gol' })] as any,
    });
    expect(os0(v1ToV2(db)).clientId).toBe('C2');
  });
});

describe('v1ToV2: propriedades', () => {
  const rico = () => dbV1({
    workOrders: [mkOS({ technician: 'Ana', parts: [{ id: 'i', description: 'Filtro', price: 1 }] }), mkOS({ id: 'W2', clientName: 'Fantasma' })] as any,
  });
  it('é idempotente', () => {
    const uma = v1ToV2(rico());
    expect(v1ToV2(uma)).toEqual(uma);
  });
  it('é determinística', () => {
    expect(v1ToV2(rico())).toEqual(v1ToV2(rico()));
  });
  it('é pura: não altera a entrada', () => {
    const input = rico();
    const antes = JSON.stringify(input);
    v1ToV2(input);
    expect(JSON.stringify(input)).toBe(antes);
  });
  it('não altera nenhum texto nem o ledger', () => {
    const input = rico();
    const r = v1ToV2(input);
    expect(r.ledger).toEqual(input.ledger);
    expect(r.settings).toEqual(input.settings);
    expect(r.catalogParts).toEqual(input.catalogParts);
    r.workOrders.forEach((o, i) => {
      const a = input.workOrders[i];
      expect([o.vehicle, o.clientName, o.clientPhone, o.technician]).toEqual([a.vehicle, a.clientName, a.clientPhone, a.technician]);
      expect(o.parts.map(p => p.description)).toEqual(a.parts.map(p => p.description));
    });
    r.clients.forEach((c, i) => {
      expect([c.name, c.phone]).toEqual([input.clients[i].name, input.clients[i].phone]);
      expect(c.vehicles.map(v => [v.model, v.plate])).toEqual(input.clients[i].vehicles.map(v => [v.model, v.plate]));
    });
  });
  it('banco vazio', () => {
    expect(v1ToV2(vazioV1())).toEqual(vazioV1());
    expect(countUnresolvedLinks(vazioV1())).toEqual({ osSemCliente: 0, osSemVeiculo: 0, itensSemCatalogo: 0, osSemTecnico: 0 });
  });
});

describe('countUnresolvedLinks', () => {
  it('conta o que ficou sem vínculo válido', () => {
    const item = (id: string, description: string) => ({ id, description, price: 1 });
    const db = dbV1({
      workOrders: [
        mkOS({ technician: 'Ana', parts: [item('a', 'Filtro'), item('b', 'Avulsa')] }),
        mkOS({ id: 'W2', clientName: 'Fantasma', technician: 'Zeca' }),
        mkOS({ id: 'W3' }),
      ] as any,
    });
    expect(countUnresolvedLinks(db)).toEqual({ osSemCliente: 3, osSemVeiculo: 3, itensSemCatalogo: 2, osSemTecnico: 2 });
    expect(countUnresolvedLinks(v1ToV2(db))).toEqual({ osSemCliente: 1, osSemVeiculo: 1, itensSemCatalogo: 1, osSemTecnico: 1 });
  });
});

describe('pipeline completo (schema 5)', () => {
  const meta = (v: number) => ({ schemaVersion: v, revision: 'r', history: [], savedAt: '', savedBy: '' });

  it('CURRENT_SCHEMA_VERSION é 5', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(5);
  });
  it('v0 -> v5 aplica todos os passos', () => {
    const r = migrate(v0());
    expect(r.from).toBe(0);
    expect(r.changed).toBe(true);
    expect(r.db.meta?.schemaVersion).toBe(5);
    expect(r.db.auditLog).toEqual([]);
    expect(r.db.appointments).toEqual([]);
    expect(r.db.workOrders[0].paymentDate).toBe('2025-01-10'); // v0ToV1
    expect(r.db.catalogTechnicians.map(t => t.name)).toEqual(['Ana', 'Beto']); // v0ToV1
    expect(r.db.clients[0].id).toBe('C1');
    // v1ToV2 rodou: nenhum veículo/OS perdeu nada e o técnico legado continua sem OS ligada
    expect(countUnresolvedLinks(r.db).osSemCliente).toBe(3);
  });
  it('v0 com dados ligáveis recebe ids de v1ToV2', () => {
    const base = dbV1();
    const r = migrate(base);
    expect(r.from).toBe(0);
    expect(os0(r.db).clientId).toBe('C1');
    expect(r.db.clients[0].vehicles[0].id).toBe('C1:v0');
  });
  it('v1 -> v5 liga ids, acrescenta appointments e sobe a versão', () => {
    const r = migrate({ ...dbV1(), meta: meta(1) });
    expect(r.from).toBe(1);
    expect(r.changed).toBe(true);
    expect(r.db.meta?.schemaVersion).toBe(5);
    expect(r.db.auditLog).toEqual([]);
    expect(r.db.appointments).toEqual([]);
    expect(os0(r.db).clientId).toBe('C1');
    expect(os0(r.db).vehicleId).toBe('C1:v0');
    expect(r.db.clients[0].vehicles[0].id).toBe('C1:v0');
    expect(r.db.ledger).toEqual(dbV1().ledger);
    expect(os0(r.db).clientName).toBe('Maria');
  });
  it('v2 -> v5: só acrescenta auditLog e sobe a versão; o resto fica idêntico', () => {
    const v2 = { ...v1ToV2(dbV1()), meta: meta(2) };
    const antes = JSON.stringify(v2);
    const r = migrate(v2);
    expect(r.changed).toBe(true);
    expect(r.from).toBe(2);
    expect(r.db.meta).toEqual(meta(5));
    expect(r.db.appointments).toEqual([]);
    expect(r.db.auditLog).toEqual([]);
    const { appointments: _a, auditLog: _l, meta: _m, ...resto } = r.db;
    const { meta: _m2, ...restoAntes } = v2;
    expect(resto).toEqual(restoAntes);
    expect(JSON.stringify(v2)).toBe(antes); // pura
  });
  it('v3 -> v5 só acrescenta auditLog e sobe a versão', () => {
    const v3 = { ...v2ToV3(v1ToV2(dbV1())), meta: meta(3) };
    const r = migrate(v3);
    expect(r.changed).toBe(true);
    expect(r.from).toBe(3);
    expect(r.db.meta).toEqual(meta(5));
    expect(r.db.auditLog).toEqual([]);
    const { auditLog: _l, meta: _m, ...resto } = r.db;
    const { meta: _m3, ...restoAntes } = v3;
    expect(resto).toEqual(restoAntes);
  });
  it('v4 -> v5: só sobe a versão; dados idênticos', () => {
    const v4 = { ...v3ToV4(v2ToV3(v1ToV2(dbV1()))), meta: meta(4) };
    const antes = JSON.stringify(v4);
    const r = migrate(v4);
    expect(r.changed).toBe(true);
    expect(r.from).toBe(4);
    expect(r.db.meta).toEqual(meta(5));
    const { meta: _m, ...resto } = r.db;
    const { meta: _m4, ...restoAntes } = v4;
    expect(resto).toEqual(restoAntes);
    expect(JSON.stringify(v4)).toBe(antes); // pura
  });
  it('v5 volta inalterado, inclusive com photos', () => {
    const base = v3ToV4(v2ToV3(v1ToV2(dbV1())));
    const v5 = {
      ...base,
      workOrders: base.workOrders.map((o, i) => (i === 0 ? { ...o, photos: [{ id: 'p1', createdAt: '2026-03-01T15:00:00.000Z', caption: 'Para-choque' }] } : o)),
      meta: meta(5),
    };
    const antes = JSON.stringify(v5);
    const r = migrate(v5);
    expect(r.changed).toBe(false);
    expect(r.from).toBe(5);
    expect(r.db).toBe(v5);
    expect(JSON.stringify(r.db)).toBe(antes);
    expect(r.db.workOrders[0].photos).toHaveLength(1);
  });
  it('v4ToV5 é idempotente e migrate duas vezes dá o mesmo', () => {
    const v4 = { ...v3ToV4(v2ToV3(v1ToV2(dbV1()))), meta: meta(4) };
    expect(v4ToV5(v4)).toBe(v4);
    const a = migrate(v4);
    expect(migrate(a.db).db).toEqual(a.db);
  });
  it('versão futura (6) fica intacta', () => {
    const fut = { ...dbV1(), meta: meta(6) };
    const antes = JSON.stringify(fut);
    const r = migrate(fut);
    expect(r.changed).toBe(false);
    expect(r.from).toBe(6);
    expect(r.db).toBe(fut);
    expect(JSON.stringify(r.db)).toBe(antes);
    expect(os0(r.db).clientId).toBeUndefined();
  });
  it('é idempotente: migrate(migrate(x)) == migrate(x)', () => {
    const a = migrate({ ...dbV1(), meta: meta(1) });
    const b = migrate(a.db);
    expect(b.changed).toBe(false);
    expect(b.db).toEqual(a.db);
    const c = migrate(v0());
    expect(migrate(c.db).db).toEqual(c.db);
  });
});

describe('diffLocalChanges: agendamentos', () => {
  const ap = { id: 'A1', date: 'x', clientName: 'Maria', vehicle: 'Gol', status: 'AGENDADO' as const, createdAt: 'x' };
  it('lista novo, alterado e removido; base antiga sem a coleção não quebra', () => {
    const base = { ...v0(), appointments: [ap, { ...ap, id: 'A2' }] };
    const atual = { ...v0(), appointments: [{ ...ap, status: 'FALTOU' as const }, { ...ap, id: 'A3' }] };
    const r = diffLocalChanges(JSON.stringify(base), atual).map(c => `${c.kind}:${c.group}:${c.id}`);
    expect(r).toEqual(['alterado:Agendamento:A1', 'novo:Agendamento:A3', 'removido:Agendamento:A2']);
    expect(diffLocalChanges(JSON.stringify(v0()), { ...v0(), appointments: [ap] }).map(c => c.kind)).toEqual(['novo']);
  });
});

describe('diffLocalChanges: fotos', () => {
  it('foto acrescentada, removida ou com legenda nova marca a OS como alterada', () => {
    const base = v0();
    const baseJson = JSON.stringify(base);
    const foto = { id: 'p1', createdAt: '2026-03-01T15:00:00.000Z' };
    const comFoto = { ...base, workOrders: base.workOrders.map((o, i) => (i === 0 ? { ...o, photos: [foto] } : o)) };
    const r = diffLocalChanges(baseJson, comFoto).map(c => `${c.kind}:${c.group}:${c.id}`);
    expect(r).toEqual(['alterado:OS:W1']);
    const legenda = { ...comFoto, workOrders: comFoto.workOrders.map((o, i) => (i === 0 ? { ...o, photos: [{ ...foto, caption: 'x' }] } : o)) };
    expect(diffLocalChanges(JSON.stringify(comFoto), legenda).map(c => c.kind)).toEqual(['alterado']);
    expect(diffLocalChanges(JSON.stringify(comFoto), base).map(c => c.kind)).toEqual(['alterado']);
  });
});

describe('v2ToV3', () => {
  it('acrescenta appointments vazio quando ausente', () => {
    const r = v2ToV3(dbV1());
    expect(r.appointments).toEqual([]);
  });
  it('mantém a lista existente (mesmo objeto) e é idempotente', () => {
    const ap = { id: 'A1', date: '2026-03-10T15:00:00.000Z', clientName: 'Maria', vehicle: 'Gol', status: 'AGENDADO' as const, createdAt: '2026-03-01T15:00:00.000Z' };
    const db = { ...dbV1(), appointments: [ap] };
    expect(v2ToV3(db)).toBe(db);
    const uma = v2ToV3(dbV1());
    expect(v2ToV3(uma)).toBe(uma);
  });
  it('não altera mais nada nem a entrada', () => {
    const input = dbV1();
    const antes = JSON.stringify(input);
    const r = v2ToV3(input);
    expect(JSON.stringify(input)).toBe(antes);
    const { appointments: _a, ...resto } = r;
    expect(resto).toEqual(input);
  });
});


// ---- v3 -> v4: adiantamentos com data (fixtures sintéticas) ----
describe('v3ToV4', () => {
  const noon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).toISOString();
  const v3db = (over: Record<string, unknown> = {}): DatabaseSchema => ({
    ...v2ToV3(v1ToV2(dbV1())),
    meta: { schemaVersion: 3, revision: 'r', history: [], savedAt: '', savedBy: '' },
    ...over,
  } as DatabaseSchema);
  const adv = (id: string, effectiveDate: string) =>
    ({ id, description: 'Adiantamento OS #1 - Maria', amount: 3000, type: 'CREDIT' as const, effectiveDate, createdAt: effectiveDate, paymentDate: effectiveDate });
  const osAdv = (over: Record<string, unknown> = {}) =>
    mkOS({ id: 'WA', total: 10000, advanceAmount: 3000, advanceEntryId: 'EA', createdAt: '2026-01-05T15:00:00.000Z', ...over });
  const getOS = (db: DatabaseSchema, id: string) => db.workOrders.find(o => o.id === id)!;
  const remaining = (os: DatabaseSchema['workOrders'][number]) =>
    os.advances ? Math.max(os.total - os.advances.reduce((a, x) => a + x.amount, 0), 0)
      : os.advanceEntryId ? Math.max(os.total - (os.advanceAmount || 0), 0) : os.total;

  it('OS com lançamento ligado: advances com a data do lançamento, sem os campos antigos', () => {
    const db = v3db({ workOrders: [osAdv()], ledger: [adv('EA', noon(2026, 2, 10))] });
    const out = v3ToV4(db);
    const o = getOS(out, 'WA');
    expect(o.advances).toEqual([{ id: 'WA:a0', amount: 3000, entryId: 'EA', date: noon(2026, 2, 10) }]);
    expect('advanceAmount' in o).toBe(false);
    expect('advanceEntryId' in o).toBe(false);
    expect(out.auditLog).toEqual([]);
  });
  it('data só-dia do lançamento vira meio-dia local do mesmo dia', () => {
    const db = v3db({ workOrders: [osAdv()], ledger: [adv('EA', '2026-02-10')] });
    expect(getOS(v3ToV4(db), 'WA').advances![0].date).toBe(noon(2026, 2, 10));
  });
  it('advanceEntryId para lançamento inexistente: usa o dia do createdAt da OS', () => {
    const out = v3ToV4(v3db({ workOrders: [osAdv({ createdAt: noon(2026, 1, 5) })], ledger: [] }));
    expect(getOS(out, 'WA').advances).toEqual([{ id: 'WA:a0', amount: 3000, entryId: 'EA', date: noon(2026, 1, 5) }]);
  });
  it('só advanceAmount antigo (sem advanceEntryId): fica como está', () => {
    const o = mkOS({ id: 'WL', total: 10000, advanceAmount: 3000 });
    const out = v3ToV4(v3db({ workOrders: [o] }));
    expect(getOS(out, 'WL')).toBe(o);
  });
  it('OS finalizada com adiantamento também converte', () => {
    const out = v3ToV4(v3db({
      workOrders: [osAdv({ status: 'FINALIZADO', financialId: 'EF' })],
      ledger: [adv('EA', noon(2026, 2, 10))],
    }));
    const o = getOS(out, 'WA');
    expect(o.status).toBe('FINALIZADO');
    expect(o.financialId).toBe('EF');
    expect(o.advances).toHaveLength(1);
  });
  it('OS que já tem advances fica intocada (mesmo objeto)', () => {
    const o = mkOS({ id: 'WN', total: 5000, advances: [{ id: 'x', amount: 100, entryId: 'e', date: noon(2026, 1, 1) }], advanceAmount: 999, advanceEntryId: 'zz' });
    const out = v3ToV4(v3db({ workOrders: [o] }));
    expect(getOS(out, 'WN')).toBe(o);
  });
  it('banco sem auditLog ganha []; auditLog existente é mantido', () => {
    expect(v3ToV4(v3db()).auditLog).toEqual([]);
    const db = v3db({ auditLog: [] });
    expect(v3ToV4(db)).toBe(db);
    const log = [{ id: 'e', at: 'x', machine: 'PC', action: 'ADIANTAMENTO_CRIADO', osId: 'o', osNumber: 1, advanceId: 'a' }];
    expect(v3ToV4(v3db({ auditLog: log })).auditLog).toBe(log);
  });
  it('restante a receber igual antes/depois; ledger igual em profundidade; entrada não mutada; idempotente', () => {
    const ledger = [adv('EA', noon(2026, 2, 10)), adv('EB', noon(2026, 3, 1))];
    const wos = [
      osAdv(),
      mkOS({ id: 'WB', total: 8000, advanceAmount: 8000, advanceEntryId: 'EB', status: 'FINALIZADO' }),
      mkOS({ id: 'WL', total: 7000, advanceAmount: 1000 }),
      mkOS({ id: 'WC', total: 2000 }),
    ];
    const db = v3db({ workOrders: wos, ledger });
    const antes = JSON.stringify(db);
    const out = v3ToV4(db);
    expect(JSON.stringify(db)).toBe(antes);
    expect(out.ledger).toEqual(JSON.parse(JSON.stringify(ledger)));
    out.workOrders.forEach((o, i) => expect(remaining(o)).toBe(remaining(db.workOrders[i])));
    expect(v3ToV4(out)).toBe(out);
    expect(migrate(migrate(db).db).db).toEqual(migrate(db).db);
  });
  it('v3 -> v4 via migrate sobe a versão e converte', () => {
    const r = migrate(v3db({ workOrders: [osAdv()], ledger: [adv('EA', noon(2026, 2, 10))] }));
    expect(r.from).toBe(3);
    expect(r.db.meta?.schemaVersion).toBe(5);
    expect(getOS(r.db, 'WA').advances).toHaveLength(1);
  });
  it('v0, v1 e v2 chegam à v5 com adiantamento convertido', () => {
    const comAdv = (db: DatabaseSchema, v: number): DatabaseSchema => ({
      ...db,
      workOrders: [...db.workOrders, osAdv()] as DatabaseSchema['workOrders'],
      ledger: [...db.ledger, adv('EA', noon(2026, 2, 10))],
      meta: { schemaVersion: v, revision: 'r', history: [], savedAt: '', savedBy: '' },
    });
    for (const [base, v] of [[dbV1(), 0], [dbV1(), 1], [v1ToV2(dbV1()), 2]] as const) {
      const r = migrate(comAdv(base, v));
      expect(r.db.meta?.schemaVersion).toBe(5);
      expect(getOS(r.db, 'WA').advances).toEqual([{ id: 'WA:a0', amount: 3000, entryId: 'EA', date: noon(2026, 2, 10) }]);
      expect(r.db.auditLog).toEqual([]);
    }
  });
  it('versão futura (6) abre intacta', () => {
    const fut = v3db({ workOrders: [osAdv()], meta: { schemaVersion: 6, revision: 'r', history: [], savedAt: '', savedBy: '' } });
    const r = migrate(fut);
    expect(r.changed).toBe(false);
    expect(r.db).toBe(fut);
  });
});

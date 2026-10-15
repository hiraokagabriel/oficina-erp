import { describe, it, expect } from 'vitest';
import { CURRENT_SCHEMA_VERSION, migrate } from './migrations';
import { diffLocalChanges } from './conflictDiff';
import type { DatabaseSchema } from '../types';

// Fixtures sintéticas (nada do banco real).
const v0 = (): DatabaseSchema => ({
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

describe('migrate v0 -> v1', () => {
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
    const vazio: DatabaseSchema = { ledger: [], workOrders: [], clients: [], catalogParts: [], catalogServices: [], catalogTechnicians: [], settings: { name: 'X' } as any };
    const r = migrate(vazio);
    expect(r.changed).toBe(true);
    expect(r.db.ledger).toEqual([]);
    expect(r.db.meta?.schemaVersion).toBe(1);
  });

  it('preserva o meta existente (revision/history) ao subir a versão', () => {
    const input = v0();
    input.meta = { schemaVersion: 0, revision: 'r1', history: ['r0'], savedAt: 't', savedBy: 'PC' };
    const { db } = migrate(input);
    expect(db.meta).toEqual({ schemaVersion: 1, revision: 'r1', history: ['r0'], savedAt: 't', savedBy: 'PC' });
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

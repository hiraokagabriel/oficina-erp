import { describe, expect, it } from 'vitest';
import { getClientReceivables, getClientSpending } from './receivables';
import { clientGroupKey, osBelongsToClient } from '../utils/links';
import type { Client, LedgerEntry, WorkOrder } from '../types';

// Fixtures sintéticas (nada do banco real).
const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();
const TODAY = new Date(2026, 5, 15, 9);
const FIN = 'FINALIZADO' as WorkOrder['status'];

const e = (id: string, over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id, description: id, amount: 1000, type: 'CREDIT',
  effectiveDate: day(2026, 6, 15), createdAt: day(2026, 1, 1), ...over,
});
const os = (id: string, clientName: string, over: Partial<WorkOrder> = {}): WorkOrder => ({
  id, osNumber: 1, vehicle: 'Gol', clientName, clientPhone: '1', mileage: 0,
  status: 'AGUARDANDO_PAGAMENTO' as WorkOrder['status'], parts: [], services: [], total: 0,
  createdAt: day(2026, 1, 1), ...over,
});
const cli = (id: string, name: string): Client => ({ id, name, phone: '', vehicles: [] });

describe('getClientReceivables por id', () => {
  it('homônimos com clientId têm dívidas separadas', () => {
    const clients = [cli('C1', 'João Silva'), cli('C2', 'João Silva')];
    const works = [
      os('o1', 'João Silva', { clientId: 'C1', financialId: 'f1' }),
      os('o2', 'João Silva', { clientId: 'C2', financialId: 'f2' }),
    ];
    const ledger = [e('f1', { amount: 100 }), e('f2', { amount: 250, dueDate: day(2026, 1, 1) })];
    const { byClient, ranking } = getClientReceivables(works, ledger, TODAY, clients);
    expect(byClient.get('C1')).toEqual({ clientId: 'C1', clientName: 'João Silva', emAberto: 100, atrasado: 0, countAberto: 1, countAtrasado: 0 });
    expect(byClient.get('C2')).toEqual({ clientId: 'C2', clientName: 'João Silva', emAberto: 250, atrasado: 250, countAberto: 1, countAtrasado: 1 });
    expect(ranking.map(r => r.clientId)).toEqual(['C2', 'C1']);
  });
  it('nome único sem clientId resolve para o cliente; o nome do cadastro é o exibido', () => {
    const clients = [cli('C1', 'Maria Souza')];
    const works = [os('o1', ' maria  SOUZA', { financialId: 'f1' })];
    const r = getClientReceivables(works, [e('f1', { amount: 300 })], TODAY, clients);
    expect(r.byClient.get('C1')).toMatchObject({ clientId: 'C1', clientName: 'Maria Souza', emAberto: 300 });
    expect(r.byClient.size).toBe(1);
  });
  it('OS com clientId e OS só com o nome do mesmo cliente somam no mesmo id', () => {
    const clients = [cli('C1', 'Maria')];
    const works = [os('o1', 'Maria', { clientId: 'C1', financialId: 'f1' }), os('o2', 'Maria', { financialId: 'f2' })];
    const r = getClientReceivables(works, [e('f1', { amount: 100 }), e('f2', { amount: 50 })], TODAY, clients);
    expect(r.byClient.get('C1')?.emAberto).toBe(150);
  });
  it('homônimos sem id agrupam em nome:<normalizado>, sem clientId', () => {
    const clients = [cli('C1', 'Pedro'), cli('C2', 'PEDRO')];
    const works = [os('o1', 'Pedro', { financialId: 'f1' }), os('o2', ' pedro ', { financialId: 'f2' })];
    const r = getClientReceivables(works, [e('f1', { amount: 100 }), e('f2', { amount: 200 })], TODAY, clients);
    expect([...r.byClient.keys()]).toEqual(['nome:pedro']);
    const c = r.byClient.get('nome:pedro')!;
    expect(c.emAberto).toBe(300);
    expect(c.clientId).toBeUndefined();
  });
  it('clientId de cliente excluído cai no texto (nome:)', () => {
    const clients = [cli('C9', 'Outro')];
    const works = [os('o1', 'Fulano', { clientId: 'C1', financialId: 'f1' })];
    const r = getClientReceivables(works, [e('f1', { amount: 80 })], TODAY, clients);
    expect(r.byClient.get('nome:fulano')).toMatchObject({ clientName: 'Fulano', emAberto: 80 });
    expect(r.byClient.get('C1')).toBeUndefined();
  });
  it('clientId de cliente excluído, mas nome ainda único no cadastro: resolve pelo nome', () => {
    const clients = [cli('C2', 'Fulano')];
    const works = [os('o1', 'Fulano', { clientId: 'C1', financialId: 'f1' })];
    expect(getClientReceivables(works, [e('f1')], TODAY, clients).byClient.get('C2')?.emAberto).toBe(1000);
  });
  it('OS sem cliente cadastrado agrupa por nome', () => {
    const r = getClientReceivables([os('o1', 'Avulso', { financialId: 'f1' })], [e('f1')], TODAY, [cli('C1', 'Ana')]);
    expect([...r.byClient.keys()]).toEqual(['nome:avulso']);
  });
  it('parcelas em aberto e atrasadas por cliente; as pagas ficam de fora', () => {
    const clients = [cli('C1', 'Ana'), cli('C2', 'Bia')];
    const cfg = { totalAmount: 3000, installments: 3, installmentAmount: 1000, lastInstallmentAmount: 1000, firstPaymentDate: day(2026, 5, 10), groupId: 'g1', description: 'x' };
    const works = [
      os('o1', 'Ana', { clientId: 'C1', financialId: 'p1', installmentConfig: cfg }),
      os('o2', 'Bia', { clientId: 'C2', financialId: 'f2' }),
    ];
    const ledger = [
      e('p1', { dueDate: day(2026, 5, 10), installmentGroupId: 'g1' }),
      e('p2', { dueDate: day(2026, 7, 10), installmentGroupId: 'g1' }),
      e('p3', { dueDate: day(2026, 4, 10), installmentGroupId: 'g1', paymentDate: day(2026, 4, 11) }),
      e('f2', { amount: 400 }),
    ];
    const { byClient } = getClientReceivables(works, ledger, TODAY, clients);
    expect(byClient.get('C1')).toMatchObject({ emAberto: 2000, atrasado: 1000, countAberto: 2, countAtrasado: 1 });
    expect(byClient.get('C2')).toMatchObject({ emAberto: 400, atrasado: 0 });
  });
  it('ranking: maior dívida primeiro, empate por nome', () => {
    const clients = [cli('C1', 'Zé'), cli('C2', 'Ana'), cli('C3', 'Rico')];
    const works = [
      os('o1', 'Zé', { clientId: 'C1', financialId: 'f1' }), os('o2', 'Ana', { clientId: 'C2', financialId: 'f2' }),
      os('o3', 'Rico', { clientId: 'C3', financialId: 'f3' }),
    ];
    const ledger = [e('f1', { amount: 500 }), e('f2', { amount: 500 }), e('f3', { amount: 900 })];
    expect(getClientReceivables(works, ledger, TODAY, clients).ranking.map(c => c.clientName)).toEqual(['Rico', 'Ana', 'Zé']);
  });
  it('ledger vazio', () => {
    const r = getClientReceivables([os('o1', 'Ana')], [], TODAY, [cli('C1', 'Ana')]);
    expect(r.byClient.size).toBe(0);
    expect(r.ranking).toEqual([]);
  });
});

describe('getClientSpending', () => {
  it('soma só FINALIZADAS por id; homônimos com id ficam separados; mantém a última data', () => {
    const clients = [cli('C1', 'João'), cli('C2', 'João')];
    const works = [
      os('a', 'João', { clientId: 'C1', status: FIN, total: 100, createdAt: day(2026, 1, 1) }),
      os('b', 'João', { clientId: 'C1', status: FIN, total: 50, createdAt: day(2026, 3, 1) }),
      os('c', 'João', { clientId: 'C2', status: FIN, total: 70 }),
      os('d', 'João', { clientId: 'C2', total: 999 }), // não finalizada
    ];
    const m = getClientSpending(works, clients);
    expect(m.get('C1')).toEqual({ total: 150, count: 2, lastDate: day(2026, 3, 1) });
    expect(m.get('C2')).toMatchObject({ total: 70, count: 1 });
  });
  it('OS sem cliente resolvível cai em nome:', () => {
    const clients = [cli('C1', 'X'), cli('C2', 'x')];
    const m = getClientSpending([os('a', 'X', { status: FIN, total: 10 })], clients);
    expect(m.get('nome:x')).toMatchObject({ total: 10, count: 1 });
  });
  it('vazio', () => {
    expect(getClientSpending([], []).size).toBe(0);
  });
});

describe('clientGroupKey / osBelongsToClient', () => {
  const clients = [cli('C1', 'Pedro'), cli('C2', 'Pedro'), cli('C3', 'Ana')];
  it('chave é o id quando resolve, nome: quando não', () => {
    expect(clientGroupKey({ clientName: 'Ana' }, clients)).toBe('C3');
    expect(clientGroupKey({ clientName: 'Pedro' }, clients)).toBe('nome:pedro');
    expect(clientGroupKey({ clientName: 'Pedro', clientId: 'C2' }, clients)).toBe('C2');
  });
  it('pertence pelo id; renomear o cliente não perde a OS com clientId', () => {
    const renamed = [cli('C1', 'Pedro Novo'), cli('C2', 'Pedro')];
    expect(osBelongsToClient({ clientName: 'Pedro', clientId: 'C1' }, renamed[0], renamed)).toBe(true);
    expect(osBelongsToClient({ clientName: 'Pedro', clientId: 'C1' }, renamed[1], renamed)).toBe(false);
  });
  it('homônimo de outro id não entra; OS sem resolução usa a reserva pelo texto', () => {
    expect(osBelongsToClient({ clientName: 'Pedro', clientId: 'C2' }, clients[0], clients)).toBe(false);
    expect(osBelongsToClient({ clientName: 'pedro' }, clients[0], clients)).toBe(true);
    expect(osBelongsToClient({ clientName: 'Ana' }, clients[0], clients)).toBe(false);
  });
  it('cliente excluído: a OS não entra no histórico de quem tem outro nome', () => {
    expect(osBelongsToClient({ clientName: 'Zé', clientId: 'GONE' }, clients[2], clients)).toBe(false);
  });
});

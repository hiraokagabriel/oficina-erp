import { describe, it, expect } from 'vitest';
import { updateClientCascading, updateCatalogItemCascading } from './cascadeService';
import type { CatalogItem, Client, LedgerEntry, OrderItem, WorkOrder } from '../types';

// Fixtures sintéticas.
const client = (over: Partial<Client> = {}): Client => ({
  id: 'c1', name: 'Fulano Teste', phone: '11 90000-0000',
  vehicles: [{ model: 'Gol', plate: 'AAA-0001' }], ...over,
});
const item = (id: string, description: string, price = 1000): OrderItem => ({ id, description, price });
const os = (over: Partial<WorkOrder> = {}): WorkOrder => ({
  id: 'os1', osNumber: 1, vehicle: 'Gol - AAA-0001', clientName: 'Fulano Teste',
  clientPhone: '11 90000-0000', mileage: 0, status: 'ORCAMENTO', parts: [], services: [],
  total: 0, createdAt: '2026-01-10T12:00:00.000Z', ...over,
});
const entry = (id: string, description: string): LedgerEntry => ({
  id, description, amount: 1000, type: 'CREDIT',
  effectiveDate: '2026-01-10T12:00:00.000Z', createdAt: '2026-01-10T12:00:00.000Z',
});

describe('updateClientCascading', () => {
  it('sem cliente antigo: nada muda', () => {
    const r = updateClientCascading(undefined, client(), [os()], [entry('e1', 'x')]);
    expect(r.hasChanges).toBe(false);
    expect(r.newWorkOrders).toEqual([os()]);
  });

  it('nada alterado: hasChanges false', () => {
    const c = client();
    const r = updateClientCascading(c, { ...c }, [os()], []);
    expect(r.hasChanges).toBe(false);
  });

  it('renomeia o cliente nas OSs e no Ledger', () => {
    const old = client();
    const r = updateClientCascading(
      old, { ...old, name: 'Beltrano Teste' },
      [os(), os({ id: 'os2', clientName: 'Outro' })],
      [entry('e1', 'Receita OS #1 - Fulano Teste'), entry('e2', 'Aluguel')]
    );
    expect(r.hasChanges).toBe(true);
    expect(r.newWorkOrders[0].clientName).toBe('Beltrano Teste');
    expect(r.newWorkOrders[1].clientName).toBe('Outro');
    expect(r.newLedger[0].description).toBe('Receita OS #1 - Beltrano Teste');
    expect(r.newLedger[1].description).toBe('Aluguel');
  });

  it('propaga telefone só nas OSs do cliente', () => {
    const old = client();
    const r = updateClientCascading(old, { ...old, phone: '11 98888-8888' }, [os(), os({ id: 'os2', clientName: 'Outro' })], []);
    expect(r.newWorkOrders[0].clientPhone).toBe('11 98888-8888');
    expect(r.newWorkOrders[1].clientPhone).toBe('11 90000-0000');
  });

  it('troca de veículo por posição atualiza a string "modelo - placa" da OS', () => {
    const old = client();
    const upd = { ...old, vehicles: [{ model: 'Gol', plate: 'BBB-0002' }] };
    const r = updateClientCascading(old, upd, [os(), os({ id: 'os2', vehicle: 'Outro - ZZZ-9999' })], []);
    expect(r.newWorkOrders[0].vehicle).toBe('Gol - BBB-0002');
    expect(r.newWorkOrders[1].vehicle).toBe('Outro - ZZZ-9999');
  });

  it('não altera a descrição do Ledger se só o telefone mudou', () => {
    const old = client();
    const r = updateClientCascading(old, { ...old, phone: '1' }, [os()], [entry('e1', 'Receita - Fulano Teste')]);
    expect(r.newLedger[0].description).toBe('Receita - Fulano Teste');
  });

  it('não muta as listas de entrada', () => {
    const old = client();
    const wos = [os()];
    const led = [entry('e1', 'Fulano Teste')];
    updateClientCascading(old, { ...old, name: 'Novo' }, wos, led);
    expect(wos[0].clientName).toBe('Fulano Teste');
    expect(led[0].description).toBe('Fulano Teste');
  });

  // COMPORTAMENTO ATUAL (suspeito): o vínculo OS-cliente é pelo NOME (texto), não por id.
  // Se o nome na OS diverge (ex.: caixa diferente), a OS não é atualizada.
  it('vínculo por nome: OS com nome diferente em caixa não é atualizada', () => {
    const old = client();
    const r = updateClientCascading(old, { ...old, name: 'Novo' }, [os({ clientName: 'fulano teste' })], []);
    expect(r.newWorkOrders[0].clientName).toBe('fulano teste');
  });

  // COMPORTAMENTO ATUAL (suspeito): usa includes/replace na descrição do Ledger.
  // Substitui só a PRIMEIRA ocorrência.
  it('ledger: replace troca só a primeira ocorrência da string', () => {
    const old = client({ name: 'Ana' });
    const r = updateClientCascading(old, { ...old, name: 'Bia' }, [], [entry('e1', 'Ana paga Ana')]);
    expect(r.newLedger[0].description).toBe('Bia paga Ana');
  });

  // COMPORTAMENTO ATUAL (suspeito): "Mari" casa dentro de "Mariana" (includes), corrompendo o lançamento de outra pessoa.
  it('ledger: nome curto casa substring de outro cliente', () => {
    const old = client({ name: 'Mari' });
    const r = updateClientCascading(old, { ...old, name: 'Bia' }, [], [entry('e1', 'Receita OS #2 - Mariana')]);
    expect(r.newLedger[0].description).toBe('Receita OS #2 - Biaana');
  });

  // COMPORTAMENTO ATUAL (suspeito): hasChanges fica true mesmo sem nenhuma OS/lançamento afetado.
  it('hasChanges true mesmo sem OS do cliente', () => {
    const old = client();
    const r = updateClientCascading(old, { ...old, name: 'Novo' }, [os({ clientName: 'Outro' })], []);
    expect(r.hasChanges).toBe(true);
  });

  // COMPORTAMENTO ATUAL (suspeito): veículos casados por índice; remover o primeiro veículo
  // desloca os demais e reescreve a OS do veículo errado.
  it('veículos por índice: remover o 1º reescreve a OS do Gol como Uno', () => {
    const old = client({ vehicles: [{ model: 'Gol', plate: 'A' }, { model: 'Uno', plate: 'B' }] });
    const upd = { ...old, vehicles: [{ model: 'Uno', plate: 'B' }] };
    const r = updateClientCascading(old, upd, [os({ vehicle: 'Gol - A' }), os({ id: 'os2', vehicle: 'Uno - B' })], []);
    expect(r.newWorkOrders[0].vehicle).toBe('Uno - B');
    expect(r.newWorkOrders[1].vehicle).toBe('Uno - B');
  });
});

describe('updateCatalogItemCascading', () => {
  const cat = (description: string): CatalogItem => ({ id: 'k1', description, price: 1000 });

  it('sem item antigo ou descrição igual: nada muda', () => {
    const o = os({ parts: [item('p1', 'Filtro')] });
    expect(updateCatalogItemCascading(undefined, cat('Filtro'), [o]).hasChanges).toBe(false);
    expect(updateCatalogItemCascading(cat('Filtro'), cat('Filtro'), [o]).hasChanges).toBe(false);
  });

  it('renomeia em peças e serviços de todas as OSs', () => {
    const wos = [
      os({ parts: [item('p1', 'Filtro'), item('p2', 'Vela')] }),
      os({ id: 'os2', services: [item('s1', 'Filtro')] }),
      os({ id: 'os3', parts: [item('p3', 'Vela')] }),
    ];
    const r = updateCatalogItemCascading(cat('Filtro'), cat('Filtro de óleo'), wos);
    expect(r.hasChanges).toBe(true);
    expect(r.newWorkOrders[0].parts.map(p => p.description)).toEqual(['Filtro de óleo', 'Vela']);
    expect(r.newWorkOrders[1].services[0].description).toBe('Filtro de óleo');
    expect(r.newWorkOrders[2]).toBe(wos[2]);
  });

  it('não muta as OSs de entrada', () => {
    const wos = [os({ parts: [item('p1', 'Filtro')] })];
    updateCatalogItemCascading(cat('Filtro'), cat('Novo'), wos);
    expect(wos[0].parts[0].description).toBe('Filtro');
  });

  // COMPORTAMENTO ATUAL (suspeito): vínculo por descrição exata (texto), não por id; sensível a caixa
  // e atinge também itens digitados à mão com a mesma descrição.
  it('vínculo por descrição: caixa diferente não é atualizada', () => {
    const wos = [os({ parts: [item('p1', 'filtro')] })];
    const r = updateCatalogItemCascading(cat('Filtro'), cat('Novo'), wos);
    expect(r.hasChanges).toBe(false);
    expect(r.newWorkOrders[0].parts[0].description).toBe('filtro');
  });

  // COMPORTAMENTO ATUAL (suspeito): o cascade reescreve a descrição em OSs já finalizadas (histórico muda).
  it('altera também OS FINALIZADO', () => {
    const wos = [os({ status: 'FINALIZADO', parts: [item('p1', 'Filtro')] })];
    const r = updateCatalogItemCascading(cat('Filtro'), cat('Novo'), wos);
    expect(r.newWorkOrders[0].parts[0].description).toBe('Novo');
  });

  // COMPORTAMENTO ATUAL (suspeito): mudar só o preço do catálogo não propaga nada.
  it('mudança de preço não propaga', () => {
    const wos = [os({ parts: [item('p1', 'Filtro')] })];
    const r = updateCatalogItemCascading(cat('Filtro'), { ...cat('Filtro'), price: 9999 }, wos);
    expect(r.hasChanges).toBe(false);
  });
});

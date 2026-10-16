import { describe, it, expect } from 'vitest';
import { updateClientCascading, updateCatalogItemCascading, updateTechnicianCascading } from './cascadeService';
import type { CatalogItem, Client, LedgerEntry, OrderItem, Technician, WorkOrder } from '../types';

// Fixtures sintéticas.
const client = (over: Partial<Client> = {}): Client => ({
  id: 'c1', name: 'Fulano Teste', phone: '11 90000-0000',
  vehicles: [{ id: 'v1', model: 'Gol', plate: 'AAA-0001' }], ...over,
});
const item = (id: string, description: string, price = 1000, over: Partial<OrderItem> = {}): OrderItem => ({ id, description, price, ...over });
const os = (over: Partial<WorkOrder> = {}): WorkOrder => ({
  id: 'os1', osNumber: 1, vehicle: 'Gol - AAA-0001', clientName: 'Fulano Teste', clientId: 'c1',
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

  it('renomeia o cliente nas OSs e no Ledger das OSs dele', () => {
    const old = client();
    const r = updateClientCascading(
      old, { ...old, name: 'Beltrano Teste' },
      [os({ financialId: 'e1' }), os({ id: 'os2', osNumber: 2, clientId: 'c2', clientName: 'Outro' })],
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
    const r = updateClientCascading(old, { ...old, phone: '11 98888-8888' }, [os(), os({ id: 'os2', clientId: 'c2', clientName: 'Outro' })], []);
    expect(r.newWorkOrders[0].clientPhone).toBe('11 98888-8888');
    expect(r.newWorkOrders[1].clientPhone).toBe('11 90000-0000');
  });

  it('troca de placa do veículo atualiza a string "modelo - placa" da OS pelo vehicleId', () => {
    const old = client();
    const upd = { ...old, vehicles: [{ id: 'v1', model: 'Gol', plate: 'BBB-0002' }] };
    const r = updateClientCascading(old, upd, [os({ vehicleId: 'v1' }), os({ id: 'os2', vehicle: 'Outro - ZZZ-9999', vehicleId: 'v9' })], []);
    expect(r.newWorkOrders[0].vehicle).toBe('Gol - BBB-0002');
    expect(r.newWorkOrders[1].vehicle).toBe('Outro - ZZZ-9999');
  });

  it('veículo renomeado (modelo) atualiza a OS; a placa vai em maiúsculas como no OSModal', () => {
    const old = client();
    const upd = { ...old, vehicles: [{ id: 'v1', model: 'Gol G5', plate: 'aaa-0001' }] };
    const r = updateClientCascading(old, upd, [os({ vehicleId: 'v1' })], []);
    expect(r.newWorkOrders[0].vehicle).toBe('Gol G5 - AAA-0001');
  });

  it('não altera a descrição do Ledger se só o telefone mudou', () => {
    const old = client();
    const r = updateClientCascading(old, { ...old, phone: '1' }, [os({ financialId: 'e1' })], [entry('e1', 'Receita OS #1 - Fulano Teste')]);
    expect(r.newLedger[0].description).toBe('Receita OS #1 - Fulano Teste');
  });

  it('não muta as listas de entrada', () => {
    const old = client();
    const wos = [os({ financialId: 'e1' })];
    const led = [entry('e1', 'Receita OS #1 - Fulano Teste')];
    updateClientCascading(old, { ...old, name: 'Novo' }, wos, led);
    expect(wos[0].clientName).toBe('Fulano Teste');
    expect(led[0].description).toBe('Receita OS #1 - Fulano Teste');
  });

  // CORRIGIDO (4.6): vínculo por nome sensível a caixa (OS não atualizada) -> OS legada sem id, caixa diferente, nome único: atualizada e ligada.
  it('CORRIGIDO (4.6): vínculo por nome sensível a caixa -> OS legada sem id é atualizada e ligada', () => {
    const old = client();
    const r = updateClientCascading(old, { ...old, name: 'Novo' }, [os({ clientId: undefined, clientName: 'fulano teste' })], [], [old]);
    expect(r.newWorkOrders[0].clientName).toBe('Novo');
    expect(r.newWorkOrders[0].clientId).toBe('c1');
  });

  // CORRIGIDO (4.6): replace trocava só a 1ª ocorrência -> troca todas as ocorrências do trecho `OS #n - nome`.
  it('CORRIGIDO (4.6): ledger trocava só a 1ª ocorrência -> troca todas do trecho exato', () => {
    const old = client({ name: 'Ana' });
    const r = updateClientCascading(
      old, { ...old, name: 'Bia' }, [os({ clientName: 'Ana', financialId: 'e1' })],
      [entry('e1', 'OS #1 - Ana; OS #1 - Ana; Ana paga')]
    );
    expect(r.newLedger[0].description).toBe('OS #1 - Bia; OS #1 - Bia; Ana paga');
  });

  // CORRIGIDO (4.6): "Mari" casava substring de "Mariana" -> só o trecho exato das OS do cliente.
  it('CORRIGIDO (4.6): "Mari" corrompia "Mariana" -> "Mari" não altera "Mariana"', () => {
    const old = client({ id: 'cm', name: 'Mari' });
    const r = updateClientCascading(
      old, { ...old, name: 'Bia' },
      [os({ id: 'osM', osNumber: 1, clientId: 'cm', clientName: 'Mari', financialId: 'e1' }),
       os({ id: 'osA', osNumber: 2, clientId: 'ca', clientName: 'Mariana', financialId: 'e2' })],
      [entry('e1', 'Receita OS #1 - Mari'), entry('e2', 'Receita OS #2 - Mariana')]
    );
    expect(r.newLedger[0].description).toBe('Receita OS #1 - Bia');
    expect(r.newLedger[1].description).toBe('Receita OS #2 - Mariana');
  });

  it('ledger: "Mari" não casa "Mariana" nem dentro de uma OS do mesmo número (fronteira de palavra)', () => {
    const old = client({ name: 'Mari' });
    const r = updateClientCascading(
      old, { ...old, name: 'Bia' }, [os({ clientName: 'Mari', financialId: 'e1' })],
      [entry('e1', 'Receita OS #1 - Mariana')]
    );
    expect(r.newLedger[0].description).toBe('Receita OS #1 - Mariana');
  });

  it('ledger: lançamento fora das OS do cliente não é tocado, mesmo com o nome na descrição', () => {
    const old = client();
    const r = updateClientCascading(
      old, { ...old, name: 'Novo' }, [os({ financialId: 'e1' })],
      [entry('e1', 'Receita OS #1 - Fulano Teste'), entry('e2', 'Receita OS #1 - Fulano Teste'), entry('e3', 'Pagamento a Fulano Teste')]
    );
    expect(r.newLedger[0].description).toBe('Receita OS #1 - Novo');
    expect(r.newLedger[1].description).toBe('Receita OS #1 - Fulano Teste');
    expect(r.newLedger[2].description).toBe('Pagamento a Fulano Teste');
  });

  it('ledger: à vista, adiantamento e todas as parcelas da OS do cliente; OS de outro cliente intacta', () => {
    const old = client();
    const wo = os({
      osNumber: 7, financialId: 'e1', advanceEntryId: 'e2',
      installmentConfig: { totalAmount: 3000, installments: 3, installmentAmount: 1000, lastInstallmentAmount: 1000, firstPaymentDate: '2026-02-01', groupId: 'g1', description: 'x' },
    });
    const other = os({ id: 'os2', osNumber: 8, clientId: 'c2', clientName: 'Outro', financialId: 'e9' });
    const p = (id: string, n: number): LedgerEntry => ({ ...entry(id, `Receita OS #7 - Fulano Teste (${n}/3)`), installmentGroupId: 'g1', installmentNumber: n });
    const r = updateClientCascading(
      old, { ...old, name: 'Novo' }, [wo, other],
      [entry('e1', 'Receita OS #7 - Fulano Teste'), entry('e2', 'Adiantamento OS #7 - Fulano Teste'),
       p('p1', 1), p('p2', 2), p('p3', 3), entry('e9', 'Receita OS #8 - Fulano Teste')]
    );
    expect(r.newLedger.map(e => e.description)).toEqual([
      'Receita OS #7 - Novo', 'Adiantamento OS #7 - Novo',
      'Receita OS #7 - Novo (1/3)', 'Receita OS #7 - Novo (2/3)', 'Receita OS #7 - Novo (3/3)',
      'Receita OS #8 - Fulano Teste',
    ]);
  });

  it('nome não mudou: o Ledger não é tocado', () => {
    const old = client();
    const led = [entry('e1', 'Receita OS #1 - Fulano Teste')];
    const r = updateClientCascading(old, { ...old, phone: '2' }, [os({ financialId: 'e1' })], led);
    expect(r.newLedger[0]).toBe(led[0]);
  });

  // CORRIGIDO (4.6): hasChanges era true sem OS/lançamento afetado -> false.
  it('CORRIGIDO (4.6): hasChanges true mesmo sem OS do cliente -> false', () => {
    const old = client();
    const r = updateClientCascading(old, { ...old, name: 'Novo' }, [os({ clientId: 'c2', clientName: 'Outro' })], [entry('e1', 'x')]);
    expect(r.hasChanges).toBe(false);
  });

  it('cliente sem OS: listas devolvidas intactas e hasChanges false', () => {
    const old = client();
    const r = updateClientCascading(old, { ...old, name: 'Novo' }, [], []);
    expect(r).toEqual({ newWorkOrders: [], newLedger: [], hasChanges: false });
  });

  // CORRIGIDO (4.6): veículos casados por índice (remover o 1º reescrevia a OS do Gol como Uno) -> por id.
  it('CORRIGIDO (4.6): remover o 1º veículo reescrevia a OS do Gol como Uno -> OS do removido e do 2º intactas', () => {
    const old = client({ vehicles: [{ id: 'v1', model: 'Gol', plate: 'A' }, { id: 'v2', model: 'Uno', plate: 'B' }] });
    const upd = { ...old, vehicles: [{ id: 'v2', model: 'Uno', plate: 'B' }] };
    const r = updateClientCascading(old, upd, [os({ vehicle: 'Gol - A', vehicleId: 'v1' }), os({ id: 'os2', vehicle: 'Uno - B', vehicleId: 'v2' })], []);
    expect(r.newWorkOrders[0].vehicle).toBe('Gol - A');
    expect(r.newWorkOrders[1].vehicle).toBe('Uno - B');
    expect(r.hasChanges).toBe(false);
  });

  // CORRIGIDO (4.6): placa apagada gerava "Gol - " -> segue o OSModal (só o modelo).
  it('CORRIGIDO (4.6): placa apagada gerava "Gol - " -> "Gol"', () => {
    const old = client();
    const upd = { ...old, vehicles: [{ id: 'v1', model: 'Gol', plate: '' }] };
    const r = updateClientCascading(old, upd, [os({ vehicleId: 'v1' })], []);
    expect(r.newWorkOrders[0].vehicle).toBe('Gol');
  });

  it('OS legada sem vehicleId: veículo resolvido pela placa no cliente antigo e atualizado', () => {
    const old = client({ vehicles: [{ id: 'v1', model: 'Gol', plate: 'AAA-0001' }, { id: 'v2', model: 'Uno', plate: 'BBB-0002' }] });
    const upd = { ...old, vehicles: [{ id: 'v1', model: 'Gol', plate: 'CCC-0003' }, old.vehicles[1]] };
    const r = updateClientCascading(old, upd, [os({ vehicle: 'Gol - aaa0001' })], []);
    expect(r.newWorkOrders[0].vehicle).toBe('Gol - CCC-0003');
    expect(r.newWorkOrders[0].vehicleId).toBe('v1');
  });

  it('OS legada com veículo não resolvido: texto intacto', () => {
    const old = client();
    const upd = { ...old, vehicles: [{ id: 'v1', model: 'Gol', plate: 'CCC-0003' }] };
    const r = updateClientCascading(old, upd, [os({ vehicle: 'Fusca - ZZZ-9999' })], []);
    expect(r.newWorkOrders[0].vehicle).toBe('Fusca - ZZZ-9999');
    expect(r.hasChanges).toBe(false);
  });

  it('homônimos isolados por id: renomear um não toca o outro (OS e Ledger)', () => {
    const a = client({ id: 'ca', name: 'João Silva', vehicles: [] });
    const b = client({ id: 'cb', name: 'João Silva', vehicles: [] });
    const wos = [
      os({ id: 'osA', osNumber: 1, clientId: 'ca', clientName: 'João Silva', financialId: 'e1' }),
      os({ id: 'osB', osNumber: 2, clientId: 'cb', clientName: 'João Silva', financialId: 'e2' }),
    ];
    const led = [entry('e1', 'Receita OS #1 - João Silva'), entry('e2', 'Receita OS #2 - João Silva')];
    const r = updateClientCascading(a, { ...a, name: 'João Souza' }, wos, led, [a, b]);
    expect(r.newWorkOrders[0].clientName).toBe('João Souza');
    expect(r.newWorkOrders[1]).toBe(wos[1]);
    expect(r.newLedger[0].description).toBe('Receita OS #1 - João Souza');
    expect(r.newLedger[1].description).toBe('Receita OS #2 - João Silva');
  });

  it('OS legada sem clientId: ligada na hora quando o nome antigo é único; deixada quando é homônimo', () => {
    const a = client({ id: 'ca', name: 'João Silva', vehicles: [] });
    const b = client({ id: 'cb', name: 'joão  silva', vehicles: [] });
    const legacy = os({ clientId: undefined, clientName: 'João Silva' });
    const homonym = updateClientCascading(a, { ...a, name: 'João Souza' }, [legacy], [], [a, b]);
    expect(homonym.hasChanges).toBe(false);
    expect(homonym.newWorkOrders[0]).toBe(legacy);

    const unique = updateClientCascading(a, { ...a, name: 'João Souza' }, [legacy], [], [a]);
    expect(unique.hasChanges).toBe(true);
    expect(unique.newWorkOrders[0]).toMatchObject({ clientId: 'ca', clientName: 'João Souza' });
  });

  it('atualiza também a OS FINALIZADO e ARQUIVADO (nome atual no histórico)', () => {
    const old = client();
    const r = updateClientCascading(old, { ...old, name: 'Novo' },
      [os({ status: 'FINALIZADO' }), os({ id: 'os2', status: 'ARQUIVADO' })], []);
    expect(r.newWorkOrders.map(o => o.clientName)).toEqual(['Novo', 'Novo']);
  });
});

describe('updateCatalogItemCascading', () => {
  const cat = (description: string): CatalogItem => ({ id: 'k1', description, price: 1000 });

  it('sem item antigo ou descrição igual: nada muda', () => {
    const o = os({ parts: [item('p1', 'Filtro')] });
    expect(updateCatalogItemCascading(undefined, cat('Filtro'), [o]).hasChanges).toBe(false);
    expect(updateCatalogItemCascading(cat('Filtro'), cat('Filtro'), [o]).hasChanges).toBe(false);
  });

  it('renomeia em peças e serviços de todas as OSs (por catalogItemId)', () => {
    const wos = [
      os({ parts: [item('p1', 'Filtro', 1000, { catalogItemId: 'k1' }), item('p2', 'Vela', 1000, { catalogItemId: 'k2' })] }),
      os({ id: 'os2', services: [item('s1', 'Filtro', 1000, { catalogItemId: 'k1' })] }),
      os({ id: 'os3', parts: [item('p3', 'Vela', 1000, { catalogItemId: 'k2' })] }),
    ];
    const r = updateCatalogItemCascading(cat('Filtro'), cat('Filtro de óleo'), wos);
    expect(r.hasChanges).toBe(true);
    expect(r.newWorkOrders[0].parts.map(p => p.description)).toEqual(['Filtro de óleo', 'Vela']);
    expect(r.newWorkOrders[1].services[0].description).toBe('Filtro de óleo');
    expect(r.newWorkOrders[2]).toBe(wos[2]);
  });

  it('não muta as OSs de entrada', () => {
    const wos = [os({ parts: [item('p1', 'Filtro', 1000, { catalogItemId: 'k1' })] })];
    updateCatalogItemCascading(cat('Filtro'), cat('Novo'), wos);
    expect(wos[0].parts[0].description).toBe('Filtro');
  });

  it('item de OS legado sem catalogItemId: casa pela descrição antiga se for única no catálogo e ganha o id', () => {
    const wos = [os({ parts: [item('p1', 'filtro')] })];
    const r = updateCatalogItemCascading(cat('Filtro'), cat('Novo'), wos, [cat('Filtro')], 'part');
    expect(r.hasChanges).toBe(true);
    expect(r.newWorkOrders[0].parts[0]).toMatchObject({ description: 'Novo', catalogItemId: 'k1' });
  });

  it('item legado com descrição duplicada no catálogo: não é tocado', () => {
    const wos = [os({ parts: [item('p1', 'Filtro')] })];
    const dup: CatalogItem = { id: 'k2', description: ' filtro ', price: 5 };
    const r = updateCatalogItemCascading(cat('Filtro'), cat('Novo'), wos, [cat('Filtro'), dup], 'part');
    expect(r.hasChanges).toBe(false);
    expect(r.newWorkOrders[0].parts[0].description).toBe('Filtro');
  });

  it('item com catalogItemId de outro item não é tocado, mesmo com a mesma descrição', () => {
    const wos = [os({ parts: [item('p1', 'Filtro', 1000, { catalogItemId: 'k2' })] })];
    const r = updateCatalogItemCascading(cat('Filtro'), cat('Novo'), wos, [cat('Filtro')], 'part');
    expect(r.hasChanges).toBe(false);
  });

  it('o preço (e o custo) do item da OS nunca muda', () => {
    const wos = [os({ parts: [item('p1', 'Filtro', 7777, { catalogItemId: 'k1', cost: 3000 })] })];
    const r = updateCatalogItemCascading(cat('Filtro'), { ...cat('Novo'), price: 1, cost: 1 }, wos);
    expect(r.newWorkOrders[0].parts[0]).toMatchObject({ description: 'Novo', price: 7777, cost: 3000 });
  });

  it('com o tipo informado, legado de peça não casa serviço de mesma descrição', () => {
    const wos = [os({ parts: [item('p1', 'Filtro')], services: [item('s1', 'Filtro')] })];
    const r = updateCatalogItemCascading(cat('Filtro'), cat('Novo'), wos, [cat('Filtro')], 'part');
    expect(r.newWorkOrders[0].parts[0].description).toBe('Novo');
    expect(r.newWorkOrders[0].services[0].description).toBe('Filtro');
  });

  // CORRIGIDO (4.6): descrição exata sensível a caixa (não atualizava) -> por id, ou descrição normalizada única.
  it('CORRIGIDO (4.6): vínculo por descrição exata, caixa diferente não atualizava -> atualiza por id', () => {
    const wos = [os({ parts: [item('p1', 'filtro', 1000, { catalogItemId: 'k1' })] })];
    const r = updateCatalogItemCascading(cat('Filtro'), cat('Novo'), wos);
    expect(r.hasChanges).toBe(true);
    expect(r.newWorkOrders[0].parts[0].description).toBe('Novo');
  });

  // Decisão aprovada (4.6): OS finalizada mostra o nome atual, como antes.
  it('altera também OS FINALIZADO (descrição atual no histórico, preço intacto)', () => {
    const wos = [os({ status: 'FINALIZADO', parts: [item('p1', 'Filtro', 1000, { catalogItemId: 'k1' })] })];
    const r = updateCatalogItemCascading(cat('Filtro'), cat('Novo'), wos);
    expect(r.newWorkOrders[0].parts[0].description).toBe('Novo');
    expect(r.newWorkOrders[0].parts[0].price).toBe(1000);
  });

  // Mantido: mudar só o preço do catálogo não propaga nada.
  it('mudança de preço não propaga', () => {
    const wos = [os({ parts: [item('p1', 'Filtro', 1000, { catalogItemId: 'k1' })] })];
    const r = updateCatalogItemCascading(cat('Filtro'), { ...cat('Filtro'), price: 9999 }, wos);
    expect(r.hasChanges).toBe(false);
  });
});

describe('updateTechnicianCascading', () => {
  const tech = (id: string, name: string): Technician => ({ id, name });

  it('sem técnico antigo ou nome igual: nada muda', () => {
    const wos = [os({ technician: 'Zé', technicianId: 't1' })];
    expect(updateTechnicianCascading(undefined, tech('t1', 'Zé'), wos).hasChanges).toBe(false);
    expect(updateTechnicianCascading(tech('t1', 'Zé'), tech('t1', 'Zé'), wos).hasChanges).toBe(false);
  });

  it('renomeia por technicianId; homônimo com outro id fica intacto', () => {
    const wos = [
      os({ technician: 'Zé', technicianId: 't1' }),
      os({ id: 'os2', technician: 'Zé', technicianId: 't2' }),
    ];
    const r = updateTechnicianCascading(tech('t1', 'Zé'), tech('t1', 'José'), wos, [tech('t1', 'Zé'), tech('t2', 'Zé')]);
    expect(r.hasChanges).toBe(true);
    expect(r.newWorkOrders[0].technician).toBe('José');
    expect(r.newWorkOrders[1]).toBe(wos[1]);
  });

  it('OS legada sem technicianId: casa pelo nome normalizado se único e ganha o id', () => {
    const wos = [os({ technician: ' zé ' })];
    const r = updateTechnicianCascading(tech('t1', 'Zé'), tech('t1', 'José'), wos, [tech('t1', 'Zé')]);
    expect(r.newWorkOrders[0]).toMatchObject({ technician: 'José', technicianId: 't1' });
  });

  it('OS legada com nome homônimo no catálogo: não é tocada', () => {
    const wos = [os({ technician: 'Zé' })];
    const r = updateTechnicianCascading(tech('t1', 'Zé'), tech('t1', 'José'), wos, [tech('t1', 'Zé'), tech('t2', 'zé')]);
    expect(r.hasChanges).toBe(false);
  });

  it('técnico sem OS: hasChanges false; não muta a entrada', () => {
    const wos = [os({ technician: 'Outro', technicianId: 't9' })];
    const r = updateTechnicianCascading(tech('t1', 'Zé'), tech('t1', 'José'), wos, [tech('t1', 'Zé')]);
    expect(r.hasChanges).toBe(false);
    expect(wos[0].technician).toBe('Outro');
  });
});

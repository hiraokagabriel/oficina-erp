import { describe, it, expect } from 'vitest';
import {
  normalizeName, normalizePlate, splitVehicle, resolveClientId, resolveVehicleId,
  resolveCatalogItemId, resolveTechnicianId, matchClientId,
  linkClient, preferredClientId, linkCatalogItems, linkTechnician,
} from './links';
import type { CatalogItem, Client, OrderItem, Technician } from '../types';

const cli = (id: string, name: string, phone = '', vehicles: Client['vehicles'] = []): Client => ({ id, name, phone, vehicles });

describe('normalizeName', () => {
  it('apara, junta espaços e põe em minúsculas preservando acentos', () => {
    expect(normalizeName('  João   DA  Silva ')).toBe('joão da silva');
    expect(normalizeName('JOSÉ')).toBe('josé');
    expect(normalizeName('José')).not.toBe(normalizeName('Jose'));
  });
  it('tolera vazio/undefined', () => {
    expect(normalizeName('')).toBe('');
    expect(normalizeName(undefined)).toBe('');
  });
});

describe('normalizePlate', () => {
  it('mantém só letras e números em maiúsculas', () => {
    expect(normalizePlate('abc-1d23')).toBe('ABC1D23');
    expect(normalizePlate(' abc 1234 ')).toBe('ABC1234');
    expect(normalizePlate('')).toBe('');
  });
});

describe('splitVehicle', () => {
  it('separa pelo último " - "', () => {
    expect(splitVehicle('Gol - ABC-1234')).toEqual({ model: 'Gol', plate: 'ABC-1234' });
    expect(splitVehicle('Fiat - Uno - ABC1234')).toEqual({ model: 'Fiat - Uno', plate: 'ABC1234' });
  });
  it('sem separador, placa vazia', () => {
    expect(splitVehicle('Gol')).toEqual({ model: 'Gol', plate: '' });
    expect(splitVehicle('')).toEqual({ model: '', plate: '' });
  });
  it('placa vazia depois do separador (como o cascade grava)', () => {
    expect(splitVehicle('Gol - ')).toEqual({ model: 'Gol', plate: '' });
  });
  it('separador logo no início não vale (igual ao OSModal, sep > 0)', () => {
    expect(splitVehicle(' - X')).toEqual({ model: ' - X', plate: '' });
  });
});

describe('resolveClientId', () => {
  const clients = [cli('C1', 'Maria Souza'), cli('C2', 'Pedro'), cli('C3', 'pedro')];
  it('usa o clientId se existir no cadastro', () => {
    expect(resolveClientId({ clientName: 'Outro', clientId: 'C2' }, clients)).toBe('C2');
  });
  it('clientId inexistente cai no nome', () => {
    expect(resolveClientId({ clientName: ' maria  SOUZA', clientId: 'X' }, clients)).toBe('C1');
  });
  it('homônimos: undefined', () => {
    expect(resolveClientId({ clientName: 'PEDRO' }, clients)).toBeUndefined();
  });
  it('nome inexistente ou vazio: undefined', () => {
    expect(resolveClientId({ clientName: 'Zé' }, clients)).toBeUndefined();
    expect(resolveClientId({ clientName: '  ' }, clients)).toBeUndefined();
  });
});

describe('matchClientId (desempate)', () => {
  const clients = [
    cli('A', 'Ana', '(11) 90000-0001', [{ id: 'A:v0', model: 'Gol', plate: 'AAA1111' }]),
    cli('B', 'ana', '(11) 90000-0002', [{ id: 'B:v0', model: 'Uno', plate: 'BBB2222' }]),
  ];
  it('por placa', () => {
    expect(matchClientId({ clientName: 'Ana', vehicle: 'Uno - bbb-2222' }, clients)).toBe('B');
  });
  it('por telefone quando a placa não decide', () => {
    expect(matchClientId({ clientName: 'Ana', vehicle: 'Fusca', clientPhone: '11900000001' }, clients)).toBe('A');
  });
  it('empate fica sem vínculo', () => {
    expect(matchClientId({ clientName: 'Ana', vehicle: 'Fusca', clientPhone: '' }, clients)).toBeUndefined();
  });
});

describe('resolveVehicleId / resolveCatalogItemId / resolveTechnicianId', () => {
  const c = cli('C', 'X', '', [
    { id: 'C:v0', model: 'Gol', plate: 'AAA1111' },
    { id: 'C:v1', model: 'Uno', plate: '' },
  ]);
  it('veículo por placa e por modelo', () => {
    expect(resolveVehicleId({ vehicle: 'qualquer - aaa-1111' }, c)).toBe('C:v0');
    expect(resolveVehicleId({ vehicle: 'uno' }, c)).toBe('C:v1');
    expect(resolveVehicleId({ vehicle: 'Fusca - ZZZ9999' }, c)).toBeUndefined();
    expect(resolveVehicleId({ vehicle: 'Gol' }, undefined)).toBeUndefined();
  });
  it('catálogo: único liga, duplicado não', () => {
    const cat = [
      { id: 'P1', description: 'Filtro de óleo', price: 1 },
      { id: 'P2', description: 'Vela', price: 1 },
      { id: 'P3', description: 'vela', price: 1 },
    ];
    expect(resolveCatalogItemId({ description: ' FILTRO  de óleo' }, cat)).toBe('P1');
    expect(resolveCatalogItemId({ description: 'Vela' }, cat)).toBeUndefined();
    expect(resolveCatalogItemId({ description: 'Outro' }, cat)).toBeUndefined();
  });
  it('técnico', () => {
    const t = [{ id: 'T1', name: 'Ana' }, { id: 'T2', name: 'Beto' }, { id: 'T3', name: 'beto' }];
    expect(resolveTechnicianId(' ana ', t)).toBe('T1');
    expect(resolveTechnicianId('Beto', t)).toBeUndefined();
    expect(resolveTechnicianId(undefined, t)).toBeUndefined();
  });
});

const seq = () => {
  let n = 0;
  return () => `novo-${++n}`;
};

describe('linkClient', () => {
  const base = (): Client[] => [cli('c1', 'Fulano Teste', '111', [{ id: 'v1', model: 'Gol', plate: 'ABC-1234' }])];

  it('cliente único: usa o existente, sem duplicar', () => {
    const r = linkClient({ clients: base(), clientName: ' fulano  teste ', clientPhone: '111', vehicle: 'Gol - ABC-1234', newId: seq() });
    if (r.ambiguous) throw new Error('não deveria ser ambíguo');
    expect(r.clients).toHaveLength(1);
    expect(r.clientId).toBe('c1');
  });

  it('veículo existente (placa normalizada) mantém o id', () => {
    const r = linkClient({ clients: base(), clientName: 'Fulano Teste', clientPhone: '', vehicle: 'Gol - abc1234', newId: seq() });
    if (r.ambiguous) throw new Error();
    expect(r.vehicleId).toBe('v1');
    expect(r.clients[0].vehicles).toHaveLength(1);
  });

  it('sem placa casa pelo modelo normalizado', () => {
    const r = linkClient({ clients: base(), clientName: 'Fulano Teste', clientPhone: '', vehicle: 'gol', newId: seq() });
    if (r.ambiguous) throw new Error();
    expect(r.vehicleId).toBe('v1');
  });

  it('veículo novo recebe id novo e entra no cliente', () => {
    const r = linkClient({ clients: base(), clientName: 'Fulano Teste', clientPhone: '', vehicle: 'Uno - XYZ-0001', newId: seq() });
    if (r.ambiguous) throw new Error();
    expect(r.vehicleId).toBe('novo-1');
    expect(r.clients[0].vehicles).toEqual([
      { id: 'v1', model: 'Gol', plate: 'ABC-1234' },
      { id: 'novo-1', model: 'Uno', plate: 'XYZ-0001' },
    ]);
  });

  it('veículo legado sem id ganha um id ao ser ligado', () => {
    const legado = [cli('c1', 'Fulano Teste', '1', [{ model: 'Gol', plate: 'A' }])];
    const r = linkClient({ clients: legado, clientName: 'Fulano Teste', clientPhone: '', vehicle: 'Gol - A', newId: seq() });
    if (r.ambiguous) throw new Error();
    expect(r.vehicleId).toBe('novo-1');
    expect(r.clients[0].vehicles[0].id).toBe('novo-1');
  });

  it('cliente novo: cria com id novo, trim, telefone, notas e veículo com id', () => {
    const r = linkClient({ clients: base(), clientName: '  Novo   Cliente ', clientPhone: '222', clientNotes: 'obs', vehicle: 'Palio - PAL-0001', newId: seq() });
    if (r.ambiguous) throw new Error();
    expect(r.clients).toHaveLength(2);
    expect(r.clients[1]).toEqual({ id: 'novo-2', name: 'Novo Cliente', phone: '222', notes: 'obs', vehicles: [{ id: 'novo-1', model: 'Palio', plate: 'PAL-0001' }] });
    expect(r.clientId).toBe('novo-2');
    expect(r.vehicleId).toBe('novo-1');
  });

  it('aprende telefone novo; telefone vazio mantém o antigo', () => {
    const a = linkClient({ clients: base(), clientName: 'Fulano Teste', clientPhone: '999', vehicle: 'Gol - ABC-1234', newId: seq() });
    if (a.ambiguous) throw new Error();
    expect(a.clients[0].phone).toBe('999');
    const b = linkClient({ clients: base(), clientName: 'Fulano Teste', clientPhone: '', vehicle: 'Gol - ABC-1234', newId: seq() });
    if (b.ambiguous) throw new Error();
    expect(b.clients[0].phone).toBe('111');
  });

  const homonimos = (): Client[] => [cli('c1', 'João Silva', '1', [{ id: 'v1', model: 'Gol', plate: 'A' }]), cli('c2', 'joão  silva', '2', [])];

  it('homônimos sem clientId: sinaliza ambiguidade e não altera clients', () => {
    const clients = homonimos();
    const snapshot = JSON.stringify(clients);
    const r = linkClient({ clients, clientName: 'João Silva', clientPhone: '9', vehicle: 'Uno - B', newId: seq() });
    expect(r.ambiguous).toBe(true);
    if (r.ambiguous) expect(r.candidates.map(c => c.id)).toEqual(['c1', 'c2']);
    expect(JSON.stringify(clients)).toBe(snapshot);
  });

  it('clientId informado resolve os homônimos e só altera o escolhido', () => {
    const r = linkClient({ clients: homonimos(), clientName: 'João Silva', clientPhone: '9', vehicle: 'Uno - B', clientId: 'c2', newId: seq() });
    if (r.ambiguous) throw new Error();
    expect(r.clientId).toBe('c2');
    expect(r.clients[0]).toEqual(homonimos()[0]);
    expect(r.clients[1].phone).toBe('9');
    expect(r.clients[1].vehicles).toEqual([{ id: 'novo-1', model: 'Uno', plate: 'B' }]);
  });

  it('clientId que não existe mais cai na resolução pelo nome', () => {
    const r = linkClient({ clients: base(), clientName: 'Fulano Teste', clientPhone: '', vehicle: 'Gol - ABC-1234', clientId: 'sumiu', newId: seq() });
    if (r.ambiguous) throw new Error();
    expect(r.clientId).toBe('c1');
  });

  it('nome vazio não altera nem cria cliente', () => {
    const clients = base();
    const r = linkClient({ clients, clientName: '  ', clientPhone: '', vehicle: 'Gol', newId: seq() });
    if (r.ambiguous) throw new Error();
    expect(r.clients).toBe(clients);
    expect(r.clientId).toBeUndefined();
  });
});

describe('preferredClientId (regra de edição)', () => {
  it('nome não mudou (normalizado): mantém o clientId da OS', () => {
    expect(preferredClientId({ clientName: 'Fulano Teste', clientId: 'c1' }, '  fulano   TESTE')).toBe('c1');
  });
  it('nome mudou: undefined, para resolver de novo', () => {
    expect(preferredClientId({ clientName: 'Fulano Teste', clientId: 'c1' }, 'Outro Nome')).toBeUndefined();
  });
  it('escolha explícita do modal vence', () => {
    expect(preferredClientId({ clientName: 'Fulano', clientId: 'c1' }, 'Outro', 'c9')).toBe('c9');
  });
  it('OS sem clientId ou sem edição: undefined', () => {
    expect(preferredClientId({ clientName: 'Fulano' }, 'Fulano')).toBeUndefined();
    expect(preferredClientId(null, 'Fulano')).toBeUndefined();
  });
  it('integração: nome mudou para o de outro cliente, o vínculo muda', () => {
    const clients = [cli('c1', 'Ana', '', []), cli('c2', 'Beto', '', [])];
    const r = linkClient({ clients, clientName: 'Beto', clientPhone: '', vehicle: 'Gol', clientId: preferredClientId({ clientName: 'Ana', clientId: 'c1' }, 'Beto'), newId: seq() });
    if (r.ambiguous) throw new Error();
    expect(r.clientId).toBe('c2');
  });
});

describe('linkCatalogItems', () => {
  const item = (id: string, description: string, price = 100, extra: Partial<OrderItem> = {}): OrderItem => ({ id, description, price, ...extra });
  const cat = (id: string, description: string, price = 100, extra: Partial<CatalogItem> = {}): CatalogItem => ({ id, description, price, ...extra });

  it('item casado com UM do catálogo recebe o catalogItemId e não altera o preço do catálogo', () => {
    const catalog = [cat('k1', 'Filtro de óleo', 5000)];
    const r = linkCatalogItems({ catalog, items: [item('i1', ' filtro  DE óleo', 9999)], newId: seq() });
    expect(r.items[0].catalogItemId).toBe('k1');
    expect(r.catalog).toEqual([cat('k1', 'Filtro de óleo', 5000)]);
  });

  it('item novo cria entrada com id PRÓPRIO (não o do OrderItem) e recebe esse id', () => {
    const r = linkCatalogItems({ catalog: [], items: [item('i1', 'Vela', 700, { cost: 300, category: 'MOTOR' })], newId: seq() });
    expect(r.catalog).toEqual([{ id: 'novo-1', description: 'Vela', price: 700, cost: 300, category: 'MOTOR' }]);
    expect(r.items[0].catalogItemId).toBe('novo-1');
    expect(r.items[0].id).toBe('i1');
  });

  it('dois itens novos iguais no mesmo salvamento criam uma só entrada', () => {
    const r = linkCatalogItems({ catalog: [], items: [item('i1', 'Vela'), item('i2', 'vela')], newId: seq() });
    expect(r.catalog).toHaveLength(1);
    expect(r.items.map(i => i.catalogItemId)).toEqual(['novo-1', 'novo-1']);
  });

  it('descrição duplicada no catálogo: sem id e sem criar entrada', () => {
    const catalog = [cat('k1', 'Pastilha'), cat('k2', 'pastilha')];
    const r = linkCatalogItems({ catalog, items: [item('i1', 'Pastilha')], newId: seq() });
    expect(r.items[0].catalogItemId).toBeUndefined();
    expect(r.catalog).toBe(catalog);
  });

  it('id velho cuja descrição deixou de casar é descartado e o item é religado', () => {
    const catalog = [cat('k1', 'Filtro'), cat('k2', 'Correia')];
    const r = linkCatalogItems({ catalog, items: [item('i1', 'Correia', 100, { catalogItemId: 'k1' })], newId: seq() });
    expect(r.items[0].catalogItemId).toBe('k2');
  });

  it('completa a categoria que faltava no catálogo, sem tocar no preço', () => {
    const r = linkCatalogItems({ catalog: [cat('k1', 'Filtro', 5000)], items: [item('i1', 'Filtro', 1, { category: 'MOTOR' })], newId: seq() });
    expect(r.catalog[0]).toEqual({ id: 'k1', description: 'Filtro', price: 5000, category: 'MOTOR' });
  });
});

describe('linkTechnician', () => {
  const techs: Technician[] = [{ id: 't1', name: 'Zé' }];
  it('técnico existente (nome normalizado): devolve o id sem alterar a lista', () => {
    const r = linkTechnician(techs, '  zé ', seq());
    expect(r.technicianId).toBe('t1');
    expect(r.technicians).toBe(techs);
  });
  it('técnico novo: cria com id novo', () => {
    const r = linkTechnician(techs, ' João ', seq());
    expect(r.technicians).toEqual([...techs, { id: 'novo-1', name: 'João' }]);
    expect(r.technicianId).toBe('novo-1');
  });
  it('vazio ou homônimos: sem id e sem criar', () => {
    expect(linkTechnician(techs, '  ', seq()).technicianId).toBeUndefined();
    const dup: Technician[] = [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'ana' }];
    const r = linkTechnician(dup, 'Ana', seq());
    expect(r.technicianId).toBeUndefined();
    expect(r.technicians).toBe(dup);
  });
});

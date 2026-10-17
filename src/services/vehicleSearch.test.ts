import { describe, expect, it } from 'vitest';
import { buildIndex, type RawVehicleCatalog } from './vehicleCatalog';
import { bestMatch, buildVehicleSuggestions, collectShopVehicles, searchVehicles } from './vehicleSearch';

// Fixture sintética pequena (nomes no formato FIPE; anos em faixas).
const RAW: RawVehicleCatalog = {
  brands: ['Honda', 'Volkswagen', 'Hyundai', 'Fiat', 'Toyota', 'Mercedes-Benz'],
  versions: [
    [0, 'Civic Sedan EXL 2.0 Flex 16V Aut.4p', '2014-2016', '5'],
    [0, 'Civic Sedan LXS 1.8 Flex 16V Mec. 4p', '2007-2013', '5'],
    [0, 'Civic Sedan LX 1.6 Aut.', '1996-2000', '1'],
    [0, 'Civic Coupe Si 2.4 16V 206cv Mec. 2p', '2008-2011', '1'],
    [0, 'Civic Hatch DX', '1992-1995', '1'],
    [0, 'Fit LX 1.4 8V Flex', '2004-2008', '5'],
    [0, 'HR-V EXL 1.8 Flex 16V Aut.', '2015-2019', '5'],
    [1, 'Gol 1.0 Mi 8V', '2000-2010', '1'],
    [1, 'Gol 1.0 Power 16V', '2002-2005', '1'],
    [1, 'Gol 1.0 City Flex 8V', '2006-2013', '5'],
    [1, 'Golf 1.6 8V', '2000-2010', '1'],
    [2, 'HB20 Comfort 1.0 12V Flex', '2013-2019', '5'],
    [3, 'Uno Mille Fire 1.0 8V', '2001-2010', '15'],
    [3, 'Uno Mille 1.0', '1990-2000', '1'],
    [4, 'Corolla XEi 2.0 Flex 16V Aut.', '2015-2019', '5'],
    [5, 'C 180 Classic 1.6 16V', '2012-2014', '1'],
  ],
};
const idx = buildIndex(RAW);
const labels = (q: string, limit = 20) => searchVehicles(idx, q, { limit }).map(r => r.label);

describe('searchVehicles: qualquer ordem', () => {
  it('civic 2.0 2015', () => expect(labels('civic 2.0 2015')).toEqual(['Honda Civic 2.0 16v 2015']));
  it('civic 2015 (só o que existiu em 2015)', () => expect(labels('civic 2015')).toEqual(['Honda Civic 2.0 16v 2015']));
  it('2015 civic 2.0', () => expect(labels('2015 civic 2.0')).toEqual(['Honda Civic 2.0 16v 2015']));
  it('com marca, válvulas e ano', () => expect(labels('honda civic 2.0 16v 2015')).toEqual(['Honda Civic 2.0 16v 2015']));
  it('vírgula na cilindrada e "16 v"', () => expect(labels('civic 2,0 16 v')).toEqual(['Honda Civic 2.0 16v']));
  it('número solto 16 vira válvulas quando há outro termo', () => {
    expect(labels('civic 16')).toEqual(expect.arrayContaining(['Honda Civic 1.8 16v', 'Honda Civic 2.0 16v']));
    expect(labels('civic 16').every(l => l.includes('16v'))).toBe(true);
  });
  it('vw gol 1.0 (sinônimo de marca)', () => {
    const l = labels('vw gol 1.0');
    expect(l).toEqual(expect.arrayContaining(['Volkswagen Gol 1.0 8v', 'Volkswagen Gol 1.0 16v']));
    expect(l.some(x => x.includes('Golf'))).toBe(false);
  });
  it('hb20 1.0', () => expect(labels('hb20 1.0')).toEqual(['Hyundai HB20 1.0 12v']));
  it('corolla 2.0', () => expect(labels('corolla 2.0')).toEqual(['Toyota Corolla 2.0 16v']));
  it('uno mille (acabamento na busca)', () => expect(labels('uno mille').sort()).toEqual(['Fiat Uno 1.0', 'Fiat Uno 1.0 8v']));
  it('hrv casa HR-V', () => expect(labels('hrv')).toEqual(['Honda HR-V 1.8 16v']));
  it('família com letra e número (Mercedes C 180)', () => expect(labels('mb c 180')).toEqual(['Mercedes-Benz C 180 1.6 16v']));
  it('sem acento nem caixa', () => expect(labels('CIVIC 2.0')).toEqual(['Honda Civic 2.0 16v']));
});

describe('searchVehicles: casos de borda', () => {
  it('erro de digitação: civc', () => {
    const r = searchVehicles(idx, 'civc');
    expect(r.length).toBeGreaterThan(0);
    expect(r.every(x => x.model === 'Civic')).toBe(true);
    expect(r[0].fuzzy).toBe(true);
    expect(bestMatch(idx, 'civc')).toBeNull();
  });
  it('civic sem ano traz todos os anos de cada entrada', () => {
    const r = searchVehicles(idx, 'civic');
    const e20 = r.find(x => x.displacement === '2.0');
    expect(e20?.years).toEqual([2014, 2015, 2016]);
    expect(e20?.label).toBe('Honda Civic 2.0 16v');
  });
  it('ano fora da faixa: sem resultado', () => {
    expect(labels('civic 1950')).toEqual([]);
    expect(labels('civic 2030')).toEqual([]);
  });
  it('consulta vazia: nada', () => expect(labels('   ')).toEqual([]));
  it('respeita o limite', () => expect(labels('civic', 2)).toHaveLength(2));
  it('entradas aproximadas (sem válvulas) somem quando irmãs cobrem os anos', () => {
    // Uno Mille 1.0 (1990-2000) não tem válvulas e nenhuma irmã cobre 1990-1999: fica; 2001-2010 tem 8v
    const l = labels('uno 1.0');
    expect(l).toEqual(expect.arrayContaining(['Fiat Uno 1.0 8v', 'Fiat Uno 1.0']));
  });
  it('detail traz o nome FIPE completo', () => {
    expect(searchVehicles(idx, 'civic 2.0 2015')[0].detail).toBe('Civic Sedan EXL 2.0 Flex 16V Aut.4p');
  });
  it('bestMatch: inequívoco devolve, ambíguo não', () => {
    expect(bestMatch(idx, 'honda civic 2.0 16v 2015')?.label).toBe('Honda Civic 2.0 16v 2015');
    expect(bestMatch(idx, 'civic')).toBeNull();
    expect(bestMatch(idx, 'xyzabc')).toBeNull();
  });
});

describe('histórico da oficina', () => {
  const clients = [
    { vehicles: [{ model: 'Honda Civic 2.0 16v 2015', plate: 'ABC1D23' }, { model: 'Fiat Uno Mille 1.0 8v 2008', plate: 'XYZ9K88' }] },
    { vehicles: [{ model: 'Chevrolet Onix 1.0 2019', plate: 'QWE1R23' }] },
  ];
  const orders = [
    { vehicle: 'Chevrolet Onix 1.0 2019 - QWE1R23' },
    { vehicle: 'chevrolet onix 1.0 2019 - QWE1R23' },
    { vehicle: 'Ford Ka 1.0 2016' },
    { vehicle: '' },
  ];
  it('deduplica por texto normalizado, conta usos e tira a placa', () => {
    const shop = collectShopVehicles(clients, orders);
    const onix = shop.find(s => s.norm === 'chevrolet onix 1.0 2019');
    expect(onix?.count).toBe(3);
    expect(shop.some(s => s.text.includes('QWE1R23'))).toBe(false);
    expect(shop.map(s => s.text)).toContain('Ford Ka 1.0 2016');
    expect(shop[0].text).toBe('Chevrolet Onix 1.0 2019');
  });
});

describe('buildVehicleSuggestions', () => {
  const clientVehicles = [
    { model: 'Honda Civic 2.0 16v 2015', plate: 'ABC1D23' },
    { model: 'Fiat Uno Mille 1.0 8v 2008', plate: 'XYZ9K88' },
  ];
  const shop = collectShopVehicles([], [{ vehicle: 'Honda Civic 1.8 16v 2010 - AAA0A00' }, { vehicle: 'Honda Civic 2.0 16v 2015 - ABC1D23' }]);

  it('consulta vazia: só os veículos do cliente (todos)', () => {
    const g = buildVehicleSuggestions({ query: '', clientVehicles, shopVehicles: shop, index: idx });
    expect(g.map(x => x.id)).toEqual(['cliente']);
    expect(g[0].items).toHaveLength(2);
    expect(g[0].items[0]).toMatchObject({ vehicleText: 'Honda Civic 2.0 16v 2015', plate: 'ABC1D23', source: 'cliente' });
  });
  it('sem veículos do cliente e consulta vazia: nenhum grupo', () => {
    expect(buildVehicleSuggestions({ query: '', shopVehicles: shop, index: idx })).toEqual([]);
  });
  it('com consulta: cliente primeiro, depois oficina, depois base, sem repetir', () => {
    const g = buildVehicleSuggestions({ query: 'civic', clientVehicles, shopVehicles: shop, index: idx });
    expect(g.map(x => x.id)).toEqual(['cliente', 'oficina', 'base']);
    expect(g[0].items.map(i => i.vehicleText)).toEqual(['Honda Civic 2.0 16v 2015']);
    expect(g[1].items.map(i => i.vehicleText)).toEqual(['Honda Civic 1.8 16v 2010']);
    const all = g.flatMap(x => x.items.map(i => i.vehicleText.toLowerCase()));
    expect(new Set(all).size).toBe(all.length);
    expect(g[2].items.every(i => i.source === 'base' && i.vehicleText.startsWith('Honda Civic'))).toBe(true);
  });
  it('a base não repete o que o cliente já tem (mesmo texto)', () => {
    const g = buildVehicleSuggestions({ query: 'civic 2.0 2015', clientVehicles, shopVehicles: [], index: idx });
    expect(g.map(x => x.id)).toEqual(['cliente']);
  });
  it('consulta filtra os veículos do cliente (também pela placa)', () => {
    expect(buildVehicleSuggestions({ query: 'uno', clientVehicles, index: null })[0].items).toHaveLength(1);
    expect(buildVehicleSuggestions({ query: 'abc1d', clientVehicles, index: null })[0].items[0].plate).toBe('ABC1D23');
    expect(buildVehicleSuggestions({ query: 'gol', clientVehicles, index: null })).toEqual([]);
  });
  it('veículo digitado novo na oficina passa a ser sugerido', () => {
    const novo = collectShopVehicles([], [{ vehicle: 'Renault Kwid 1.0 2022 - KWD1A11' }]);
    const g = buildVehicleSuggestions({ query: 'kwid', shopVehicles: novo, index: idx });
    expect(g).toEqual([{ id: 'oficina', title: 'Já cadastrados na oficina', items: [{ label: 'Renault Kwid 1.0 2022', source: 'oficina', vehicleText: 'Renault Kwid 1.0 2022', count: 1 }] }]);
  });
});

describe('desempenho', () => {
  it('busca sobre >= 8.000 entradas em < 25 ms', () => {
    const brands = Array.from({ length: 40 }, (_, i) => `Marca${i}`);
    const versions: RawVehicleCatalog['versions'] = [];
    for (let i = 0; i < 8400; i++) {
      versions.push([i % 40, `Modelo${i % 2500} Versao${i % 7} ${1 + (i % 4)}.${i % 9} ${[8, 12, 16][i % 3]}V`, `${1990 + (i % 20)}-${2010 + (i % 15)}`, '1']);
    }
    const big = buildIndex({ brands, versions });
    expect(big.entries.length).toBeGreaterThanOrEqual(8000);
    searchVehicles(big, 'modelo12'); // aquece
    const qs = ['modelo1234 2015', 'marca3 modelo 2.0 16v', 'zzzz', 'modelo12 versao3 2015', 'modelo7', '2015'];
    for (const q of qs) {
      // melhor de 3 execuções, para não medir ruído de outros testes rodando em paralelo
      let dt = Infinity;
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now();
        searchVehicles(big, q);
        dt = Math.min(dt, performance.now() - t0);
      }
      expect(`${q}: ${dt < 25 ? 'ok' : dt}`).toBe(`${q}: ok`);
    }
  });
});

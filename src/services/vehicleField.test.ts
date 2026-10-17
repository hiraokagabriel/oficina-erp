import { describe, expect, it } from 'vitest';
import { buildIndex, type RawVehicleCatalog } from './vehicleCatalog';
import { buildVehicleSuggestions, type VehicleSuggestion } from './vehicleSearch';
import {
  decideEnter, describeCatalog, flattenOptions, highlightParts, joinVehicleValue, labelWithYear, limitGroups, listYearsDesc, queryOf, replaceModelKeepingPlate,
  resolvePick, suggestionWithYear, valueAfterPick,
} from './vehicleField';

const raw: RawVehicleCatalog = {
  brands: ['Honda', 'Fiat'],
  versions: [
    [0, 'Civic Sedan EXL 2.0 Flex 16V Aut.4p', '2014-2016', '5'],
    [0, 'Civic Sedan LXS 1.8 Flex 16V Mec.4p', '2012-2016', '5'],
    [1, 'Uno Mille Fire 1.0 8V 2p', '2004-2013', '1'],
  ],
};
const index = buildIndex(raw);

const base: VehicleSuggestion = { label: 'Honda Civic 2.0 16v', source: 'base', vehicleText: 'Honda Civic 2.0 16v' };
const mine: VehicleSuggestion = { label: 'Gol 1.0 - ABC1D23', source: 'cliente', vehicleText: 'Gol 1.0', plate: 'ABC1D23' };

describe('valor com placa', () => {
  it('junta e separa modelo e placa', () => {
    expect(joinVehicleValue('Gol 1.0', 'ABC1D23')).toBe('Gol 1.0 - ABC1D23');
    expect(joinVehicleValue(' Gol ', '')).toBe('Gol');
    expect(queryOf('Civic - XYZ9A99', true)).toBe('Civic');
    expect(queryOf('Civic - XYZ9A99', false)).toBe('Civic - XYZ9A99');
  });
  it('escolher sugestão preserva a placa do campo (plateAware)', () => {
    expect(valueAfterPick('civic - XYZ9A99', base, true)).toBe('Honda Civic 2.0 16v - XYZ9A99');
    expect(valueAfterPick('civic', base, true)).toBe('Honda Civic 2.0 16v');
  });
  it('veículo do cliente traz a própria placa; sem plateAware vira só o modelo', () => {
    expect(valueAfterPick('g', mine, true)).toBe('Gol 1.0 - ABC1D23');
    expect(valueAfterPick('g', mine, false)).toBe('Gol 1.0');
    expect(valueAfterPick('civic', base, false)).toBe('Honda Civic 2.0 16v');
  });
  it('placa digitada à mão vence a do veículo do cliente; placa de outro veículo do cliente não', () => {
    expect(valueAfterPick('gol - ZZZ9Z99', mine, true, ['ABC1D23'])).toBe('Gol 1.0 - ZZZ9Z99');
    expect(valueAfterPick('uno - QQQ1Q11', mine, true, ['qqq1q11', 'ABC1D23'])).toBe('Gol 1.0 - ABC1D23');
  });
  it('replaceModelKeepingPlate troca só o modelo', () => {
    expect(replaceModelKeepingPlate('civc - ABC1D23', 'Honda Civic')).toBe('Honda Civic - ABC1D23');
  });
});

describe('lista de opções', () => {
  it('cliente primeiro e limite total respeitado, com índices em sequência', () => {
    const groups = buildVehicleSuggestions({
      query: '', clientVehicles: [{ model: 'Gol 1.0', plate: 'AAA1A11' }, { model: 'Uno', plate: '' }], index,
    });
    const lim = limitGroups(groups, 1);
    expect(lim).toHaveLength(1);
    expect(lim[0].id).toBe('cliente');
    expect(flattenOptions(lim).map(o => o.index)).toEqual([0]);
  });
  it('consulta traz grupos na ordem cliente, oficina, base', () => {
    const groups = buildVehicleSuggestions({
      query: 'civic', clientVehicles: [{ model: 'Civic LXS', plate: 'AAA1A11' }],
      shopVehicles: [{ text: 'Civic Si', norm: 'civic si', count: 2 }], index,
    });
    const lim = limitGroups(groups, 14);
    expect(lim.map(g => g.id)).toEqual(['cliente', 'oficina', 'base']);
    expect(flattenOptions(lim).map(o => o.index)).toEqual(flattenOptions(lim).map((_, i) => i));
  });
  it('veículo novo digitado (texto livre) vira sugestão da oficina', () => {
    const groups = buildVehicleSuggestions({ query: 'kombi', shopVehicles: [{ text: 'Kombi 1.6 1975', norm: 'kombi 1.6 1975', count: 1 }], index: null });
    expect(groups[0].id).toBe('oficina');
  });
});

describe('highlightParts', () => {
  it('destaca prefixos sem acento e junta trechos', () => {
    expect(highlightParts('Honda Civic 2.0 16v 2015', 'civ 2015')).toEqual([
      { text: 'Honda ', match: false }, { text: 'Civ', match: true }, { text: 'ic 2.0 16v ', match: false }, { text: '2015', match: true },
    ]);
  });
  it('sem consulta não destaca', () => {
    expect(highlightParts('Gol', '')).toEqual([{ text: 'Gol', match: false }]);
  });
});

describe('decideEnter', () => {
  const lim = flattenOptions(limitGroups(buildVehicleSuggestions({ query: 'civic', index }), 14));
  it('opção destacada seleciona', () => {
    expect(decideEnter(lim, 0, 'civic', index)).toEqual({ kind: 'pick', suggestion: lim[0].suggestion });
  });
  it('sem destaque usa o melhor casamento inequívoco', () => {
    const d = decideEnter([], -1, 'civic 2.0 2015', index);
    expect(d).toEqual({ kind: 'label', label: 'Honda Civic 2.0 16v 2015' });
  });
  it('sem casamento mantém o texto digitado', () => {
    expect(decideEnter([], -1, 'xyzzy', index)).toEqual({ kind: 'keep' });
    expect(decideEnter([], -1, 'civic', null)).toEqual({ kind: 'keep' });
    expect(decideEnter([], -1, '  ', index)).toEqual({ kind: 'keep' });
  });
});

describe('describeCatalog', () => {
  it('avisa base parcial e lista contagens', () => {
    const r = describeCatalog({ generatedAt: '2026-10-16T12:00:00.000Z', brands: 74, versions: 4738, partial: true });
    expect(r.details).toEqual(['Gerada em 16/10/2026', '74 marcas', '4738 versões']);
    expect(r.warning).toBe('Base parcial: algumas marcas ainda não incluídas.');
  });
  it('sem meta nem aviso', () => {
    expect(describeCatalog(undefined)).toEqual({ details: [], warning: undefined });
  });
});

describe('segundo passo: ano da versão', () => {
  const v: VehicleSuggestion = { label: 'Honda Civic 1.7 16v', source: 'base', vehicleText: 'Honda Civic 1.7 16v', years: [2001, 2003, 2002, 2006, 2006, 32000] };
  it('lista anos do mais novo ao mais antigo, sem repetição nem zero km', () => {
    expect(listYearsDesc(v.years)).toEqual([2006, 2003, 2002, 2001]);
    expect(listYearsDesc(undefined)).toEqual([]);
  });
  it('monta o rótulo com e sem ano', () => {
    expect(labelWithYear('Honda Civic 1.7 16v', 2006)).toBe('Honda Civic 1.7 16v 2006');
    expect(labelWithYear('Honda Civic 1.7 16v')).toBe('Honda Civic 1.7 16v');
    expect(valueAfterPick('civic - ABC1D23', suggestionWithYear(v, 2006), true)).toBe('Honda Civic 1.7 16v 2006 - ABC1D23');
  });
  it('base sem ano e com vários anos abre o seletor', () => {
    const r = resolvePick(v);
    expect(r.kind).toBe('years');
    if (r.kind === 'years') expect(r.years[0]).toBe(2006);
  });
  it('ano já definido, texto pronto e ano único preenchem direto', () => {
    expect(resolvePick({ ...v, year: 2015, label: 'Honda Civic 1.7 16v 2015', vehicleText: 'Honda Civic 1.7 16v 2015' }).kind).toBe('direct');
    expect(resolvePick(mine).kind).toBe('direct');
    expect(resolvePick({ label: 'Gol', source: 'oficina', vehicleText: 'Gol' }).kind).toBe('direct');
    const one = resolvePick({ ...v, years: [2010] });
    expect(one.kind === 'direct' && one.suggestion.vehicleText).toBe('Honda Civic 1.7 16v 2010');
    expect(resolvePick({ ...v, years: [] }).kind).toBe('direct');
  });
});

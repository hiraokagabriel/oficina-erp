import { describe, expect, it } from 'vitest';
import {
  buildIndex, formatVehicleLabel, normalizeText, parseVersionName, parseYearRanges, type RawVehicleCatalog,
} from './vehicleCatalog';
import { bestMatch, searchVehicles } from './vehicleSearch';
import realRaw from '../data/veiculos-br.json';

describe('normalizeText', () => {
  it('minúsculas, sem acento, sem pontuação', () => {
    expect(normalizeText('Citroën C4 Pallas')).toBe('citroen c4 pallas');
    expect(normalizeText('  HR-V  EXL, Aut. ')).toBe('hr v exl aut');
    expect(normalizeText('Scénic')).toBe('scenic');
  });
  it('2,0 vira 2.0 e 2.O (letra O) vira 2.0', () => {
    expect(normalizeText('Civic 2,0')).toBe('civic 2.0');
    expect(normalizeText('Civic 2.O 16V')).toBe('civic 2.0 16v');
    expect(normalizeText('1.0/1.6')).toBe('1.0 1.6');
  });
  it('vazio e nulo', () => {
    expect(normalizeText('')).toBe('');
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
  });
});

describe('formatVehicleLabel', () => {
  it('ordem MARCA MODELO MOTOR VÁLVULAS ANO', () => {
    expect(formatVehicleLabel({ brand: 'Honda', model: 'Civic', displacement: '2.0', valves: 16, year: 2015 })).toBe('Honda Civic 2.0 16v 2015');
  });
  it('omite partes ausentes', () => {
    expect(formatVehicleLabel({ brand: 'Honda', model: 'Civic' })).toBe('Honda Civic');
    expect(formatVehicleLabel({ brand: 'Fiat', model: 'Uno', displacement: '1.0', year: 2010 })).toBe('Fiat Uno 1.0 2010');
    expect(formatVehicleLabel({ brand: 'Fiat', model: 'Uno', valves: 8 })).toBe('Fiat Uno 8v');
  });
  it('cilindrada com ponto, também a partir de vírgula ou número', () => {
    expect(formatVehicleLabel({ model: 'Gol', displacement: '1,6' })).toBe('Gol 1.6');
    expect(formatVehicleLabel({ model: 'Gol', displacement: 2 })).toBe('Gol 2.0');
    expect(formatVehicleLabel({ model: 'Gol', displacement: 1.6 })).toBe('Gol 1.6');
  });
});

describe('parseYearRanges', () => {
  it('faixas e anos soltos', () => {
    expect(parseYearRanges('2021,2023-2025')).toEqual([2021, 2023, 2024, 2025]);
    expect(parseYearRanges('1998')).toEqual([1998]);
    expect(parseYearRanges('')).toEqual([]);
  });
});

// Nomes reais da FIPE (tipo carros). [marca, nome FIPE, família, cilindrada, válvulas]
type Row = [string, string, string, string | undefined, number | undefined];
const TABLE: Row[] = [
  ['Volkswagen', 'Gol 1.0 Mi 8V', 'Gol', '1.0', 8],
  ['Volkswagen', 'VOYAGE  Trendline 1.0 T.Flex 8V 4p', 'Voyage', '1.0', 8],
  ['Volkswagen', 'Saveiro 1.6 Mi Total Flex 8V CE', 'Saveiro', '1.6', 8],
  ['Volkswagen', 'Fox 1.0 Mi Total Flex 8V 3p', 'Fox', '1.0', 8],
  ['Volkswagen', 'Polo 1.0 Flex 12V 5p', 'Polo', '1.0', 12],
  ['Volkswagen', 'VIRTUS 1.6 MSI Flex 16V 4p Aut.', 'Virtus', '1.6', 16],
  ['Volkswagen', 'T-Cross 1.0 TSI Flex 12V 5p Mec.', 'T-Cross', '1.0', 12],
  ['Volkswagen', 'CROSSFOX  1.6 T. Flex 16V 5p', 'Cross Fox', '1.6', 16],
  ['Volkswagen', 'SpaceCross 1.6 Mi Total Flex 16V', 'Space Cross', '1.6', 16],
  ['Volkswagen', 'Kombi Carat', 'Kombi', undefined, undefined],
  ['Fiat', 'Palio 1.0 Cel. ECON./ITALIA F.Flex 8V 4p', 'Palio', '1.0', 8],
  ['Fiat', 'Palio Weekend 1.0 6-marchas', 'Palio Weekend', '1.0', undefined],
  ['Fiat', 'Uno 1.6 mpi 2p e 4p', 'Uno', '1.6', undefined],
  ['Fiat', 'MOBI DRIVE 1.0 Flex 6V 5p', 'Mobi', '1.0', 6],
  ['Fiat', 'ARGO 1.0 6V Flex', 'Argo', '1.0', 6],
  ['Fiat', 'CRONOS 1.0 6V Flex', 'Cronos', '1.0', 6],
  ['Fiat', 'Strada 1.3 mpi Fire 8V 67cv CE', 'Strada', '1.3', 8],
  ['Fiat', 'Toro Blackjack 2.4 16V flex Aut', 'Toro', '2.4', 16],
  ['Fiat', 'Grand Siena 1.0 EVO Flex 8V 4p', 'Grand Siena', '1.0', 8],
  ['Fiat', 'Doblo  1.4 mpi Fire Flex  8V 4p', 'Doblo', '1.4', 8],
  ['Fiat', '500 ABARTH MULTIAIR 1.4 TB 16V 3p', '500', '1.4', 16],
  ['Ford', 'Fiesta 1.0 8V Flex/Class 1.0 8V Flex 5p', 'Fiesta', '1.0', 8],
  ['Ford', 'Ka 1.0 8V/1.0 8V ST Flex 3p', 'Ka', '1.0', 8],
  ['Ford', 'EcoSport  100 Anos 1.5 Flex 5p Aut.', 'EcoSport', '1.5', undefined],
  ['Ford', 'Focus 1.6 S/1.6 SE Flex 16v 5p Aut', 'Focus', '1.6', 16],
  ['Chevrolet', 'Corsa Furgão 1.6 MPFi Powertech 92cv', 'Corsa', '1.6', undefined],
  ['Chevrolet', 'Celta 1.0/ Super 1.0 MPFI VHC 8v 5p', 'Celta', '1.0', 8],
  ['Chevrolet', 'ONIX  Lollapalooza 1.0 F.Power 5p Mec.', 'Onix', '1.0', undefined],
  ['Chevrolet', 'PRISMA  Sed. Maxx/ LT 1.4 8V ECONOF. 4p', 'Prisma', '1.4', 8],
  ['Chevrolet', 'COBALT 1.8 8V Econo.Flex 4p Aut.', 'Cobalt', '1.8', 8],
  ['Chevrolet', 'TRACKER 1.0 Turbo 12V Flex Aut. ', 'Tracker', '1.0', 12],
  ['Chevrolet', 'S10 Blazer  DTi 2.8 4x2 Turbo Diesel', 'S10', '2.8', undefined],
  ['Chevrolet', 'MONTANA  Sport 1.8 MPFI FlexPower 8V', 'Montana', '1.8', 8],
  ['Chevrolet', 'SPIN 1.8 8V Econo.Flex 5p Aut.', 'Spin', '1.8', 8],
  ['Honda', 'Civic Coupe EX/ EXS 1.6 16V 2p', 'Civic', '1.6', 16],
  ['Honda', 'Civic Sedan EXL 2.0 Flex 16V Aut.4p', 'Civic', '2.0', 16],
  ['Honda', 'Fit CX 1.4 Flex 16V 5p Aut.', 'Fit', '1.4', 16],
  ['Honda', 'CITY Hatchback EX 1.5 Flex 16V Aut.', 'City', '1.5', 16],
  ['Honda', 'HR-V Advance 1.5  Flex TB 16V 5p Aut.', 'HR-V', '1.5', 16],
  ['Toyota', 'Corolla Altis 1.8 16V Aut. (Híbrido)', 'Corolla', '1.8', 16],
  ['Toyota', 'Hilux 4x2 2.4 Diesel', 'Hilux', '2.4', undefined],
  ['Toyota', 'ETIOS 1.3 Flex 16V 5p Mec.', 'Etios', '1.3', 16],
  ['Toyota', 'Land Cruiser 4WD 4.5 24V', 'Land Cruiser', '4.5', 24],
  ['Hyundai', 'HB20 1 Million 1.6 Flex 16V Aut.', 'HB20', '1.6', 16],
  ['Hyundai', 'Creta 1 Million 1.6 16V Flex Aut.', 'Creta', '1.6', 16],
  ['Hyundai', 'Tucson 2.0 16V Aut.', 'Tucson', '2.0', 16],
  ['Hyundai', 'Santa Fe 3.5 V6 4X4 Aut.', 'Santa Fe', '3.5', undefined],
  ['Renault', 'SANDERO Auth. Plus Hi-Power 1.0 16V 5p', 'Sandero', '1.0', 16],
  ['Renault', 'LOGAN Authentique Flex 1.0 12V 4p', 'Logan', '1.0', 12],
  ['Renault', 'DUSTER 1.6 Hi-Flex 16V Mec.', 'Duster', '1.6', 16],
  ['Renault', 'Kwid ConnecTV 1.0 Flex 12V Mec.', 'Kwid', '1.0', 12],
  ['Renault', 'Clio Auth. /AIR Hi-Flex 1.6 16V 5p', 'Clio', '1.6', 16],
  ['Renault', 'Master 2.3 dCi Chassi 16V Diesel', 'Master', '2.3', 16],
  ['Nissan', 'LIVINA 1.6 16V Flex Fuel 5p', 'Livina', '1.6', 16],
  ['Suzuki', 'Grand Vitara 1.6 16V Aut.', 'Grand Vitara', '1.6', 16],
  ['Peugeot', '208 Active 1.0 Flex 5p Mec.', '208', '1.0', undefined],
  ['Citroën', 'C3 100 Anos 1.6 16V Flex Aut.', 'C3', '1.6', 16],
  ['Jeep', 'COMPASS Black Hurricane 2.0 4x4 TB Aut.', 'Compass', '2.0', undefined],
  ['Kia Motors', 'Sportage 2.0 16V Aut.', 'Sportage', '2.0', 16],
  ['Land Rover', 'Range R. Autobio. 3.0 I6 TB Die. (Híb.)', 'Range Rover', '3.0', undefined],
  ['Land Rover', 'Range R.EVOQUE HSE Dyna. 2.0 Dies. Aut.', 'Range Rover Evoque', '2.0', undefined],
  ['Land Rover', 'Range R. VELAR 3.0 4x4 V6 380cv Aut.', 'Range Rover Velar', '3.0', undefined],
  ['Land Rover', 'Range Rover Sport HSE 3.0', 'Range Rover Sport', '3.0', undefined],
  ['Mercedes-Benz', 'C-180 CGI Coupe Sport 1.6 TB 16V Aut.', 'C 180', '1.6', 16],
  ['Mercedes-Benz', 'Classe A 190 Elegance 1.9 Mec.', 'A 190', '1.9', undefined],
  ['Mitsubishi', 'L200 Triton HPE 3.2 4x4 Diesel', 'L200', '3.2', undefined],
  ['Mitsubishi', 'Eclipse Cross HPE 1.5 16V TB 165cv Aut.', 'Eclipse Cross', '1.5', 16],
  ['Ford', 'F-250 XL 4.2 Turbo Diesel', 'F-250', '4.2', undefined],
  ['BMW', '318i/iA Compact 1.8 16V', '318i', '1.8', 16],
];

describe('parseVersionName: tabela de nomes reais', () => {
  it.each(TABLE)('%s | %s', (brand, name, family, displacement, valves) => {
    const p = parseVersionName(name, brand);
    expect({ family: p.family, displacement: p.displacement, valves: p.valves }).toEqual({ family, displacement, valves });
  });
});

describe('parseVersionName: regras', () => {
  it('cilindrada aceita 2.O (letra O) e vírgula', () => {
    expect(parseVersionName('Civic LXS 2.O 16V').displacement).toBe('2.0');
    expect(parseVersionName('Civic LXS 2,0 16V').displacement).toBe('2.0');
  });
  it('pega a primeira cilindrada de uma lista e ignora o cv', () => {
    expect(parseVersionName('Accord Sedan EX 2.4/2.3/ 2.2 16V').displacement).toBe('2.4');
    expect(parseVersionName('Strada 1.3 mpi Fire 8V 67cv CE').displacement).toBe('1.3');
    expect(parseVersionName('Alguma Coisa 156cv').displacement).toBeUndefined();
  });
  it('cilindrada colada em ponto de abreviação ("Ed.3.0")', () => {
    expect(parseVersionName('Range R. First Ed.3.0 350cv Die.(Hib.)').displacement).toBe('3.0');
  });
  it('válvulas: 16V/16v; V6 e V8 não são válvulas; ausente fica indefinida', () => {
    expect(parseVersionName('Focus 1.6 16v 5p').valves).toBe(16);
    expect(parseVersionName('Vitara JLX 2.0 V6 4x4').valves).toBeUndefined();
    expect(parseVersionName('CLS-500 V8 24V').valves).toBe(24);
    expect(parseVersionName('Uno Mille 1.0').valves).toBeUndefined();
  });
  it('potência em cv', () => {
    expect(parseVersionName('Civic Coupe Si 2.4 16V 206cv Mec. 2p').horsepower).toBe(206);
    expect(parseVersionName('Gol 1.0').horsepower).toBeUndefined();
  });
  it('combustível citado no nome', () => {
    expect(parseVersionName('Civic 2.0 Flex 16V').fuels).toEqual(['Flex']);
    expect(parseVersionName('Hilux 2.8 Diesel').fuels).toEqual(['Diesel']);
    expect(parseVersionName('Audi E-TRON GT Aut. (Elétrico)').fuels).toEqual(['Elétrico']);
    expect(parseVersionName('Corolla Altis 1.8 16V Aut. (Híbrido)').fuels).toEqual(['Híbrido']);
    expect(parseVersionName('Gol 1.0').fuels).toEqual([]);
  });
  it('segunda palavra de carroceria/acabamento não estende a família', () => {
    for (const n of ['Civic Sedan LX 1.8', 'Civic Coupe Si', 'Corolla SW 2.0', 'Gol CD 1.6', 'Fiesta Hatch 1.0', 'Fox Cross 1.6', 'Palio Fire 1.0']) {
      expect(parseVersionName(n).family.split(' ')).toHaveLength(1);
    }
  });
  it('família com palavra-prefixo genérica (Grand X, New X)', () => {
    expect(parseVersionName('Grand Cherokee Limited 3.6').family).toBe('Grand Cherokee');
    expect(parseVersionName('New Fiesta Hatch 1.6').family).toBe('New Fiesta');
    expect(parseVersionName('Grand Sedan 1.0').family).toBe('Grand');
  });
  it('trim guarda o restante e a marca repetida no começo é descartada', () => {
    const p = parseVersionName('Civic Sedan EXL 2.0 Flex 16V Aut.4p', 'Honda');
    expect(p.trim).toBe('Sedan EXL 2.0 Flex 16V Aut.4p');
    expect(parseVersionName('Honda Civic LX', 'Honda').family).toBe('Civic');
  });
});

describe('buildIndex', () => {
  const raw: RawVehicleCatalog = {
    brands: ['Honda'],
    versions: [
      [0, 'Civic Sedan EXL 2.0 Flex 16V Aut.4p', '2014-2016', '5'],
      [0, 'Civic Sedan LXR 2.0 Flex 16V Mec. 4p', '2014-2016', '5'],
      [0, 'CIVIC Sedan LX 2.0', '2014-2015', '1'],
      [0, 'Civic Hatch DX', '2014', '1'],
      [0, 'Civic Sedan LX 1.8', '2008-2010', '1'],
      [0, 'Civic Sedan LX 1.8 16V', '2008-2010', '1'],
      [0, 'Civic Zero', '32000', '1'],
    ],
  };
  const idx = buildIndex(raw);
  it('agrega acabamentos (marca+modelo+cilindrada+válvulas) e junta os anos', () => {
    const e = idx.entries.find(x => x.displacement === '2.0' && x.valves === 16);
    expect(e?.versions).toBe(2);
    expect(e?.years).toEqual([2014, 2015, 2016]);
  });
  it('entrada sem válvulas some quando irmã com válvulas cobre os anos dela', () => {
    expect(idx.entries.filter(x => x.displacement === '2.0')).toHaveLength(1);
    expect(idx.entries.filter(x => x.displacement === '1.8')).toHaveLength(1);
  });
  it('entrada sem cilindrada some quando irmãs cobrem o ano; versão sem anos é ignorada', () => {
    expect(idx.entries.some(x => x.displacement === undefined)).toBe(false);
    expect(idx.versions.some(v => v.detail === 'Civic Zero')).toBe(false);
  });
});

// Fumaça com a base real gerada por `npm run vehicles:build` (a base pode estar parcial se a API estava no limite diário).
describe('base real (veiculos-br.json)', () => {
  const raw = realRaw as unknown as RawVehicleCatalog;
  const index = buildIndex(raw);
  const has = (brand: string) => raw.brands.includes(brand);
  const first = (q: string) => searchVehicles(index, q, { limit: 1 })[0];

  it('tem acentos corretos (UTF-8) e metadados', () => {
    expect(raw.meta?.source).toContain('FIPE');
    expect(raw.brands).toContain('Citroën');
    expect(raw.versions.some(v => /Elétrico|Híbrido/.test(v[1]))).toBe(true);
    expect(raw.versions.some(v => /Ã[ -¿]|Â[ -¿]|�/.test(v[1]))).toBe(false);
    expect(index.entries.length).toBeGreaterThan(1500);
  });
  it('civic 2.0 e ano: a ordem das palavras não importa', () => {
    const a = first('civic 2.0 2015');
    expect(a?.label).toBe('Honda Civic 2.0 16v 2015');
    expect(first('2015 civic 2.0')?.label).toBe(a?.label);
    expect(first('honda civic 2.0 16v 2015')?.label).toBe(a?.label);
    expect(searchVehicles(index, 'civic 2015').every(r => r.years.includes(2015) && r.model === 'Civic')).toBe(true);
    expect(bestMatch(index, 'honda civic 2.0 16v 2015')?.label).toBe('Honda Civic 2.0 16v 2015');
  });
  it('erro de digitação e ano fora da faixa', () => {
    expect(first('civc')?.model).toBe('Civic');
    expect(searchVehicles(index, 'civic 1930')).toEqual([]);
  });
  it.skipIf(!has('Volkswagen'))('vw gol 1.0', () => {
    expect(first('vw gol 1.0')).toMatchObject({ brand: 'Volkswagen', model: 'Gol', displacement: '1.0' });
  });
  it.skipIf(!has('Toyota'))('corolla 2.0', () => {
    expect(first('corolla 2.0')).toMatchObject({ brand: 'Toyota', model: 'Corolla', displacement: '2.0' });
  });
  it('hb20 1.0 e uno mille', () => {
    expect(first('hb20 1.0')).toMatchObject({ brand: 'Hyundai', model: 'HB20', displacement: '1.0' });
    expect(first('uno mille')).toMatchObject({ brand: 'Fiat', model: 'Uno' });
  });
  it('desempenho na base real', () => {
    searchVehicles(index, 'civic');
    const t0 = performance.now();
    searchVehicles(index, 'civic 2.0 2015');
    searchVehicles(index, 'hb20 1.0');
    expect(performance.now() - t0).toBeLessThan(25);
  });
});

import { describe, it, expect } from 'vitest';
import { extractVehicleInfo } from './vehicleInfo';

describe('extractVehicleInfo', () => {
  it('marca, modelo, motor, válvulas, ano e placa no fim', () => {
    const v = extractVehicleInfo('VW Gol 1.0 8V 2012 - ABC1D23');
    expect(v).toMatchObject({ brand: 'VW', model: 'Gol', year: 2012, engine: '1.0', valves: 8, plate: 'ABC1D23' });
    expect(v.label).toBe('VW Gol 2012 1.0 8V');
  });

  it('só marca, modelo e ano', () => {
    const v = extractVehicleInfo('Fiat Uno 2015');
    expect(v).toMatchObject({ brand: 'Fiat', model: 'Uno', year: 2015, engine: '' });
    expect(v.valves).toBeUndefined();
    expect(v.label).toBe('Fiat Uno 2015');
  });

  it('sem ano', () => {
    const v = extractVehicleInfo('Honda Civic 2.0 16v');
    expect(v).toMatchObject({ brand: 'Honda', model: 'Civic', engine: '2.0', valves: 16 });
    expect(v.year).toBeUndefined();
    expect(v.label).toBe('Honda Civic 2.0 16V');
  });

  it('só marca e modelo', () => {
    expect(extractVehicleInfo('Chevrolet Onix').label).toBe('Chevrolet Onix');
  });

  it('apelidos de marca viram a mesma marca; vírgula no motor', () => {
    expect(extractVehicleInfo('Volkswagen Gol 1,6').brand).toBe('VW');
    expect(extractVehicleInfo('Volkswagen Gol 1,6').engine).toBe('1.6');
    expect(extractVehicleInfo('GM Celta').brand).toBe('Chevrolet');
    expect(extractVehicleInfo('Mercedes Benz C 180').brand).toBe('Mercedes-Benz');
  });

  it('marca desconhecida: o resto vira modelo, nada inventado', () => {
    const v = extractVehicleInfo('Fusca 1975');
    expect(v).toMatchObject({ brand: '', model: 'Fusca', year: 1975 });
    expect(v.label).toBe('Fusca 1975');
  });

  it('ano em par usa o do modelo; placa sem " - " é achada no texto', () => {
    const v = extractVehicleInfo('Ford Ka 2012/2013 ABC-1234');
    expect(v).toMatchObject({ brand: 'Ford', model: 'Ka', year: 2013 });
    expect(v.plate).toBe('ABC-1234');
  });

  it('texto sem nada reconhecível volta o original; vazio tem rótulo fixo', () => {
    expect(extractVehicleInfo('2015').label).toBe('2015');
    expect(extractVehicleInfo('').label).toBe('Veículo não informado');
    expect(extractVehicleInfo(undefined).label).toBe('Veículo não informado');
    for (const t of ['', '2015', 'x', 'VW']) expect(extractVehicleInfo(t).label).not.toMatch(/undefined|NaN/);
  });

  it('chave ignora caixa, acento e espaços; muda com ano, motor ou válvulas', () => {
    const a = extractVehicleInfo('vw  GOL 1.0 8v 2012 - AAA1A11').key;
    expect(extractVehicleInfo('VW Gol 1.0 8V 2012 - BBB2B22').key).toBe(a);
    expect(extractVehicleInfo('VW Gol 1.0 8V 2013').key).not.toBe(a);
    expect(extractVehicleInfo('VW Gol 1.6 8V 2012').key).not.toBe(a);
    expect(extractVehicleInfo('VW Gol 1.0 16V 2012').key).not.toBe(a);
  });
});

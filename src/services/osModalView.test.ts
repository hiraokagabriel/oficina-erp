import { describe, it, expect } from 'vitest';
import { centsToMoneyText, firstErrorField, parsePriceText, sanitizeMoneyText, validateOSFields } from './osModalView';

const ok = { clientName: 'Ana', vehicle: 'Gol', needsClientChoice: false, osNumber: '12' };

describe('validateOSFields', () => {
  it('sem erro quando tudo preenchido', () => {
    expect(validateOSFields(ok)).toEqual({});
    expect(firstErrorField({})).toBeNull();
  });
  it('cliente e veículo vazios', () => {
    const e = validateOSFields({ ...ok, clientName: '', vehicle: '' });
    expect(e['os-client']).toBeTruthy();
    expect(e['os-vehicle']).toBeTruthy();
    expect(firstErrorField(e)).toBe('os-client');
  });
  it('homônimo sem escolha', () => {
    const e = validateOSFields({ ...ok, needsClientChoice: true });
    expect(firstErrorField(e)).toBe('os-client-choice');
  });
  it('número da OS inválido', () => {
    expect(firstErrorField(validateOSFields({ ...ok, osNumber: 'x' }))).toBe('os-number');
    expect(validateOSFields({ ...ok, osNumber: '' })['os-number']).toBeTruthy();
  });
});

describe('texto de dinheiro', () => {
  it('aceita vírgula e ponto', () => {
    expect(parsePriceText('200,00')).toBe(20000);
    expect(parsePriceText('12.5')).toBe(1250);
    expect(parsePriceText('')).toBe(0);
    expect(parsePriceText('abc')).toBe(0);
  });
  it('sanitiza e formata', () => {
    expect(sanitizeMoneyText('R$ 1a2,5')).toBe('12,5');
    expect(centsToMoneyText(1250)).toBe('12,5');
    expect(centsToMoneyText(0)).toBe('0');
  });
});

import { describe, it, expect } from 'vitest';
import { centsToMoneyText, firstErrorField, parseMoneyField, parseMoneyText, sanitizeMoneyText, validateOSFields } from './osModalView';

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

const cents = (raw: string) => {
  const r = parseMoneyText(raw);
  return r.status === 'ok' ? r.cents : r.status;
};

describe('parseMoneyText', () => {
  it('formato pt-BR com milhar', () => {
    expect(cents('1.234,50')).toBe(123450);
    expect(cents('1.500,00')).toBe(150000);
    expect(cents('1.234.567,8')).toBe(123456780);
    expect(cents('1234,5')).toBe(123450);
    expect(cents('200,00')).toBe(20000);
  });
  it('sem vírgula: ponto com 3 dígitos é milhar, senão decimal', () => {
    expect(cents('1.500')).toBe(150000);
    expect(cents('1.234.567')).toBe(123456700);
    expect(cents('1.5')).toBe(150);
    expect(cents('12.5')).toBe(1250);
    expect(cents('1234.56')).toBe(123456);
    expect(cents('.5')).toBe(50);
  });
  it('vírgula final e inteiro', () => {
    expect(cents('12,')).toBe(1200);
    expect(cents('1,5')).toBe(150);
    expect(cents('7')).toBe(700);
  });
  it('vazio', () => {
    expect(cents('')).toBe('empty');
    expect(cents('   ')).toBe('empty');
  });
  it('inválido nunca vira valor errado', () => {
    for (const bad of ['1,234.50', 'abc', '1.2.3', '1,2,3', '-', '.', ',', '1.2,5', '0,005', '0.500', '1234.567', '5-', '1 2a']) {
      expect(cents(bad)).toBe('invalid');
    }
  });
  it('negativo só com "-" na frente e o sinal é preservado', () => {
    expect(cents('-5')).toBe(-500);
    expect(cents('-1.234,50')).toBe(-123450);
    expect(cents('-0')).toBe(0);
  });
});

describe('parseMoneyField', () => {
  it('preço: vazio = 0; inválido não grava', () => {
    expect(parseMoneyField('price', '')).toEqual({ ok: true, value: 0 });
    expect(parseMoneyField('price', '1.234,50')).toEqual({ ok: true, value: 123450 });
    expect(parseMoneyField('price', 'abc')).toEqual({ ok: false });
  });
  it('custo: vazio = sem custo; 0 e negativo = 0', () => {
    expect(parseMoneyField('cost', '')).toEqual({ ok: true, value: undefined });
    expect(parseMoneyField('cost', '0,5')).toEqual({ ok: true, value: 50 });
    expect(parseMoneyField('cost', '0')).toEqual({ ok: true, value: 0 });
    expect(parseMoneyField('cost', '-3')).toEqual({ ok: true, value: 0 });
  });
  it('opcional (adiantamento): vazio = sem valor', () => {
    expect(parseMoneyField('optional', '')).toEqual({ ok: true, value: undefined });
    expect(parseMoneyField('optional', '200,00')).toEqual({ ok: true, value: 20000 });
    expect(parseMoneyField('optional', '1,234.50')).toEqual({ ok: false });
  });
});

describe('texto de dinheiro', () => {
  it('sanitiza: "-" só na frente', () => {
    expect(sanitizeMoneyText('R$ 1a2,5')).toBe('12,5');
    expect(sanitizeMoneyText('-5')).toBe('-5');
    expect(sanitizeMoneyText('5-3')).toBe('53');
    expect(sanitizeMoneyText('--5')).toBe('-5');
  });
  it('formata em pt-BR e volta igual', () => {
    expect(centsToMoneyText(1250)).toBe('12,50');
    expect(centsToMoneyText(0)).toBe('0,00');
    expect(centsToMoneyText(123450)).toBe('1.234,50');
    expect(centsToMoneyText(-500)).toBe('-5,00');
    for (const c of [0, 5, 1250, 123450, -123450, 100000000]) expect(cents(centsToMoneyText(c))).toBe(c);
  });
});

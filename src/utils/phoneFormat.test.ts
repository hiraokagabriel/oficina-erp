import { describe, expect, it } from 'vitest';
import { formatPhoneDisplay } from './phoneFormat';

describe('formatPhoneDisplay', () => {
  it('celular com 11 dígitos', () => {
    expect(formatPhoneDisplay('11987654321')).toBe('(11) 98765-4321');
    expect(formatPhoneDisplay('(11) 98765-4321')).toBe('(11) 98765-4321');
  });
  it('fixo com 10 dígitos', () => {
    expect(formatPhoneDisplay('1134567890')).toBe('(11) 3456-7890');
  });
  it('tira o 55 do país', () => {
    expect(formatPhoneDisplay('+55 11 98765-4321')).toBe('(11) 98765-4321');
    expect(formatPhoneDisplay('551134567890')).toBe('(11) 3456-7890');
  });
  it('formato desconhecido volta como veio; vazio vira vazio', () => {
    expect(formatPhoneDisplay('9876-5432')).toBe('9876-5432');
    expect(formatPhoneDisplay('')).toBe('');
    expect(formatPhoneDisplay(undefined)).toBe('');
  });
});

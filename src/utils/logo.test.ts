import { describe, it, expect } from 'vitest';
import { normalizeLogoText, DEFAULT_LOGO_TEXT } from './logo';

describe('normalizeLogoText', () => {
  it('ausente ou vazio vira AM', () => {
    expect(normalizeLogoText(undefined)).toBe('AM');
    expect(normalizeLogoText(null)).toBe('AM');
    expect(normalizeLogoText('')).toBe('AM');
    expect(normalizeLogoText('   ')).toBe('AM');
    expect(DEFAULT_LOGO_TEXT).toBe('AM');
  });
  it('maiúsculas e trim', () => {
    expect(normalizeLogoText('  of ')).toBe('OF');
    expect(normalizeLogoText('ão')).toBe('ÃO');
  });
  it('corta em 3 caracteres', () => {
    expect(normalizeLogoText('abcdef')).toBe('ABC');
  });
  it('remove espaços internos, controles e símbolos', () => {
    expect(normalizeLogoText('a b\tc\n')).toBe('ABC');
    expect(normalizeLogoText('<b>')).toBe('B');
    expect(normalizeLogoText('!!')).toBe('AM');
  });
  it('aceita números', () => {
    expect(normalizeLogoText('a1')).toBe('A1');
  });
  it('conta pontos de código: letra fora do BMP não é cortada ao meio', () => {
    const r = normalizeLogoText('\u{1D4D0}\u{1D4D1}\u{1D4D2}\u{1D4D3}');
    expect(Array.from(r)).toHaveLength(3);
    expect(r).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });
});

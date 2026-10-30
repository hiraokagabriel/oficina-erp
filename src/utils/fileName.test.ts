import { describe, it, expect } from 'vitest';
import { sanitizeFilePart } from './fileName';

describe('sanitizeFilePart', () => {
  it('tira acentos e cedilha', () => expect(sanitizeFilePart('João Conceição')).toBe('Joao_Conceicao'));
  it('troca símbolos por _ e junta repetidos', () => expect(sanitizeFilePart('A / B -- C')).toBe('A_B_C'));
  it('tira _ das pontas', () => expect(sanitizeFilePart('  (Ana)  ')).toBe('Ana'));
  it('vazio ou só símbolos vira vazio', () => {
    expect(sanitizeFilePart('')).toBe('');
    expect(sanitizeFilePart('@#$%')).toBe('');
  });
  it('corta no limite (padrão 40)', () => {
    expect(sanitizeFilePart('a'.repeat(100))).toHaveLength(40);
    expect(sanitizeFilePart('a'.repeat(100), 50)).toHaveLength(50);
  });
});

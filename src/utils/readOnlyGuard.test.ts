import { describe, expect, it } from 'vitest';
import { READ_ONLY_MESSAGE, readOnlyBlock } from './readOnlyGuard';

describe('readOnlyBlock', () => {
  it('banco em somente leitura: devolve a mensagem de bloqueio', () => {
    expect(readOnlyBlock(true)).toBe(READ_ONLY_MESSAGE);
  });
  it('banco normal: não bloqueia', () => {
    expect(readOnlyBlock(false)).toBeNull();
  });
  it('mensagem simples em pt-BR, sem falso sucesso', () => {
    expect(READ_ONLY_MESSAGE).toBe('Somente leitura: este banco não aceita alterações.');
  });
});

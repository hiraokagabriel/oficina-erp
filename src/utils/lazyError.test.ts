import { describe, expect, it } from 'vitest';
import { CHUNK_MESSAGE, GENERIC_MESSAGE, isChunkLoadError, lazyErrorMessage } from './lazyError';

describe('lazyError', () => {
  it.each([
    'Failed to fetch dynamically imported module: http://x/assets/FinancialPage-abc.js',
    'error loading dynamically imported module',
    'Importing a module script failed.',
    'Loading chunk 12 failed.',
  ])('reconhece falha de chunk: %s', (m) => {
    expect(isChunkLoadError(new TypeError(m))).toBe(true);
    expect(lazyErrorMessage(new Error(m))).toBe(CHUNK_MESSAGE);
  });
  it('outro erro: mensagem genérica; valor que não é Error não quebra', () => {
    expect(lazyErrorMessage(new Error('x is undefined'))).toBe(GENERIC_MESSAGE);
    expect(lazyErrorMessage('Failed to fetch dynamically imported module')).toBe(CHUNK_MESSAGE);
    expect(lazyErrorMessage(null)).toBe(GENERIC_MESSAGE);
  });
  it('a mensagem de chunk é a combinada, sem jargão', () => {
    expect(CHUNK_MESSAGE).toBe('Não deu para abrir esta parte sem internet. Conecte e toque em Tentar de novo.');
  });
});

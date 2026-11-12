import { describe, expect, it } from 'vitest';
import { applyPatchToList } from './CloudDatabaseProvider';

type It = { id: string; v: number };

describe('applyPatchToList', () => {
  const prev: It[] = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }, { id: 'c', v: 1 }];

  it('troca no lugar, acrescenta o novo no fim e remove', () => {
    const out = applyPatchToList<It>(prev, [{ id: 'b', v: 2 }, { id: 'd', v: 1 }], ['c']);
    expect(out).toEqual([{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'd', v: 1 }]);
  });

  it('não muta a lista de entrada e patch vazio mantém os itens', () => {
    const out = applyPatchToList<It>(prev, [], []);
    expect(out).toEqual(prev);
    expect(prev).toHaveLength(3);
  });
});

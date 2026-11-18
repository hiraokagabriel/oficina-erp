import { describe, expect, it } from 'vitest';
import type { CatalogItem, DatabaseSchema } from '../types';
import { fixCatalogIds, prepareForCloud } from './split';
import { checkImportable } from './importCheck';
import { fixture } from './testKit';

const item = (id: string | undefined, description: string): CatalogItem =>
  ({ id, description, price: 1000 } as unknown as CatalogItem);

describe('fixCatalogIds (catálogo de banco antigo)', () => {
  it('mantém o primeiro de cada id, dá id novo e estável a quem não tem ou repete, sem apagar nada', () => {
    const taken = new Set<string>();
    const out = fixCatalogIds([item(undefined, 'A'), item('x', 'B'), item('x', 'C'), item('', 'D'), item('y', 'E')], 'peca', taken);
    expect(out.map(i => i.description)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(out[1].id).toBe('x');
    expect(out[4].id).toBe('y');
    expect(new Set(out.map(i => i.id)).size).toBe(5);
    expect(out[0].id).toBe('peca-ajuste-1');
    expect(out[2].id).toBe('peca-ajuste-3');
    // Mesmo arquivo, mesmos ids (reenviar a importação continua idempotente).
    const again = fixCatalogIds([item(undefined, 'A'), item('x', 'B'), item('x', 'C'), item('', 'D'), item('y', 'E')], 'peca', new Set());
    expect(again.map(i => i.id)).toEqual(out.map(i => i.id));
  });

  it('não reaproveita id já usado por peça nos serviços', () => {
    const taken = new Set<string>();
    fixCatalogIds([item('z', 'peça')], 'peca', taken);
    const servs = fixCatalogIds([item('z', 'serviço')], 'servico', taken);
    expect(servs[0].id).not.toBe('z');
  });

  it('prepareForCloud conserta o catálogo e o banco passa na conferência', () => {
    const db = fixture(5) as DatabaseSchema;
    const broken: DatabaseSchema = {
      ...db,
      catalogParts: [item(undefined, 'Sem id'), item('dup', 'Um'), item('dup', 'Dois'), ...db.catalogParts],
      catalogServices: [item(undefined, 'Serviço sem id'), ...db.catalogServices],
    };
    const prepared = prepareForCloud(broken);
    expect(prepared.catalogParts).toHaveLength(broken.catalogParts.length);
    expect(prepared.catalogServices).toHaveLength(broken.catalogServices.length);
    expect(checkImportable(prepared).filter(p => p.collection.startsWith('catalog'))).toEqual([]);
  });
});

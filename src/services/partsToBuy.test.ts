import { describe, it, expect } from 'vitest';
import { buildPartsToBuy, comparePartsOrder, filterOrdersForParts, normalizeDescription } from './partsToBuy';
import type { OSStatus, WorkOrder } from '../types';

const mk = (osNumber: number, status: OSStatus, vehicle: string, clientName: string, parts: string[]): WorkOrder =>
  ({
    id: `os-${osNumber}`, osNumber, status, vehicle, clientName, clientPhone: '', mileage: 0, services: [], total: 0, createdAt: '',
    parts: parts.map((d, i) => ({ id: `p${osNumber}-${i}`, description: d, price: 0 })),
  }) as WorkOrder;

describe('comparePartsOrder', () => {
  const k = (status: OSStatus, osNumber: number, year?: number) => ({ status, osNumber, year });
  it('situação primeiro, na sequência do fluxo', () => {
    const list = [k('AGUARDANDO_PAGAMENTO', 1), k('EM_SERVICO', 2), k('APROVADO', 3), k('ORCAMENTO', 9)];
    expect(list.sort(comparePartsOrder).map(x => x.status)).toEqual(['ORCAMENTO', 'APROVADO', 'EM_SERVICO', 'AGUARDANDO_PAGAMENTO']);
  });
  it('mesmo status: número da OS crescente', () => {
    expect([k('APROVADO', 30), k('APROVADO', 4)].sort(comparePartsOrder).map(x => x.osNumber)).toEqual([4, 30]);
  });
  it('empate de OS: ano do mais novo ao mais velho, sem ano por último', () => {
    const l = [k('APROVADO', 5), k('APROVADO', 5, 2010), k('APROVADO', 5, 2020)];
    expect(l.sort(comparePartsOrder).map(x => x.year)).toEqual([2020, 2010, undefined]);
  });
  it('empate total devolve 0', () => {
    expect(comparePartsOrder(k('APROVADO', 5, 2010), k('APROVADO', 5, 2010))).toBe(0);
    expect(comparePartsOrder(k('APROVADO', 5), k('APROVADO', 5))).toBe(0);
  });
  it('o status vence o número da OS', () => {
    expect(comparePartsOrder(k('APROVADO', 1), k('ORCAMENTO', 99))).toBeGreaterThan(0);
  });
});

describe('filterOrdersForParts', () => {
  const orders = [mk(1, 'ORCAMENTO', '', '', []), mk(2, 'APROVADO', '', '', []), mk(3, 'FINALIZADO', '', '', [])];
  it('ALL traz orçamento e aprovado; filtro específico traz só aquele', () => {
    expect(filterOrdersForParts(orders, 'ALL').map(o => o.osNumber)).toEqual([1, 2]);
    expect(filterOrdersForParts(orders, 'APROVADO').map(o => o.osNumber)).toEqual([2]);
  });
});

describe('buildPartsToBuy', () => {
  const sel = (...d: string[]) => new Set(d);

  it('normaliza descrição sem caixa, acento e espaços', () => {
    expect(normalizeDescription('  Filtro  de ÓLEO ')).toBe(normalizeDescription('filtro de oleo'));
  });

  it('só entram as peças selecionadas', () => {
    const plan = buildPartsToBuy([mk(1, 'ORCAMENTO', 'VW Gol 1.0 2012', 'Ana', ['Filtro', 'Vela'])], sel('Vela'));
    expect(plan.sections[0].groups[0].rows.map(r => r.description)).toEqual(['Vela']);
  });

  it('mesmo item em carros diferentes fica separado; no mesmo carro soma e lista as OS', () => {
    const orders = [
      mk(1, 'ORCAMENTO', 'VW Gol 1.0 8V 2012', 'Ana', ['Filtro de óleo']),
      mk(2, 'ORCAMENTO', 'vw gol 1.0 8v 2012', 'Bia', ['FILTRO DE OLEO']),
      mk(3, 'ORCAMENTO', 'VW Gol 1.0 8V 2014', 'Caio', ['Filtro de óleo']),
      mk(4, 'ORCAMENTO', 'Fiat Uno 2015', 'Dani', ['Filtro de óleo']),
    ];
    const plan = buildPartsToBuy(orders, sel('Filtro de óleo', 'FILTRO DE OLEO'));
    expect(plan.totals.distinct).toBe(3);
    expect(plan.totals.units).toBe(4);
    expect(plan.repeated).toHaveLength(1);
    expect(plan.repeated[0].quantity).toBe(2);
    expect(plan.repeated[0].orders.map(o => o.osNumber)).toEqual([1, 2]);
  });

  it('peça repetida na mesma OS soma a quantidade', () => {
    const os = mk(1, 'APROVADO', 'Fiat Uno 2015', 'Ana', ['Pastilha', 'pastilha']);
    const plan = buildPartsToBuy([os], sel('Pastilha', 'pastilha'));
    expect(plan.sections[0].groups[0].rows).toHaveLength(1);
    expect(plan.sections[0].groups[0].rows[0].quantity).toBe(2);
    expect(plan.repeated).toHaveLength(0);
  });

  it('ordem: situação > OS > ano', () => {
    const orders = [
      mk(20, 'APROVADO', 'Fiat Uno 2015', 'A', ['P']),
      mk(7, 'APROVADO', 'Fiat Uno 2010', 'B', ['P']),
      mk(30, 'ORCAMENTO', 'Fiat Uno', 'C', ['P']),
      mk(5, 'ORCAMENTO', 'Fiat Uno 2020', 'D', ['P']),
    ];
    const plan = buildPartsToBuy(orders, sel('P'));
    expect(plan.sections.map(s => s.status)).toEqual(['ORCAMENTO', 'APROVADO']);
    expect(plan.sections.flatMap(s => s.groups.map(g => g.osNumber))).toEqual([5, 30, 7, 20]);
    expect(plan.sections[0]).toMatchObject({ itemCount: 2, unitCount: 2 });
  });

  it('categoria ordena as linhas dentro da OS', () => {
    const os = mk(1, 'ORCAMENTO', 'Fiat Uno', 'A', []);
    os.parts = [
      { id: 'a', description: 'Z outros', price: 0, category: 'OUTROS' },
      { id: 'b', description: 'Disco', price: 0, category: 'FREIO' },
      { id: 'c', description: 'Correia', price: 0, category: 'MOTOR' },
    ];
    const rows = buildPartsToBuy([os], sel('Z outros', 'Disco', 'Correia')).sections[0].groups[0].rows;
    expect(rows.map(r => r.description)).toEqual(['Correia', 'Disco', 'Z outros']);
  });

  it('sem seleção ou sem OS: plano vazio', () => {
    expect(buildPartsToBuy([], sel('x')).sections).toEqual([]);
    expect(buildPartsToBuy([mk(1, 'ORCAMENTO', '', '', ['P'])], sel()).totals).toEqual({ distinct: 0, units: 0, orders: 0 });
  });
});

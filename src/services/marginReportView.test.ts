import { describe, it, expect } from 'vitest';
import { isLowCoverage, levelText, priceHintCents, priceHintText, rowMarginText } from './marginReportView';

describe('marginReportView', () => {
  it('levelText cobre os quatro níveis', () => {
    expect(levelText('NA_META')).toBe('Na meta');
    expect(levelText('ATENCAO')).toBe('Atenção');
    expect(levelText('ABAIXO')).toBe('Abaixo da meta');
    expect(levelText('SEM_CUSTO')).toBe('Sem custo');
  });

  it('rowMarginText mostra nível em texto e "sem custo" para null', () => {
    expect(rowMarginText(72.5, 'NA_META')).toBe('72,5% · Na meta');
    expect(rowMarginText(20, 'ABAIXO')).toBe('20% · Abaixo da meta');
    expect(rowMarginText(null, 'SEM_CUSTO')).toBe('sem custo');
  });

  it('isLowCoverage: só com receita e cobertura < 80', () => {
    expect(isLowCoverage(79.9, 1000)).toBe(true);
    expect(isLowCoverage(80, 1000)).toBe(false);
    expect(isLowCoverage(0, 0)).toBe(false);
  });

  it('priceHintCents: sugere a mediana só com diferença >= 10%', () => {
    expect(priceHintCents({ medianPrice: 11000, catalogPrice: 10000 })).toBe(11000);
    expect(priceHintCents({ medianPrice: 9000, catalogPrice: 10000 })).toBe(9000);
    expect(priceHintCents({ medianPrice: 10999, catalogPrice: 10000 })).toBeNull();
    expect(priceHintCents({ medianPrice: null, catalogPrice: 10000 })).toBeNull();
    expect(priceHintCents({ medianPrice: 5000, catalogPrice: null })).toBeNull();
    expect(priceHintCents({ medianPrice: 5000, catalogPrice: 0 })).toBeNull();
  });

  it('priceHintText usa o formatador recebido', () => {
    expect(priceHintText(11000, c => `R$ ${c / 100}`)).toBe('Sugestão: ajustar para R$ 110');
  });
});

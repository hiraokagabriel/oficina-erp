import { describe, it, expect } from 'vitest';
import { ChecklistSchema } from '../types';
import {
  DEFAULT_SUMMARY_CHOICE, choiceToOptions, inspectionItemText, countInspectedItems, itemDetailText, needsSummaryChoice, remainingLabel, sumItems,
} from './serviceSummaryView';

const cl = (statuses: Array<'ok' | 'attention' | 'urgent' | 'pending'>): ChecklistSchema => ({
  mileageIn: 0,
  notes: '',
  categories: [{ id: 'c', label: 'C', items: statuses.map((status, i) => ({ id: `i${i}`, label: `I${i}`, status })) }],
});

describe('serviceSummaryView', () => {
  it('padrão: nada incluso', () => {
    expect(choiceToOptions(DEFAULT_SUMMARY_CHOICE)).toEqual({ includeInspection: false, includeGeneralNote: false });
  });

  it('nota geral só vale com os itens da vistoria', () => {
    expect(choiceToOptions({ includeInspection: false, includeGeneralNote: true }).includeGeneralNote).toBe(false);
    expect(choiceToOptions({ includeInspection: true, includeGeneralNote: true })).toEqual({ includeInspection: true, includeGeneralNote: true });
  });

  it('countInspectedItems conta tudo que não é pending', () => {
    expect(countInspectedItems({ checklist: cl(['ok', 'attention', 'urgent', 'pending']) })).toBe(3);
    expect(countInspectedItems({ checklist: cl(['pending']) })).toBe(0);
    expect(countInspectedItems({ checklist: undefined })).toBe(0);
  });

  it('needsSummaryChoice: com ao menos um item marcado', () => {
    expect(needsSummaryChoice({ checklist: cl(['ok']) })).toBe(true);
    expect(needsSummaryChoice({ checklist: cl(['pending', 'pending']) })).toBe(false);
    expect(needsSummaryChoice({ checklist: undefined })).toBe(false);
  });

  it('inspectionItemText: item e categoria', () => {
    expect(inspectionItemText({ label: 'Disco', category: 'Freios' })).toBe('Disco (Freios)');
    expect(inspectionItemText({ label: 'Disco', category: '' })).toBe('Disco');
  });

  it('sumItems soma centavos', () => {
    expect(sumItems([{ description: 'a', price: 10, warranty: true }, { description: 'b', price: 5, warranty: true }])).toBe(15);
    expect(sumItems([])).toBe(0);
  });

  it('detalhe do item: garantia só se cobrado', () => {
    expect(itemDetailText({ description: 'a', price: 1000, warranty: true }, 90)).toContain('Garantia de 90 dias');
    expect(itemDetailText({ description: 'a', price: 0, warranty: false }, 90)).toContain('sem garantia');
  });

  it('rótulo do restante', () => {
    expect(remainingLabel(100)).toBe('Restante a pagar');
    expect(remainingLabel(0)).toBe('Nada a pagar');
  });
});

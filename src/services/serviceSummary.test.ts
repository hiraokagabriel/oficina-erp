import { describe, it, expect } from 'vitest';
import { WorkOrder, WorkshopSettings, ChecklistSchema } from '../types';
import { parseDateOnly } from '../utils/dates';
import { buildServiceSummary, plainStatus } from './serviceSummary';

const SECRETS = [
  'SEGREDO-CUSTO-123',
  'SEGREDO-MARGEM-456',
  'SEGREDO-NOTAS-CLIENTE',
  'SEGREDO-NOTA-INTERNA',
  'SEGREDO-FONE-99999',
  'SEGREDO-TECNICO',
  'SEGREDO-ADV-ENTRY',
  'SEGREDO-FIN-ID',
  'SEGREDO-CLIENT-ID',
];

const settings: WorkshopSettings = {
  name: 'Oficina Teste',
  cnpj: '12.345.678/0001-90',
  address: 'Rua A, 10',
  exportPath: 'C:\\SEGREDO-EXPORT',
  googleApiKey: 'SEGREDO-API',
  googleDriveToken: 'SEGREDO-TOKEN',
};

const checklist = (): ChecklistSchema => ({
  mileageIn: 1000,
  notes: 'SEGREDO-NOTA-INTERNA',
  categories: [
    {
      id: 'c1',
      label: 'Freios',
      items: [
        { id: 'i1', label: 'Pastilha dianteira', status: 'urgent', note: 'Lona no fim' },
        { id: 'i2', label: 'Disco dianteiro', status: 'attention' },
        { id: 'i3', label: 'Fluido de freio', status: 'ok', note: 'ok' },
        { id: 'i4', label: 'Mangueiras', status: 'pending' },
      ],
    },
  ],
});

const makeOS = (over: Partial<WorkOrder> = {}): WorkOrder => ({
  id: 'os-1',
  osNumber: 42,
  vehicle: 'Gol - ABC1D23',
  clientName: 'Maria <b>Silva</b>',
  clientPhone: 'SEGREDO-FONE-99999',
  clientId: 'SEGREDO-CLIENT-ID',
  mileage: 55000,
  status: 'AGUARDANDO_PAGAMENTO',
  parts: [{ id: 'p1', description: 'Pastilha', price: 20000, cost: 12345, category: 'FREIO' }],
  services: [
    { id: 's1', description: 'Troca de pastilha', price: 15000, cost: 99999 },
    { id: 's2', description: 'Cortesia: lavagem', price: 0 },
  ],
  total: 35000,
  totalCost: 777,
  profit: 888,
  profitMargin: 66,
  createdAt: new Date(2026, 2, 10, 15, 30).toISOString(),
  financialId: 'SEGREDO-FIN-ID',
  checklist: checklist(),
  publicNotes: '  Trocar óleo em 5.000 km  ',
  technician: 'SEGREDO-TECNICO',
  advanceAmount: 10000,
  advanceEntryId: 'SEGREDO-ADV-ENTRY',
  ...over,
});

// Marcadores nos campos de custo/margem (valores numéricos não são rastreáveis por texto).
const withTextSecrets = (): WorkOrder => {
  const os = makeOS();
  // `as` só no teste: injeta lixo extra que um banco real poderia ter.
  return {
    ...os,
    ...({ notes: 'SEGREDO-NOTA-INTERNA', clientNotes: 'SEGREDO-NOTAS-CLIENTE', costLabel: 'SEGREDO-CUSTO-123', marginLabel: 'SEGREDO-MARGEM-456' } as Partial<WorkOrder>),
  };
};

const NOW = new Date(2026, 5, 1, 10, 0);

describe('buildServiceSummary - vazamento', () => {
  it('JSON do resumo não contém nenhum dado interno', () => {
    const json = JSON.stringify(buildServiceSummary(withTextSecrets(), settings, {
      includeRecommendations: true,
      includeInspectionNotes: true,
    }, NOW));
    for (const s of SECRETS) expect(json).not.toContain(s);
    for (const k of ['cost', 'totalCost', 'profit', 'profitMargin', 'clientPhone', 'technician', 'advanceEntryId', 'financialId', 'clientId', 'exportPath', 'googleApiKey']) {
      expect(json).not.toContain(`"${k}"`);
    }
    expect(json).not.toContain('12345');
    expect(json).not.toContain('99999');
  });

  it('não é o mesmo objeto nem espalha a OS', () => {
    const os = makeOS();
    const s = buildServiceSummary(os, settings, {}, NOW) as unknown as Record<string, unknown>;
    expect(s).not.toBe(os);
    expect(Object.keys(s).sort()).toEqual([
      'clientName', 'expectedDate', 'generatedAt', 'items', 'mileage', 'osDate', 'osNumber',
      'publicNotes', 'recommendations', 'status', 'statusText', 'totals', 'vehicle', 'warranty', 'workshop',
    ]);
  });
});

describe('buildServiceSummary - conteúdo', () => {
  it('cabeçalho, cliente, veículo, KM, data e notas públicas', () => {
    const s = buildServiceSummary(makeOS(), settings, {}, NOW);
    expect(s.workshop).toEqual({ name: 'Oficina Teste', address: 'Rua A, 10', cnpj: '12.345.678/0001-90' });
    expect(s.osNumber).toBe(42);
    expect(s.osDate).toBe('10/03/2026');
    expect(s.generatedAt).toBe('01/06/2026');
    expect(s.vehicle).toBe('Gol - ABC1D23');
    expect(s.mileage).toBe(55000);
    expect(s.clientName).toBe('Maria <b>Silva</b>');
    expect(s.publicNotes).toBe('Trocar óleo em 5.000 km');
  });

  it('itens: garantia só para preço > 0', () => {
    const s = buildServiceSummary(makeOS(), settings, {}, NOW);
    expect(s.items.services).toEqual([
      { description: 'Troca de pastilha', price: 15000, warranty: true },
      { description: 'Cortesia: lavagem', price: 0, warranty: false },
    ]);
    expect(s.items.parts).toEqual([{ description: 'Pastilha', price: 20000, warranty: true }]);
    expect(s.warranty.days).toBe(90);
    expect(s.warranty.text).toContain('90 (noventa) dias');
    expect(s.warranty.hasWarrantyItems).toBe(true);
  });

  it('só itens de valor zero: sem garantia', () => {
    const s = buildServiceSummary(makeOS({
      parts: [], services: [{ id: 'z', description: 'Cortesia', price: 0 }], total: 0, advanceAmount: undefined, advanceEntryId: undefined,
    }), settings, {}, NOW);
    expect(s.warranty.hasWarrantyItems).toBe(false);
    expect(s.items.services[0].warranty).toBe(false);
  });

  it('adiantamento e restante', () => {
    const s = buildServiceSummary(makeOS(), settings, {}, NOW);
    expect(s.totals).toEqual({ total: 35000, advance: 10000, remaining: 25000, hasAdvance: true });
  });

  it('sem adiantamento: restante = total, hasAdvance false', () => {
    const s = buildServiceSummary(makeOS({ advanceAmount: undefined, advanceEntryId: undefined }), settings, {}, NOW);
    expect(s.totals).toEqual({ total: 35000, advance: 0, remaining: 35000, hasAdvance: false });
  });

  it('adiantamento legado sem advanceEntryId não aparece (igual a getRemainingAmount)', () => {
    const s = buildServiceSummary(makeOS({ advanceEntryId: undefined }), settings, {}, NOW);
    expect(s.totals.remaining).toBe(35000);
    expect(s.totals.hasAdvance).toBe(false);
  });

  it('adiantamento maior que o total: restante 0', () => {
    const s = buildServiceSummary(makeOS({ advanceAmount: 50000 }), settings, {}, NOW);
    expect(s.totals.remaining).toBe(0);
    expect(s.totals.advance).toBe(35000);
  });
});

describe('buildServiceSummary - previsão (qualquer fuso)', () => {
  it('formata o dia local, ISO meio-dia local', () => {
    const iso = parseDateOnly('2026-12-31').toISOString();
    expect(buildServiceSummary(makeOS({ expectedDate: iso }), settings, {}, NOW).expectedDate).toBe('31/12/2026');
  });
  it('só-dia e ausente', () => {
    expect(buildServiceSummary(makeOS({ expectedDate: '2026-01-05' }), settings, {}, NOW).expectedDate).toBe('05/01/2026');
    expect(buildServiceSummary(makeOS(), settings, {}, NOW).expectedDate).toBe('');
  });
});

describe('buildServiceSummary - recomendações', () => {
  it('padrão: nenhuma', () => {
    expect(buildServiceSummary(makeOS(), settings, {}, NOW).recommendations).toEqual([]);
  });
  it('includeRecommendations: só attention/urgent, sem notas', () => {
    const s = buildServiceSummary(makeOS(), settings, { includeRecommendations: true }, NOW);
    expect(s.recommendations).toEqual([
      { label: 'Pastilha dianteira', urgent: true },
      { label: 'Disco dianteiro', urgent: false },
    ]);
  });
  it('includeInspectionNotes só com nota preenchida', () => {
    const s = buildServiceSummary(makeOS(), settings, { includeRecommendations: true, includeInspectionNotes: true }, NOW);
    expect(s.recommendations).toEqual([
      { label: 'Pastilha dianteira', urgent: true, note: 'Lona no fim' },
      { label: 'Disco dianteiro', urgent: false },
    ]);
  });
  it('notas sem includeRecommendations: nada', () => {
    const s = buildServiceSummary(makeOS(), settings, { includeInspectionNotes: true }, NOW);
    expect(s.recommendations).toEqual([]);
  });
  it('checklist ausente ou legado sem categories: sem recomendações e sem erro', () => {
    const a = buildServiceSummary(makeOS({ checklist: undefined }), settings, { includeRecommendations: true }, NOW);
    expect(a.recommendations).toEqual([]);
    const legado = { notes: 'x' } as unknown as ChecklistSchema;
    const b = buildServiceSummary(makeOS({ checklist: legado }), settings, { includeRecommendations: true }, NOW);
    expect(b.recommendations).toEqual([]);
  });
});

describe('plainStatus', () => {
  it('linguagem simples', () => {
    expect(plainStatus('AGUARDANDO_PAGAMENTO')).toBe('Pronto para retirada');
    expect(plainStatus('EM_SERVICO')).toBe('Serviço em andamento');
    expect(plainStatus('ORCAMENTO')).toBe('Orçamento aguardando aprovação');
    expect(plainStatus('APROVADO')).toBe('Aprovado, aguardando início do serviço');
    expect(plainStatus('FINALIZADO')).toBe('Serviço concluído e entregue');
    expect(plainStatus('ARQUIVADO')).toBe('Serviço concluído');
  });
});

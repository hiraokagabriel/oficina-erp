import { describe, it, expect } from 'vitest';
import { WorkOrder, WorkshopSettings, ChecklistSchema } from '../types';
import { buildServiceSummary } from '../services/serviceSummary';
import { buildPrintServiceSummaryHtml } from './printServiceSummary';

const settings: WorkshopSettings = {
  name: 'Oficina <Teste>',
  cnpj: '12.345.678/0001-90',
  address: 'Rua A, 10',
  exportPath: 'C:\\SEGREDO-EXPORT',
  googleApiKey: 'SEGREDO-API',
};

const checklist = (): ChecklistSchema => ({
  mileageIn: 1000,
  notes: 'Geral <u>vistoria</u>',
  categories: [{
    id: 'c1', label: 'Freios',
    items: [
      { id: 'i1', label: 'Pastilha <i>fim</i>', status: 'urgent', note: 'Nota <script>x</script>' },
      { id: 'i2', label: 'Disco', status: 'attention' },
      { id: 'i3', label: 'Fluido', status: 'ok' },
    ],
  }],
});

const makeOS = (over: Partial<WorkOrder> = {}): WorkOrder => ({
  id: 'os-1',
  osNumber: 42,
  vehicle: 'Gol - ABC1D23',
  clientName: 'Maria <script>alert(1)</script>',
  clientPhone: 'SEGREDO-FONE-99999',
  mileage: 55000,
  status: 'AGUARDANDO_PAGAMENTO',
  parts: [{ id: 'p1', description: 'Pastilha <b>x</b>', price: 20000, cost: 12345 }],
  services: [
    { id: 's1', description: 'Troca', price: 15000, cost: 99999 },
    { id: 's2', description: 'Cortesia', price: 0 },
  ],
  total: 35000,
  totalCost: 777,
  profit: 888,
  profitMargin: 66,
  createdAt: new Date(2026, 2, 10, 15, 30).toISOString(),
  checklist: checklist(),
  publicNotes: 'Obs <img src=x onerror=1>',
  technician: 'SEGREDO-TECNICO',
  advances: [
    { id: 'a1', date: new Date(2026, 2, 11, 12).toISOString(), amount: 5000, entryId: 'e1' },
    { id: 'a2', date: new Date(2026, 2, 12, 12).toISOString(), amount: 5000, entryId: 'e2' },
  ],
  ...over,
} as WorkOrder);

const html = (os: WorkOrder, opts = {}) =>
  buildPrintServiceSummaryHtml(buildServiceSummary(os, settings, opts, new Date(2026, 5, 1))).printContent;

describe('buildPrintServiceSummaryHtml', () => {
  it('escapa texto digitado (sem tag injetada)', () => {
    const h = html(makeOS(), { includeInspection: true });
    expect(h).not.toContain('<script>');
    expect(h).not.toContain('<img');
    expect(h).not.toContain('<b>x</b>');
    expect(h).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(h).toContain('Oficina &lt;Teste&gt;');
  });

  it('não vaza custo, margem, telefone, técnico, notas internas nem config', () => {
    const h = html(makeOS(), { includeInspection: true });
    for (const s of ['SEGREDO', '999,99', '123,45', '7,77', '8,88', 'Margem', 'Custo', 'Técnico', 'Telefone']) {
      expect(h).not.toContain(s);
    }
  });

  it('total, soma dos adiantamentos e restante', () => {
    const h = html(makeOS());
    expect(h).toMatch(/Total<\/td><td class="num">R\$\s350,00/);
    expect(h).toMatch(/Adiantamento recebido<\/td><td class="num">- R\$\s100,00/);
    expect(h).toMatch(/Restante a pagar<\/td><td class="num">R\$\s250,00/);
  });

  it('sem adiantamento: sem linha de adiantamento; quitado: Nada a pagar', () => {
    expect(html(makeOS({ advances: [] }))).not.toContain('Adiantamento recebido');
    const quitado = html(makeOS({ advances: [{ id: 'a', date: new Date().toISOString(), amount: 35000, entryId: 'e' }] }));
    expect(quitado).toContain('Nada a pagar');
  });

  it('garantia só quando há item cobrado; item sem cobrança marcado', () => {
    expect(html(makeOS())).toContain('90 (noventa) dias');
    expect(html(makeOS())).toContain('sem cobrança');
    const zero = html(makeOS({ parts: [], services: [{ id: 'z', description: 'Cortesia', price: 0 }], total: 0, advances: [] }));
    expect(zero).not.toContain('Garantia de');
  });

  it('vistoria só quando a opção está ligada; todos os marcados, urgente primeiro, com a palavra do estado', () => {
    expect(html(makeOS())).not.toContain('Itens da vistoria');
    const h = html(makeOS(), { includeInspection: true });
    expect(h).toContain('Itens da vistoria');
    expect(h.indexOf('Urgente!')).toBeGreaterThan(-1);
    expect(h.indexOf('Urgente!')).toBeLessThan(h.indexOf('Necessita trocar'));
    expect(h.indexOf('Necessita trocar')).toBeLessThan(h.indexOf('OK / Feito'));
    expect(h).toContain('Fluido (Freios)');
    expect(h).toContain('Nota &lt;script&gt;');
  });

  it('item não inspecionado nunca entra; nota geral só com a opção', () => {
    const os = makeOS();
    os.checklist!.categories[0].items.push({ id: 'i4', label: 'Mangueira', status: 'pending', note: 'oculta' });
    const h = html(os, { includeInspection: true });
    expect(h).not.toContain('Mangueira');
    expect(h).not.toContain('Nota geral da vistoria');
    const g = html(os, { includeInspection: true, includeGeneralNote: true });
    expect(g).toContain('Nota geral da vistoria');
    expect(g).toContain('Geral &lt;u&gt;vistoria&lt;/u&gt;');
    expect(html(os, { includeGeneralNote: true })).not.toContain('Nota geral da vistoria');
  });

  it('título do documento sanitizado', () => {
    const { documentTitle } = buildPrintServiceSummaryHtml(buildServiceSummary(makeOS(), settings, {}, new Date()));
    expect(documentTitle).toBe('Resumo_OS_42_Maria_script_alert_1_script');
  });

  it('fontes >= 9pt', () => {
    const sizes = [...html(makeOS(), { includeInspection: true }).matchAll(/font-size:\s*([\d.]+)pt/g)].map(m => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(0);
    for (const s of sizes) expect(s).toBeGreaterThanOrEqual(9);
  });
});

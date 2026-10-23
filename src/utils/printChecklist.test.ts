import { describe, it, expect } from 'vitest';
import { buildPrintChecklistHtml } from './printChecklist';
import type { WorkOrder, WorkshopSettings, ChecklistSchema } from '../types';

const settings: WorkshopSettings = {
  name: 'Oficina Teste',
  cnpj: '12.345.678/0001-90',
  address: 'Rua das Flores, 100 - Centro',
  exportPath: '',
};

const os = {
  id: 'os-1',
  osNumber: 77,
  vehicle: 'Fiat Uno ABC-1D23',
  clientName: 'João da Silva',
  clientPhone: '(11) 99999-0000',
  mileage: 85000,
  technician: 'Carlos',
} as WorkOrder;

const checklist = (): ChecklistSchema => ({
  mileageIn: 85100,
  notes: 'Risco na porta direita.',
  inspectedAt: '2026-03-10T12:00:00.000Z',
  categories: [
    {
      id: 'c1',
      label: 'Freios',
      items: [
        { id: 'i1', label: 'Pastilhas dianteiras', status: 'attention' },
        { id: 'i2', label: 'Fluido de freio', status: 'ok' },
      ],
    },
    { id: 'c2', label: 'Motor', items: [{ id: 'i3', label: 'Correia dentada', status: 'urgent' }] },
    { id: 'c3', label: 'Vazia', items: [] },
  ],
} as ChecklistSchema);

describe('buildPrintChecklistHtml: dados normais', () => {
  // O snapshot foi gerado com o código ANTES do escapeHtml: a saída para textos normais não pode mudar.
  it('HTML do checklist', () => {
    expect(buildPrintChecklistHtml(os, checklist(), settings).printContent).toMatchSnapshot();
  });
});

describe('buildPrintChecklistHtml: texto do usuário é escapado', () => {
  it('<script> vira texto em todos os campos livres', () => {
    const bad = '<script>alert(1)</script>';
    const cl = checklist();
    cl.notes = bad;
    cl.categories = [{ id: 'c', label: bad, items: [{ id: 'i', label: bad, status: 'ok' }] }] as ChecklistSchema['categories'];
    const html = buildPrintChecklistHtml(
      { ...os, vehicle: bad, clientName: bad, clientPhone: bad, technician: bad } as WorkOrder,
      cl,
      { ...settings, name: bad, address: bad, cnpj: bad },
    ).printContent;
    expect(html).not.toMatch(/<script>alert/i);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

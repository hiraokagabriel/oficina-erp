import { describe, it, expect } from 'vitest';
import { buildPrintOSHtml } from './printOS';
import type { WorkOrder, WorkshopSettings } from '../types';

const settings: WorkshopSettings = {
  name: 'Oficina Teste',
  cnpj: '12.345.678/0001-90',
  address: 'Rua das Flores, 100 - Centro',
  exportPath: '',
};

const baseOS = (): WorkOrder => ({
  id: 'os-1',
  osNumber: 1234,
  vehicle: 'Fiat Uno ABC-1D23',
  clientName: 'João da Silva',
  clientPhone: '(11) 99999-0000',
  mileage: 85000,
  status: 'APROVADO',
  parts: [
    { id: 'p1', description: 'Pastilha de freio dianteira', price: 18000, category: 'FREIO' },
    { id: 'p2', description: 'Filtro de óleo', price: 4500, category: 'MOTOR' },
  ],
  services: [{ id: 's1', description: 'Troca de pastilhas', price: 12000 }],
  total: 34500,
  createdAt: '2026-03-10T12:00:00.000Z',
  publicNotes: 'Garantia de 90 dias nas peças.',
  technician: 'Carlos',
} as WorkOrder);

describe('buildPrintOSHtml: dados normais', () => {
  // O snapshot foi gerado com o código ANTES do escapeHtml: a saída para textos normais não pode mudar.
  it('HTML da via do cliente (peças com categoria)', () => {
    expect(buildPrintOSHtml(baseOS(), settings, 'CLIENT').printContent).toMatchSnapshot();
  });

  it('HTML sem categorias e sem observações', () => {
    const os = baseOS();
    os.parts = os.parts.map(p => ({ ...p, category: undefined }));
    os.publicNotes = '';
    expect(buildPrintOSHtml(os, settings, 'SHOP').printContent).toMatchSnapshot();
  });
});

describe('buildPrintOSHtml: texto do usuário é escapado', () => {
  it('<script> vira texto em todos os campos livres', () => {
    const bad = '<script>alert(1)</script>';
    const os = baseOS();
    os.clientName = bad;
    os.clientPhone = bad;
    os.vehicle = bad;
    os.technician = bad;
    os.publicNotes = bad;
    os.parts = [{ id: 'p', description: bad, price: 100 }];
    os.services = [{ id: 's', description: bad, price: 100 }];
    const html = buildPrintOSHtml(os, { ...settings, name: bad, address: bad, cnpj: bad }).printContent;
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

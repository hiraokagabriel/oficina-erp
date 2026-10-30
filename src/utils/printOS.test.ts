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

// Primeiro bloco de assinaturas do documento (o da página da OS).
const signatureArea = (html: string): string => {
  const start = html.indexOf('<div class="signature-area">');
  const end = html.indexOf('<div class="footer-text-block">', start);
  return html.slice(start, end);
};
const blocks = (area: string): number => (area.match(/class="signature-block"/g) ?? []).length;

describe('buildPrintOSHtml: vias e assinaturas', () => {
  it('via geral: duas assinaturas (oficina com técnico e cliente)', () => {
    const area = signatureArea(buildPrintOSHtml(baseOS(), settings).printContent);
    expect(blocks(area)).toBe(2);
    expect(area).toContain('<span class="sign-name">Carlos</span>');
    expect(area).toContain('<span class="sign-label">Cliente</span>');
  });

  it('via do cliente: só a assinatura da oficina, com o técnico', () => {
    const area = signatureArea(buildPrintOSHtml(baseOS(), settings, 'CLIENT').printContent);
    expect(blocks(area)).toBe(1);
    expect(area).toContain('<span class="sign-name">Carlos</span>');
    expect(area).not.toContain('>Cliente<');
  });

  it('via do cliente sem técnico: usa o nome da oficina', () => {
    const os = baseOS();
    os.technician = '';
    const area = signatureArea(buildPrintOSHtml(os, settings, 'CLIENT').printContent);
    expect(blocks(area)).toBe(1);
    expect(area).toContain('<span class="sign-name">Oficina Teste</span>');
  });

  it('via da oficina: só o cliente assina e o técnico aparece como responsável', () => {
    const area = signatureArea(buildPrintOSHtml(baseOS(), settings, 'SHOP').printContent);
    expect(blocks(area)).toBe(1);
    expect(area).toContain('<span class="sign-name">João da Silva</span>');
    expect(area).toContain('Responsável Técnico: Carlos');
  });

  it('via da oficina sem técnico: nada de técnico nem nome da oficina na assinatura', () => {
    const os = baseOS();
    os.technician = '';
    const area = signatureArea(buildPrintOSHtml(os, settings, 'SHOP').printContent);
    expect(blocks(area)).toBe(1);
    expect(area).not.toContain('Responsável Técnico');
    expect(area).not.toContain('Oficina Teste');
  });

  it('nome do técnico é escapado na via da oficina', () => {
    const os = baseOS();
    os.technician = '<b>x</b>';
    const area = signatureArea(buildPrintOSHtml(os, settings, 'SHOP').printContent);
    expect(area).not.toContain('<b>x</b>');
    expect(area).toContain('Responsável Técnico: &lt;b&gt;x&lt;/b&gt;');
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

describe('buildPrintOSHtml: letras do logo', () => {
  const logos = (html: string): string[] =>
    [...html.matchAll(/class="invoice-logo-circle"[^>]*>([^<]*(?:<[^/][^<]*)*?)<\/div>/g)].map(m => m[1]);
  it('ausente continua AM', () => {
    const l = logos(buildPrintOSHtml(baseOS(), settings).printContent);
    expect(l.length).toBeGreaterThan(0);
    expect(l.every(t => t === 'AM')).toBe(true);
  });
  it('usa as letras configuradas', () => {
    const html = buildPrintOSHtml(baseOS(), { ...settings, logoText: 'of' }).printContent;
    expect(logos(html).every(t => t === 'OF')).toBe(true);
    expect(html).not.toContain('>AM</div>');
  });
  it('texto com tag é normalizado e nunca vira HTML', () => {
    const html = buildPrintOSHtml(baseOS(), { ...settings, logoText: '<b>' }).printContent;
    expect(html).not.toContain('<b></div>');
    expect(logos(html).every(t => t === 'B')).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { buildPartsToBuyHtml } from './printPartsToBuy';
import { buildPartsToBuy } from '../services/partsToBuy';
import type { OSStatus, WorkOrder } from '../types';

const mk = (osNumber: number, status: OSStatus, vehicle: string, clientName: string, parts: string[]): WorkOrder =>
  ({
    id: `os-${osNumber}`, osNumber, status, vehicle, clientName, clientPhone: '', mileage: 0, services: [], total: 0, createdAt: '',
    parts: parts.map((d, i) => ({ id: `p${osNumber}-${i}`, description: d, price: 0 })),
  }) as WorkOrder;

const NOW = new Date(2026, 10, 3, 12, 0, 0);
const settings = { name: 'Oficina Teste' };

const orders = [
  mk(12, 'APROVADO', 'VW Gol 1.0 8V 2012 - ABC1D23', 'João da Conceição', ['Filtro de óleo', 'Pastilha de freio']),
  mk(3, 'ORCAMENTO', 'Fiat Uno 2015', 'Maria', ['Filtro de óleo']),
  mk(15, 'APROVADO', 'vw gol 1.0 8v 2012', 'Pedro', ['Filtro de óleo']),
  mk(20, 'APROVADO', 'Moto estranha', 'Ana', ['Vela']),
];
const all = new Set(['Filtro de óleo', 'Pastilha de freio', 'Vela']);
const html = () => buildPartsToBuyHtml(buildPartsToBuy(orders, all), settings, { now: NOW });

describe('buildPartsToBuyHtml', () => {
  it('conteúdo básico, @page A4 e rodapé de página', () => {
    const { printContent: h, docTitle } = html();
    expect(docTitle).toBe('Pecas_a_comprar_2026-11-03');
    expect(h).toContain('size: A4');
    expect(h).toContain('@bottom-right');
    expect(h).toContain('"Página " counter(page) " de " counter(pages)');
    expect(h).toContain('Peças a comprar');
    expect(h).toContain('Oficina Teste');
    expect(h).toContain('03/11/2026');
    expect(h).toContain('thead { display: table-header-group; }');
    expect(h).toContain('break-inside: avoid');
    expect(h).toContain('OS 12');
    expect(h).toContain('VW Gol 2012 1.0 8V');
    expect(h).toContain('João da Conceição');
    expect(h).toContain('Moto estranha');
  });

  it('Orçamento aparece antes de Aprovado e OS em ordem crescente', () => {
    const h = html().printContent;
    expect(h.indexOf('<span>Orçamento</span>')).toBeLessThan(h.indexOf('<span>Aprovado</span>'));
    expect(h.indexOf('OS 3<')).toBeLessThan(h.indexOf('OS 12<'));
    expect(h.indexOf('OS 12<')).toBeLessThan(h.indexOf('OS 15<'));
    expect(h).toContain('Para comprar junto');
  });

  it('escapa texto digitado', () => {
    const evil = [mk(1, 'ORCAMENTO', '<script>alert(1)</script> Gol', '<img src=x onerror=1>', ['<script>x</script>'])];
    const h = buildPartsToBuyHtml(buildPartsToBuy(evil, new Set(['<script>x</script>'])), { name: '<b>Of</b>' }, { now: NOW }).printContent;
    expect(h).not.toContain('<script>');
    expect(h).not.toContain('<img');
    expect(h).not.toContain('<b>Of</b>');
    expect(h).toContain('&lt;script&gt;');
  });

  it('nada de undefined/NaN, nem com dados vazios', () => {
    const odd = [mk(1, 'ORCAMENTO', '', '', [''])];
    const h = buildPartsToBuyHtml(buildPartsToBuy(odd, new Set([''])), { name: '' }, { now: NOW }).printContent;
    for (const x of [html().printContent, h]) expect(x).not.toMatch(/undefined|NaN|null/);
    expect(h).toContain('Cliente não informado');
    expect(h).toContain('Veículo não informado');
  });

  it('plano vazio mostra aviso', () => {
    const h = buildPartsToBuyHtml(buildPartsToBuy([], new Set()), settings, { now: NOW }).printContent;
    expect(h).toContain('Nenhuma peça selecionada.');
  });

  it('fonte nunca abaixo de 8pt e sem gradiente, sombra ou emoji', () => {
    const h = html().printContent;
    const sizes = [...h.matchAll(/font-size:\s*([\d.]+)pt/g)].map(m => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(5);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(8);
    expect(h).not.toMatch(/gradient|box-shadow|border-radius/);
    expect(h).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('snapshot', () => {
    expect(html().printContent).toMatchSnapshot();
  });
});

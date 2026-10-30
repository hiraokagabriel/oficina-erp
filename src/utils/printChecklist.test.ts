import { describe, it, expect } from 'vitest';
import { buildPrintChecklistHtml, selectChecklistForPrint, vehicleParts } from './printChecklist';
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

const NOW = new Date(2026, 2, 15, 12, 0, 0);

// 3 itens marcados (attention, ok, urgent) + 1 pending, com nota em um item.
const checklist = (): ChecklistSchema => ({
  mileageIn: 85100,
  notes: 'Risco na porta direita.',
  inspectedAt: '2026-03-10T12:00:00.000Z',
  categories: [
    {
      id: 'c1',
      label: 'Freios',
      items: [
        { id: 'i1', label: 'Pastilhas dianteiras', status: 'attention', note: 'Desgaste de 80%' },
        { id: 'i2', label: 'Fluido de freio', status: 'ok' },
        { id: 'i4', label: 'Discos', status: 'pending' },
      ],
    },
    { id: 'c2', label: 'Motor', items: [{ id: 'i3', label: 'Correia dentada', status: 'urgent' }] },
    { id: 'c3', label: 'Vazia', items: [] },
  ],
} as ChecklistSchema);

const allPending = (): ChecklistSchema => {
  const cl = checklist();
  cl.categories.forEach(c => c.items.forEach(i => { i.status = 'pending'; }));
  return cl;
};

const full = (o = os, cl = checklist(), s = settings) => buildPrintChecklistHtml(o, cl, s, { now: NOW });
const summary = (o = os, cl = checklist(), s = settings) => buildPrintChecklistHtml(o, cl, s, { mode: 'summary', now: NOW });

/** Só o conteúdo do <style> (onde nenhum texto digitado pode entrar além de OS e placa). */
const styleOf = (html: string) => html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';

describe('buildPrintChecklistHtml: snapshots', () => {
  it('completo', () => {
    expect(full().printContent).toMatchSnapshot();
  });
  it('resumido', () => {
    expect(summary().printContent).toMatchSnapshot();
  });
});

describe('buildPrintChecklistHtml: itens', () => {
  it('is-marked = itens inspecionados (3 de 4)', () => {
    expect((full().printContent.match(/is-marked/g) ?? []).length).toBe(3);
  });

  it('pending no completo: 3 caixas vazias, sem is-marked; no resumido não aparece', () => {
    const f = full().printContent;
    const row = f.split('<tr>').find(r => r.includes('Discos')) ?? '';
    expect((row.match(/class="st/g) ?? []).length).toBe(3);
    expect(row).not.toContain('is-marked');
    expect(summary().printContent).not.toContain('Discos');
  });

  it('resumido diz quantos itens mostra', () => {
    expect(summary().printContent).toContain('Mostrando só os 3 itens inspecionados de 4');
  });

  it('completo traz a instrução de marcação e a linha de resumo', () => {
    const f = full().printContent;
    expect(f).toContain('Marque com X a coluna do estado. Três caixas vazias = item não inspecionado.');
    expect(f).toContain('Inspecionados: 3 de 4');
    expect(f).toContain('OK / Feito: 1');
    expect(f).toContain('Necessita trocar: 1');
    expect(f).toContain('<strong>Urgente!: 1</strong>');
  });

  it('docTitle: sufixo _Resumido só no resumido', () => {
    expect(full().docTitle).toBe('Checklist_OS77_Fiat_Uno_ABC_1D23');
    expect(summary().docTitle).toBe('Checklist_OS77_Fiat_Uno_ABC_1D23_Resumido');
  });

  it('nunca mostra categoria vazia nem "Nenhum item"', () => {
    for (const html of [full().printContent, summary().printContent]) {
      expect(html).not.toContain('Nenhum item<');
      expect(html).not.toContain('VAZIA');
    }
  });

  it('resumido com tudo pending mostra aviso e nenhuma tabela de categoria', () => {
    const html = summary(os, allPending()).printContent;
    expect(html).toContain('Nenhum item foi inspecionado ainda.');
    expect(html).not.toContain('<table class="cat');
  });

  it('nota do item sai como "Observação: ..." escapada', () => {
    const cl = checklist();
    cl.categories[0].items[0].note = ' <b>x</b> ';
    const html = full(os, cl).printContent;
    expect(html).toContain('Observação: &lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<b>x</b>');
  });

  it('item urgente tem rótulo em negrito (classe is-urgent)', () => {
    expect(full().printContent).toMatch(/class="lbl is-urgent">Correia dentada/);
  });
});

describe('buildPrintChecklistHtml: estilo sóbrio e página', () => {
  const html = full().printContent + summary().printContent;

  it('só usa as cores da paleta', () => {
    const allowed = new Set(['#000000', '#111111', '#333333', '#444444', '#8c8c8c', '#ffffff']);
    const found = (html.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map(c => c.toLowerCase());
    expect(found.length).toBeGreaterThan(0);
    for (const c of found) expect(allowed.has(c)).toBe(true);
  });

  it('sem cantos arredondados, sombra, gradiente, rgba ou emoji', () => {
    expect(html).not.toMatch(/border-radius/i);
    expect(html).not.toMatch(/box-shadow/i);
    expect(html).not.toMatch(/gradient/i);
    expect(html).not.toContain('rgba(');
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('todo font-size está em pt e é pelo menos 8', () => {
    const sizes = [...html.matchAll(/font-size:\s*([^;}\s]+)/g)].map(m => m[1]);
    expect(sizes.length).toBeGreaterThan(0);
    for (const s of sizes) {
      expect(s).toMatch(/^[0-9.]+pt$/);
      expect(parseFloat(s)).toBeGreaterThanOrEqual(8);
    }
  });

  it('declara página A4 e regras de quebra', () => {
    expect(html).toContain('@page');
    expect(html).toContain('size: A4');
    expect(html).toContain('break-inside: avoid');
    expect(html).toContain('table-header-group');
  });

  it('rodapé de página usa margin boxes', () => {
    const css = styleOf(full().printContent);
    expect(css).toContain('@bottom-left');
    expect(css).toContain('@bottom-right');
    expect(css).toContain('counter(page)');
    expect(css).toContain('OS 77');
    expect(css).toContain('ABC-1D23');
  });
});

describe('buildPrintChecklistHtml: texto do usuário é escapado', () => {
  it('<script> vira texto em todos os campos livres', () => {
    const bad = '<script>alert(1)</script>';
    const cl = checklist();
    cl.notes = bad;
    cl.categories = [{ id: 'c', label: bad, items: [{ id: 'i', label: bad, status: 'ok', note: bad }] }] as ChecklistSchema['categories'];
    const html = buildPrintChecklistHtml(
      { ...os, vehicle: bad, clientName: bad, clientPhone: bad, technician: bad } as WorkOrder,
      cl,
      { ...settings, name: bad, address: bad, cnpj: bad },
    ).printContent;
    expect(html).not.toMatch(/<script>alert/i);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('veículo malicioso não entra no <style> e a margin box mostra só letras e números', () => {
    const { printContent } = full({ ...os, vehicle: 'X - AB"C}</style><script>' } as WorkOrder);
    const css = styleOf(printContent);
    expect(css).not.toContain('"C}');
    expect(css).not.toContain('</style><script>');
    expect(css).not.toContain('<');
    expect(css).toMatch(/content: "Checklist de vistoria \\00B7 OS 77 \\00B7 ABC[A-Za-z]*"/);
    // No corpo, o texto continua escapado.
    expect(printContent).not.toContain('<script>');
    expect(printContent).toContain('AB&quot;C}&lt;/style&gt;&lt;script&gt;');
  });

  it('número de OS inválido vira SN no rodapé', () => {
    const css = styleOf(full({ ...os, osNumber: 'x"}' } as unknown as WorkOrder).printContent);
    expect(css).toContain('OS SN');
    expect(css).not.toContain('x"}');
  });
});

describe('buildPrintChecklistHtml: assinaturas', () => {
  const sigBlock = (html: string) => html.slice(html.indexOf('class="signatures"'));

  it('com técnico: nome do técnico e do cliente', () => {
    const s = sigBlock(full().printContent);
    expect(s).toContain('Carlos');
    expect(s).toContain('João da Silva');
    expect(s).toContain('Responsável técnico');
    expect(s).toContain('Local e data:');
    expect(s).toContain('Declaro que o veículo foi recebido e inspecionado conforme os itens acima.');
    expect(s).toContain('Obrigado pela preferência!');
  });

  it('sem técnico: usa o nome da oficina', () => {
    const s = sigBlock(full({ ...os, technician: '' } as WorkOrder).printContent);
    expect(s).toContain('Oficina Teste');
  });

  it('sem técnico e sem nome da oficina: linha sem nome, sem "undefined"', () => {
    const html = full({ ...os, technician: undefined, clientName: '', clientPhone: undefined, mileage: 0 } as unknown as WorkOrder, checklist(), { ...settings, name: '' }).printContent;
    const s = sigBlock(html);
    expect(s).not.toContain('sign-name');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('null');
  });
});

describe('buildPrintChecklistHtml: KM e data', () => {
  it('85100 vira "85.100 km"', () => {
    expect(full().printContent).toContain('85.100 km');
  });

  it('KM 0 ou vazio vira linha em branco, nunca "0"', () => {
    const cl = checklist();
    cl.mileageIn = 0;
    const html = full({ ...os, mileage: 0 } as WorkOrder, cl).printContent;
    expect(html).toContain('________ km');
    expect(html).not.toMatch(/>0 km/);
    cl.mileageIn = undefined;
    expect(full({ ...os, mileage: undefined } as unknown as WorkOrder, cl).printContent).toContain('________ km');
  });

  it('sem inspectedAt usa o now injetado', () => {
    const cl = checklist();
    delete cl.inspectedAt;
    expect(full(os, cl).printContent).toContain('15/03/2026');
  });

  it('com inspectedAt usa a data da vistoria', () => {
    expect(full().printContent).toContain('10/03/2026');
  });
});

describe('buildPrintChecklistHtml: observações gerais', () => {
  it('completo: nota + linhas pautadas; sem nota ainda mostra a seção', () => {
    const cl = checklist();
    expect(full().printContent).toContain('Risco na porta direita.');
    cl.notes = '';
    const html = full(os, cl).printContent;
    expect(html).toContain('Observações gerais');
    expect((html.match(/class="rule"/g) ?? []).length).toBe(3);
  });

  it('resumido: seção só existe com nota', () => {
    const cl = checklist();
    cl.notes = '  ';
    expect(summary(os, cl).printContent).not.toContain('Observações gerais');
    expect(summary().printContent).toContain('Observações gerais');
  });
});

describe('selectChecklistForPrint', () => {
  it('completo: todos os itens, sem categoria vazia, ordem preservada', () => {
    const r = selectChecklistForPrint(checklist(), 'full');
    expect(r.categories.map(c => c.id)).toEqual(['c1', 'c2']);
    expect(r.categories[0].items.map(i => i.id)).toEqual(['i1', 'i2', 'i4']);
    expect(r.total).toBe(4);
    expect(r.inspected).toBe(3);
    expect(r.counts).toEqual({ pending: 1, ok: 1, attention: 1, urgent: 1 });
  });

  it('resumido: só status != pending; totais continuam do checklist inteiro', () => {
    const r = selectChecklistForPrint(checklist(), 'summary');
    expect(r.categories[0].items.map(i => i.id)).toEqual(['i1', 'i2']);
    expect(r.total).toBe(4);
    expect(r.inspected).toBe(3);
  });

  it('resumido sem marcados: nenhuma categoria', () => {
    const r = selectChecklistForPrint(allPending(), 'summary');
    expect(r.categories).toEqual([]);
    expect(r.inspected).toBe(0);
  });

  it('não altera o checklist original', () => {
    const cl = checklist();
    selectChecklistForPrint(cl, 'summary');
    expect(cl.categories[0].items).toHaveLength(3);
  });
});

describe('vehicleParts', () => {
  it('separa "modelo - PLACA"', () => {
    expect(vehicleParts('Fiat Uno - ABC-1D23')).toEqual({ model: 'Fiat Uno', plate: 'ABC-1D23' });
  });
  it('acha a placa no fim do texto sem separador', () => {
    expect(vehicleParts('Fiat Uno ABC-1D23')).toEqual({ model: 'Fiat Uno', plate: 'ABC-1D23' });
  });
  it('sem placa: só modelo', () => {
    expect(vehicleParts('Fiat Uno')).toEqual({ model: 'Fiat Uno', plate: '' });
    expect(vehicleParts('')).toEqual({ model: '', plate: '' });
  });
});

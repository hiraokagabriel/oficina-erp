import { describe, it, expect } from 'vitest';
import { buildDocument, docFileStem, osFolderName, DocKind } from './documents';
import { buildPrintOSHtml } from '../utils/printOS';
import type { WorkOrder, WorkshopSettings } from '../types';

const settings: WorkshopSettings = { name: 'Oficina Teste', cnpj: '', address: '', exportPath: '' };
const mk = (over: Partial<WorkOrder> = {}): WorkOrder => ({
  id: 'os-1', osNumber: 77, vehicle: 'Fiat Uno - ABC-1D23', clientName: 'João da Silva',
  clientPhone: '', mileage: 85000, technician: 'Carlos', status: 'ORCAMENTO', total: 100000,
  services: [], parts: [], ...over,
} as unknown as WorkOrder);

describe('docFileStem', () => {
  const os = mk();
  const cases: [DocKind, string][] = [
    ['OS', 'OS_77_Joao_da_Silva_Fiat_Uno_ABC_1D23'],
    ['OS_CLIENTE', 'OS_77_Joao_da_Silva_Fiat_Uno_ABC_1D23_ViaCliente'],
    ['OS_OFICINA', 'OS_77_Joao_da_Silva_Fiat_Uno_ABC_1D23_ViaOficina'],
    ['RESUMO', 'Resumo_OS_77_Joao_da_Silva'],
    ['CHECKLIST', 'Checklist_OS_77_Joao_da_Silva_ABC_1D23'],
    ['CHECKLIST_RESUMIDO', 'Checklist_OS_77_Joao_da_Silva_ABC_1D23_Resumido'],
  ];
  it.each(cases)('%s', (kind, esperado) => expect(docFileStem(kind, os)).toBe(esperado));

  it('placa ausente vira SemPlaca e veículo sem separador usa a placa do texto', () => {
    expect(docFileStem('OS', mk({ vehicle: 'Fiat Uno' }))).toBe('OS_77_Joao_da_Silva_Fiat_Uno_SemPlaca');
    expect(docFileStem('OS', mk({ vehicle: 'Fiat Uno ABC1D23' }))).toBe('OS_77_Joao_da_Silva_Fiat_Uno_ABC1D23');
  });
  it('placa Mercosul e com hífen', () => {
    expect(docFileStem('CHECKLIST', mk({ vehicle: 'Gol - BRA2E19' }))).toBe('Checklist_OS_77_Joao_da_Silva_BRA2E19');
    expect(docFileStem('CHECKLIST', mk({ vehicle: 'Gol - ABC-1234' }))).toBe('Checklist_OS_77_Joao_da_Silva_ABC_1234');
  });
  it('veículo vazio vira Veiculo/SemPlaca; cliente só com símbolos vira Cliente', () => {
    expect(docFileStem('OS', mk({ vehicle: '', clientName: '@#$' }))).toBe('OS_77_Cliente_Veiculo_SemPlaca');
  });
  it('limita a 120 caracteres e só usa [A-Za-z0-9_-]', () => {
    const s = docFileStem('OS_OFICINA', mk({ clientName: 'x'.repeat(200), vehicle: 'y'.repeat(200) + ' - ABC1D23' }));
    expect(s.length).toBeLessThanOrEqual(120);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('osFolderName', () => {
  it('número, cliente e modelo com espaços e acentos, sem a placa', () => {
    expect(osFolderName(mk({ osNumber: 12, clientName: 'João Silva', vehicle: 'Gol - ABC1D23' }))).toBe('12 João Silva Gol');
    expect(osFolderName(mk())).toBe('77 João da Silva Fiat Uno');
  });
  it('veículo com placa no texto, sem separador', () => {
    expect(osFolderName(mk({ vehicle: 'Fiat Uno ABC1D23' }))).toBe('77 João da Silva Fiat Uno');
  });
  it('veículo só com a placa ou vazio: omite o carro', () => {
    expect(osFolderName(mk({ vehicle: 'ABC1D23' }))).toBe('77 João da Silva');
    expect(osFolderName(mk({ vehicle: '' }))).toBe('77 João da Silva');
  });
  it('remove só o que o Windows proíbe e colapsa espaços', () => {
    expect(osFolderName(mk({ clientName: 'A<b>:"c/d\\e|f?g*h', vehicle: 'Gol' }))).toBe('77 Abcdefgh Gol');
    expect(osFolderName(mk({ clientName: '  Maria   \t Souza  ', vehicle: 'Gol' }))).toBe('77 Maria Souza Gol');
    expect(osFolderName(mk({ clientName: 'Ana\u0001 Lima', vehicle: 'Gol' }))).toBe('77 Ana Lima Gol');
  });
  it('tira pontos e espaços das pontas e junta pontos repetidos', () => {
    expect(osFolderName(mk({ clientName: 'Ltda..', vehicle: '..Gol. ' }))).toBe('77 Ltda Gol');
    expect(osFolderName(mk({ clientName: 'A..B', vehicle: 'Gol' }))).toBe('77 A.B Gol');
  });
  it('corta em 80 caracteres sem deixar espaço ou ponto no fim', () => {
    const n = osFolderName(mk({ clientName: 'x'.repeat(200), vehicle: 'y' }));
    expect(n.length).toBeLessThanOrEqual(80);
    expect(n.startsWith('77 xxx')).toBe(true);
    const corte = osFolderName(mk({ osNumber: 1, clientName: 'a'.repeat(77) + ' b', vehicle: 'c' }));
    expect(corte.endsWith(' ')).toBe(false);
    expect(corte.length).toBeLessThanOrEqual(80);
  });
  it('nome reservado ou vazio cai em "OS {número}"', () => {
    expect(osFolderName({ osNumber: '' as unknown as number, clientName: 'CON', vehicle: '' })).toBe('OS SN');
    expect(osFolderName({ osNumber: '' as unknown as number, clientName: 'com1', vehicle: '' })).toBe('OS SN');
    expect(osFolderName({ osNumber: '' as unknown as number, clientName: '', vehicle: '' })).toBe('OS SN');
    expect(osFolderName({ osNumber: '' as unknown as number, clientName: '<>:', vehicle: '' })).toBe('OS SN');
  });
  it('buildDocument traz a mesma subpasta em todos os documentos da OS', () => {
    const os = mk({ osNumber: 12, clientName: 'João Silva', vehicle: 'Gol - ABC1D23' });
    const kinds: DocKind[] = ['OS', 'OS_CLIENTE', 'OS_OFICINA', 'RESUMO', 'CHECKLIST', 'CHECKLIST_RESUMIDO'];
    for (const k of kinds) expect(buildDocument(k, os, settings).subfolder).toBe('12 João Silva Gol');
  });
});

describe('buildDocument', () => {
  it('OS: repassa a soma dos adiantamentos como advanceAmount', () => {
    const os = mk({ advances: [{ amount: 3000 }, { amount: 2000 }] as unknown as WorkOrder['advances'] });
    const doc = buildDocument('OS', os, settings);
    const esperado = buildPrintOSHtml({ ...os, advanceAmount: 5000 }, settings);
    expect(doc.html).toBe(esperado.printContent);
    expect(doc.title).toBe(esperado.documentTitle);
    expect(doc.fileStem).toBe('OS_77_Joao_da_Silva_Fiat_Uno_ABC_1D23');
  });
  it('OS_CLIENTE usa a via do cliente', () => {
    const doc = buildDocument('OS_CLIENTE', mk(), settings);
    expect(doc.html).toBe(buildPrintOSHtml(mk(), settings, 'CLIENT').printContent);
    expect(doc.title.endsWith('_ViaCliente')).toBe(true);
  });
  it('RESUMO tem título de resumo', () => {
    expect(buildDocument('RESUMO', mk(), settings).title).toBe('Resumo_OS_77_Joao_da_Silva');
  });
  it('checklist ausente vira checklist em branco (sem erro)', () => {
    const full = buildDocument('CHECKLIST', mk({ checklist: undefined }), settings);
    expect(full.html).toContain('<html');
    expect(full.title).toContain('Checklist_OS77');
    expect(buildDocument('CHECKLIST_RESUMIDO', mk(), settings).title.endsWith('_Resumido')).toBe(true);
  });
});

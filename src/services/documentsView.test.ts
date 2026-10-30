import { describe, it, expect } from 'vitest';
import { fileNameFromPath, isOsDocument, listPickerOrders, pickerOrderLabel, printingMessage } from './documentsView';

type O = Parameters<typeof listPickerOrders>[0][number];
const mk = (osNumber: number, clientName: string, vehicle: string, createdAt: string, status: O['status'] = 'ORCAMENTO'): O => ({
  osNumber, clientName, vehicle, createdAt, status,
});

const orders = [
  mk(1, 'João Silva', 'Gol - ABC-1D23', '2026-01-01T12:00:00'),
  mk(2, 'Maria Souza', 'Uno - XYZ9999', '2026-03-01T12:00:00'),
  mk(3, 'Pedro Lima', 'Onix - QWE-4R56', '2026-02-01T12:00:00', 'ARQUIVADO'),
  mk(12, 'Ana Joao', 'Palio', '2026-03-01T12:00:00'),
];

describe('listPickerOrders', () => {
  it('tira arquivadas e ordena da mais recente para a mais antiga (empate: maior número)', () => {
    expect(listPickerOrders(orders, '').map(o => o.osNumber)).toEqual([12, 2, 1]);
  });
  it('não altera a lista original', () => {
    const copy = [...orders];
    listPickerOrders(orders, '');
    expect(orders).toEqual(copy);
  });
  it('busca por número, com ou sem #', () => {
    expect(listPickerOrders(orders, '#2').map(o => o.osNumber)).toEqual([12, 2]);
    expect(listPickerOrders(orders, '12').map(o => o.osNumber)).toEqual([12]);
  });
  it('busca por cliente sem diferenciar maiúsculas', () => {
    expect(listPickerOrders(orders, 'silva').map(o => o.osNumber)).toEqual([1]);
    expect(listPickerOrders(orders, '  MARIA  ').map(o => o.osNumber)).toEqual([2]);
  });
  it('busca ignora acentos nos dois sentidos', () => {
    expect(listPickerOrders(orders, 'joao').map(o => o.osNumber)).toEqual([12, 1]);
    expect(listPickerOrders(orders, 'JOÃO silva').map(o => o.osNumber)).toEqual([1]);
    const acentuada = [mk(5, 'Ana Conceição', 'Fusca Pé-de-Boi', '2026-04-01T12:00:00')];
    expect(listPickerOrders(acentuada, 'conceicao')).toHaveLength(1);
    expect(listPickerOrders(acentuada, 'pe-de-boi')).toHaveLength(1);
  });
  it('busca por placa em qualquer formato', () => {
    expect(listPickerOrders(orders, 'abc1d23').map(o => o.osNumber)).toEqual([1]);
    expect(listPickerOrders(orders, 'xyz-9999').map(o => o.osNumber)).toEqual([2]);
  });
  it('OS arquivada não aparece nem na busca', () => {
    expect(listPickerOrders(orders, 'pedro')).toEqual([]);
  });
  it('sem resultado devolve lista vazia', () => {
    expect(listPickerOrders(orders, 'zzzz')).toEqual([]);
  });
});

describe('textos e tipos dos documentos', () => {
  it('só as três vias da OS marcam a primeira impressão', () => {
    expect(isOsDocument('OS')).toBe(true);
    expect(isOsDocument('OS_CLIENTE')).toBe(true);
    expect(isOsDocument('OS_OFICINA')).toBe(true);
    expect(isOsDocument('RESUMO')).toBe(false);
    expect(isOsDocument('CHECKLIST')).toBe(false);
  });
  it('mantém os avisos de impressão de antes', () => {
    expect(printingMessage('OS', 7)).toBe('Imprimindo OS #7...');
    expect(printingMessage('OS_CLIENTE', 7)).toBe('Imprimindo via do cliente - OS #7...');
    expect(printingMessage('OS_OFICINA', 7)).toBe('Imprimindo via da oficina - OS #7...');
    expect(printingMessage('RESUMO', 7)).toBe('Imprimindo resumo da OS #7...');
    expect(printingMessage('CHECKLIST_RESUMIDO', 7)).toBe('Imprimindo vistoria da OS #7...');
  });
  it('pega o nome do arquivo de caminhos do Windows e de barra normal', () => {
    expect(fileNameFromPath('C:\\Users\\x\\Documentos\\OficinaPro\\OS_1.pdf')).toBe('OS_1.pdf');
    expect(fileNameFromPath('/home/x/OS_1-2.pdf')).toBe('OS_1-2.pdf');
    expect(fileNameFromPath('OS_1.pdf')).toBe('OS_1.pdf');
  });
});

describe('pickerOrderLabel', () => {
  it('junta número, cliente e veículo', () => {
    expect(pickerOrderLabel({ osNumber: 5, clientName: 'Ana', vehicle: 'Gol - AAA1B23' })).toBe('OS #5 - Ana - Gol - AAA1B23');
  });
  it('pula partes vazias', () => {
    expect(pickerOrderLabel({ osNumber: 5, clientName: '', vehicle: '' })).toBe('OS #5');
  });
});

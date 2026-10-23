import { describe, it, expect } from 'vitest';
import type { OSStatus } from '../types';
import { deliveryProgress, formatKm, nextStep, shouldIgnoreStep, splitVehicle, statusClass, STEP_LOCK_MS } from './kanbanCardView';

const noon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).toISOString();
const TODAY = '2026-10-22';
const os = (status: OSStatus, expected?: string, created = noon(2026, 10, 12)) => ({ status, expectedDate: expected, createdAt: created });

describe('nextStep', () => {
  it('segue o fluxo com os rótulos combinados', () => {
    expect(nextStep('ORCAMENTO')).toEqual({ to: 'APROVADO', label: 'Aprovar' });
    expect(nextStep('APROVADO')).toEqual({ to: 'EM_SERVICO', label: 'Começar serviço' });
    expect(nextStep('EM_SERVICO')).toEqual({ to: 'AGUARDANDO_PAGAMENTO', label: 'Terminar serviço' });
    expect(nextStep('AGUARDANDO_PAGAMENTO')).toEqual({ to: 'FINALIZADO', label: 'Receber' });
  });
  it('FINALIZADO e ARQUIVADO não têm botão', () => {
    expect(nextStep('FINALIZADO')).toBeNull();
    expect(nextStep('ARQUIVADO')).toBeNull();
  });
});

describe('deliveryProgress', () => {
  it('status que não conta = null (mesmo com data)', () => {
    expect(deliveryProgress(os('ORCAMENTO', noon(2026, 10, 25)), TODAY)).toBeNull();
    expect(deliveryProgress(os('FINALIZADO', noon(2026, 10, 1)), TODAY)).toBeNull();
    expect(deliveryProgress(os('AGUARDANDO_PAGAMENTO'), TODAY)).toBeNull();
  });
  it('sem previsão', () => {
    expect(deliveryProgress(os('EM_SERVICO'), TODAY)).toMatchObject({ level: 'sem', pct: 0, label: 'Sem previsão' });
  });
  it('hoje: barra cheia', () => {
    expect(deliveryProgress(os('APROVADO', noon(2026, 10, 22)), TODAY)).toMatchObject({ level: 'hoje', pct: 100, label: 'Entrega hoje' });
  });
  it('amanhã e data mais distante, com dia da semana', () => {
    expect(deliveryProgress(os('EM_SERVICO', noon(2026, 10, 23)), TODAY)?.label).toBe('Entrega amanhã (sex 23/10)');
    expect(deliveryProgress(os('EM_SERVICO', noon(2026, 10, 26)), TODAY)?.label).toBe('Entrega seg 26/10');
  });
  it('atrasada: singular, plural e barra cheia', () => {
    expect(deliveryProgress(os('EM_SERVICO', noon(2026, 10, 21)), TODAY)).toMatchObject({ level: 'atrasada', pct: 100, label: 'Atrasada 1 dia' });
    expect(deliveryProgress(os('APROVADO', noon(2026, 10, 20)), TODAY)?.label).toBe('Atrasada 2 dias');
  });
  it('percentual proporcional ao prazo (abertura 12/10, previsão 26/10, hoje 22/10 = 10 de 14 dias)', () => {
    expect(deliveryProgress(os('EM_SERVICO', noon(2026, 10, 26)), TODAY)).toMatchObject({ level: 'ok', pct: 71 });
  });
  it('percentual limitado a 0..100 e abertura inválida vira 0', () => {
    expect(deliveryProgress(os('EM_SERVICO', noon(2026, 10, 26), noon(2026, 10, 24)), TODAY)?.pct).toBe(0);
    expect(deliveryProgress(os('EM_SERVICO', noon(2026, 10, 26), 'lixo'), TODAY)?.pct).toBe(0);
  });
  it('aceita Date como hoje', () => {
    expect(deliveryProgress(os('EM_SERVICO', noon(2026, 10, 22)), new Date(2026, 9, 22, 18))?.level).toBe('hoje');
  });
});

describe('splitVehicle e formatKm', () => {
  it('separa a placa gravada no fim', () => {
    expect(splitVehicle('Gol 1.0 - ABC1D23')).toEqual({ model: 'Gol 1.0', plate: 'ABC1D23' });
    expect(splitVehicle('Fiat - Uno - abc-1234')).toEqual({ model: 'Fiat - Uno', plate: 'ABC-1234' });
  });
  it('sem placa (ou sem número no final) tudo é modelo', () => {
    expect(splitVehicle('Gol 1.0')).toEqual({ model: 'Gol 1.0', plate: null });
    expect(splitVehicle('Honda - Branco')).toEqual({ model: 'Honda - Branco', plate: null });
    expect(splitVehicle('')).toEqual({ model: '', plate: null });
  });
  it('km formatado em pt-BR; vazio sem informação', () => {
    expect(formatKm(45000)).toMatch(/^45\.000 km$/);
    expect(formatKm(0)).toBe('');
    expect(formatKm(undefined)).toBe('');
  });
  it('classe do status', () => {
    expect(statusClass('AGUARDANDO_PAGAMENTO')).toBe('aguardando-pagamento');
  });
});

describe('shouldIgnoreStep (trava do clique duplo)', () => {
  it('primeiro passo nunca é ignorado', () => {
    expect(shouldIgnoreStep(null, 1000)).toBe(false);
  });
  it('segundo passo dentro da janela é ignorado', () => {
    expect(shouldIgnoreStep(1000, 1001, 600)).toBe(true);
    expect(shouldIgnoreStep(1000, 1599, 600)).toBe(true);
  });
  it('na borda da janela e depois dela passa', () => {
    expect(shouldIgnoreStep(1000, 1600, 600)).toBe(false);
    expect(shouldIgnoreStep(1000, 5000, 600)).toBe(false);
  });
  it('relógio que andou para trás não trava', () => {
    expect(shouldIgnoreStep(1000, 900, 600)).toBe(false);
  });
  it('janela padrão é STEP_LOCK_MS', () => {
    expect(shouldIgnoreStep(0, STEP_LOCK_MS - 1)).toBe(true);
    expect(shouldIgnoreStep(0, STEP_LOCK_MS)).toBe(false);
  });
});

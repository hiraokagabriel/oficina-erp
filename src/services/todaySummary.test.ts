import { describe, it, expect } from 'vitest';
import { buildOnboarding, buildTodaySummary, lateLabel } from './todaySummary';
import { Appointment, Client, LedgerEntry, WorkOrder } from '../types';

const iso = (day: string) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d, 12).toISOString(); };
const os = (id: number, status: WorkOrder['status'], day?: string): WorkOrder =>
  ({ id: `o${id}`, osNumber: id, status, expectedDate: day ? iso(day) : undefined, clientName: 'C', vehicle: 'V' } as unknown as WorkOrder);
const ap = (id: string, day: string, status: Appointment['status'], time?: string, workOrderId?: string): Appointment =>
  ({ id, date: iso(day), time, status, workOrderId, clientName: 'C', vehicle: 'V', createdAt: '2026-01-01T00:00:00.000Z' });
const credit = (id: string, due: string, amount: number, paid = false): LedgerEntry =>
  ({ id, type: 'CREDIT', amount, description: id, effectiveDate: iso(due), dueDate: iso(due), paymentDate: paid ? iso(due) : undefined } as unknown as LedgerEntry);

const today = '2026-10-22';

describe('buildTodaySummary', () => {
  it('separa entregas de hoje, atrasadas (mais atrasada primeiro) e ignora status que não conta', () => {
    const s = buildTodaySummary(
      [os(1, 'EM_SERVICO', today), os(2, 'APROVADO', '2026-10-20'), os(3, 'EM_SERVICO', '2026-10-10'), os(4, 'ORCAMENTO', '2026-10-01'), os(5, 'APROVADO', '2026-10-30')],
      [], [], today);
    expect(s.entregasHoje.map(o => o.osNumber)).toEqual([1]);
    expect(s.atrasadas.map(a => [a.os.osNumber, a.daysLate])).toEqual([[3, 12], [2, 2]]);
  });
  it('agendamentos de hoje: sem cancelados e faltas, por hora', () => {
    const s = buildTodaySummary([], [
      ap('a', today, 'AGENDADO', '14:00'), ap('b', today, 'AGENDADO', '09:00'), ap('c', today, 'CANCELADO', '08:00'),
      ap('d', today, 'FALTOU'), ap('e', today, 'COMPARECEU', '10:00', 'o1'), ap('f', '2026-10-23', 'AGENDADO'),
    ], [], today);
    expect(s.agendamentosHoje.map(a => a.id)).toEqual(['b', 'e', 'a']);
  });
  it('contas vencidas: só crédito em aberto e vencido, mais antiga primeiro, com total', () => {
    const s = buildTodaySummary([], [], [
      credit('x', '2026-10-20', 1000), credit('y', '2026-10-01', 2500), credit('z', today, 700),
      credit('p', '2026-10-01', 900, true), { ...credit('d', '2026-10-01', 400), type: 'DEBIT' } as LedgerEntry,
    ], today);
    expect(s.contasVencidas.map(c => [c.entry.id, c.daysOverdue])).toEqual([['y', 21], ['x', 2]]);
    expect(s.totalVencido).toBe(3500);
    expect(s.countVencido).toBe(2);
  });
  it('vazio', () => {
    const s = buildTodaySummary([], [], [], today);
    expect(s.entregasHoje).toEqual([]); expect(s.atrasadas).toEqual([]); expect(s.contasVencidas).toEqual([]);
  });
});

describe('lateLabel', () => {
  it('singular e plural', () => { expect(lateLabel(1)).toBe('1 dia de atraso'); expect(lateLabel(3)).toBe('3 dias de atraso'); });
});

describe('buildOnboarding', () => {
  const settings = { name: 'OFICINA', cnpj: '', address: '' };
  it('base nova: nada feito', () => {
    expect(buildOnboarding(settings, [], [], false).map(s => s.done)).toEqual([false, false, false, false, false]);
  });
  it('calcula cada marca dos dados', () => {
    const steps = buildOnboarding({ ...settings, name: 'Auto Silva' }, [{ id: 'c' } as Client], [os(1, 'EM_SERVICO')], true);
    expect(steps.map(s => s.done)).toEqual([true, true, true, true, true]);
  });
  it('OS só aprovada não conta como "em serviço"; endereço conta como dados da oficina', () => {
    const steps = buildOnboarding({ ...settings, address: 'Rua 1' }, [], [os(1, 'APROVADO')], false);
    expect(steps.map(s => s.done)).toEqual([true, false, true, false, false]);
  });
});

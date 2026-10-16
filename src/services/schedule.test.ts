import { describe, it, expect, afterEach } from 'vitest';
import {
  getDeliveryStatus, getDaysLate, formatExpectedDate, summarizeDeliveries,
  groupAppointmentsByDay, startOfWeek, shiftWeek, appointmentToOSDraft,
} from './schedule';
import { formatDateOnly } from '../utils/dates';
import type { Appointment, OSStatus, WorkOrder } from '../types';

// Fixtures sintéticas. Datas só-dia = meio-dia local (como o app grava).
const noon = (y: number, m: number, d: number): string => new Date(y, m - 1, d, 12).toISOString();
const os = (over: Partial<WorkOrder> = {}): WorkOrder => ({
  id: 'os1', osNumber: 1, vehicle: 'Gol - AAA-0001', clientName: 'Fulano Teste', clientPhone: '',
  mileage: 0, status: 'EM_SERVICO', parts: [], services: [], total: 0, createdAt: noon(2026, 1, 1), ...over,
});
const ap = (over: Partial<Appointment> = {}): Appointment => ({
  id: 'a1', date: noon(2026, 3, 10), clientName: 'Maria Teste', vehicle: 'Uno - BBB-0002',
  status: 'AGENDADO', createdAt: '2026-03-01T10:00:00.000Z', ...over,
});

describe('getDeliveryStatus', () => {
  const today = '2026-03-10';
  it('só APROVADO e EM_SERVICO contam', () => {
    const outros: OSStatus[] = ['ORCAMENTO', 'AGUARDANDO_PAGAMENTO', 'FINALIZADO', 'ARQUIVADO'];
    for (const status of outros) {
      expect(getDeliveryStatus(os({ status, expectedDate: noon(2026, 3, 1) }), today)).toBeNull();
      expect(getDeliveryStatus(os({ status }), today)).toBeNull();
    }
    expect(getDeliveryStatus(os({ status: 'APROVADO', expectedDate: noon(2026, 3, 1) }), today)).toBe('ATRASADA');
    expect(getDeliveryStatus(os({ status: 'EM_SERVICO', expectedDate: noon(2026, 3, 1) }), today)).toBe('ATRASADA');
  });
  it('ontem atrasa; hoje e amanhã estão no prazo', () => {
    expect(getDeliveryStatus(os({ expectedDate: noon(2026, 3, 9) }), today)).toBe('ATRASADA');
    expect(getDeliveryStatus(os({ expectedDate: noon(2026, 3, 10) }), today)).toBe('NO_PRAZO');
    expect(getDeliveryStatus(os({ expectedDate: noon(2026, 3, 11) }), today)).toBe('NO_PRAZO');
  });
  it('hoje é por dia local, não por hora: 23h59 do mesmo dia ainda não atrasou', () => {
    const exp = noon(2026, 3, 10);
    expect(getDeliveryStatus(os({ expectedDate: exp }), new Date(2026, 2, 10, 23, 59))).toBe('NO_PRAZO');
    expect(getDeliveryStatus(os({ expectedDate: exp }), new Date(2026, 2, 11, 0, 1))).toBe('ATRASADA');
  });
  it('sem previsão (ou previsão inválida) = SEM_PREVISAO', () => {
    expect(getDeliveryStatus(os(), today)).toBe('SEM_PREVISAO');
    expect(getDeliveryStatus(os({ expectedDate: 'lixo' }), today)).toBe('SEM_PREVISAO');
    expect(getDeliveryStatus(os({ expectedDate: '' }), today)).toBe('SEM_PREVISAO');
  });
  it('aceita previsão só-dia', () => {
    expect(getDeliveryStatus(os({ expectedDate: '2026-03-09' }), today)).toBe('ATRASADA');
  });
});

describe('getDaysLate', () => {
  it('0 quando não atrasada ou não conta', () => {
    expect(getDaysLate(os({ expectedDate: noon(2026, 3, 10) }), '2026-03-10')).toBe(0);
    expect(getDaysLate(os({ expectedDate: noon(2026, 3, 20) }), '2026-03-10')).toBe(0);
    expect(getDaysLate(os(), '2026-03-10')).toBe(0);
    expect(getDaysLate(os({ status: 'FINALIZADO', expectedDate: noon(2026, 3, 1) }), '2026-03-10')).toBe(0);
  });
  it('conta dias de calendário', () => {
    expect(getDaysLate(os({ expectedDate: noon(2026, 3, 9) }), '2026-03-10')).toBe(1);
    expect(getDaysLate(os({ expectedDate: noon(2026, 3, 1) }), '2026-03-10')).toBe(9);
  });
  it('virada de mês e de ano', () => {
    expect(getDaysLate(os({ expectedDate: noon(2026, 2, 27) }), '2026-03-02')).toBe(3); // fev/2026 tem 28 dias
    expect(getDaysLate(os({ expectedDate: noon(2024, 2, 28) }), '2024-03-01')).toBe(2); // bissexto
    expect(getDaysLate(os({ expectedDate: noon(2025, 12, 31) }), '2026-01-02')).toBe(2);
  });
  it('mesma conta com Date e com string', () => {
    expect(getDaysLate(os({ expectedDate: noon(2026, 3, 1) }), new Date(2026, 2, 10, 8, 30))).toBe(9);
  });
});

describe('formatExpectedDate', () => {
  it('dd/mm/aaaa pelo dia local', () => {
    expect(formatExpectedDate(os({ expectedDate: noon(2026, 3, 5) }))).toBe('05/03/2026');
    expect(formatExpectedDate(os({ expectedDate: noon(2025, 12, 31) }))).toBe('31/12/2025');
  });
  it('vazio sem previsão ou inválida', () => {
    expect(formatExpectedDate(os())).toBe('');
    expect(formatExpectedDate(os({ expectedDate: 'x' }))).toBe('');
  });
});

describe('summarizeDeliveries', () => {
  const today = '2026-03-10';
  const lista = [
    os({ id: 'a', osNumber: 5, expectedDate: noon(2026, 3, 8) }), // 2 dias
    os({ id: 'b', osNumber: 3, status: 'APROVADO', expectedDate: noon(2026, 3, 1) }), // 9 dias
    os({ id: 'c', osNumber: 4, expectedDate: noon(2026, 3, 8) }), // 2 dias (empate: número menor primeiro)
    os({ id: 'd', osNumber: 6, expectedDate: noon(2026, 3, 10) }), // hoje
    os({ id: 'e', osNumber: 7, status: 'APROVADO', expectedDate: noon(2026, 3, 10) }), // hoje
    os({ id: 'f', osNumber: 8, expectedDate: noon(2026, 3, 12) }), // futuro
    os({ id: 'g', osNumber: 9 }), // sem previsão
    os({ id: 'h', osNumber: 10, status: 'APROVADO' }), // sem previsão
    os({ id: 'i', osNumber: 11, status: 'FINALIZADO', expectedDate: noon(2026, 1, 1) }), // ignorada
    os({ id: 'j', osNumber: 12, status: 'ORCAMENTO' }), // ignorada
  ];
  it('atrasadas da mais atrasada para a menos; conta hoje e sem previsão', () => {
    const r = summarizeDeliveries(lista, today);
    expect(r.atrasadas.map(o => o.id)).toEqual(['b', 'c', 'a']);
    expect(r.hoje).toBe(2);
    expect(r.semPrevisao).toBe(2);
  });
  it('lista vazia e não muta a entrada', () => {
    expect(summarizeDeliveries([], today)).toEqual({ atrasadas: [], hoje: 0, semPrevisao: 0 });
    const copia = lista.map(o => o.id);
    summarizeDeliveries(lista, today);
    expect(lista.map(o => o.id)).toEqual(copia);
  });
});

describe('startOfWeek / shiftWeek', () => {
  const key = (d: Date) => formatDateOnly(d);
  it('segunda-feira da semana, para qualquer dia', () => {
    // 2026-03-09 é segunda
    for (const dia of ['2026-03-09', '2026-03-10', '2026-03-13', '2026-03-14', '2026-03-15']) {
      expect(key(startOfWeek(dia))).toBe('2026-03-09');
    }
    expect(key(startOfWeek('2026-03-16'))).toBe('2026-03-16');
  });
  it('domingo pertence à semana que termina nele', () => {
    expect(key(startOfWeek(new Date(2026, 2, 15, 23, 30)))).toBe('2026-03-09');
  });
  it('atravessa mês e ano', () => {
    expect(key(startOfWeek('2026-01-01'))).toBe('2025-12-29'); // quinta
    expect(key(startOfWeek('2026-03-01'))).toBe('2026-02-23'); // domingo
  });
  it('devolve meio-dia local', () => {
    expect(startOfWeek('2026-03-12').getHours()).toBe(12);
  });
  it('shiftWeek soma semanas, inclusive negativas e viradas', () => {
    expect(key(shiftWeek('2026-03-09', 1))).toBe('2026-03-16');
    expect(key(shiftWeek('2026-03-09', -1))).toBe('2026-03-02');
    expect(key(shiftWeek('2025-12-29', 1))).toBe('2026-01-05');
    expect(key(shiftWeek('2026-03-09', 0))).toBe('2026-03-09');
    expect(key(shiftWeek(new Date(2026, 2, 9, 12), 52))).toBe('2027-03-08');
  });
});

describe('groupAppointmentsByDay', () => {
  const semana = '2026-03-09'; // segunda
  it('semana vazia: 7 dias, segunda a domingo, sem itens', () => {
    const g = groupAppointmentsByDay([], semana, '2026-03-10');
    expect(g.map(d => d.dayKey)).toEqual([
      '2026-03-09', '2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13', '2026-03-14', '2026-03-15',
    ]);
    expect(g.every(d => d.items.length === 0)).toBe(true);
  });
  it('marca hoje e amanhã', () => {
    const g = groupAppointmentsByDay([], semana, new Date(2026, 2, 10, 18));
    expect(g.map(d => d.isToday)).toEqual([false, true, false, false, false, false, false]);
    expect(g.map(d => d.isTomorrow)).toEqual([false, false, true, false, false, false, false]);
  });
  it('hoje domingo: amanhã é a segunda seguinte (fora desta semana, dentro da próxima)', () => {
    const g = groupAppointmentsByDay([], semana, '2026-03-15');
    expect(g[6].isToday).toBe(true);
    expect(g.some(d => d.isTomorrow)).toBe(false);
    const prox = groupAppointmentsByDay([], '2026-03-16', '2026-03-15');
    expect(prox[0].isTomorrow).toBe(true);
  });
  it('hoje fora da semana: ninguém marcado', () => {
    const g = groupAppointmentsByDay([], semana, '2026-04-01');
    expect(g.some(d => d.isToday || d.isTomorrow)).toBe(false);
  });
  it('ordena por hora; sem hora por último; empate por criação e id', () => {
    const dia = noon(2026, 3, 11);
    const itens = [
      ap({ id: 'sem2', date: dia, createdAt: '2026-03-02T00:00:00Z' }),
      ap({ id: 'h14', date: dia, time: '14:30' }),
      ap({ id: 'sem1', date: dia, createdAt: '2026-03-01T00:00:00Z' }),
      ap({ id: 'h08', date: dia, time: '08:00' }),
      ap({ id: 'h14b', date: dia, time: '14:30', createdAt: '2026-03-05T00:00:00Z' }),
    ];
    const g = groupAppointmentsByDay(itens, semana, '2026-03-10');
    expect(g[2].items.map(a => a.id)).toEqual(['h08', 'h14', 'h14b', 'sem1', 'sem2']);
  });
  it('cancelados e faltas entram no grupo, distinguíveis pelo status', () => {
    const dia = noon(2026, 3, 12);
    const g = groupAppointmentsByDay([
      ap({ id: '1', date: dia, status: 'CANCELADO' }),
      ap({ id: '2', date: dia, status: 'FALTOU' }),
      ap({ id: '3', date: dia, status: 'COMPARECEU' }),
      ap({ id: '4', date: dia }),
    ], semana, '2026-03-10');
    expect(g[3].items.map(a => a.status).sort()).toEqual(['AGENDADO', 'CANCELADO', 'COMPARECEU', 'FALTOU']);
  });
  it('agendamentos fora da semana (ou com data inválida) não entram', () => {
    const g = groupAppointmentsByDay([
      ap({ id: 'antes', date: noon(2026, 3, 8) }),
      ap({ id: 'depois', date: noon(2026, 3, 16) }),
      ap({ id: 'ruim', date: 'x' }),
      ap({ id: 'ok', date: noon(2026, 3, 15) }),
    ], semana, '2026-03-10');
    expect(g.flatMap(d => d.items.map(a => a.id))).toEqual(['ok']);
    expect(g[6].items[0].id).toBe('ok');
  });
  it('não muta a entrada', () => {
    const itens = [ap({ id: 'b', time: '10:00' }), ap({ id: 'a', time: '09:00' })];
    groupAppointmentsByDay(itens, semana, '2026-03-10');
    expect(itens.map(a => a.id)).toEqual(['b', 'a']);
  });
  it('semana atravessando virada de ano', () => {
    const g = groupAppointmentsByDay([ap({ id: 'x', date: noon(2026, 1, 1) })], '2025-12-29', '2025-12-31');
    expect(g.map(d => d.dayKey)).toEqual(['2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']);
    expect(g[3].items).toHaveLength(1);
    expect(g[2].isToday).toBe(true);
    expect(g[3].isTomorrow).toBe(true);
  });
});

describe('appointmentToOSDraft', () => {
  it('copia os campos e usa notes = reason', () => {
    expect(appointmentToOSDraft(ap({
      clientId: 'c1', clientPhone: '11 90000-0000', vehicleId: 'v1', reason: 'Barulho na frente',
    }))).toEqual({
      clientName: 'Maria Teste', clientPhone: '11 90000-0000', clientId: 'c1',
      vehicle: 'Uno - BBB-0002', vehicleId: 'v1', notes: 'Barulho na frente',
    });
  });
  it('campos opcionais ausentes viram texto vazio (telefone, notas) ou ficam sem id', () => {
    const d = appointmentToOSDraft(ap());
    expect(d.clientPhone).toBe('');
    expect(d.notes).toBe('');
    expect(d.clientId).toBeUndefined();
    expect(d.vehicleId).toBeUndefined();
  });
});

// Fusos: o dia local não pode depender do fuso nem do horário de verão.
describe('fusos e horário de verão', () => {
  const original = process.env.TZ;
  afterEach(() => { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; });

  const zonas = ['UTC', 'America/Sao_Paulo', 'America/New_York', 'Europe/London', 'Pacific/Auckland'];
  for (const tz of zonas) {
    it(`mesmos resultados em ${tz}`, () => {
      process.env.TZ = tz;
      const exp = new Date(2026, 2, 8, 12).toISOString(); // meio-dia local de 08/03 (EUA troca para verão neste dia)
      const o = os({ expectedDate: exp });
      expect(formatExpectedDate(o)).toBe('08/03/2026');
      expect(getDaysLate(o, '2026-03-10')).toBe(2);
      expect(getDeliveryStatus(o, new Date(2026, 2, 8, 23, 59))).toBe('NO_PRAZO');
      expect(getDeliveryStatus(o, new Date(2026, 2, 9, 0, 0))).toBe('ATRASADA');
      // atravessa a troca de horário de verão: contagem de dias de calendário continua exata
      expect(getDaysLate(os({ expectedDate: new Date(2026, 2, 1, 12).toISOString() }), '2026-03-15')).toBe(14);
      expect(getDaysLate(os({ expectedDate: new Date(2026, 9, 25, 12).toISOString() }), '2026-11-02')).toBe(8);
      const g = groupAppointmentsByDay([ap({ id: 'z', date: new Date(2026, 2, 8, 12).toISOString() })], startOfWeek('2026-03-04'), '2026-03-04');
      expect(g.map(d => d.dayKey)).toEqual(['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08']);
      expect(g[6].items).toHaveLength(1);
      expect(formatDateOnly(shiftWeek('2026-03-02', 1))).toBe('2026-03-09');
      expect(formatDateOnly(shiftWeek('2026-10-26', 1))).toBe('2026-11-02');
    });
  }
});

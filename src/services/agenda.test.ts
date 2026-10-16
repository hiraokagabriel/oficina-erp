import { describe, expect, it } from 'vitest';
import type { Appointment, Client } from '../types';
import {
  appendNote, applyAppointmentAction, appointmentDayKey, canApplyAction, canCreateOS, linkAppointmentToOS,
  makeAppointment, resolveAppointmentClient, statusLabel, updateAppointment, validateAppointmentInput, weekRangeLabel,
} from './agenda';
import { parseDateOnly } from '../utils/dates';

const NOW = new Date(2026, 4, 10, 9, 30);

const base = (over: Partial<Appointment> = {}): Appointment => ({
  id: 'a1',
  date: parseDateOnly('2026-05-12').toISOString(),
  clientName: 'Ana',
  vehicle: 'Gol - ABC1D23',
  status: 'AGENDADO',
  createdAt: NOW.toISOString(),
  ...over,
});

const client = (id: string, name: string, extra: Partial<Client> = {}): Client => ({
  id, name, phone: '', notes: '', vehicles: [], ...extra,
});

describe('statusLabel', () => {
  it('traduz os quatro status', () => {
    expect(statusLabel('AGENDADO')).toBe('Agendado');
    expect(statusLabel('COMPARECEU')).toBe('Compareceu');
    expect(statusLabel('CANCELADO')).toBe('Cancelado');
    expect(statusLabel('FALTOU')).toBe('Faltou');
  });
});

describe('makeAppointment / validação', () => {
  const input = { clientName: '  Ana   Souza ', vehicle: ' Gol - ABC1D23 ', date: '2026-05-12', newId: 'n1', now: NOW };

  it('monta o agendamento com trim, meio-dia local e status AGENDADO', () => {
    const ap = makeAppointment({ ...input, clientPhone: ' 9999 ', time: '08:30', reason: ' revisão ' });
    expect(ap).toMatchObject({
      id: 'n1', status: 'AGENDADO', clientName: 'Ana Souza', clientPhone: '9999', vehicle: 'Gol - ABC1D23',
      time: '08:30', reason: 'revisão', createdAt: NOW.toISOString(),
    });
    expect(appointmentDayKey(ap)).toBe('2026-05-12');
    expect(new Date(ap.date).getHours()).toBe(12);
  });

  it('campos opcionais vazios viram undefined', () => {
    const ap = makeAppointment({ ...input, time: '', reason: '  ', clientPhone: '' });
    expect(ap.time).toBeUndefined();
    expect(ap.reason).toBeUndefined();
    expect(ap.clientPhone).toBeUndefined();
  });

  it('exige cliente', () => {
    expect(() => makeAppointment({ ...input, clientName: '   ' })).toThrow('Informe o cliente.');
  });

  it('exige data', () => {
    expect(() => makeAppointment({ ...input, date: '' })).toThrow('Informe a data');
  });

  it('recusa data inexistente e formato errado', () => {
    expect(validateAppointmentInput({ clientName: 'A', vehicle: '', date: '2026-02-31' })).toBe('Data inválida.');
    expect(validateAppointmentInput({ clientName: 'A', vehicle: '', date: '12/05/2026' })).toBe('Data inválida.');
  });

  it('recusa hora inválida e aceita limites', () => {
    for (const t of ['24:00', '8:30', '12:60', 'abc', '12:5']) {
      expect(validateAppointmentInput({ clientName: 'A', vehicle: '', date: '2026-05-12', time: t })).toMatch(/Hora inválida/);
    }
    for (const t of ['00:00', '23:59', '']) {
      expect(validateAppointmentInput({ clientName: 'A', vehicle: '', date: '2026-05-12', time: t })).toBeNull();
    }
  });

  it('updateAppointment mantém id, status, workOrderId e createdAt', () => {
    const orig = base({ status: 'COMPARECEU', workOrderId: 'os1' });
    const up = updateAppointment(orig, { clientName: 'Bia', vehicle: 'Uno', date: '2026-06-01', time: '10:00' });
    expect(up).toMatchObject({ id: 'a1', status: 'COMPARECEU', workOrderId: 'os1', createdAt: orig.createdAt, clientName: 'Bia', time: '10:00' });
    expect(appointmentDayKey(up)).toBe('2026-06-01');
    expect(() => updateAppointment(orig, { clientName: '', vehicle: '', date: '2026-06-01' })).toThrow();
  });
});

describe('ações', () => {
  it('CANCELAR, FALTOU e COMPARECEU a partir de AGENDADO', () => {
    expect(applyAppointmentAction(base(), 'CANCELAR').status).toBe('CANCELADO');
    expect(applyAppointmentAction(base(), 'FALTOU').status).toBe('FALTOU');
    expect(applyAppointmentAction(base(), 'COMPARECEU').status).toBe('COMPARECEU');
  });

  it('não muta o original', () => {
    const ap = base();
    applyAppointmentAction(ap, 'CANCELAR');
    expect(ap.status).toBe('AGENDADO');
  });

  it('REAGENDAR volta a AGENDADO com nova data e hora (a partir de cancelado/faltou também)', () => {
    for (const status of ['AGENDADO', 'CANCELADO', 'FALTOU'] as const) {
      const r = applyAppointmentAction(base({ status, time: '09:00' }), 'REAGENDAR', { date: '2026-05-20', time: '14:00' });
      expect(r.status).toBe('AGENDADO');
      expect(appointmentDayKey(r)).toBe('2026-05-20');
      expect(r.time).toBe('14:00');
    }
  });

  it('REAGENDAR sem hora limpa a hora; sem data ou com data/hora inválida lança', () => {
    expect(applyAppointmentAction(base({ time: '09:00' }), 'REAGENDAR', { date: '2026-05-20' }).time).toBeUndefined();
    expect(() => applyAppointmentAction(base(), 'REAGENDAR')).toThrow();
    expect(() => applyAppointmentAction(base(), 'REAGENDAR', { date: '' })).toThrow();
    expect(() => applyAppointmentAction(base(), 'REAGENDAR', { date: '2026-05-20', time: '99:00' })).toThrow();
  });

  it('transições inválidas lançam', () => {
    expect(() => applyAppointmentAction(base({ status: 'CANCELADO' }), 'COMPARECEU')).toThrow();
    expect(() => applyAppointmentAction(base({ status: 'FALTOU' }), 'CANCELAR')).toThrow();
    expect(() => applyAppointmentAction(base({ status: 'COMPARECEU' }), 'FALTOU')).toThrow();
    expect(() => applyAppointmentAction(base({ status: 'COMPARECEU' }), 'REAGENDAR', { date: '2026-05-20' })).toThrow();
  });

  it('canApplyAction espelha as regras', () => {
    expect(canApplyAction(base(), 'CANCELAR')).toBe(true);
    expect(canApplyAction(base({ status: 'CANCELADO' }), 'REAGENDAR')).toBe(true);
    expect(canApplyAction(base({ status: 'COMPARECEU' }), 'REAGENDAR')).toBe(false);
  });
});

describe('canCreateOS / linkAppointmentToOS', () => {
  it('só AGENDADO sem OS', () => {
    expect(canCreateOS(base())).toBe(true);
    expect(canCreateOS(base({ workOrderId: 'os1' }))).toBe(false);
    expect(canCreateOS(base({ status: 'CANCELADO' }))).toBe(false);
    expect(canCreateOS(base({ status: 'FALTOU' }))).toBe(false);
    expect(canCreateOS(base({ status: 'COMPARECEU' }))).toBe(false);
  });

  it('linkAppointmentToOS marca COMPARECEU e grava workOrderId', () => {
    const ap = base();
    const r = linkAppointmentToOS(ap, { id: 'os9' });
    expect(r).toMatchObject({ status: 'COMPARECEU', workOrderId: 'os9', id: 'a1' });
    expect(ap.status).toBe('AGENDADO');
    expect(canCreateOS(r)).toBe(false);
  });
});

describe('appendNote', () => {
  it('acrescenta na linha de baixo sem apagar a nota existente', () => {
    expect(appendNote('Cliente exigente', 'Barulho ao frear')).toBe('Cliente exigente\nBarulho ao frear');
  });
  it('mantém notas de várias linhas e acrescenta depois da última', () => {
    expect(appendNote('linha 1\nlinha 2', 'novo')).toBe('linha 1\nlinha 2\nnovo');
  });
  it('não duplica quebras quando a nota existente já termina em linha em branco', () => {
    expect(appendNote('abc\n\n', 'novo')).toBe('abc\nnovo');
  });
  it('sem nota existente fica só o texto novo', () => {
    expect(appendNote('', 'Barulho ao frear')).toBe('Barulho ao frear');
    expect(appendNote(undefined, 'Barulho ao frear')).toBe('Barulho ao frear');
  });
  it('sem texto novo devolve a nota existente intacta', () => {
    expect(appendNote('abc', '')).toBe('abc');
    expect(appendNote('abc', '   ')).toBe('abc');
    expect(appendNote('abc', undefined)).toBe('abc');
    expect(appendNote(undefined, undefined)).toBe('');
  });
  it('apara espaços do texto novo', () => {
    expect(appendNote('abc', '  novo  ')).toBe('abc\nnovo');
  });
});

describe('weekRangeLabel', () => {
  it('semana no mesmo mês', () => {
    expect(weekRangeLabel(parseDateOnly('2026-05-11'))).toBe('11/05 a 17/05/2026');
  });
  it('virada de mês', () => {
    expect(weekRangeLabel(parseDateOnly('2026-04-27'))).toBe('27/04 a 03/05/2026');
  });
  it('virada de ano', () => {
    expect(weekRangeLabel(parseDateOnly('2026-12-28'))).toBe('28/12 a 03/01/2027');
  });
  it('aceita string AAAA-MM-DD', () => {
    expect(weekRangeLabel('2026-05-11')).toBe('11/05 a 17/05/2026');
  });
});

describe('resolveAppointmentClient', () => {
  const clients = [
    client('c1', 'Ana Souza', { vehicles: [{ id: 'v1', model: 'Gol', plate: 'ABC1D23' }] }),
    client('c2', 'João'),
    client('c3', 'joão '),
  ];

  it('único cliente -> clientId e vehicleId', () => {
    const r = resolveAppointmentClient('  ana   souza', clients, undefined, 'Gol - ABC-1D23');
    expect(r).toMatchObject({ kind: 'unique', clientId: 'c1', vehicleId: 'v1' });
  });

  it('único sem veículo cadastrado -> sem vehicleId', () => {
    const r = resolveAppointmentClient('Ana Souza', clients, undefined, 'Uno - ZZZ9999');
    expect(r).toMatchObject({ kind: 'unique', clientId: 'c1' });
    expect(r.kind === 'unique' && r.vehicleId).toBeUndefined();
  });

  it('homônimos exigem escolha', () => {
    const r = resolveAppointmentClient('João', clients);
    expect(r.kind).toBe('ambiguous');
    expect(r.kind === 'ambiguous' && r.candidates.map(c => c.id)).toEqual(['c2', 'c3']);
  });

  it('homônimos com escolha válida resolvem; escolha de outro nome não vale', () => {
    expect(resolveAppointmentClient('João', clients, 'c3')).toMatchObject({ kind: 'unique', clientId: 'c3' });
    expect(resolveAppointmentClient('João', clients, 'c1').kind).toBe('ambiguous');
  });

  it('inexistente ou vazio -> none (não cria cliente)', () => {
    expect(resolveAppointmentClient('Zé Ninguém', clients).kind).toBe('none');
    expect(resolveAppointmentClient('  ', clients).kind).toBe('none');
  });
});

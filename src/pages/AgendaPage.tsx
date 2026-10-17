import React, { useMemo, useState } from 'react';
import { Appointment, Client, WorkOrder } from '../types';
import { AppointmentAction, AppointmentInput, canApplyAction, canCreateOS, statusLabel, weekRangeLabel } from '../services/agenda';
import { groupAppointmentsByDay, shiftWeek, startOfWeek } from '../services/schedule';
import { formatDateOnly, parseDateOnly } from '../utils/dates';
import { AppointmentModal, AppointmentModalMode } from '../modals/AppointmentModal';
import { ConfirmationModal } from '../modals/ConfirmationModal';

interface AgendaPageProps {
  appointments: Appointment[];
  workOrders: WorkOrder[];
  clients: Client[];
  /** `editing` nulo = novo agendamento. */
  onSave: (input: AppointmentInput, editing: Appointment | null, mode: AppointmentModalMode) => void;
  onAction: (id: string, action: Exclude<AppointmentAction, 'REAGENDAR'>) => void;
  onDelete: (id: string) => void;
  onCreateOS: (appointment: Appointment) => void;
}

interface ModalState {
  mode: AppointmentModalMode;
  editing: Appointment | null;
  date: string;
}

const dayTitle = (dayKey: string): string =>
  parseDateOnly(dayKey).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });

export const AgendaPage: React.FC<AgendaPageProps> = ({ appointments, workOrders, clients, onSave, onAction, onDelete, onCreateOS }) => {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [modal, setModal] = useState<ModalState | null>(null);
  const [toDelete, setToDelete] = useState<Appointment | null>(null);

  const today = new Date();
  const todayKey = formatDateOnly(today);
  const days = useMemo(
    () => groupAppointmentsByDay(appointments, weekStart, new Date()),
    [appointments, weekStart]
  );
  const weekTotal = days.reduce((n, d) => n + d.items.length, 0);

  const osById = useMemo(() => new Map(workOrders.map(o => [o.id, o])), [workOrders]);

  const openNew = (date: string) => setModal({ mode: 'NOVO', editing: null, date });

  const renderOS = (ap: Appointment) => {
    if (!ap.workOrderId) return null;
    const os = osById.get(ap.workOrderId);
    return <span className="appt-os">{os ? `OS #${os.osNumber}` : 'OS excluída'}</span>;
  };

  return (
    <div className="appt-page">
      <header className="appt-header">
        <h1 className="appt-title">Agenda</h1>
        <div className="appt-nav" role="group" aria-label="Navegação por semana">
          <button type="button" className="btn-sm" onClick={() => setWeekStart(w => shiftWeek(w, -1))}>Semana anterior</button>
          <button type="button" className="btn-sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>Hoje</button>
          <button type="button" className="btn-sm" onClick={() => setWeekStart(w => shiftWeek(w, 1))}>Próxima semana</button>
          <span className="appt-range" aria-live="polite">{weekRangeLabel(weekStart)}</span>
        </div>
        <button type="button" className="btn" onClick={() => openNew(todayKey)}>+ Novo agendamento</button>
      </header>

      {weekTotal === 0 && (
        <p className="appt-week-empty">Nenhum agendamento nesta semana. Use &quot;+ Novo agendamento&quot; para marcar a entrada de um veículo.</p>
      )}

      <div className="appt-days">
        {days.map(day => (
          <section
            key={day.dayKey}
            className={`appt-day${day.isToday ? ' appt-day--today' : ''}`}
            aria-labelledby={`appt-day-${day.dayKey}`}
          >
            <div className="appt-day-head">
              <h2 className="appt-day-title" id={`appt-day-${day.dayKey}`}>
                {dayTitle(day.dayKey)}
                {day.isToday && <span className="appt-tag appt-tag--today">Hoje</span>}
                {day.isTomorrow && <span className="appt-tag appt-tag--tomorrow">Amanhã</span>}
              </h2>
              <button type="button" className="btn-sm" onClick={() => openNew(day.dayKey)}>+ Agendar neste dia</button>
            </div>

            {day.items.length === 0 ? (
              <p className="appt-day-empty">Sem agendamentos</p>
            ) : (
              <ul className="appt-list">
                {day.items.map(ap => (
                  <li key={ap.id} className={`appt-item appt-item--${ap.status.toLowerCase()}`}>
                    <div className="appt-item-main">
                      <span className="appt-time">{ap.time ? ap.time : 'Sem horário'}</span>
                      <div className="appt-info">
                        <strong className="appt-client">{ap.clientName}</strong>
                        {ap.clientPhone && <span className="appt-muted"> · {ap.clientPhone}</span>}
                        {ap.vehicle && <div className="appt-vehicle">{ap.vehicle}</div>}
                        {ap.reason && <div className="appt-reason">{ap.reason}</div>}
                      </div>
                      <div className="appt-badges">
                        <span className={`appt-chip appt-chip--${ap.status.toLowerCase()}`}>{statusLabel(ap.status)}</span>
                        {renderOS(ap)}
                      </div>
                    </div>
                    <div className="appt-actions">
                      {canCreateOS(ap) && (
                        <button type="button" className="btn-sm appt-btn-primary" onClick={() => onCreateOS(ap)}>Criar OS</button>
                      )}
                      <button type="button" className="btn-sm" onClick={() => setModal({ mode: 'EDITAR', editing: ap, date: todayKey })}>Editar</button>
                      {canApplyAction(ap, 'COMPARECEU') && (
                        <button type="button" className="btn-sm" onClick={() => onAction(ap.id, 'COMPARECEU')}>Compareceu</button>
                      )}
                      {canApplyAction(ap, 'FALTOU') && (
                        <button type="button" className="btn-sm" onClick={() => onAction(ap.id, 'FALTOU')}>Faltou</button>
                      )}
                      {canApplyAction(ap, 'CANCELAR') && (
                        <button type="button" className="btn-sm" onClick={() => onAction(ap.id, 'CANCELAR')}>Cancelar</button>
                      )}
                      {canApplyAction(ap, 'REAGENDAR') && (
                        <button type="button" className="btn-sm" onClick={() => setModal({ mode: 'REAGENDAR', editing: ap, date: todayKey })}>Reagendar</button>
                      )}
                      <button type="button" className="btn-sm appt-btn-danger" onClick={() => setToDelete(ap)}>Excluir</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      {modal && (
        <AppointmentModal
          isOpen
          mode={modal.mode}
          editing={modal.editing}
          defaultDate={modal.date}
          clients={clients}
          workOrders={workOrders}
          onClose={() => setModal(null)}
          onSave={input => { onSave(input, modal.editing, modal.mode); setModal(null); }}
        />
      )}

      {toDelete && (
        <ConfirmationModal
          isOpen
          title="Excluir agendamento?"
          message={`O agendamento de ${toDelete.clientName} será removido. A OS ligada a ele, se houver, não é afetada.`}
          confirmText="Excluir"
          confirmColor="danger"
          onClose={() => setToDelete(null)}
          onConfirm={() => onDelete(toDelete.id)}
        />
      )}
    </div>
  );
};

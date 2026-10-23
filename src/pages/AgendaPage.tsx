import React, { useEffect, useMemo, useState } from 'react';
import { Appointment, Client, WorkOrder } from '../types';
import { AppointmentAction, AppointmentInput, canApplyAction, canCreateOS, statusLabel, weekRangeLabel } from '../services/agenda';
import { groupAppointmentsByDay, shiftWeek, startOfWeek } from '../services/schedule';
import { formatDateOnly, parseDateFlexible, parseDateOnly } from '../utils/dates';
import { AppointmentModal, AppointmentModalMode } from '../modals/AppointmentModal';
import { ConfirmationModal } from '../modals/ConfirmationModal';
import { Icon, IconName } from '../components/ui/Icon';

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

const STATUS_ICON: Record<Appointment['status'], IconName> = {
  AGENDADO: 'relogio',
  COMPARECEU: 'check',
  FALTOU: 'alerta',
  CANCELADO: 'fechar',
};

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

  // Semana atual: Hoje e os próximos dias primeiro; os dias que já passaram vão para o fim.
  const todayIdx = days.findIndex(d => d.isToday);
  const isCurrentWeek = todayIdx >= 0;
  const ordered = useMemo(
    () => (todayIdx > 0 ? [...days.slice(todayIdx), ...days.slice(0, todayIdx)] : days),
    [days, todayIdx]
  );
  const firstPastIdx = todayIdx > 0 ? days.length - todayIdx : -1;

  // Esc fecha a confirmação de exclusão (o App não conhece esse estado).
  useEffect(() => {
    if (!toDelete) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) setToDelete(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toDelete]);

  const renderOS = (ap: Appointment) => {
    if (!ap.workOrderId) return null;
    const os = osById.get(ap.workOrderId);
    return <span className="appt-os">{os ? `OS #${os.osNumber}` : 'OS excluída'}</span>;
  };

  const renderTags = (day: { isToday: boolean; isTomorrow: boolean }) => (
    <>
      {day.isToday && <span className="appt-tag appt-tag--today">Hoje</span>}
      {day.isTomorrow && <span className="appt-tag appt-tag--tomorrow">Amanhã</span>}
    </>
  );

  const renderItem = (ap: Appointment) => (
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
          <span className={`appt-chip appt-chip--${ap.status.toLowerCase()}`}>
            <Icon name={STATUS_ICON[ap.status]} size={14} />
            {statusLabel(ap.status)}
          </span>
          {renderOS(ap)}
        </div>
      </div>
      <div className="appt-actions">
        {canCreateOS(ap) && (
          <button type="button" className="btn appt-btn-main" onClick={() => onCreateOS(ap)}>
            <Icon name="prancheta" size={18} />Criar OS
          </button>
        )}
        <div className="appt-actions-group" role="group" aria-label="Outras ações">
          {canApplyAction(ap, 'COMPARECEU') && (
            <button type="button" className="btn-sm appt-btn-sec" onClick={() => onAction(ap.id, 'COMPARECEU')}>
              <Icon name="check" size={16} />Compareceu
            </button>
          )}
          {canApplyAction(ap, 'FALTOU') && (
            <button type="button" className="btn-sm appt-btn-sec" onClick={() => onAction(ap.id, 'FALTOU')}>
              <Icon name="alerta" size={16} />Faltou
            </button>
          )}
          {canApplyAction(ap, 'REAGENDAR') && (
            <button type="button" className="btn-sm appt-btn-sec" onClick={() => setModal({ mode: 'REAGENDAR', editing: ap, date: todayKey })}>
              <Icon name="calendario" size={16} />Reagendar
            </button>
          )}
          <button type="button" className="btn-sm appt-btn-sec" onClick={() => setModal({ mode: 'EDITAR', editing: ap, date: todayKey })}>
            <Icon name="editar" size={16} />Editar
          </button>
        </div>
        <div className="appt-actions-end">
          {canApplyAction(ap, 'CANCELAR') && (
            <button type="button" className="btn-sm appt-btn-cancel" onClick={() => onAction(ap.id, 'CANCELAR')}>
              <Icon name="fechar" size={16} />Cancelar agendamento
            </button>
          )}
          <button type="button" className="btn-sm appt-btn-danger" onClick={() => setToDelete(ap)}>
            <Icon name="excluir" size={16} />Excluir
          </button>
        </div>
      </div>
    </li>
  );

  return (
    <div className="appt-page">
      <header className="appt-header">
        <h1 className="appt-title">Agenda</h1>
        <div className="appt-nav" role="group" aria-label="Navegação por semana">
          <button type="button" className="btn-sm" onClick={() => setWeekStart(w => shiftWeek(w, -1))}>
            <Icon name="voltar" size={16} />Semana anterior
          </button>
          <button type="button" className="btn-sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>Hoje</button>
          <button type="button" className="btn-sm" onClick={() => setWeekStart(w => shiftWeek(w, 1))}>
            Próxima semana<Icon name="proximo" size={16} />
          </button>
          <span className="appt-range" aria-live="polite">{weekRangeLabel(weekStart)}</span>
        </div>
        <button type="button" className="btn" onClick={() => openNew(todayKey)}>
          <Icon name="adicionar" size={18} />Novo agendamento
        </button>
      </header>

      {weekTotal === 0 && (
        <div className="empty-state">
          <Icon name="agenda" size={40} className="empty-state-icon" />
          <h2 className="empty-state-title">Nenhum agendamento nesta semana</h2>
          <p className="empty-state-text">Marque a entrada de um veículo para não esquecer do cliente.</p>
          <button type="button" className="btn" onClick={() => openNew(isCurrentWeek ? todayKey : days[0].dayKey)}>
            <Icon name="adicionar" size={18} />Novo agendamento
          </button>
        </div>
      )}

      <div className="appt-days">
        {ordered.map((day, idx) => (
          <React.Fragment key={day.dayKey}>
            {idx === firstPastIdx && <h2 className="appt-past-title">Dias que já passaram nesta semana</h2>}
            {day.items.length === 0 ? (
              <div className={`appt-day appt-day--empty${day.isToday ? ' appt-day--today' : ''}`}>
                <span className="appt-day-title">{dayTitle(day.dayKey)}{renderTags(day)}</span>
                <span className="appt-day-empty">Sem agendamentos</span>
                <button type="button" className="btn-sm" onClick={() => openNew(day.dayKey)}>
                  <Icon name="adicionar" size={16} />Agendar
                </button>
              </div>
            ) : (
              <section className={`appt-day${day.isToday ? ' appt-day--today' : ''}`} aria-labelledby={`appt-day-${day.dayKey}`}>
                <div className="appt-day-head">
                  <h2 className="appt-day-title" id={`appt-day-${day.dayKey}`}>{dayTitle(day.dayKey)}{renderTags(day)}</h2>
                  <button type="button" className="btn-sm" onClick={() => openNew(day.dayKey)}>
                    <Icon name="adicionar" size={16} />Agendar neste dia
                  </button>
                </div>
                <ul className="appt-list">{day.items.map(renderItem)}</ul>
              </section>
            )}
          </React.Fragment>
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
          message={`O agendamento de ${toDelete.clientName} em ${parseDateFlexible(toDelete.date).toLocaleDateString('pt-BR')} será removido. A OS ligada a ele, se houver, não é afetada.`}
          confirmText="Excluir"
          confirmColor="danger"
          onClose={() => setToDelete(null)}
          onConfirm={() => onDelete(toDelete.id)}
        />
      )}
    </div>
  );
};

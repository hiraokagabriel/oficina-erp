import React, { useEffect, useMemo, useRef, useState } from 'react';
import { listPastPending } from '../services/agendaPending';
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

  // Chave do dia (AAAA-MM-DD local): atualiza ao focar a janela e a cada 60 s (como o Painel Hoje),
  // para a virada do dia valer sem reabrir o app.
  const [todayKey, setTodayKey] = useState<string>(() => formatDateOnly(new Date()));
  const prevTodayRef = useRef(todayKey);
  useEffect(() => {
    const refresh = () => setTodayKey(prev => { const k = formatDateOnly(new Date()); return k === prev ? prev : k; });
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(refresh, 60000);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, []);
  // Se o usuário olhava a semana do "dia antigo", acompanha o dia novo.
  useEffect(() => {
    const prev = prevTodayRef.current;
    if (prev === todayKey) return;
    prevTodayRef.current = todayKey;
    setWeekStart(w => (formatDateOnly(w) === formatDateOnly(startOfWeek(parseDateOnly(prev))) ? startOfWeek(parseDateOnly(todayKey)) : w));
  }, [todayKey]);

  const todayDate = useMemo(() => parseDateOnly(todayKey), [todayKey]);
  const days = useMemo(
    () => groupAppointmentsByDay(appointments, weekStart, todayDate),
    [appointments, weekStart, todayDate]
  );
  const weekTotal = days.reduce((n, d) => n + d.items.length, 0);
  const pending = useMemo(() => listPastPending(appointments, todayKey), [appointments, todayKey]);

  // Foco estável após ações: tenta já e de novo quando a lista/semana mudar.
  const pendingFocus = useRef<string | null>(null);
  const tryFocus = () => {
    const id = pendingFocus.current;
    if (!id) return;
    const el = document.getElementById(id);
    if (el) { pendingFocus.current = null; el.focus(); }
  };
  const focusLater = (id: string) => { pendingFocus.current = id; window.requestAnimationFrame(tryFocus); };
  useEffect(() => { window.requestAnimationFrame(tryFocus); }, [appointments, weekStart]);

  const goToFirstPending = () => {
    const first = pending[0];
    if (!first) return;
    setWeekStart(startOfWeek(parseDateFlexible(first.date)));
    focusLater(`appt-chip-${first.id}`);
  };

  const runAction = (ap: Appointment, action: Exclude<AppointmentAction, 'REAGENDAR'>) => {
    onAction(ap.id, action);
    focusLater(`appt-chip-${ap.id}`);
  };

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
  const upcomingDays = firstPastIdx > 0 ? ordered.slice(0, firstPastIdx) : ordered;
  const pastDays = firstPastIdx > 0 ? ordered.slice(firstPastIdx) : [];

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
          <span id={`appt-chip-${ap.id}`} tabIndex={-1} className={`appt-chip appt-chip--${ap.status.toLowerCase()}`}>
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
        <div className="appt-actions-group" role="group" aria-label={`Outras ações: ${ap.clientName}`}>
          {canApplyAction(ap, 'COMPARECEU') && (
            <button type="button" className="btn-sm appt-btn-sec" onClick={() => runAction(ap, 'COMPARECEU')}>
              <Icon name="check" size={16} />Compareceu
            </button>
          )}
          {canApplyAction(ap, 'FALTOU') && (
            <button type="button" className="btn-sm appt-btn-sec" onClick={() => runAction(ap, 'FALTOU')}>
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
            <button type="button" className="btn-sm appt-btn-cancel" onClick={() => runAction(ap, 'CANCELAR')}>
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

  const renderDay = (day: { dayKey: string; isToday: boolean; isTomorrow: boolean; items: Appointment[] }) => {
    const titleId = `appt-day-${day.dayKey}`;
    const title = (
      <h3 className="appt-day-title" id={titleId} tabIndex={-1}>{dayTitle(day.dayKey)}{renderTags(day)}</h3>
    );
    if (day.items.length === 0) {
      return (
        <section key={day.dayKey} className={`appt-day appt-day--empty${day.isToday ? ' appt-day--today' : ''}`} aria-labelledby={titleId}>
          {title}
          <span className="appt-day-empty">Sem agendamentos</span>
          <button type="button" className="btn-sm" onClick={() => openNew(day.dayKey)}>
            <Icon name="adicionar" size={16} />Agendar
          </button>
        </section>
      );
    }
    return (
      <section key={day.dayKey} className={`appt-day${day.isToday ? ' appt-day--today' : ''}`} aria-labelledby={titleId}>
        <div className="appt-day-head">
          {title}
          <button type="button" className="btn-sm" onClick={() => openNew(day.dayKey)}>
            <Icon name="adicionar" size={16} />Agendar neste dia
          </button>
        </div>
        <ul className="appt-list">{day.items.map(renderItem)}</ul>
      </section>
    );
  };

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

      {pending.length > 0 && (
        <div className="app-banner app-banner--warning appt-pending">
          <Icon name="alerta" size={18} />
          <span>
            {pending.length === 1
              ? '1 agendamento de dia anterior sem registro de comparecimento.'
              : `${pending.length} agendamentos de dias anteriores sem registro de comparecimento.`}
            {' '}Registre Compareceu ou Faltou.
          </span>
          <button type="button" className="btn-sm" onClick={goToFirstPending}>Ver</button>
        </div>
      )}

      {weekTotal === 0 ? (
        <div className="empty-state">
          <Icon name="agenda" size={40} className="empty-state-icon" />
          <h2 className="empty-state-title">Nenhum agendamento nesta semana</h2>
          <p className="empty-state-text">Marque a entrada de um veículo para não esquecer do cliente.</p>
          <button type="button" className="btn" onClick={() => openNew(isCurrentWeek ? todayKey : days[0].dayKey)}>
            <Icon name="adicionar" size={18} />Agendar
          </button>
        </div>
      ) : (
        <div className="appt-days">
          <section aria-labelledby="appt-group-main" className="appt-group">
            <h2 id="appt-group-main" className="sr-only">
              {isCurrentWeek ? 'Hoje e próximos dias' : 'Dias da semana'}
            </h2>
            {upcomingDays.map(renderDay)}
          </section>
          {pastDays.length > 0 && (
            <section aria-labelledby="appt-group-past" className="appt-group">
              <h2 id="appt-group-past" className="appt-past-title">Dias que já passaram nesta semana</h2>
              {pastDays.map(renderDay)}
            </section>
          )}
        </div>
      )}

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
          cancelText="Não excluir"
          confirmColor="danger"
          onClose={() => setToDelete(null)}
          onConfirm={() => { onDelete(toDelete.id); focusLater(`appt-day-${formatDateOnly(parseDateFlexible(toDelete.date))}`); }}
        />
      )}
    </div>
  );
};

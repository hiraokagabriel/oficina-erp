import React, { useEffect, useMemo, useState } from 'react';
import { parseDateOnly } from '../utils/dates';
import { Appointment, Client, LedgerEntry, WorkOrder, WorkshopSettings } from '../types';
import { AppointmentInput, statusLabel } from '../services/agenda';
import { formatExpectedDate } from '../services/schedule';
import { buildOnboarding, buildTodaySummary, formatTodayLong, lateLabel, todayKeyOf, TODAY_LIST_LIMIT } from '../services/todaySummary';
import { readGuideDismissed, readPrintedOnce, writeGuideDismissed } from '../utils/todayPrefs';
import { Icon, IconName } from '../components/ui/Icon';
import { AppointmentModal } from '../modals/AppointmentModal';

interface TodayPageProps {
  workOrders: WorkOrder[];
  appointments: Appointment[];
  ledger: LedgerEntry[];
  clients: Client[];
  settings: WorkshopSettings;
  formatMoney: (cents: number) => string;
  onNewOS: () => void;
  onSaveAppointment: (input: AppointmentInput) => void;
  onCreateOSFromAppointment: (appointment: Appointment) => void;
  onOpenOS: (os: WorkOrder) => void;
  onGoProcesses: () => void;
  onGoAgenda: () => void;
  onGoFinance: () => void;
  onGoConfig: () => void;
  onGoClients: () => void;
}

export const TodayPage: React.FC<TodayPageProps> = ({
  workOrders, appointments, ledger, clients, settings, formatMoney,
  onNewOS, onSaveAppointment, onCreateOSFromAppointment, onOpenOS,
  onGoProcesses, onGoAgenda, onGoFinance, onGoConfig, onGoClients,
}) => {
  // Chave do dia (AAAA-MM-DD local): atualiza ao focar a janela e a cada 60 s, para a virada do dia valer sem reabrir o app.
  const [dayKey, setDayKey] = useState<string>(() => todayKeyOf(new Date()));
  useEffect(() => {
    const refresh = () => setDayKey(prev => { const k = todayKeyOf(new Date()); return k === prev ? prev : k; });
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
  const now = useMemo(() => parseDateOnly(dayKey), [dayKey]);
  const [apptOpen, setApptOpen] = useState(false);
  const [guideHidden, setGuideHidden] = useState<boolean>(() => readGuideDismissed());

  const sum = useMemo(() => buildTodaySummary(workOrders, appointments, ledger, dayKey), [workOrders, appointments, ledger, dayKey]);
  const steps = useMemo(() => buildOnboarding(settings, clients, workOrders, readPrintedOnce()), [settings, clients, workOrders]);
  const doneCount = steps.filter(s => s.done).length;

  const dismissGuide = () => { writeGuideDismissed(); setGuideHidden(true); };

  const empty = (icon: IconName, title: string) => (
    <div className="empty-state today-empty">
      <Icon name={icon} size={28} />
      <p className="empty-state-title">{title}</p>
    </div>
  );

  const seeAll = (total: number, onClick: () => void, label: string) =>
    total > 0 ? (
      <button type="button" className="btn-secondary today-more" onClick={onClick}>
        {label}{total > TODAY_LIST_LIMIT ? ` (${total})` : ''}
      </button>
    ) : null;

  return (
    <div className="today-page">
      <header className="today-header">
        <h1 className="today-title">Hoje</h1>
        <p className="today-date">{formatTodayLong(now)}</p>
      </header>

      <div className="today-actions" role="group" aria-label="Ações rápidas">
        <button type="button" className="btn today-big" onClick={onNewOS}>
          <Icon name="adicionar" size={26} /> Nova OS
        </button>
        <button type="button" className="btn-secondary today-big" onClick={() => setApptOpen(true)}>
          <Icon name="calendario" size={26} /> Agendar veículo
        </button>
        <button type="button" className="btn-secondary today-big" onClick={onGoFinance}>
          <Icon name="receber" size={26} /> Receber pagamento
        </button>
      </div>

      {!guideHidden && (
        <section className="today-card today-guide" aria-labelledby="today-guide-title">
          <div className="today-card-head">
            <h2 id="today-guide-title" className="today-card-title">Primeiros passos ({doneCount} de {steps.length})</h2>
            <button type="button" className="btn-sm" onClick={dismissGuide}>Dispensar</button>
          </div>
          <ul className="today-steps">
            {steps.map(s => (
              <li key={s.id} className={`today-step${s.done ? ' is-done' : ''}`}>
                <Icon name={s.done ? 'check' : 'relogio'} size={20} />
                <span className="today-step-label">{s.label}</span>
                <span className="today-step-state">{s.done ? 'Feito' : 'Falta fazer'}</span>
                {!s.done && s.id === 'oficina' && <button type="button" className="btn-sm" onClick={onGoConfig}>Abrir</button>}
                {!s.done && s.id === 'cliente' && <button type="button" className="btn-sm" onClick={onGoClients}>Abrir</button>}
                {!s.done && s.id === 'os' && <button type="button" className="btn-sm" onClick={onNewOS}>Nova OS</button>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="today-grid">
        <section className="today-card" aria-labelledby="today-late-title">
          <div className="today-card-head">
            <h2 id="today-late-title" className="today-card-title">Atrasadas</h2>
            {sum.atrasadas.length > 0 && <span className="today-count today-count--bad" role="img" aria-label={`${sum.atrasadas.length} ${sum.atrasadas.length === 1 ? 'OS atrasada' : 'OS atrasadas'}`}>{sum.atrasadas.length}</span>}
          </div>
          {sum.atrasadas.length === 0 ? empty('check', 'Nenhuma OS atrasada') : (
            <ul className="today-list">
              {sum.atrasadas.slice(0, TODAY_LIST_LIMIT).map(({ os, daysLate }) => (
                <li key={os.id} className="today-item">
                  <div className="today-item-main">
                    <strong>OS #{os.osNumber} · {os.clientName}</strong>
                    <span className="today-sub">{os.vehicle}</span>
                    <span className="status-light status-light--atrasado">{lateLabel(daysLate)} (previsto {formatExpectedDate(os)})</span>
                  </div>
                  <button type="button" className="btn-sm" onClick={() => onOpenOS(os)}>Abrir OS #{os.osNumber}</button>
                </li>
              ))}
            </ul>
          )}
          {seeAll(sum.atrasadas.length, onGoProcesses, 'Abrir Processos')}
        </section>

        <section className="today-card" aria-labelledby="today-deliv-title">
          <div className="today-card-head">
            <h2 id="today-deliv-title" className="today-card-title">Entregas de hoje</h2>
            {sum.entregasHoje.length > 0 && <span className="today-count" role="img" aria-label={`${sum.entregasHoje.length} ${sum.entregasHoje.length === 1 ? 'entrega hoje' : 'entregas hoje'}`}>{sum.entregasHoje.length}</span>}
          </div>
          {sum.entregasHoje.length === 0 ? empty('caixa', 'Nenhuma entrega para hoje') : (
            <ul className="today-list">
              {sum.entregasHoje.slice(0, TODAY_LIST_LIMIT).map(os => (
                <li key={os.id} className="today-item">
                  <div className="today-item-main">
                    <strong>OS #{os.osNumber} · {os.clientName}</strong>
                    <span className="today-sub">{os.vehicle}</span>
                  </div>
                  <button type="button" className="btn-sm" onClick={() => onOpenOS(os)}>Abrir OS #{os.osNumber}</button>
                </li>
              ))}
            </ul>
          )}
          {seeAll(sum.entregasHoje.length, onGoProcesses, 'Abrir Processos')}
        </section>

        <section className="today-card" aria-labelledby="today-appt-title">
          <div className="today-card-head">
            <h2 id="today-appt-title" className="today-card-title">Agendamentos de hoje</h2>
            {sum.agendamentosHoje.length > 0 && <span className="today-count" role="img" aria-label={`${sum.agendamentosHoje.length} ${sum.agendamentosHoje.length === 1 ? 'agendamento hoje' : 'agendamentos hoje'}`}>{sum.agendamentosHoje.length}</span>}
          </div>
          {sum.agendamentosHoje.length === 0 ? empty('agenda', 'Nenhum veículo agendado para hoje') : (
            <ul className="today-list">
              {sum.agendamentosHoje.slice(0, TODAY_LIST_LIMIT).map(ap => (
                <li key={ap.id} className="today-item">
                  <div className="today-item-main">
                    <strong>{ap.time ? ap.time : 'Sem horário'} · {ap.clientName}</strong>
                    <span className="today-sub">{ap.vehicle}{ap.reason ? ` · ${ap.reason}` : ''}</span>
                    <span className="today-sub">{statusLabel(ap.status)}</span>
                  </div>
                  {ap.status === 'AGENDADO' && !ap.workOrderId && (
                    <button type="button" className="btn-sm today-primary" onClick={() => onCreateOSFromAppointment(ap)}>Criar OS</button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {seeAll(sum.agendamentosHoje.length, onGoAgenda, 'Ver agenda')}
        </section>

        <section className="today-card" aria-labelledby="today-due-title">
          <div className="today-card-head">
            <h2 id="today-due-title" className="today-card-title">Contas vencidas</h2>
            {sum.countVencido > 0 && <span className="today-count today-count--bad" role="img" aria-label={`${sum.countVencido} ${sum.countVencido === 1 ? 'conta vencida' : 'contas vencidas'}`}>{sum.countVencido}</span>}
          </div>
          {sum.contasVencidas.length === 0 ? empty('cifrao', 'Nenhuma conta vencida') : (
            <>
              <p className="today-total">Total vencido: <strong>{formatMoney(sum.totalVencido)}</strong></p>
              <ul className="today-list">
                {sum.contasVencidas.slice(0, TODAY_LIST_LIMIT).map(({ entry, daysOverdue }) => (
                  <li key={entry.id} className="today-item">
                    <div className="today-item-main">
                      <strong>{entry.description}</strong>
                      <span className="status-light status-light--atrasado">Atrasado há {daysOverdue} {daysOverdue === 1 ? 'dia' : 'dias'}</span>
                    </div>
                    <strong className="today-money">{formatMoney(entry.amount)}</strong>
                  </li>
                ))}
              </ul>
            </>
          )}
          {seeAll(sum.contasVencidas.length, onGoFinance, 'Ver contas a receber')}
        </section>
      </div>

      {apptOpen && (
        <AppointmentModal
          isOpen
          mode="NOVO"
          editing={null}
          defaultDate={todayKeyOf(now)}
          clients={clients}
          workOrders={workOrders}
          onClose={() => setApptOpen(false)}
          onSave={input => { onSaveAppointment(input); setApptOpen(false); }}
        />
      )}
    </div>
  );
};

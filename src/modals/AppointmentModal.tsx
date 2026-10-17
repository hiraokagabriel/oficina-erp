import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Appointment, Client, WorkOrder } from '../types';
import { VehicleCombobox, useShopVehicles } from '../components/VehicleCombobox';
import { AppointmentInput, appointmentDayKey, resolveAppointmentClient, validateAppointmentInput } from '../services/agenda';
import { normalizeName } from '../utils/links';

export type AppointmentModalMode = 'NOVO' | 'EDITAR' | 'REAGENDAR';

interface AppointmentModalProps {
  isOpen: boolean;
  mode: AppointmentModalMode;
  onClose: () => void;
  /** Recebe o formulário já com clientId/vehicleId resolvidos (só quando o cliente existe no cadastro). */
  onSave: (input: AppointmentInput) => void;
  editing: Appointment | null;
  /** AAAA-MM-DD sugerido ao criar. */
  defaultDate: string;
  clients: Client[];
  /** Histórico de OS para sugerir veículos já atendidos na oficina. */
  workOrders?: WorkOrder[];
}

const TITLES: Record<AppointmentModalMode, string> = {
  NOVO: 'Novo agendamento',
  EDITAR: 'Editar agendamento',
  REAGENDAR: 'Reagendar',
};

const vehicleText = (v: { model: string; plate: string }): string => (v.plate ? `${v.model} - ${v.plate}` : v.model);

export const AppointmentModal: React.FC<AppointmentModalProps> = ({ isOpen, mode, onClose, onSave, editing, defaultDate, clients, workOrders }) => {
  const clientRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const autoPhoneRef = useRef(''); // último telefone preenchido automaticamente a partir do cadastro

  const [clientName, setClientName] = useState('');
  const [chosenClientId, setChosenClientId] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setClientName(editing?.clientName ?? '');
    setChosenClientId(editing?.clientId ?? '');
    setPhone(editing?.clientPhone ?? '');
    setVehicle(editing?.vehicle ?? '');
    setDate(editing ? appointmentDayKey(editing) : defaultDate);
    setTime(editing?.time ?? '');
    setReason(editing?.reason ?? '');
    setError('');
    autoPhoneRef.current = '';
    const t =setTimeout(() => (mode === 'REAGENDAR' ? dateRef : clientRef).current?.focus(), 50);
    return () => clearTimeout(t);
  }, [isOpen, editing, defaultDate, mode]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const sameName = useMemo(() => {
    const n = normalizeName(clientName);
    return n ? clients.filter(c => normalizeName(c.name) === n) : [];
  }, [clients, clientName]);
  const hasHomonyms = sameName.length > 1;
  const resolution = useMemo(
    () => resolveAppointmentClient(clientName, clients, chosenClientId, vehicle),
    [clientName, clients, chosenClientId, vehicle]
  );
  const needsChoice = resolution.kind === 'ambiguous';
  const selectedClient = resolution.kind === 'unique' ? resolution.client : undefined;

  const clientNames = useMemo(() => [...new Set(clients.map(c => c.name))].slice(0, 200), [clients]);
  const shopVehicles = useShopVehicles(clients, workOrders);

  // Ao casar um único cliente, preenche o telefone se estiver vazio ou ainda for o que o app preencheu para
  // o cliente anterior (trocar o nome não pode deixar o telefone de outra pessoa). Telefone digitado/editado é preservado.
  useEffect(() => {
    if (selectedClient) {
      if (!phone || phone === autoPhoneRef.current) {
        const next = selectedClient.phone || '';
        setPhone(next);
        autoPhoneRef.current = next;
      }
    } else if (autoPhoneRef.current && phone === autoPhoneRef.current) {
      setPhone('');
      autoPhoneRef.current = '';
    }
  }, [selectedClient]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const handleSave = () => {
    const input: AppointmentInput = {
      clientName, clientPhone: phone, vehicle, date, time, reason,
      clientId: resolution.kind === 'unique' ? resolution.clientId : undefined,
      vehicleId: resolution.kind === 'unique' ? resolution.vehicleId : undefined,
    };
    const msg = needsChoice
      ? 'Há mais de um cliente com esse nome. Escolha qual em "Qual cliente?".'
      : validateAppointmentInput(input);
    if (msg) { setError(msg); return; }
    onSave(input);
  };

  const onSubmit = (e: React.FormEvent) => { e.preventDefault(); handleSave(); };

  return (
    <div className="modal-overlay">
      <form className="modal-content appt-modal" role="dialog" aria-modal="true" aria-labelledby="appt-title" onSubmit={onSubmit} noValidate>
        <h2 className="modal-title" id="appt-title">{TITLES[mode]}</h2>

        <div className="form-group">
          <label className="form-label" htmlFor="appt-client">Cliente</label>
          <input
            id="appt-client" ref={clientRef} className="form-input" list="appt-clients-list" autoComplete="off"
            value={clientName} onChange={e => setClientName(e.target.value)} aria-required="true"
          />
          <datalist id="appt-clients-list">{clientNames.map(n => <option key={n} value={n} />)}</datalist>
        </div>

        {hasHomonyms && (
          <fieldset className="appt-homonyms">
            <legend className="form-label">Qual cliente?</legend>
            <div role="radiogroup" aria-label="Qual cliente?" aria-required="true" className="appt-homonyms-list">
              {sameName.map(c => (
                <label key={c.id} className="appt-homonym">
                  <input
                    type="radio" name="appt-client-choice" checked={chosenClientId === c.id}
                    onChange={() => { setChosenClientId(c.id); setPhone(c.phone || ''); autoPhoneRef.current = c.phone || ''; }}
                  />
                  <span>
                    <strong>{c.name}</strong> · {c.phone ? c.phone : 'sem telefone'}
                    <br />
                    <span className="appt-muted">{c.vehicles.length > 0 ? c.vehicles.map(vehicleText).join(', ') : 'sem veículos'}</span>
                  </span>
                </label>
              ))}
            </div>
            {needsChoice && (
              <small role="alert" className="appt-error-text">Existe mais de um cliente com este nome. Escolha qual é para poder salvar.</small>
            )}
          </fieldset>
        )}

        <div className="appt-row">
          <div className="form-group">
            <label className="form-label" htmlFor="appt-phone">Telefone</label>
            <input id="appt-phone" className="form-input" value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="appt-vehicle">Veículo (modelo - PLACA)</label>
            <VehicleCombobox
              id="appt-vehicle" plateAware value={vehicle} onChange={setVehicle}
              clientVehicles={selectedClient?.vehicles} shopVehicles={shopVehicles}
            />
          </div>
        </div>

        <div className="appt-row">
          <div className="form-group">
            <label className="form-label" htmlFor="appt-date">Data</label>
            <input id="appt-date" ref={dateRef} className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} aria-required="true" required />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="appt-time">Hora <span className="appt-muted">(opcional)</span></label>
            <input id="appt-time" className="form-input" type="time" value={time} onChange={e => setTime(e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="appt-reason">Motivo / observação <span className="appt-muted">(opcional)</span></label>
          <textarea id="appt-reason" className="form-input form-textarea" value={reason} onChange={e => setReason(e.target.value)} style={{ minHeight: 60 }} />
        </div>

        {error && <p role="alert" className="appt-error-text appt-form-error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn" disabled={needsChoice}>{mode === 'REAGENDAR' ? 'Reagendar' : 'Salvar'}</button>
        </div>
      </form>
    </div>
  );
};

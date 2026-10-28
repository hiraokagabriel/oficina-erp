import React, { useState, useEffect, useId, useRef } from 'react';
import { Client, WorkOrder } from '../types';
import { VehicleCombobox, useShopVehicles } from '../components/VehicleCombobox';
import { generateId } from '../utils/helpers';
import { useDirtyGuard } from '../hooks/useDirtyGuard';
import { ConfirmationModal } from './ConfirmationModal';
import { Icon } from '../components/ui/Icon';
import { noVehicleMessage } from '../services/clientListView';

interface ClientEditModalProps {
  isOpen: boolean;
  client: Client;
  /** Cliente ainda não cadastrado: o título vira "Novo cliente". */
  isNew?: boolean;
  onClose: () => void;
  onSave: (client: Client) => void;
  /** Histórico de OS para sugerir veículos já atendidos na oficina. */
  workOrders?: WorkOrder[];
}

export const ClientEditModal: React.FC<ClientEditModalProps> = ({
  isOpen,
  client,
  isNew = false,
  onClose,
  onSave,
  workOrders
}) => {
  const uid = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const shopVehicles = useShopVehicles([], workOrders);
  const [formData, setFormData] = useState({
    name: client.name,
    phone: client.phone || '',
    notes: client.notes || '',
    vehicles: client.vehicles.map(v => ({ ...v })) // Clone dos veículos
  });
  const [nameError, setNameError] = useState(false);
  const [askNoVehicle, setAskNoVehicle] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: client.name,
        phone: client.phone || '',
        notes: client.notes || '',
        vehicles: client.vehicles.map(v => ({ ...v }))
      });
      setNameError(false);
      setAskNoVehicle(false);
    }
  }, [isOpen, client]);

  const guard = useDirtyGuard({ active: isOpen, onClose, resetKey: client.id });

  // Esc com a pergunta aberta fecha só a pergunta (o guard ignora evento já tratado).
  useEffect(() => {
    if (!askNoVehicle) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setAskNoVehicle(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [askNoVehicle]);

  const handleAddVehicle = () => {
    guard.markDirty();
    setFormData(prev => ({
      ...prev,
      vehicles: [...prev.vehicles, { id: generateId(), model: '', plate: '' }]
    }));
  };

  const handleRemoveVehicle = (index: number) => {
    guard.markDirty();
    setFormData(prev => ({
      ...prev,
      vehicles: prev.vehicles.filter((_, i) => i !== index)
    }));
  };

  const handleVehicleChange = (index: number, field: 'model' | 'plate', value: string) => {
    guard.markDirty();
    setFormData(prev => ({
      ...prev,
      vehicles: prev.vehicles.map((v, i) =>
        i === index ? { ...v, [field]: value } : v
      )
    }));
  };

  const finishSave = (vehicles: Client['vehicles']) => {
    const updatedClient: Client = {
      ...client,
      name: formData.name.trim(),
      phone: formData.phone.trim() || '',
      notes: formData.notes.trim() || undefined,
      vehicles
    };
    onSave(updatedClient);
  };

  const handleSave = () => {
    // Validação básica
    if (!formData.name.trim()) {
      setNameError(true);
      nameRef.current?.focus();
      return;
    }

    // Remove veículos vazios
    const validVehicles = formData.vehicles.filter(v => v.model.trim() !== '');

    if (validVehicles.length === 0) {
      setAskNoVehicle(true);
      return;
    }

    finishSave(validVehicles);
  };

  if (!isOpen) return null;

  const title = isNew ? 'Novo cliente' : 'Editar cliente';

  return (
    <>
    <div className="modal-overlay" ref={guard.overlayRef} onClick={guard.requestClose}>
      <div
        className="modal-content cm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '600px' }}
      >
        <div className="cm-header">
          <h2 id={`${uid}-title`}>{title}</h2>
          <button type="button" className="cm-close" onClick={guard.requestClose} aria-label="Fechar">
            <Icon name="fechar" size={20} />
          </button>
        </div>

        <div className="cm-body">
          {/* Nome */}
          <div className="cm-field">
            <label className="cm-label" htmlFor={`${uid}-name`}>Nome do cliente *</label>
            <input
              id={`${uid}-name`}
              ref={nameRef}
              type="text"
              className="form-input"
              value={formData.name}
              onChange={(e) => { setNameError(false); setFormData(prev => ({ ...prev, name: e.target.value })); }}
              placeholder="Ex: João Silva"
              aria-required="true"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? `${uid}-name-error` : undefined}
              style={{ width: '100%' }}
            />
            {nameError && <p id={`${uid}-name-error`} className="field-error" role="alert">Escreva o nome do cliente para salvar.</p>}
          </div>

          {/* Telefone */}
          <div className="cm-field">
            <label className="cm-label" htmlFor={`${uid}-phone`}>Telefone / WhatsApp</label>
            <input
              id={`${uid}-phone`}
              type="tel"
              className="form-input"
              value={formData.phone}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              placeholder="Ex: (11) 98765-4321"
              style={{ width: '100%' }}
            />
          </div>

          {/* Veículos */}
          <fieldset className="cm-field cm-vehicles">
            <legend className="cm-label">Veículos</legend>

            {formData.vehicles.map((vehicle, index) => (
              <div key={index} className="cm-vehicle-row">
                <VehicleCombobox
                  id={`client-vehicle-${index}`}
                  value={vehicle.model}
                  onChange={(v) => handleVehicleChange(index, 'model', v)}
                  shopVehicles={shopVehicles}
                  placeholder="Modelo (ex: Honda Civic 2.0 16v 2015)"
                  ariaLabel={`Modelo do veículo ${index + 1}`}
                  style={{ margin: 0 }}
                />
                <input
                  id={`${uid}-plate-${index}`}
                  type="text"
                  className="form-input plate"
                  value={vehicle.plate}
                  onChange={(e) => handleVehicleChange(index, 'plate', e.target.value)}
                  placeholder="Placa"
                  aria-label={`Placa do veículo ${index + 1}`}
                  style={{ margin: 0, textTransform: 'uppercase' }}
                />
                <button
                  type="button"
                  className="btn btn-danger cm-remove"
                  onClick={() => handleRemoveVehicle(index)}
                  aria-label={`Remover veículo ${index + 1}`}
                >
                  <Icon name="excluir" size={18} />
                  Remover
                </button>
              </div>
            ))}

            <button type="button" className="btn btn-secondary" onClick={handleAddVehicle} style={{ width: '100%' }}>
              <Icon name="adicionar" />
              Adicionar veículo
            </button>
          </fieldset>

          {/* Notas */}
          <div className="cm-field">
            <label className="cm-label" htmlFor={`${uid}-notes`}>Notas / observações</label>
            <textarea
              id={`${uid}-notes`}
              className="form-input"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Ex: Cliente prefere contato por WhatsApp, veículo faz barulho ao frear..."
              rows={4}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>
        </div>

        <div className="cm-footer">
          <button type="button" className="btn btn-secondary" onClick={guard.requestClose}>
            Cancelar
          </button>
          <button type="button" className="btn" onClick={handleSave}>
            <Icon name="salvar" />
            {isNew ? 'Cadastrar cliente' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
    {guard.dialog}
    <ConfirmationModal
      isOpen={askNoVehicle}
      onClose={() => setAskNoVehicle(false)}
      onConfirm={() => finishSave([])}
      title="Salvar sem veículo?"
      message={noVehicleMessage(formData.name.trim())}
      confirmText="Salvar sem veículo"
      cancelText="Voltar"
    />
    </>
  );
};

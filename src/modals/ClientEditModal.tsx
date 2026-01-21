import React, { useState, useEffect } from 'react';
import { Client } from '../types';

interface ClientEditModalProps {
  isOpen: boolean;
  client: Client;
  onClose: () => void;
  onSave: (client: Client) => void;
}

export const ClientEditModal: React.FC<ClientEditModalProps> = ({
  isOpen,
  client,
  onClose,
  onSave
}) => {
  const [formData, setFormData] = useState({
    name: client.name,
    phone: client.phone || '',
    notes: client.notes || '',
    vehicles: client.vehicles.map(v => ({ ...v })) // Clone dos veículos
  });

  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: client.name,
        phone: client.phone || '',
        notes: client.notes || '',
        vehicles: client.vehicles.map(v => ({ ...v }))
      });
    }
  }, [isOpen, client]);

  const handleAddVehicle = () => {
    setFormData(prev => ({
      ...prev,
      vehicles: [...prev.vehicles, { model: '', plate: '' }]
    }));
  };

  const handleRemoveVehicle = (index: number) => {
    setFormData(prev => ({
      ...prev,
      vehicles: prev.vehicles.filter((_, i) => i !== index)
    }));
  };

  const handleVehicleChange = (index: number, field: 'model' | 'plate', value: string) => {
    setFormData(prev => ({
      ...prev,
      vehicles: prev.vehicles.map((v, i) => 
        i === index ? { ...v, [field]: value } : v
      )
    }));
  };

  const handleSave = () => {
    // Validação básica
    if (!formData.name.trim()) {
      alert('Nome do cliente é obrigatório!');
      return;
    }

    // Remove veículos vazios
    const validVehicles = formData.vehicles.filter(v => v.model.trim() !== '');

    if (validVehicles.length === 0) {
      if (!confirm('Nenhum veículo cadastrado. Continuar?')) return;
    }

    const updatedClient: Client = {
      ...client,
      name: formData.name.trim(),
      phone: formData.phone.trim() || '',
      notes: formData.notes.trim() || undefined,
      vehicles: validVehicles
    };

    onSave(updatedClient);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h2>✏️ Editar Cliente</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ padding: '24px' }}>
          {/* Nome */}
          <div style={{ marginBottom: '20px' }}>
            <label className="form-label" style={{ fontWeight: 'bold', marginBottom: '8px', display: 'block' }}>
              👤 Nome do Cliente *
            </label>
            <input
              type="text"
              className="form-input"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Ex: João Silva"
              style={{ width: '100%' }}
            />
          </div>

          {/* Telefone */}
          <div style={{ marginBottom: '20px' }}>
            <label className="form-label" style={{ fontWeight: 'bold', marginBottom: '8px', display: 'block' }}>
              📞 Telefone / WhatsApp
            </label>
            <input
              type="tel"
              className="form-input"
              value={formData.phone}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              placeholder="Ex: (11) 98765-4321"
              style={{ width: '100%' }}
            />
          </div>

          {/* Veículos */}
          <div style={{ marginBottom: '20px' }}>
            <label className="form-label" style={{ fontWeight: 'bold', marginBottom: '8px', display: 'block' }}>
              🚗 Veículos
            </label>
            
            {formData.vehicles.map((vehicle, index) => (
              <div key={index} style={{ 
                display: 'grid', 
                gridTemplateColumns: '2fr 1fr auto', 
                gap: '8px', 
                marginBottom: '12px',
                padding: '12px',
                background: 'var(--bg-panel)',
                borderRadius: '8px',
                border: '1px solid var(--border)'
              }}>
                <input
                  type="text"
                  className="form-input"
                  value={vehicle.model}
                  onChange={(e) => handleVehicleChange(index, 'model', e.target.value)}
                  placeholder="Modelo (ex: Gol 1.0)"
                  style={{ margin: 0 }}
                />
                <input
                  type="text"
                  className="form-input"
                  value={vehicle.plate}
                  onChange={(e) => handleVehicleChange(index, 'plate', e.target.value)}
                  placeholder="Placa"
                  style={{ margin: 0, textTransform: 'uppercase' }}
                />
                <button
                  className="btn btn-danger"
                  onClick={() => handleRemoveVehicle(index)}
                  style={{ padding: '8px 12px' }}
                >
                  🗑️
                </button>
              </div>
            ))}
            
            <button 
              className="btn btn-secondary" 
              onClick={handleAddVehicle}
              style={{ width: '100%', marginTop: '8px' }}
            >
              + Adicionar Veículo
            </button>
          </div>

          {/* Notas */}
          <div style={{ marginBottom: '20px' }}>
            <label className="form-label" style={{ fontWeight: 'bold', marginBottom: '8px', display: 'block' }}>
              📝 Notas / Observações
            </label>
            <textarea
              className="form-input"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Ex: Cliente prefere contato por WhatsApp, veículo faz barulho ao frear..."
              rows={4}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            ✅ Salvar Alterações
          </button>
        </div>
      </div>
    </div>
  );
};
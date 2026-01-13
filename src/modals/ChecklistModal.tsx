import React, { useState, useEffect } from 'react';
import { WorkOrder } from '../types';

interface TiresState {
  fl: boolean;
  fr: boolean;
  bl: boolean;
  br: boolean;
}

interface ChecklistSchema {
  fuelLevel: number;
  tires: TiresState;
  notes: string;
}

interface ChecklistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: ChecklistSchema) => void;
  os: WorkOrder | null;
}

const EMPTY_CHECKLIST: ChecklistSchema = {
  fuelLevel: 0,
  tires: { fl: true, fr: true, bl: true, br: true },
  notes: '',
};

export const ChecklistModal: React.FC<ChecklistModalProps> = ({
  isOpen,
  onClose,
  onSave,
  os,
}) => {
  const [fuel, setFuel] = useState<number>(0);
  const [tires, setTires] = useState<TiresState>(EMPTY_CHECKLIST.tires);
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (isOpen && os) {
      const d = os.checklist || EMPTY_CHECKLIST;
      setFuel(d.fuelLevel);
      setTires({ ...d.tires });
      setNotes(d.notes);
    }
  }, [isOpen, os]);

  const toggleTire = (key: keyof TiresState) =>
    setTires((p) => ({ ...p, [key]: !p[key] }));

  const handleConfirm = () => {
    onSave({ fuelLevel: fuel, tires, notes });
    onClose();
  };

  if (!isOpen || !os) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ width: 600 }}>
        <h2 className="modal-title">Vistoria: {os.vehicle}</h2>

        {/* Tanque de Combustível */}
        <h3 style={{ fontSize: '1rem', marginTop: 0 }}>Nível de Combustível</h3>
        <div className="fuel-gauge" style={{ marginBottom: 30 }}>
          {[0, 1, 2, 3, 4].map((level) => (
            <div
              key={level}
              className={`fuel-bar ${fuel >= level ? `active-${level}` : ''}`}
              onClick={() => setFuel(level)}
              title={`${level * 25}%`}
            />
          ))}
        </div>

        {/* Pneus e Avarias */}
        <h3 style={{ fontSize: '1rem' }}>Pneus & Lataria</h3>
        <div className="tires-container">
          <div className="tire-grid">
            <div
              className={`tire-item ${!tires.fl ? 'damaged' : ''}`}
              onClick={() => toggleTire('fl')}
              style={{ gridArea: 'fl' }}
            >
              OE
            </div>

            {/* Silhueta Carro Simplificada */}
            <div className="car-silhouette">
              <div className="car-lights-front"></div>
              <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>FRENTE</span>
              <div className="car-lights-rear"></div>
            </div>

            <div
              className={`tire-item ${!tires.fr ? 'damaged' : ''}`}
              onClick={() => toggleTire('fr')}
              style={{ gridArea: 'fr' }}
            >
              OD
            </div>
            <div
              className={`tire-item ${!tires.bl ? 'damaged' : ''}`}
              onClick={() => toggleTire('bl')}
              style={{ gridArea: 'bl' }}
            >
              TE
            </div>
            <div
              className={`tire-item ${!tires.br ? 'damaged' : ''}`}
              onClick={() => toggleTire('br')}
              style={{ gridArea: 'br' }}
            >
              TD
            </div>
          </div>
          <p style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Clique no pneu para marcar como avariado/careca.
          </p>
        </div>

        <div className="form-group">
          <label className="form-label">Observações da Vistoria</label>
          <textarea
            className="form-input form-textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Riscos, amassados, luzes queimadas..."
          />
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn" onClick={handleConfirm}>
            Salvar Vistoria
          </button>
        </div>
      </div>
    </div>
  );
};
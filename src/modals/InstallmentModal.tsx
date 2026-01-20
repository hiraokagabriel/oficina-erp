import React, { useState, useEffect } from 'react';
import { InstallmentConfig } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface InstallmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalAmount: number;
  description: string;
  onConfirm: (config: InstallmentConfig) => void;
}

export const InstallmentModal: React.FC<InstallmentModalProps> = ({
  isOpen,
  onClose,
  totalAmount,
  description,
  onConfirm
}) => {
  const [installments, setInstallments] = useState<number>(2);
  const [firstPaymentDate, setFirstPaymentDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  const installmentAmount = totalAmount / installments;

  useEffect(() => {
    if (isOpen) {
      setInstallments(2);
      setFirstPaymentDate(new Date().toISOString().split('T')[0]);
    }
  }, [isOpen]);

  const handleConfirm = () => {
    const config: InstallmentConfig = {
      totalAmount,
      installments,
      installmentAmount,
      firstPaymentDate,
      groupId: uuidv4(),
      description
    };
    onConfirm(config);
    onClose();
  };

  if (!isOpen) return null;

  // Cálculo das datas de vencimento
  const generateInstallmentDates = () => {
    const dates = [];
    const baseDate = new Date(firstPaymentDate);
    
    for (let i = 0; i < installments; i++) {
      const date = new Date(baseDate);
      date.setMonth(date.getMonth() + i);
      dates.push(date);
    }
    return dates;
  };

  const installmentDates = generateInstallmentDates();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h2>💳 Configurar Pagamento Parcelado</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ padding: '24px' }}>
          {/* Card de Resumo */}
          <div style={{
            background: 'linear-gradient(135deg, var(--primary) 0%, #6366f1 100%)',
            color: 'white',
            padding: '20px',
            borderRadius: '12px',
            marginBottom: '24px',
            boxShadow: '0 4px 12px rgba(130, 87, 230, 0.3)'
          }}>
            <div style={{ fontSize: '0.9rem', opacity: 0.9, marginBottom: '8px' }}>
              Valor Total
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '12px' }}>
              {totalAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </div>
            <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>
              {description}
            </div>
          </div>

          {/* Seletor de Parcelas */}
          <div style={{ marginBottom: '24px' }}>
            <label className="form-label" style={{ marginBottom: '12px', display: 'block' }}>
              📊 Número de Parcelas
            </label>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', 
              gap: '12px' 
            }}>
              {[2, 3, 4, 5, 6, 9, 12].map(num => (
                <button
                  key={num}
                  onClick={() => setInstallments(num)}
                  style={{
                    padding: '16px 12px',
                    border: installments === num 
                      ? '2px solid var(--primary)' 
                      : '1px solid var(--border)',
                    borderRadius: '8px',
                    background: installments === num 
                      ? 'rgba(130, 87, 230, 0.1)' 
                      : 'white',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    fontWeight: installments === num ? 'bold' : 'normal',
                    color: installments === num ? 'var(--primary)' : 'var(--text)'
                  }}
                >
                  <div style={{ fontSize: '1.2rem', marginBottom: '4px' }}>{num}x</div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                    {(totalAmount / num).toLocaleString('pt-BR', { 
                      style: 'currency', 
                      currency: 'BRL',
                      minimumFractionDigits: 2
                    })}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Data do Primeiro Pagamento */}
          <div style={{ marginBottom: '24px' }}>
            <label className="form-label">
              📅 Data do Primeiro Pagamento
            </label>
            <input
              type="date"
              className="form-input"
              value={firstPaymentDate}
              onChange={(e) => setFirstPaymentDate(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          {/* Preview das Parcelas */}
          <div style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '16px',
            maxHeight: '300px',
            overflowY: 'auto'
          }}>
            <div style={{ 
              fontWeight: 'bold', 
              marginBottom: '12px',
              color: 'var(--text)',
              fontSize: '0.95rem'
            }}>
              📄 Preview das Parcelas
            </div>
            {installmentDates.map((date, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px',
                  background: 'white',
                  borderRadius: '8px',
                  marginBottom: '8px',
                  border: '1px solid var(--border)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: 'var(--primary)',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    fontSize: '0.85rem'
                  }}>
                    {index + 1}
                  </div>
                  <div>
                    <div style={{ fontWeight: 500, color: 'var(--text)' }}>
                      Parcela {index + 1}/{installments}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Vencimento: {date.toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                </div>
                <div style={{ fontWeight: 'bold', color: 'var(--primary)', fontSize: '1.1rem' }}>
                  {installmentAmount.toLocaleString('pt-BR', { 
                    style: 'currency', 
                    currency: 'BRL' 
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={handleConfirm}>
            ✅ Confirmar Parcelamento
          </button>
        </div>
      </div>
    </div>
  );
};
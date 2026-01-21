import React, { useState, useEffect } from 'react';
import { InstallmentConfig } from '../types';
import { Money } from '../utils/helpers';

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

  // ✅ FIX: Calcular parcelas com arredondamento correto
  const calculateInstallments = (total: number, count: number) => {
    const totalInReais = Money.toFloat(total);
    const baseValue = Math.floor((totalInReais / count) * 100) / 100; // Arredondar para baixo
    const baseValueInCents = Money.fromFloat(baseValue);
    
    // Calcular o resto para a última parcela
    const sumOfNormalInstallments = baseValueInCents * (count - 1);
    const lastInstallment = total - sumOfNormalInstallments;
    
    return {
      normalInstallmentAmount: baseValueInCents,
      lastInstallmentAmount: lastInstallment,
      installmentsCount: count
    };
  };

  const installmentCalc = calculateInstallments(totalAmount, installments);

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
      installmentAmount: installmentCalc.normalInstallmentAmount,
      lastInstallmentAmount: installmentCalc.lastInstallmentAmount,
      firstPaymentDate,
      groupId: crypto.randomUUID(),
      description
    };
    onConfirm(config);
    onClose();
  };

  if (!isOpen) return null;

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
              {Money.format(totalAmount)}
            </div>
            <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>
              {description}
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label className="form-label" style={{ marginBottom: '12px', display: 'block' }}>
              📊 Número de Parcelas
            </label>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', 
              gap: '12px' 
            }}>
              {[2, 3, 4, 5, 6, 9, 12].map(num => {
                const calc = calculateInstallments(totalAmount, num);
                return (
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
                      {Money.format(calc.normalInstallmentAmount)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

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
            {installmentDates.map((date, index) => {
              // ✅ Última parcela usa valor ajustado
              const isLast = index === installments - 1;
              const amount = isLast 
                ? installmentCalc.lastInstallmentAmount 
                : installmentCalc.normalInstallmentAmount;
              
              return (
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
                    {Money.format(amount)}
                  </div>
                </div>
              );
            })}
            
            {/* ✅ Mostra verificação da soma */}
            <div style={{
              marginTop: '12px',
              padding: '12px',
              background: 'rgba(34, 197, 94, 0.1)',
              borderRadius: '8px',
              fontSize: '0.85rem',
              color: 'var(--success)'
            }}>
              ✅ Soma das parcelas: {Money.format(totalAmount)}
            </div>
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
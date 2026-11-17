import React, { useState, useEffect } from 'react';
import { Money, getLocalDateString } from '../utils/helpers';
import { addMonths, parseDateFlexible } from '../utils/dates';
import { InstallmentConfig } from '../types';

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
    getLocalDateString()
  );

  const calculateInstallments = (totalInCents: number, count: number) => {
    const baseValueInCents = Math.floor(totalInCents / count);
    const remainder = totalInCents - baseValueInCents * count;
    const lastInstallmentAmount = baseValueInCents + remainder;
    const total = baseValueInCents * (count - 1) + lastInstallmentAmount;
    const isValid = total === totalInCents;

    return {
      normalInstallmentAmount: baseValueInCents,
      lastInstallmentAmount,
      installmentsCount: count,
      isValid,
    };
  };

  const installmentCalc = calculateInstallments(totalAmount, installments);

  useEffect(() => {
    if (isOpen) {
      setInstallments(2);
      setFirstPaymentDate(getLocalDateString());
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
      description,
    };
    onConfirm(config);
    onClose();
  };

  if (!isOpen) return null;

  const generateInstallmentDates = () => {
    const dates = [];
    const baseDate = parseDateFlexible(firstPaymentDate);

    for (let i = 0; i < installments; i++) {
      dates.push(addMonths(baseDate, i));
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
          <div className="inst-total">
            <div className="inst-total-label">Valor Total</div>
            <div className="inst-total-value">{Money.format(totalAmount)}</div>
            <div className="inst-total-desc">{description}</div>
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
                    type="button"
                    onClick={() => setInstallments(num)}
                    className={`inst-opt${installments === num ? ' is-selected' : ''}`}
                    aria-pressed={installments === num}
                  >
                    <div className="inst-opt-n">{num}x</div>
                    <div className="inst-opt-val">
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

          <div className="inst-preview">
            <div className="inst-preview-title">📄 Preview das Parcelas</div>
            {installmentDates.map((date, index) => {
              const isLast = index === installments - 1;
              const amount = isLast 
                ? installmentCalc.lastInstallmentAmount 
                : installmentCalc.normalInstallmentAmount;
              
              return (
                <div key={index} className={`inst-row${isLast ? ' is-last' : ''}`}>
                  <div className="inst-row-main">
                    <div className="inst-num">{index + 1}</div>
                    <div>
                      <div className="inst-row-title">
                        Parcela {index + 1}/{installments} {isLast && '✅'}
                      </div>
                      <div className="inst-row-date">
                        Vencimento: {date.toLocaleDateString('pt-BR')}
                      </div>
                    </div>
                  </div>
                  <div className="inst-amount">
                    {Money.format(amount)}
                    {isLast && <div className="inst-adjusted">ajustada</div>}
                  </div>
                </div>
              );
            })}

            <div className={`inst-sum${installmentCalc.isValid ? '' : ' is-bad'}`}>
              {installmentCalc.isValid ? '✅' : '⚠️'}
              <div>
                <strong>Soma exata:</strong> {Money.format(totalAmount)}
                {!installmentCalc.isValid && <div className="inst-sum-err">Erro de arredondamento!</div>}
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button 
            className="btn btn-primary" 
            onClick={handleConfirm}
            disabled={!installmentCalc.isValid}
          >
            ✅ Confirmar Parcelamento
          </button>
        </div>
      </div>
    </div>
  );
};

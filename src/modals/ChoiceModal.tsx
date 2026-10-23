import React, { useId } from 'react';
import { Icon, IconName } from '../components/ui/Icon';

interface ChoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onYes: () => void;
  onNo: () => void;
  title: string;
  /** Linhas separadas por \n (a quebra é preservada na tela). */
  message: string;
  yesText?: string;
  noText?: string;
  yesIcon?: IconName;
  noIcon?: IconName;
  icon?: IconName;
}

export const ChoiceModal: React.FC<ChoiceModalProps> = ({
  isOpen,
  onClose,
  onYes,
  onNo,
  title,
  message,
  yesText = 'Sim',
  noText = 'Não',
  yesIcon = 'check',
  noIcon = 'fechar',
  icon = 'info',
}) => {
  const titleId = useId();
  if (!isOpen) return null;

  const handleYes = () => {
    onYes();
    onClose();
  };

  const handleNo = () => {
    onNo();
    onClose();
  };

  return (
    <div className="modal-overlay choice-overlay" onClick={onClose}>
      <div
        className="modal-content choice-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="btn-secondary choice-close" onClick={onClose} aria-label="Fechar sem escolher">
          <Icon name="fechar" size={18} />
          Fechar
        </button>

        <div className="choice-head">
          <span className="choice-icon" aria-hidden="true"><Icon name={icon} size={36} /></span>
          <h2 id={titleId} className="choice-title">{title}</h2>
          <div className="choice-message">{message}</div>
        </div>

        <div className="choice-actions">
          <button type="button" className="btn btn-secondary choice-btn" onClick={handleNo}>
            <Icon name={noIcon} size={22} />
            <span>{noText}</span>
          </button>
          <button type="button" className="btn btn-success choice-btn" onClick={handleYes}>
            <Icon name={yesIcon} size={22} />
            <span>{yesText}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

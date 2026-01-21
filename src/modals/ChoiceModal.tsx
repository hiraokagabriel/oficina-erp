import React from 'react';

interface ChoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onYes: () => void;
  onNo: () => void;
  title: string;
  message: string;
  yesText?: string;
  noText?: string;
  yesIcon?: string;
  noIcon?: string;
  icon?: string;
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
  yesIcon = '✅',
  noIcon = '❌',
  icon = '❓',
}) => {
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
    <div 
      className="modal-overlay" 
      onClick={onClose}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '500px',
          width: '90%',
          animation: 'scaleUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        }}
      >
        {/* Header com ícone */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
          marginBottom: '24px',
          paddingBottom: '20px',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--primary) 0%, #6366f1 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2.5rem',
            boxShadow: '0 8px 20px rgba(130, 87, 230, 0.3)',
          }}>
            {icon}
          </div>
          <div style={{ textAlign: 'center', width: '100%' }}>
            <h2 style={{ 
              margin: 0, 
              fontSize: '1.75rem',
              color: 'var(--text-main)',
              fontWeight: 700,
              marginBottom: '8px',
            }}>
              {title}
            </h2>
            <div style={{
              fontSize: '1rem',
              color: 'var(--text-muted)',
              lineHeight: 1.6,
            }}>
              {message}
            </div>
          </div>
        </div>

        {/* Botões grandes e visíveis */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '16px',
          marginTop: '24px',
        }}>
          <button
            onClick={handleNo}
            style={{
              padding: '20px 16px',
              fontSize: '1.1rem',
              fontWeight: 600,
              borderRadius: '12px',
              border: '2px solid var(--border)',
              background: 'white',
              color: 'var(--text)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.borderColor = 'var(--danger)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <span style={{ fontSize: '2rem' }}>{noIcon}</span>
            <span>{noText}</span>
          </button>

          <button
            onClick={handleYes}
            style={{
              padding: '20px 16px',
              fontSize: '1.1rem',
              fontWeight: 600,
              borderRadius: '12px',
              border: '2px solid var(--success)',
              background: 'linear-gradient(135deg, var(--success) 0%, #10b981 100%)',
              color: 'white',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 8px 20px rgba(34, 197, 94, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(34, 197, 94, 0.3)';
            }}
          >
            <span style={{ fontSize: '2rem' }}>{yesIcon}</span>
            <span>{yesText}</span>
          </button>
        </div>

        {/* Botão X no canto */}
        <button 
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            border: '1px solid var(--border)',
            background: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.2rem',
            color: 'var(--text-muted)',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--danger)';
            e.currentTarget.style.color = 'white';
            e.currentTarget.style.borderColor = 'var(--danger)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'white';
            e.currentTarget.style.color = 'var(--text-muted)';
            e.currentTarget.style.borderColor = 'var(--border)';
          }}
        >
          ✕
        </button>

        {/* Dica do teclado */}
        <div style={{
          marginTop: '20px',
          textAlign: 'center',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          opacity: 0.7,
        }}>
          Pressione <kbd style={{
            background: 'var(--bg-input)',
            padding: '2px 6px',
            borderRadius: '4px',
            border: '1px solid var(--border)',
            fontFamily: 'monospace',
          }}>Esc</kbd> para cancelar
        </div>
      </div>
    </div>
  );
};
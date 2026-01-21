import React, { useState, useEffect, useRef } from 'react';

interface InputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (value: string) => void;
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  inputType?: 'text' | 'number' | 'email' | 'tel';
  icon?: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
  validateInput?: (value: string) => { valid: boolean; error?: string };
}

export const InputModal: React.FC<InputModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  placeholder = 'Digite aqui...',
  defaultValue = '',
  inputType = 'text',
  icon = '✏️',
  confirmButtonText = 'Confirmar',
  cancelButtonText = 'Cancelar',
  validateInput,
}) => {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
      setError(null);
      // Auto-focus no input quando abrir
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, defaultValue]);

  const handleConfirm = () => {
    // Validação customizada
    if (validateInput) {
      const validation = validateInput(value);
      if (!validation.valid) {
        setError(validation.error || 'Valor inválido');
        return;
      }
    }

    // Validação básica: não pode ser vazio
    if (!value.trim()) {
      setError('Este campo não pode estar vazio');
      return;
    }

    onConfirm(value);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

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
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '20px',
          paddingBottom: '16px',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--primary) 0%, #6366f1 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.5rem',
            boxShadow: '0 4px 12px rgba(130, 87, 230, 0.3)',
          }}>
            {icon}
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ 
              margin: 0, 
              fontSize: '1.5rem',
              color: 'var(--text-main)',
              fontWeight: 700,
            }}>
              {title}
            </h2>
          </div>
          <button 
            className="btn-icon" 
            onClick={onClose}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
            }}
          >
            ✕
          </button>
        </div>

        {/* Message */}
        {message && (
          <div style={{
            marginBottom: '20px',
            fontSize: '0.95rem',
            color: 'var(--text-muted)',
            lineHeight: 1.5,
          }}>
            {message}
          </div>
        )}

        {/* Input */}
        <div className="form-group" style={{ marginBottom: '24px' }}>
          <input
            ref={inputRef}
            type={inputType}
            className="form-input"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            style={{
              width: '100%',
              fontSize: '1rem',
              padding: '14px 16px',
              border: error ? '2px solid var(--danger)' : '1px solid var(--border)',
              transition: 'all 0.2s ease',
            }}
          />
          {error && (
            <div style={{
              marginTop: '8px',
              color: 'var(--danger)',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}>
              <span>⚠️</span>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px',
          paddingTop: '16px',
          borderTop: '1px solid var(--border)',
        }}>
          <button 
            className="btn-secondary" 
            onClick={onClose}
            style={{
              padding: '10px 24px',
              minWidth: '120px',
            }}
          >
            {cancelButtonText}
          </button>
          <button 
            className="btn" 
            onClick={handleConfirm}
            style={{
              padding: '10px 24px',
              minWidth: '120px',
            }}
          >
            {confirmButtonText}
          </button>
        </div>

        {/* Dica do teclado */}
        <div style={{
          marginTop: '16px',
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
          }}>Enter</kbd> para confirmar ou <kbd style={{
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
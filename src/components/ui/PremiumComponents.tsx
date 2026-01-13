/* ============================================================================
   🎨 PREMIUM UI COMPONENTS - BAZUCA DESTRUIDORA
   Componentes reutilizáveis com micro-interações sofisticadas
   ============================================================================ */

import React, { ReactNode, useState, useEffect } from 'react';

// ============================================================================
// 1. ENHANCED BUTTON COMPONENT
// ============================================================================

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  isLoading?: boolean;
  children: ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  icon,
  isLoading = false,
  children,
  className = '',
  disabled,
  ...props
}) => {
  const variantClass = `btn-${variant}`;
  const sizeClass = size !== 'md' ? `btn-${size}` : '';
  
  return (
    <button
      className={`btn ${variantClass} ${sizeClass} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <div className="spinner"></div>}
      {icon && <span className="btn-icon">{icon}</span>}
      {children}
    </button>
  );
};

// ============================================================================
// 2. ANIMATED INPUT COMPONENT
// ============================================================================

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  icon,
  className = '',
  ...props
}) => {
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      <div style={{ position: 'relative' }}>
        {icon && <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}>{icon}</span>}
        <input
          className={`form-input ${icon ? 'pl-10' : ''} ${className}`}
          {...props}
          style={icon ? { paddingLeft: '40px' } : undefined}
        />
      </div>
      {error && <span className="form-error">{error}</span>}
      {helperText && !error && <span className="form-helper">{helperText}</span>}
    </div>
  );
};

// ============================================================================
// 3. ENHANCED SELECT COMPONENT
// ============================================================================

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: Array<{ value: string; label: string }>;
  error?: string;
}

export const Select: React.FC<SelectProps> = ({
  label,
  options,
  error,
  className = '',
  ...props
}) => {
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      <select className={`form-select ${className}`} {...props}>
        <option value="">Selecione...</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <span className="form-error">{error}</span>}
    </div>
  );
};

// ============================================================================
// 4. ANIMATED BADGE COMPONENT
// ============================================================================

interface BadgeProps {
  variant?: 'primary' | 'success' | 'error' | 'warning' | 'info';
  size?: 'sm' | 'lg';
  children: ReactNode;
  icon?: ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'primary',
  size = 'sm',
  children,
  icon,
}) => {
  const sizeClass = size === 'lg' ? 'badge-lg' : '';
  
  return (
    <span className={`badge badge-${variant} ${sizeClass}`}>
      {icon && <span className="mr-2">{icon}</span>}
      {children}
    </span>
  );
};

// ============================================================================
// 5. PREMIUM CARD COMPONENT
// ============================================================================

interface CardProps {
  children: ReactNode;
  className?: string;
  glass?: boolean;
  clickable?: boolean;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  glass = false,
  clickable = false,
  onClick,
}) => {
  const glassClass = glass ? 'card-glass' : '';
  
  return (
    <div
      className={`card ${glassClass} ${clickable ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      {children}
    </div>
  );
};

// ============================================================================
// 6. TOAST NOTIFICATION COMPONENT
// ============================================================================

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

interface ToastProps {
  toasts: ToastMessage[];
  removeToast: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({ toasts, removeToast }) => {
  useEffect(() => {
    const timers = toasts.map((toast) =>
      setTimeout(() => removeToast(toast.id), 3000)
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts, removeToast]);

  const iconMap = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
  };

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.type}`}>
          <span className="toast-icon">{iconMap[toast.type]}</span>
          <span className="toast-message">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: '20px',
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};

// ============================================================================
// 7. STAT CARD COMPONENT (para KPIs)
// ============================================================================

interface StatCardProps {
  label: string;
  value: string | number;
  change?: number;
  icon?: ReactNode;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  change,
  icon,
}) => {
  const isPositive = change && change > 0;
  
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="stat-label">{label}</div>
          <div className="stat-value">{value}</div>
          {change !== undefined && (
            <div className={`stat-change ${isPositive ? 'positive' : 'negative'}`}>
              {isPositive ? '↑' : '↓'} {Math.abs(change)}%
            </div>
          )}
        </div>
        {icon && <div className="stat-icon">{icon}</div>}
      </div>
    </Card>
  );
};

// ============================================================================
// 8. LOADING SKELETON COMPONENT
// ============================================================================

interface SkeletonProps {
  count?: number;
  height?: string;
  circle?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  count = 1,
  height = '1rem',
  circle = false,
}) => {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{
            height,
            borderRadius: circle ? '50%' : 'var(--radius-lg)',
            marginBottom: '0.5rem',
          }}
        />
      ))}
    </>
  );
};

// ============================================================================
// 9. ANIMATED MODAL COMPONENT
// ============================================================================

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div>{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
};

// ============================================================================
// 10. PREMIUM TABS COMPONENT
// ============================================================================

interface TabProps {
  label: string;
  content: ReactNode;
  icon?: ReactNode;
}

interface TabsProps {
  tabs: TabProps[];
  defaultActive?: number;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, defaultActive = 0 }) => {
  const [active, setActive] = useState(defaultActive);

  return (
    <div>
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border-color)',
        gap: 'var(--space-4)',
        marginBottom: 'var(--space-6)',
      }}>
        {tabs.map((tab, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            style={{
              background: 'none',
              border: 'none',
              padding: 'var(--space-4)',
              color: active === i ? 'var(--color-primary-400)' : 'var(--text-muted)',
              fontSize: 'var(--text-sm)',
              fontWeight: active === i ? 'var(--font-bold)' : 'var(--font-medium)',
              cursor: 'pointer',
              borderBottom: active === i ? '2px solid var(--color-primary-400)' : 'none',
              transition: 'all var(--transition-fast)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
      <div>{tabs[active].content}</div>
    </div>
  );
};

// ============================================================================
// 11. PROGRESS BAR COMPONENT
// ============================================================================

interface ProgressProps {
  value: number;
  max?: number;
  color?: 'primary' | 'success' | 'error' | 'warning';
  label?: string;
}

export const Progress: React.FC<ProgressProps> = ({
  value,
  max = 100,
  color = 'primary',
  label,
}) => {
  const percentage = (value / max) * 100;
  
  return (
    <div>
      {label && <div style={{ marginBottom: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>{label}</div>}
      <div style={{
        width: '100%',
        height: '8px',
        backgroundColor: 'var(--bg-tertiary)',
        borderRadius: 'var(--radius-full)',
        overflow: 'hidden',
      }}>
        <div
          style={{
            width: `${percentage}%`,
            height: '100%',
            background: `linear-gradient(90deg, var(--color-${color === 'primary' ? 'primary' : color}-600), var(--status-${color === 'primary' ? 'success' : color}))`,
            transition: 'width var(--transition-slow)',
          }}
        />
      </div>
    </div>
  );
};

// ============================================================================
// 12. ALERT COMPONENT
// ============================================================================

interface AlertProps {
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  onClose?: () => void;
}

export const Alert: React.FC<AlertProps> = ({ type, title, message, onClose }) => {
  const bgColorMap = {
    success: 'rgba(16, 185, 129, 0.1)',
    error: 'rgba(239, 68, 68, 0.1)',
    warning: 'rgba(245, 158, 11, 0.1)',
    info: 'rgba(6, 182, 212, 0.1)',
  };

  const borderColorMap = {
    success: 'var(--status-success)',
    error: 'var(--status-error)',
    warning: 'var(--status-warning)',
    info: 'var(--status-info)',
  };

  return (
    <div
      style={{
        backgroundColor: bgColorMap[type],
        border: `2px solid ${borderColorMap[type]}`,
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-4)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 'var(--space-4)',
      }}
    >
      <div>
        <div style={{ fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-1)' }}>{title}</div>
        {message && <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{message}</div>}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '20px',
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
};

// ============================================================================
// 13. DIVIDER COMPONENT
// ============================================================================

interface DividerProps {
  label?: string;
}

export const Divider: React.FC<DividerProps> = ({ label }) => {
  if (label) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
        margin: 'var(--space-6) 0',
      }}>
        <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-color)' }} />
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>{label}</span>
        <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-color)' }} />
      </div>
    );
  }

  return <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: 'var(--space-6) 0' }} />;
};

// ============================================================================
// 14. EMPTY STATE COMPONENT
// ============================================================================

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: { label: string; onClick: () => void };
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  message,
  action,
}) => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--space-12)',
      textAlign: 'center',
    }}>
      {icon && <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }}>{icon}</div>}
      <h3 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-2)' }}>{title}</h3>
      {message && <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-6)' }}>{message}</p>}
      {action && (
        <Button onClick={action.onClick} variant="primary">
          {action.label}
        </Button>
      )}
    </div>
  );
};

// ============================================================================
// 15. SPINNER COMPONENT
// ============================================================================

export const Spinner: React.FC = () => (
  <div className="spinner" />
);

export default {
  Button,
  Input,
  Select,
  Badge,
  Card,
  Toast,
  StatCard,
  Skeleton,
  Modal,
  Tabs,
  Progress,
  Alert,
  Divider,
  EmptyState,
  Spinner,
};

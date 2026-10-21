import React, { useEffect, useRef } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  removeToast: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, removeToast }) => {
  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: ToastMessage; onRemove: (id: string) => void }> = ({ toast, onRemove }) => {
  // Ref para o timer não reiniciar quando o pai recria o callback.
  const onRemoveRef = useRef(onRemove);
  onRemoveRef.current = onRemove;

  useEffect(() => {
    const timer = setTimeout(() => {
      onRemoveRef.current(toast.id);
    }, 3000); // 3 segundos para sumir
    return () => clearTimeout(timer);
  }, [toast.id]);

  const icons = {
    success: '✅',
    error: '❌',
    info: 'ℹ️'
  };

  return (
    <div className={`toast ${toast.type}`} onClick={() => onRemove(toast.id)}>
      <span className="toast-icon">{icons[toast.type]}</span>
      <span>{toast.message}</span>
    </div>
  );
};
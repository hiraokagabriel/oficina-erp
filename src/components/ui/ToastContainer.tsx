import React, { useEffect, useRef } from 'react';
import { Icon, IconName } from './Icon';

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

/** Sucesso e informação somem sozinhos; erro fica até o usuário fechar. */
export const TOAST_AUTO_DISMISS_MS = 4000;

const ICONS: Record<ToastType, IconName> = { success: 'check', error: 'alerta', info: 'info' };

/**
 * Único bloco de avisos do app (canto de baixo, à direita). Duas regiões sempre montadas, para o leitor de
 * tela anunciar: uma educada (sucesso/info) e uma que interrompe (erro).
 */
export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, removeToast }) => {
  const calm = toasts.filter((t) => t.type !== 'error');
  const errors = toasts.filter((t) => t.type === 'error');
  return (
    <div className="toast-region">
      <div role="status" aria-live="polite" className="toast-stack">
        {calm.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
        ))}
      </div>
      <div role="alert" aria-live="assertive" className="toast-stack">
        {errors.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
        ))}
      </div>
    </div>
  );
};

const ToastItem: React.FC<{ toast: ToastMessage; onRemove: (id: string) => void }> = ({ toast, onRemove }) => {
  // Ref para o timer não reiniciar quando o pai recria o callback.
  const onRemoveRef = useRef(onRemove);
  onRemoveRef.current = onRemove;
  const isError = toast.type === 'error';

  useEffect(() => {
    if (isError) return;
    const timer = setTimeout(() => onRemoveRef.current(toast.id), TOAST_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast.id, isError]);

  return (
    <div
      className={`toast-item toast-item--${toast.type}`}
      onClick={isError ? undefined : () => onRemove(toast.id)}
    >
      <Icon name={ICONS[toast.type]} className="toast-item-icon" />
      <span className="toast-item-text">{toast.message}</span>
      {isError && (
        <button type="button" className="btn-sm toast-item-close" onClick={() => onRemove(toast.id)}>
          <Icon name="fechar" size={16} />
          Fechar
        </button>
      )}
    </div>
  );
};

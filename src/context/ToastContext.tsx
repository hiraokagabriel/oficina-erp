import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { ToastContainer, ToastMessage, ToastType } from '../components/ui/ToastContainer';
import { dropToast, pushToast } from '../utils/toastQueue';

interface ToastApi {
  addToast: (message: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
}

const noop: ToastApi = { addToast: () => {}, removeToast: () => {} };
const ToastContext = createContext<ToastApi>(noop);

/**
 * Dono único dos avisos. O valor do contexto é estável (só funções): avisar não re-renderiza as telas
 * (Kanban, tabelas), só este provider e o bloco de avisos.
 */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    setToasts((prev) => pushToast(prev, message, type, crypto.randomUUID()));
  }, []);
  const removeToast = useCallback((id: string) => setToasts((prev) => dropToast(prev, id)), []);

  const api = useMemo<ToastApi>(() => ({ addToast, removeToast }), [addToast, removeToast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastApi => useContext(ToastContext);

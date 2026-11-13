import { useEffect } from 'react';
import { isAppLocked } from '../utils/appLock';

export const useKeyboard = (key: string, callback: (e: KeyboardEvent) => void, ctrlKey: boolean = false) => {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      // Ignora se estiver digitando em inputs (exceto se for tecla de função F1-F12 ou Ctrl)
      const target = event.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      
      if (isInput && !event.ctrlKey && !event.altKey && !event.metaKey && key.length === 1) {
        return;
      }

      if (event.key.toLowerCase() === key.toLowerCase()) {
        // app bloqueado (PC compartilhado, "Entre de novo"): nenhum atalho global age
        if (isAppLocked()) return;
        if (ctrlKey && !event.ctrlKey) return;
        
        event.preventDefault();
        callback(event);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [key, callback, ctrlKey]);
};
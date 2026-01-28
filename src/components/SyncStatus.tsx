/**
 * SyncStatus.tsx
 * Indicador visual do status de sincronização
 */

import React from 'react';
import { useDatabase } from '../context/DatabaseContext';
import './SyncStatus.css';

export function SyncStatus() {
  const { useFirestore, isOnline, isSaving } = useDatabase();

  // Determina ícone e texto baseado no estado
  const getStatus = () => {
    if (isSaving) {
      return {
        icon: '🔄',
        text: 'Sincronizando...',
        className: 'sync-status syncing'
      };
    }

    if (!isOnline) {
      return {
        icon: '⚠️',
        text: 'Offline',
        className: 'sync-status offline'
      };
    }

    if (useFirestore) {
      return {
        icon: '🔥',
        text: 'Firestore',
        className: 'sync-status firestore'
      };
    }

    return {
      icon: '💾',
      text: 'Cache Local',
      className: 'sync-status local'
    };
  };

  const status = getStatus();

  return (
    <div className={status.className} title={`Modo de armazenamento: ${status.text}`}>
      <span className="sync-icon">{status.icon}</span>
      <span className="sync-text">{status.text}</span>
    </div>
  );
}

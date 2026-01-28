/**
 * SyncStatus.tsx
 * Indicador visual do status de sincronização com Firestore
 */

import React from 'react';
import { useDatabase } from '../../context/DatabaseContext';
import './SyncStatus.css';

export const SyncStatus: React.FC = () => {
  const { useFirestore, isOnline, isSaving } = useDatabase();

  // 🟢 Online + Firestore
  if (useFirestore && isOnline) {
    return (
      <div className="sync-status online">
        <div className="sync-icon">
          {isSaving ? (
            <span className="pulse">🔄</span>
          ) : (
            <span>🔥</span>
          )}
        </div>
        <div className="sync-info">
          <span className="sync-label">Firestore</span>
          <span className="sync-sublabel">
            {isSaving ? 'Salvando...' : 'Sincronizado'}
          </span>
        </div>
      </div>
    );
  }

  // 🔴 Offline
  if (!isOnline) {
    return (
      <div className="sync-status offline">
        <div className="sync-icon">
          <span>⚠️</span>
        </div>
        <div className="sync-info">
          <span className="sync-label">Offline</span>
          <span className="sync-sublabel">Cache local</span>
        </div>
      </div>
    );
  }

  // 💾 LocalStorage (não autenticado)
  return (
    <div className="sync-status local">
      <div className="sync-icon">
        {isSaving ? (
          <span className="pulse">💾</span>
        ) : (
          <span>💾</span>
        )}
      </div>
      <div className="sync-info">
        <span className="sync-label">LocalStorage</span>
        <span className="sync-sublabel">
          {isSaving ? 'Salvando...' : 'Armazenado'}
        </span>
      </div>
    </div>
  );
};

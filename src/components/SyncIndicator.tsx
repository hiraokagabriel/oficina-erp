/**
 * SyncIndicator.tsx
 * 
 * Indicador visual do status de sincronização
 * Mostra status: Online, Offline, Sincronizando, Erro
 */

import { useState, useEffect } from 'react';
import { syncService, SyncStatus } from '../services/syncService';
import '../styles/SyncIndicator.css';

interface SyncIndicatorProps {
  showDetails?: boolean;
}

function SyncIndicator({ showDetails = true }: SyncIndicatorProps) {
  const [status, setStatus] = useState<SyncStatus>(syncService.getStatus());
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    // Registra listener de mudanças de status
    const unsubscribe = syncService.onStatusChange(setStatus);
    return unsubscribe;
  }, []);

  const getStatusIcon = () => {
    if (status.isSyncing) return '🔄';
    if (!status.isOnline) return '🚫';
    if (status.error) return '⚠️';
    return '✅';
  };

  const getStatusText = () => {
    if (status.isSyncing) return 'Sincronizando...';
    if (!status.isOnline) return 'Offline';
    if (status.error) return 'Erro de sincronização';
    return 'Sincronizado';
  };

  const getStatusClass = () => {
    if (status.isSyncing) return 'syncing';
    if (!status.isOnline) return 'offline';
    if (status.error) return 'error';
    return 'online';
  };

  const formatLastSync = () => {
    if (!status.lastSync) return 'Nunca';
    
    const now = new Date();
    const diff = now.getTime() - status.lastSync.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `há ${days} dia${days > 1 ? 's' : ''}`;
    if (hours > 0) return `há ${hours} hora${hours > 1 ? 's' : ''}`;
    if (minutes > 0) return `há ${minutes} minuto${minutes > 1 ? 's' : ''}`;
    return 'agora mesmo';
  };

  return (
    <div 
      className={`sync-indicator ${getStatusClass()}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className="sync-indicator-content">
        <span className="sync-icon">{getStatusIcon()}</span>
        {showDetails && (
          <span className="sync-text">{getStatusText()}</span>
        )}
      </div>

      {showTooltip && (
        <div className="sync-tooltip">
          <div className="sync-tooltip-row">
            <strong>Status:</strong> {getStatusText()}
          </div>
          <div className="sync-tooltip-row">
            <strong>Última sincronização:</strong> {formatLastSync()}
          </div>
          {status.error && (
            <div className="sync-tooltip-row error-message">
              <strong>Erro:</strong> {status.error}
            </div>
          )}
          {!status.isOnline && (
            <div className="sync-tooltip-row info-message">
              Os dados estão salvos localmente e serão sincronizados quando voltar online.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SyncIndicator;

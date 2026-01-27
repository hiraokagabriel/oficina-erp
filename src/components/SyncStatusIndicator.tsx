import React from 'react';
import { SyncStatus } from '../services/databaseSyncService';

interface SyncStatusIndicatorProps {
  status: SyncStatus;
  message?: string;
}

/**
 * Indicador visual de status de sincronização
 */
export function SyncStatusIndicator({ status, message }: SyncStatusIndicatorProps) {
  const getStatusInfo = () => {
    switch (status) {
      case 'idle':
        return { icon: '⚪', color: '#gray', label: 'Aguardando' };
      case 'syncing':
        return { icon: '🔄', color: '#3498db', label: 'Sincronizando' };
      case 'success':
        return { icon: '✅', color: '#27ae60', label: 'Sincronizado' };
      case 'error':
        return { icon: '❌', color: '#e74c3c', label: 'Erro' };
      case 'offline':
        return { icon: '📡', color: '#95a5a6', label: 'Offline' };
      default:
        return { icon: '⚪', color: 'gray', label: 'Desconhecido' };
    }
  };

  const statusInfo = getStatusInfo();

  // Não mostrar indicador quando idle ou após 3s de sucesso
  if (status === 'idle') return null;

  return (
    <div 
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        background: 'var(--card-background, white)',
        border: `2px solid ${statusInfo.color}`,
        borderRadius: '12px',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 10000,
        animation: status === 'syncing' ? 'pulse 1.5s infinite' : 'none'
      }}
    >
      <span style={{ fontSize: '20px', animation: status === 'syncing' ? 'spin 2s linear infinite' : 'none' }}>
        {statusInfo.icon}
      </span>
      <div>
        <div style={{ fontWeight: 'bold', color: statusInfo.color, fontSize: '14px' }}>
          {statusInfo.label}
        </div>
        {message && (
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            {message}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}

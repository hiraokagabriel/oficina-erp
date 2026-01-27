/**
 * DataManager.tsx
 * Interface para gerenciar sincronização e backup de dados
 */

import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  fullSync,
  syncDown,
  syncUp,
  resetAllData,
  getSyncStatus,
  onSyncStatusChange,
  SyncStatus
} from '../services/syncService';
import {
  exportAllData,
  importAllData,
  getMetadata
} from '../services/storageService';

interface DataManagerProps {
  user: User;
  onClose?: () => void;
}

function DataManager({ user, onClose }: DataManagerProps) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(getSyncStatus());
  const [lastSyncDate, setLastSyncDate] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    // Listener de status de sync
    const unsubscribe = onSyncStatusChange(setSyncStatus);

    // Buscar última sync
    loadLastSync();

    return unsubscribe;
  }, []);

  async function loadLastSync() {
    try {
      const lastSync = await getMetadata('lastSyncDown');
      if (lastSync) {
        const date = new Date(lastSync);
        setLastSyncDate(date.toLocaleString('pt-BR'));
      }
    } catch (error) {
      console.error('Erro ao carregar última sync:', error);
    }
  }

  async function handleFullSync() {
    setLoading(true);
    setMessage(null);
    
    try {
      await fullSync(user.uid);
      await loadLastSync();
      setMessage({ type: 'success', text: '✅ Sincronização completa realizada!' });
    } catch (error: any) {
      setMessage({ type: 'error', text: `❌ Erro: ${error.message}` });
    } finally {
      setLoading(false);
    }
  }

  async function handleSyncDown() {
    setLoading(true);
    setMessage(null);
    
    try {
      await syncDown(user.uid);
      await loadLastSync();
      setMessage({ type: 'success', text: '✅ Dados baixados da nuvem!' });
    } catch (error: any) {
      setMessage({ type: 'error', text: `❌ Erro: ${error.message}` });
    } finally {
      setLoading(false);
    }
  }

  async function handleSyncUp() {
    setLoading(true);
    setMessage(null);
    
    try {
      await syncUp(user.uid);
      setMessage({ type: 'success', text: '✅ Dados enviados para nuvem!' });
    } catch (error: any) {
      setMessage({ type: 'error', text: `❌ Erro: ${error.message}` });
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    setLoading(true);
    setMessage(null);
    
    try {
      const jsonData = await exportAllData();
      
      // Criar blob e download
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `oficina-erp-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setMessage({ type: 'success', text: '✅ Backup exportado com sucesso!' });
    } catch (error: any) {
      setMessage({ type: 'error', text: `❌ Erro ao exportar: ${error.message}` });
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      setLoading(true);
      setMessage(null);
      
      try {
        const text = await file.text();
        await importAllData(text);
        setMessage({ type: 'success', text: '✅ Backup importado com sucesso!' });
      } catch (error: any) {
        setMessage({ type: 'error', text: `❌ Erro ao importar: ${error.message}` });
      } finally {
        setLoading(false);
      }
    };
    
    input.click();
  }

  async function handleReset() {
    if (!resetPassword) {
      setMessage({ type: 'error', text: '❌ Digite sua senha para confirmar!' });
      return;
    }

    if (!window.confirm('⚠️ ATENÇÃO: Isso irá deletar TODOS os dados locais e da nuvem. Continuar?')) {
      return;
    }

    setLoading(true);
    setMessage(null);
    
    try {
      await resetAllData(user.uid, resetPassword);
      setMessage({ type: 'success', text: '✅ Banco de dados resetado com sucesso!' });
      setShowResetConfirm(false);
      setResetPassword('');
    } catch (error: any) {
      setMessage({ type: 'error', text: `❌ Erro ao resetar: ${error.message}` });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="data-manager-overlay">
      <div className="data-manager-card">
        {/* Header */}
        <div className="data-manager-header">
          <h2>📊 Gerenciamento de Dados</h2>
          {onClose && (
            <button className="close-btn" onClick={onClose}>×</button>
          )}
        </div>

        {/* Status de Sincronização */}
        <div className="sync-status-section">
          <h3>🔄 Status de Sincronização</h3>
          
          <div className="status-info">
            <div className="status-item">
              <span className="label">Estado:</span>
              <span className={`status ${syncStatus.isSyncing ? 'syncing' : 'idle'}`}>
                {syncStatus.isSyncing ? '🔄 Sincronizando...' : '✅ Pronto'}
              </span>
            </div>
            
            {syncStatus.isSyncing && (
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${syncStatus.progress}%` }}></div>
              </div>
            )}
            
            {lastSyncDate && (
              <div className="status-item">
                <span className="label">Última sincronização:</span>
                <span className="value">{lastSyncDate}</span>
              </div>
            )}
            
            {syncStatus.error && (
              <div className="error-box">
                ⚠️ {syncStatus.error}
              </div>
            )}
          </div>
        </div>

        {/* Ações de Sincronização */}
        <div className="actions-section">
          <h3>🔮 Ações de Sincronização</h3>
          
          <div className="actions-grid">
            <button 
              className="action-btn primary"
              onClick={handleFullSync}
              disabled={loading || syncStatus.isSyncing}
            >
              <span className="icon">🔄</span>
              <span>Sincronizar Tudo</span>
            </button>
            
            <button 
              className="action-btn"
              onClick={handleSyncDown}
              disabled={loading || syncStatus.isSyncing}
            >
              <span className="icon">📥</span>
              <span>Baixar da Nuvem</span>
            </button>
            
            <button 
              className="action-btn"
              onClick={handleSyncUp}
              disabled={loading || syncStatus.isSyncing}
            >
              <span className="icon">📤</span>
              <span>Enviar para Nuvem</span>
            </button>
          </div>
        </div>

        {/* Backup/Restore */}
        <div className="actions-section">
          <h3>💾 Backup e Restore</h3>
          
          <div className="actions-grid">
            <button 
              className="action-btn secondary"
              onClick={handleExport}
              disabled={loading || syncStatus.isSyncing}
            >
              <span className="icon">📄</span>
              <span>Exportar Backup</span>
            </button>
            
            <button 
              className="action-btn secondary"
              onClick={handleImport}
              disabled={loading || syncStatus.isSyncing}
            >
              <span className="icon">📂</span>
              <span>Importar Backup</span>
            </button>
          </div>
        </div>

        {/* Reset */}
        <div className="actions-section danger-section">
          <h3>⚠️ Zona de Perigo</h3>
          
          {!showResetConfirm ? (
            <button 
              className="action-btn danger"
              onClick={() => setShowResetConfirm(true)}
              disabled={loading || syncStatus.isSyncing}
            >
              <span className="icon">🗑️</span>
              <span>Resetar Banco de Dados</span>
            </button>
          ) : (
            <div className="reset-confirm-box">
              <p className="warning-text">
                ⚠️ Isso irá deletar TODOS os dados! Digite sua senha para confirmar:
              </p>
              
              <input
                type="password"
                className="reset-password-input"
                placeholder="Digite sua senha"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                disabled={loading}
              />
              
              <div className="reset-actions">
                <button 
                  className="btn-cancel"
                  onClick={() => {
                    setShowResetConfirm(false);
                    setResetPassword('');
                  }}
                  disabled={loading}
                >
                  Cancelar
                </button>
                <button 
                  className="btn-confirm-reset"
                  onClick={handleReset}
                  disabled={loading || !resetPassword}
                >
                  {loading ? 'Resetando...' : 'Confirmar Reset'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Mensagem de Feedback */}
        {message && (
          <div className={`message-box ${message.type}`}>
            {message.text}
          </div>
        )}

        {/* Info do Usuário */}
        <div className="user-info">
          <small>👤 Logado como: {user.email}</small>
        </div>
      </div>
    </div>
  );
}

export default DataManager;

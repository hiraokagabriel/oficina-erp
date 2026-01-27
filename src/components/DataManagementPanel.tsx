/**
 * DATA MANAGEMENT PANEL
 * 
 * Painel completo de gerenciamento de dados do sistema
 * - Sincronização manual
 * - Export/Import de dados
 * - Reset do banco com autenticação
 * - Visualização de logs
 * - Status em tempo real
 */

import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { useDataSync } from '../hooks/useDataSync';
import '../styles/DataManagementPanel.css';

interface DataManagementPanelProps {
  user: User | null;
}

function DataManagementPanel({ user }: DataManagementPanelProps) {
  const { 
    syncState, 
    syncDown, 
    syncUp, 
    fullSync, 
    exportToFile, 
    importFromFile, 
    resetAll,
    getLogs 
  } = useDataSync(user);

  const [showResetModal, setShowResetModal] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);
  
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Buscar logs quando modal abre
  useEffect(() => {
    if (showLogsModal) {
      getLogs().then(setLogs);
    }
  }, [showLogsModal, getLogs]);

  // Limpar notificação após 5s
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (file) {
        try {
          await importFromFile(file);
          setNotification({ type: 'success', message: 'Dados importados com sucesso!' });
        } catch (err: any) {
          setNotification({ type: 'error', message: `Erro ao importar: ${err.message}` });
        }
      }
    };
    input.click();
  };

  const handleReset = async () => {
    if (!resetPassword) {
      setResetError('Digite sua senha para confirmar');
      return;
    }

    setResetLoading(true);
    setResetError(null);

    try {
      const result = await resetAll(resetPassword);
      
      if (result.success) {
        setResetSuccess(true);
        setNotification({ type: 'success', message: result.message });
        setTimeout(() => {
          setShowResetModal(false);
          setResetSuccess(false);
          setResetPassword('');
        }, 2000);
      } else {
        setResetError(result.message);
      }
    } catch (err: any) {
      setResetError(err.message);
    } finally {
      setResetLoading(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('pt-BR');
  };

  const formatTimeSince = (timestamp: number | null) => {
    if (!timestamp) return 'Nunca';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Agora há pouco';
    if (seconds < 3600) return `Há ${Math.floor(seconds / 60)} minutos`;
    if (seconds < 86400) return `Há ${Math.floor(seconds / 3600)} horas`;
    return `Há ${Math.floor(seconds / 86400)} dias`;
  };

  return (
    <div className="data-management-panel">
      {/* Notificação Flutuante */}
      {notification && (
        <div className={`notification notification-${notification.type}`}>
          {notification.type === 'success' ? '✅' : '❌'} {notification.message}
        </div>
      )}

      {/* Header */}
      <div className="panel-header">
        <h2 className="panel-title">📂 Gerenciamento de Dados</h2>
        <p className="panel-subtitle">Sincronize, exporte e gerencie seus dados</p>
      </div>

      {/* Status Card */}
      <div className="status-card">
        <div className="status-header">
          <h3>📊 Status da Sincronização</h3>
          {syncState.isSyncing && <span className="syncing-badge">🔄 Sincronizando...</span>}
        </div>
        
        <div className="status-grid">
          <div className="status-item">
            <span className="status-label">⏰ Última Sync:</span>
            <span className="status-value">{formatTimeSince(syncState.lastSync)}</span>
          </div>
          <div className="status-item">
            <span className="status-label">📊 Total de Itens:</span>
            <span className="status-value">{syncState.totalItems}</span>
          </div>
        </div>

        <div className="collections-grid">
          <div className="collection-item">
            <span className="collection-icon">👥</span>
            <div>
              <div className="collection-name">Clientes</div>
              <div className="collection-count">{syncState.itemsByCollection.clientes || 0}</div>
            </div>
          </div>
          <div className="collection-item">
            <span className="collection-icon">📋</span>
            <div>
              <div className="collection-name">Processos</div>
              <div className="collection-count">{syncState.itemsByCollection.processos || 0}</div>
            </div>
          </div>
          <div className="collection-item">
            <span className="collection-icon">💰</span>
            <div>
              <div className="collection-name">Financeiro</div>
              <div className="collection-count">{syncState.itemsByCollection.financeiro || 0}</div>
            </div>
          </div>
        </div>

        {syncState.error && (
          <div className="error-banner">
            ⚠️ {syncState.error}
          </div>
        )}
      </div>

      {/* Ações de Sincronização */}
      <div className="actions-section">
        <h3>🔄 Sincronização</h3>
        <div className="actions-grid">
          <button 
            className="action-btn sync-btn"
            onClick={syncDown}
            disabled={syncState.isSyncing || !user}
            title="Baixar dados do servidor"
          >
            <span className="btn-icon">🔽</span>
            <span>Download</span>
            <span className="btn-description">Nuvem → Local</span>
          </button>

          <button 
            className="action-btn sync-btn"
            onClick={syncUp}
            disabled={syncState.isSyncing || !user}
            title="Enviar dados para o servidor"
          >
            <span className="btn-icon">🔼</span>
            <span>Upload</span>
            <span className="btn-description">Local → Nuvem</span>
          </button>

          <button 
            className="action-btn sync-btn primary"
            onClick={fullSync}
            disabled={syncState.isSyncing || !user}
            title="Sincronização completa"
          >
            <span className="btn-icon">🔄</span>
            <span>Sync Completo</span>
            <span className="btn-description">Bidirecional</span>
          </button>
        </div>
      </div>

      {/* Ações de Backup */}
      <div className="actions-section">
        <h3>💾 Backup & Restore</h3>
        <div className="actions-grid">
          <button 
            className="action-btn backup-btn"
            onClick={exportToFile}
            disabled={syncState.isSyncing}
            title="Exportar dados para arquivo JSON"
          >
            <span className="btn-icon">📥</span>
            <span>Exportar</span>
            <span className="btn-description">Salvar arquivo</span>
          </button>

          <button 
            className="action-btn backup-btn"
            onClick={handleImport}
            disabled={syncState.isSyncing || !user}
            title="Importar dados de arquivo JSON"
          >
            <span className="btn-icon">📤</span>
            <span>Importar</span>
            <span className="btn-description">Carregar arquivo</span>
          </button>
        </div>
      </div>

      {/* Ações de Administração */}
      <div className="actions-section">
        <h3>⚙️ Administração</h3>
        <div className="actions-grid">
          <button 
            className="action-btn info-btn"
            onClick={() => setShowLogsModal(true)}
            title="Ver histórico de sincronizações"
          >
            <span className="btn-icon">📜</span>
            <span>Ver Logs</span>
            <span className="btn-description">Histórico</span>
          </button>

          <button 
            className="action-btn danger-btn"
            onClick={() => setShowResetModal(true)}
            disabled={syncState.isSyncing || !user}
            title="Resetar todo o banco de dados"
          >
            <span className="btn-icon">🗑️</span>
            <span>Resetar Tudo</span>
            <span className="btn-description">Atenção!</span>
          </button>
        </div>
      </div>

      {/* Modal de Reset */}
      {showResetModal && (
        <div className="modal-overlay" onClick={() => !resetLoading && setShowResetModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            {resetSuccess ? (
              <div className="modal-success">
                <div className="success-icon">✅</div>
                <h3>Banco resetado!</h3>
                <p>Todos os dados foram removidos com sucesso.</p>
              </div>
            ) : (
              <>
                <div className="modal-header">
                  <h3>⚠️ Resetar Banco de Dados</h3>
                  <button className="modal-close" onClick={() => setShowResetModal(false)} disabled={resetLoading}>
                    ×
                  </button>
                </div>

                <div className="modal-body">
                  <div className="warning-box">
                    <p><strong>⚠️ ATENÇÃO:</strong> Esta ação é <strong>IRREVERSÍVEL</strong>!</p>
                    <p>Todos os dados serão permanentemente removidos:</p>
                    <ul>
                      <li>• Todos os clientes</li>
                      <li>• Todos os processos</li>
                      <li>• Todos os registros financeiros</li>
                      <li>• Dados locais E remotos</li>
                    </ul>
                    <p><strong>Recomendação:</strong> Faça um backup antes de continuar!</p>
                  </div>

                  <div className="form-group">
                    <label htmlFor="reset-password">
                      🔒 Digite sua senha para confirmar:
                    </label>
                    <input
                      id="reset-password"
                      type="password"
                      className="form-input"
                      value={resetPassword}
                      onChange={e => setResetPassword(e.target.value)}
                      placeholder="Sua senha"
                      disabled={resetLoading}
                      onKeyPress={e => e.key === 'Enter' && handleReset()}
                    />
                  </div>

                  {resetError && (
                    <div className="error-message">
                      ❌ {resetError}
                    </div>
                  )}
                </div>

                <div className="modal-footer">
                  <button 
                    className="btn-secondary"
                    onClick={() => setShowResetModal(false)}
                    disabled={resetLoading}
                  >
                    Cancelar
                  </button>
                  <button 
                    className="btn-danger"
                    onClick={handleReset}
                    disabled={resetLoading || !resetPassword}
                  >
                    {resetLoading ? 'Resetando...' : 'Confirmar Reset'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal de Logs */}
      {showLogsModal && (
        <div className="modal-overlay" onClick={() => setShowLogsModal(false)}>
          <div className="modal-content logs-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📜 Histórico de Sincronizações</h3>
              <button className="modal-close" onClick={() => setShowLogsModal(false)}>
                ×
              </button>
            </div>

            <div className="modal-body logs-container">
              {logs.length === 0 ? (
                <div className="empty-state">
                  <p>📄 Nenhum log encontrado</p>
                </div>
              ) : (
                <div className="logs-list">
                  {logs.map((log, index) => (
                    <div key={log.id || index} className={`log-item log-${log.status}`}>
                      <div className="log-header">
                        <span className="log-action">
                          {log.action === 'sync' && '🔄'}
                          {log.action === 'backup' && '📥'}
                          {log.action === 'restore' && '📤'}
                          {log.action === 'reset' && '🗑️'}
                          {log.action === 'export' && '💾'}
                          {log.action === 'import' && '📂'}
                          {' '}{log.action}
                        </span>
                        <span className="log-time">{formatDate(log.timestamp)}</span>
                      </div>
                      <div className="log-details">
                        {log.details} ({log.itemsAffected} itens)
                      </div>
                      <div className="log-status">
                        {log.status === 'success' && '✅ Sucesso'}
                        {log.status === 'error' && '❌ Erro'}
                        {log.status === 'partial' && '⚠️ Parcial'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DataManagementPanel;

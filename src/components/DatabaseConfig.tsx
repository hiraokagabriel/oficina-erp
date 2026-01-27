/**
 * DATABASE CONFIG - Painel de Gerenciamento do Banco de Dados
 * 
 * Funcionalidades:
 * - Sincronizar com a nuvem
 * - Criar backup manual
 * - Resetar banco de dados (com autenticação)
 * - Visualizar status de sincronização
 * - Ativar/desativar sync em tempo real
 */

import { useState, useEffect } from 'react';
import { syncService, SyncStatus } from '../services/syncService';
import { auth } from '../lib/firebase';
import '../styles/DatabaseConfig.css';

function DatabaseConfig() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [realtimeEnabled, setRealtimeEnabled] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSyncStatus();
  }, []);

  async function loadSyncStatus() {
    const status = await syncService.getLastSyncStatus();
    setLastSync(status.lastSync);
  }

  async function handleSyncFromCloud() {
    setLoading(true);
    setMessage(null);
    
    try {
      const status = await syncService.syncFromCloud();
      setSyncStatus(status);
      setLastSync(status.lastSync);
      
      if (status.errors.length === 0) {
        setMessage({ type: 'success', text: `✅ ${status.itemsSynced} itens sincronizados da nuvem` });
      } else {
        setMessage({ type: 'error', text: `⚠️ Erros: ${status.errors.join(', ')}` });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: `❌ Erro: ${error.message}` });
    } finally {
      setLoading(false);
    }
  }

  async function handleSyncToCloud() {
    setLoading(true);
    setMessage(null);
    
    try {
      const status = await syncService.syncToCloud();
      setSyncStatus(status);
      setLastSync(status.lastSync);
      
      if (status.errors.length === 0) {
        setMessage({ type: 'success', text: `✅ ${status.itemsSynced} itens enviados para a nuvem` });
      } else {
        setMessage({ type: 'error', text: `⚠️ Erros: ${status.errors.join(', ')}` });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: `❌ Erro: ${error.message}` });
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateBackup() {
    setLoading(true);
    setMessage(null);
    
    try {
      const metadata = await syncService.createBackup();
      setMessage({ 
        type: 'success', 
        text: `✅ Backup criado com ${metadata.itemCount} itens. Download iniciado.` 
      });
    } catch (error: any) {
      setMessage({ type: 'error', text: `❌ Erro: ${error.message}` });
    } finally {
      setLoading(false);
    }
  }

  async function handleResetDatabase() {
    if (!resetPassword) {
      setMessage({ type: 'error', text: '⚠️ Digite sua senha para confirmar' });
      return;
    }

    setLoading(true);
    setMessage(null);
    
    try {
      await syncService.resetDatabase(resetPassword);
      setMessage({ type: 'success', text: '✅ Banco de dados resetado com sucesso' });
      setShowResetDialog(false);
      setResetPassword('');
      setLastSync(null);
    } catch (error: any) {
      setMessage({ type: 'error', text: `❌ ${error.message}` });
    } finally {
      setLoading(false);
    }
  }

  function toggleRealtimeSync() {
    const collections = ['clientes', 'processos', 'financeiro', 'oficina'];
    
    if (realtimeEnabled) {
      // Desativar
      collections.forEach(col => syncService.disableRealtimeSync(col));
      setRealtimeEnabled(false);
      setMessage({ type: 'success', text: '❌ Sincronização em tempo real desativada' });
    } else {
      // Ativar
      collections.forEach(col => {
        syncService.enableRealtimeSync(col, (data) => {
          console.log(`🔄 ${col} atualizado:`, data.length, 'itens');
        });
      });
      setRealtimeEnabled(true);
      setMessage({ type: 'success', text: '✅ Sincronização em tempo real ativada' });
    }
  }

  function formatDate(date: Date | null): string {
    if (!date) return 'Nunca';
    return new Date(date).toLocaleString('pt-BR');
  }

  return (
    <div className="database-config">
      <div className="config-header">
        <h2 className="config-title">📦 Gerenciamento do Banco de Dados</h2>
        <p className="config-subtitle">Sincronização, backup e reset de dados</p>
      </div>

      {/* Mensagens */}
      {message && (
        <div className={`config-message ${message.type}`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="message-close">×</button>
        </div>
      )}

      {/* Status de Sincronização */}
      <div className="config-card">
        <h3 className="card-title">📋 Status da Sincronização</h3>
        <div className="status-grid">
          <div className="status-item">
            <span className="status-label">Última Sincronização:</span>
            <span className="status-value">{formatDate(lastSync)}</span>
          </div>
          <div className="status-item">
            <span className="status-label">Usuário:</span>
            <span className="status-value">{auth.currentUser?.email || 'N/A'}</span>
          </div>
          <div className="status-item">
            <span className="status-label">Sync em Tempo Real:</span>
            <span className={`status-badge ${realtimeEnabled ? 'active' : 'inactive'}`}>
              {realtimeEnabled ? '✅ Ativo' : '❌ Inativo'}
            </span>
          </div>
        </div>
      </div>

      {/* Ações de Sincronização */}
      <div className="config-card">
        <h3 className="card-title">🔄 Sincronização</h3>
        <p className="card-description">
          Mantenha seus dados sincronizados entre a nuvem e o dispositivo local
        </p>
        
        <div className="action-buttons">
          <button 
            className="btn btn-primary"
            onClick={handleSyncFromCloud}
            disabled={loading}
          >
            {loading ? '🔄 Sincronizando...' : '⬇️ Baixar da Nuvem'}
          </button>
          
          <button 
            className="btn btn-secondary"
            onClick={handleSyncToCloud}
            disabled={loading}
          >
            {loading ? '🔄 Enviando...' : '⬆️ Enviar para Nuvem'}
          </button>
          
          <button 
            className="btn btn-accent"
            onClick={toggleRealtimeSync}
            disabled={loading}
          >
            {realtimeEnabled ? '❌ Desativar Sync Automático' : '✅ Ativar Sync Automático'}
          </button>
        </div>
      </div>

      {/* Backup */}
      <div className="config-card">
        <h3 className="card-title">💾 Backup</h3>
        <p className="card-description">
          Crie um backup completo dos seus dados em formato JSON
        </p>
        
        <button 
          className="btn btn-info"
          onClick={handleCreateBackup}
          disabled={loading}
        >
          {loading ? '🔄 Criando...' : '💾 Criar Backup'}
        </button>
      </div>

      {/* Reset do Banco */}
      <div className="config-card danger-zone">
        <h3 className="card-title">⚠️ Zona de Perigo</h3>
        <p className="card-description">
          Resetar o banco de dados irá <strong>apagar todos os dados</strong> locais e da nuvem. Esta ação é irreversível.
        </p>
        
        {!showResetDialog ? (
          <button 
            className="btn btn-danger"
            onClick={() => setShowResetDialog(true)}
            disabled={loading}
          >
            🗑️ Resetar Banco de Dados
          </button>
        ) : (
          <div className="reset-dialog">
            <p className="reset-warning">
              ⚠️ <strong>ATENÇÃO:</strong> Esta ação irá apagar TODOS os dados!
            </p>
            <input
              type="password"
              className="reset-password-input"
              placeholder="Digite sua senha para confirmar"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              disabled={loading}
            />
            <div className="reset-actions">
              <button 
                className="btn btn-danger"
                onClick={handleResetDatabase}
                disabled={loading || !resetPassword}
              >
                {loading ? '🔄 Resetando...' : '✅ Confirmar Reset'}
              </button>
              <button 
                className="btn btn-secondary"
                onClick={() => {
                  setShowResetDialog(false);
                  setResetPassword('');
                }}
                disabled={loading}
              >
                ❌ Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Informações */}
      <div className="config-info">
        <h4>💡 Dicas</h4>
        <ul>
          <li><strong>Sync Automático:</strong> Mantém dados sempre atualizados em tempo real</li>
          <li><strong>Backup:</strong> Recomendado fazer backup antes de resetar</li>
          <li><strong>Cache Local:</strong> Dados são salvos localmente para acesso offline</li>
          <li><strong>Segurança:</strong> Reset requer autenticação com senha</li>
        </ul>
      </div>
    </div>
  );
}

export default DatabaseConfig;

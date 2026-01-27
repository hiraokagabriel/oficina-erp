import React, { useState } from 'react';
import { DatabaseSyncService } from '../services/databaseSyncService';

interface DatabaseResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  syncService: DatabaseSyncService | null;
}

/**
 * Modal para reset de banco de dados com autenticação
 */
export function DatabaseResetModal({ isOpen, onClose, syncService }: DatabaseResetModalProps) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  if (!isOpen) return null;

  const handleReset = async () => {
    if (!syncService) {
      setError('Serviço de sincronização não disponível');
      return;
    }
    
    if (!password) {
      setError('Digite sua senha');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      await syncService.resetDatabase(password);
      alert('✅ Banco de dados resetado com sucesso!\n\nA página será recarregada.');
      onClose();
      // Recarrega a aplicação para limpar o estado
      setTimeout(() => window.location.reload(), 500);
    } catch (err: any) {
      setError(err.message || 'Erro ao resetar banco de dados');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setPassword('');
      setError('');
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: '0 0 10px 0', color: 'var(--danger-color, #dc3545)' }}>
            ⚠️ Resetar Banco de Dados
          </h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>
            Esta ação é <strong>irreversível</strong>
          </p>
        </div>
        
        <div style={{ 
          background: 'var(--danger-bg, #fff5f5)', 
          border: '1px solid var(--danger-color, #dc3545)',
          borderRadius: '8px',
          padding: '15px',
          marginBottom: '20px'
        }}>
          <p style={{ margin: '0 0 10px 0', fontWeight: 'bold', color: 'var(--danger-color)' }}>
            ⚠️ Atenção:
          </p>
          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px' }}>
            <li>Todos os clientes serão deletados</li>
            <li>Todas as ordens de serviço serão deletadas</li>
            <li>Todos os lançamentos financeiros serão deletados</li>
            <li>Todo o catálogo de peças e serviços será deletado</li>
            <li>Esta ação não pode ser desfeita</li>
          </ul>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Digite sua senha para confirmar:
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Sua senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleReset()}
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px',
                paddingRight: '45px',
                border: '2px solid var(--border-color)',
                borderRadius: '8px',
                fontSize: '16px',
                boxSizing: 'border-box'
              }}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              disabled={loading}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: '18px',
                padding: '5px'
              }}
            >
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>
        </div>
        
        {error && (
          <div style={{
            background: 'var(--danger-bg, #fff5f5)',
            color: 'var(--danger-color, #dc3545)',
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '14px',
            border: '1px solid var(--danger-color)'
          }}>
            ❌ {error}
          </div>
        )}
        
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button 
            onClick={handleClose} 
            disabled={loading}
            style={{
              padding: '12px 24px',
              border: '2px solid var(--border-color)',
              borderRadius: '8px',
              background: 'var(--background)',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              fontWeight: 'bold',
              opacity: loading ? 0.5 : 1
            }}
          >
            Cancelar
          </button>
          <button 
            onClick={handleReset} 
            disabled={!password || loading}
            style={{
              padding: '12px 24px',
              border: 'none',
              borderRadius: '8px',
              background: 'var(--danger-color, #dc3545)',
              color: 'white',
              cursor: (!password || loading) ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              fontWeight: 'bold',
              opacity: (!password || loading) ? 0.5 : 1
            }}
          >
            {loading ? '🔄 Resetando...' : '🗑️ Confirmar Reset'}
          </button>
        </div>
      </div>
    </div>
  );
}

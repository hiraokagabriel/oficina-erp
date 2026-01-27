/**
 * DatabaseResetModal.tsx
 * 
 * Modal para reset do banco de dados com confirmação de senha
 * - Requer autenticação do usuário
 * - Cria backup automático antes de resetar
 * - Confirmação dupla para segurança
 */

import { useState } from 'react';
import { syncService } from '../services/syncService';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth } from '../lib/firebase';
import '../styles/DatabaseResetModal.css';

interface DatabaseResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function DatabaseResetModal({ isOpen, onClose, onSuccess }: DatabaseResetModalProps) {
  const [step, setStep] = useState<'confirm' | 'password'>('confirm');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  if (!isOpen) return null;

  const handleClose = () => {
    setStep('confirm');
    setPassword('');
    setError(null);
    setShowPassword(false);
    onClose();
  };

  const handleConfirm = () => {
    setStep('password');
    setError(null);
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!password.trim()) {
      setError('Por favor, digite sua senha');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const user = auth.currentUser;
      if (!user || !user.email) {
        throw new Error('Usuário não autenticado');
      }

      // Reautentica usuário
      console.log('🔑 Reautenticando usuário...');
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);

      console.log('✅ Autenticação confirmada');

      // Reseta banco de dados
      console.log('🗑️ Resetando banco de dados...');
      await syncService.resetDatabase();

      setLoading(false);
      onSuccess();
      handleClose();

      alert('✅ Banco de dados resetado com sucesso!\n\nUm backup foi criado automaticamente.');
    } catch (error: any) {
      console.error('❌ Erro ao resetar banco:', error);
      setLoading(false);

      // Mensagens de erro amigáveis
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        setError('Senha incorreta. Tente novamente.');
      } else if (error.code === 'auth/too-many-requests') {
        setError('Muitas tentativas. Aguarde alguns minutos.');
      } else if (error.code === 'auth/user-mismatch') {
        setError('Email não corresponde ao usuário logado.');
      } else {
        setError(error.message || 'Erro ao resetar banco de dados');
      }
    }
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="reset-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={handleClose}>×</button>

        {step === 'confirm' && (
          <>
            <div className="modal-header">
              <div className="modal-icon danger">⚠️</div>
              <h2>Resetar Banco de Dados?</h2>
            </div>

            <div className="modal-body">
              <div className="warning-box">
                <h3>⚠️ Atenção!</h3>
                <p>Esta ação irá <strong>apagar todos os dados</strong> do sistema:</p>
                <ul>
                  <li>📄 Lançamentos financeiros</li>
                  <li>🛠️ Ordens de serviço</li>
                  <li>👥 Clientes</li>
                  <li>📦 Catálogos de peças e serviços</li>
                </ul>
              </div>

              <div className="info-box">
                <h4>💾 Backup Automático</h4>
                <p>Não se preocupe! Um backup completo será criado automaticamente antes do reset.</p>
              </div>

              <div className="confirmation-text">
                <p>Tem certeza que deseja continuar?</p>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-cancel" onClick={handleClose}>
                Cancelar
              </button>
              <button className="btn-danger" onClick={handleConfirm}>
                Sim, Quero Resetar
              </button>
            </div>
          </>
        )}

        {step === 'password' && (
          <>
            <div className="modal-header">
              <div className="modal-icon lock">🔒</div>
              <h2>Confirme sua Senha</h2>
            </div>

            <div className="modal-body">
              <p className="password-instruction">
                Por segurança, digite sua senha para confirmar o reset:
              </p>

              <form onSubmit={handleReset}>
                <div className="password-input-wrapper">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Digite sua senha"
                    className="password-input"
                    autoFocus
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={loading}
                  >
                    {showPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>

                {error && (
                  <div className="error-message">
                    <span className="error-icon">❌</span>
                    {error}
                  </div>
                )}
              </form>
            </div>

            <div className="modal-footer">
              <button 
                className="btn-cancel" 
                onClick={handleClose}
                disabled={loading}
              >
                Cancelar
              </button>
              <button 
                className="btn-danger" 
                onClick={handleReset}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner"></span>
                    Resetando...
                  </>
                ) : (
                  'Resetar Banco'
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default DatabaseResetModal;

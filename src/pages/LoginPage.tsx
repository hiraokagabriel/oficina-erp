import { useState, useEffect } from 'react';
import { login } from '../services/authService';
import { User } from 'firebase/auth';
import { listenAuthChanges } from '../services/authService';
import '../styles/LoginPage.css';

interface LoginPageProps {
  onLoginSuccess?: (user: User) => void;
}

function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<'dark' | 'pastel'>('dark');

  // Aplica tema ao carregar
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'dark' | 'pastel' || 'dark';
    setCurrentTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  // Monitora estado de autenticação
  useEffect(() => {
    const unsubscribe = listenAuthChanges((user) => {
      if (user && onLoginSuccess) {
        onLoginSuccess(user);
      }
    });
    return () => unsubscribe();
  }, [onLoginSuccess]);

  const handleThemeToggle = () => {
    const newTheme = currentTheme === 'dark' ? 'pastel' : 'dark';
    setCurrentTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const userCredential = await login(email, password);
      if (onLoginSuccess) {
        onLoginSuccess(userCredential.user);
      }
    } catch (err: any) {
      console.error('Erro no login:', err);
      
      // Mensagens de erro mais amigáveis
      const errorMessages: Record<string, string> = {
        'auth/invalid-credential': 'Email ou senha incorretos.',
        'auth/user-not-found': 'Usuário não encontrado.',
        'auth/wrong-password': 'Senha incorreta.',
        'auth/invalid-email': 'Email inválido.',
        'auth/user-disabled': 'Esta conta foi desativada.',
        'auth/too-many-requests': 'Muitas tentativas. Tente novamente mais tarde.',
      };

      setError(errorMessages[err.code] || 'Erro ao fazer login. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-container">
      {/* Background Animado */}
      <div className="login-bg">
        <div className="login-bg-gradient"></div>
        <div className="login-bg-shapes">
          <div className="shape shape-1"></div>
          <div className="shape shape-2"></div>
          <div className="shape shape-3"></div>
        </div>
      </div>

      {/* Botão de Troca de Tema */}
      <button 
        className="theme-toggle-btn" 
        onClick={handleThemeToggle}
        aria-label="Trocar tema"
      >
        <span className="theme-icon">{currentTheme === 'dark' ? '🌙' : '☀️'}</span>
        <span className="theme-label">{currentTheme === 'dark' ? 'Dark' : 'Pastel'}</span>
      </button>

      {/* Card de Login com Glassmorphism */}
      <div className="login-card">
        {/* Logo e Título */}
        <div className="login-header">
          <div className="login-logo">
            <div className="logo-circle">AM</div>
          </div>
          <h1 className="login-title">
            Oficina <span className="highlight">ERP</span>
          </h1>
          <p className="login-subtitle">Sistema de Gestão Automotiva</p>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="login-form">
          {/* Campo Email */}
          <div className="form-group">
            <label htmlFor="email" className="form-label">
              <span className="label-icon">📧</span>
              Email
            </label>
            <input
              id="email"
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              autoComplete="email"
              disabled={loading}
            />
          </div>

          {/* Campo Senha */}
          <div className="form-group">
            <label htmlFor="password" className="form-label">
              <span className="label-icon">🔒</span>
              Senha
            </label>
            <div className="password-wrapper">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                disabled={loading}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                disabled={loading}
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </div>

          {/* Mensagem de Erro */}
          {error && (
            <div className="error-message">
              <span className="error-icon">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Botão de Login */}
          <button 
            type="submit" 
            className="login-btn"
            disabled={loading}
          >
            {loading ? (
              <>
                <div className="spinner"></div>
                <span>Entrando...</span>
              </>
            ) : (
              <>
                <span>Entrar</span>
                <span className="btn-icon">→</span>
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="login-footer">
          <p className="footer-text">Desenvolvido com 💜 pela Oficina ERP</p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;

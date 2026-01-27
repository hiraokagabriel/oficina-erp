import { useState, useEffect, useRef } from 'react';
import { login, signup, resetPassword } from '../services/authService';
import { User } from 'firebase/auth';
import { listenAuthChanges } from '../services/authService';
import '../styles/LoginPage.css';

interface LoginPageProps {
  onLoginSuccess?: (user: User) => void;
}

type ViewMode = 'login' | 'register' | 'reset';

function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<'dark' | 'pastel'>('dark');
  const [viewMode, setViewMode] = useState<ViewMode>('login');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bubblesRef = useRef<any[]>([]);
  const mouseRef = useRef({ x: 0, y: 0 });

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

  // Animação de Bubbles Interativos
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Ajusta tamanho do canvas
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Cria bubbles
    class Bubble {
      x: number;
      y: number;
      radius: number;
      vx: number;
      vy: number;
      baseRadius: number;

      constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.baseRadius = Math.random() * 80 + 40;
        this.radius = this.baseRadius;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;

        // Rebate nas bordas
        if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
        if (this.y < 0 || this.y > canvas.height) this.vy *= -1;

        // Reação ao mouse
        const dx = mouseRef.current.x - this.x;
        const dy = mouseRef.current.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const maxDistance = 200;

        if (distance < maxDistance) {
          const force = (maxDistance - distance) / maxDistance;
          this.radius = this.baseRadius + force * 30;
          
          // Empurra levemente para longe do mouse
          this.x -= (dx / distance) * force * 2;
          this.y -= (dy / distance) * force * 2;
        } else {
          this.radius += (this.baseRadius - this.radius) * 0.1;
        }
      }

      draw() {
        if (!ctx) return;
        
        // Calcula distância do mouse para iluminação
        const dx = mouseRef.current.x - this.x;
        const dy = mouseRef.current.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const maxDistance = 200;
        const influence = Math.max(0, 1 - distance / maxDistance);

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        
        if (currentTheme === 'dark') {
          // Tema escuro: iluminação
          const glow = influence * 0.3;
          ctx.fillStyle = `rgba(130, 87, 230, ${0.08 + glow})`;
        } else {
          // Tema claro: sombra
          const shadow = influence * 0.15;
          ctx.fillStyle = `rgba(139, 92, 246, ${0.04 + shadow})`;
        }
        
        ctx.fill();

        // Efeito de borda com influencia do mouse
        if (influence > 0.1) {
          ctx.strokeStyle = currentTheme === 'dark' 
            ? `rgba(130, 87, 230, ${influence * 0.3})` 
            : `rgba(139, 92, 246, ${influence * 0.2})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }

    // Inicializa bubbles
    const bubbleCount = window.innerWidth < 768 ? 5 : 8;
    bubblesRef.current = Array.from({ length: bubbleCount }, () => new Bubble());

    // Loop de animação
    let animationId: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      bubblesRef.current.forEach(bubble => {
        bubble.update();
        bubble.draw();
      });
      
      animationId = requestAnimationFrame(animate);
    };
    animate();

    // Rastrear mouse
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationId);
    };
  }, [currentTheme]);

  const handleThemeToggle = () => {
    const newTheme = currentTheme === 'dark' ? 'pastel' : 'dark';
    setCurrentTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  };

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setError(null);
    setSuccess(null);
  };

  const switchMode = (mode: ViewMode) => {
    resetForm();
    setViewMode(mode);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (viewMode === 'login') {
        // LOGIN
        const userCredential = await login(email, password);
        if (onLoginSuccess) {
          onLoginSuccess(userCredential.user);
        }
      } else if (viewMode === 'register') {
        // REGISTRO
        if (password !== confirmPassword) {
          setError('As senhas não coincidem.');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setError('A senha deve ter pelo menos 6 caracteres.');
          setLoading(false);
          return;
        }
        
        const userCredential = await signup(email, password);
        setSuccess('Conta criada com sucesso! Redirecionando...');
        setTimeout(() => {
          if (onLoginSuccess) {
            onLoginSuccess(userCredential.user);
          }
        }, 1500);
      } else if (viewMode === 'reset') {
        // RECUPERAÇÃO DE SENHA
        await resetPassword(email);
        setSuccess('Email de recuperação enviado! Verifique sua caixa de entrada.');
        setTimeout(() => switchMode('login'), 3000);
      }
    } catch (err: any) {
      console.error('Erro:', err);
      
      const errorMessages: Record<string, string> = {
        'auth/invalid-credential': 'Email ou senha incorretos.',
        'auth/user-not-found': 'Usuário não encontrado.',
        'auth/wrong-password': 'Senha incorreta.',
        'auth/invalid-email': 'Email inválido.',
        'auth/user-disabled': 'Esta conta foi desativada.',
        'auth/too-many-requests': 'Muitas tentativas. Tente novamente mais tarde.',
        'auth/email-already-in-use': 'Este email já está em uso.',
        'auth/weak-password': 'Senha muito fraca. Use pelo menos 6 caracteres.',
      };

      setError(errorMessages[err.code] || 'Erro ao processar requisição. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  const getTitle = () => {
    switch (viewMode) {
      case 'login': return 'Bem-vindo de volta!';
      case 'register': return 'Criar nova conta';
      case 'reset': return 'Recuperar senha';
    }
  };

  const getSubtitle = () => {
    switch (viewMode) {
      case 'login': return 'Faça login para continuar';
      case 'register': return 'Preencha os dados para criar sua conta';
      case 'reset': return 'Digite seu email para recuperar o acesso';
    }
  };

  const getButtonText = () => {
    if (loading) return viewMode === 'register' ? 'Criando conta...' : viewMode === 'reset' ? 'Enviando...' : 'Entrando...';
    switch (viewMode) {
      case 'login': return 'Entrar';
      case 'register': return 'Criar Conta';
      case 'reset': return 'Enviar Email';
    }
  };

  return (
    <div className="login-container">
      {/* Canvas de Bubbles */}
      <canvas ref={canvasRef} className="bubbles-canvas" />

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
            <div className="logo-circle">
              <svg viewBox="0 0 100 100" className="car-logo">
                {/* Silhueta de carro JDM estilo anos 90 (Nissan Skyline GT-R R34) */}
                <path d="M 15 60 L 20 50 L 25 45 L 35 42 L 45 40 L 55 40 L 65 42 L 75 45 L 80 50 L 85 60 L 85 70 L 80 72 L 75 70 L 72 65 L 28 65 L 25 70 L 20 72 L 15 70 Z" 
                      fill="white" opacity="0.9"/>
                {/* Janelas */}
                <path d="M 30 45 L 35 42 L 42 41 L 42 50 L 30 50 Z" fill="white" opacity="0.4"/>
                <path d="M 58 41 L 65 42 L 70 45 L 70 50 L 58 50 Z" fill="white" opacity="0.4"/>
                {/* Rodas */}
                <circle cx="30" cy="65" r="6" fill="white" opacity="0.9"/>
                <circle cx="30" cy="65" r="3" fill="currentColor" opacity="0.6"/>
                <circle cx="70" cy="65" r="6" fill="white" opacity="0.9"/>
                <circle cx="70" cy="65" r="3" fill="currentColor" opacity="0.6"/>
                {/* Spoiler */}
                <rect x="72" y="38" width="10" height="3" fill="white" opacity="0.8"/>
                <rect x="75" y="41" width="4" height="8" fill="white" opacity="0.6"/>
              </svg>
            </div>
          </div>
          <h1 className="login-title">
            Oficina <span className="highlight">ERP</span>
          </h1>
          <p className="login-subtitle">{getTitle()}</p>
          <p className="login-description">{getSubtitle()}</p>
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

          {/* Campo Senha (não exibir no modo reset) */}
          {viewMode !== 'reset' && (
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
                  autoComplete={viewMode === 'register' ? 'new-password' : 'current-password'}
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
          )}

          {/* Campo Confirmar Senha (apenas no registro) */}
          {viewMode === 'register' && (
            <div className="form-group">
              <label htmlFor="confirmPassword" className="form-label">
                <span className="label-icon">🔒</span>
                Confirmar Senha
              </label>
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="new-password"
                disabled={loading}
              />
            </div>
          )}

          {/* Mensagem de Erro */}
          {error && (
            <div className="error-message">
              <span className="error-icon">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Mensagem de Sucesso */}
          {success && (
            <div className="success-message">
              <span className="success-icon">✅</span>
              <span>{success}</span>
            </div>
          )}

          {/* Botão de Submit */}
          <button 
            type="submit" 
            className="login-btn"
            disabled={loading}
          >
            {loading ? (
              <>
                <div className="spinner"></div>
                <span>{getButtonText()}</span>
              </>
            ) : (
              <>
                <span>{getButtonText()}</span>
                <span className="btn-icon">→</span>
              </>
            )}
          </button>

          {/* Links de Navegação */}
          <div className="form-links">
            {viewMode === 'login' && (
              <>
                <button type="button" className="link-btn" onClick={() => switchMode('reset')}>
                  Esqueci minha senha
                </button>
                <button type="button" className="link-btn primary" onClick={() => switchMode('register')}>
                  Criar nova conta
                </button>
              </>
            )}
            {viewMode === 'register' && (
              <button type="button" className="link-btn" onClick={() => switchMode('login')}>
                ← Voltar para login
              </button>
            )}
            {viewMode === 'reset' && (
              <button type="button" className="link-btn" onClick={() => switchMode('login')}>
                ← Voltar para login
              </button>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="login-footer">
          <p className="footer-text">Desenvolvido por Gabriel Ferigato</p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;

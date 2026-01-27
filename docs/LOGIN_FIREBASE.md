# 🔥 Integração Firebase - Tela de Login

## 🎯 Visão Geral

Implementação completa de uma tela de login moderna e profissional integrada ao Firebase Authentication, seguindo o design system do Oficina ERP com **glassmorphism**, animações fluidas e suporte a temas (Dark/Pastel).

---

## ✨ Funcionalidades Implementadas

### 🔐 Autenticação
- **Login com Email e Senha** via Firebase Authentication
- **Validação de Formulário** com feedback em tempo real
- **Mensagens de Erro Amigáveis** traduzidas do Firebase
- **Botão de Toggle de Senha** (mostrar/ocultar)
- **Loading State** com spinner durante autenticação
- **Auto-Login** com listener de mudanças de estado

### 🎨 Design & UX
- **Glassmorphism Effect** com blur e transparência
- **Animações Fluidas** em todos os elementos
- **Background Animado** com formas flutuantes
- **Troca de Tema** (Dark/Pastel) direto na tela de login
- **Responsivo** para mobile, tablet e desktop
- **Acessibilidade** com labels e aria-labels adequados

### 💡 Persistência
- **Tema salvo no LocalStorage** para preferência do usuário
- **Auto-aplicação do tema** ao carregar a página

---

## 📁 Estrutura de Arquivos

```
src/
├── lib/
│   └── firebase.ts              # Configuração do Firebase
├── services/
│   ├── authService.ts          # Serviços de autenticação
│   └── clientService.ts        # Serviços de cliente (futuro)
├── pages/
│   └── LoginPage.tsx           # Componente da tela de login
└── styles/
    └── LoginPage.css           # Estilos glassmorphism
```

---

## 🛠️ Como Usar

### 1️⃣ Importar o Componente

```tsx
import LoginPage from './pages/LoginPage';
import { User } from 'firebase/auth';

function App() {
  const handleLoginSuccess = (user: User) => {
    console.log('Usuário logado:', user);
    // Redirecionar para dashboard ou home
  };

  return (
    <LoginPage onLoginSuccess={handleLoginSuccess} />
  );
}
```

### 2️⃣ Integrar com Roteamento

```tsx
import { useState, useEffect } from 'react';
import { listenAuthChanges } from './services/authService';
import LoginPage from './pages/LoginPage';
import App from './App';

function Root() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = listenAuthChanges((currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) return <div>Carregando...</div>;

  return user ? <App /> : <LoginPage onLoginSuccess={setUser} />;
}
```

---

## 🔑 Tratamento de Erros

O sistema traduz automaticamente os códigos de erro do Firebase para mensagens amigáveis:

| Código Firebase | Mensagem Exibida |
|-------------------|------------------|
| `auth/invalid-credential` | Email ou senha incorretos. |
| `auth/user-not-found` | Usuário não encontrado. |
| `auth/wrong-password` | Senha incorreta. |
| `auth/invalid-email` | Email inválido. |
| `auth/user-disabled` | Esta conta foi desativada. |
| `auth/too-many-requests` | Muitas tentativas. Tente novamente mais tarde. |

---

## 🎨 Design System

### Cores (CSS Variables)

#### Tema Dark
```css
--bg-app: #1e1e2e;
--bg-panel: #2b2b3b;
--primary: #8257e6;
--primary-hover: #9466ff;
--text-main: #e0e0e0;
--text-muted: #a0a0a0;
```

#### Tema Pastel
```css
--bg-app: #F8F5FA;
--bg-panel: #FFFFFF;
--primary: #8B5CF6;
--primary-hover: #A78BFA;
--text-main: #2D2438;
--text-muted: #6B6078;
```

### Animações

- **cardEntrance**: Entrada suave do card com scale e fade
- **logoFloat**: Logo flutuante com movimento vertical
- **logoShine**: Efeito de brilho no logo
- **float**: Formas de background flutuantes
- **gradientShift**: Gradiente animado do background
- **errorShake**: Animação de shake para erros

---

## 📦 Dependências

Certifique-se de ter as dependências instaladas:

```bash
npm install firebase
# ou
yarn add firebase
```

### Configuração do Firebase

O arquivo `src/lib/firebase.ts` já contém a configuração necessária:

```typescript
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  // ... outras configurações
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
```

---

## 📱 Responsividade

A tela se adapta perfeitamente a diferentes tamanhos de tela:

- **Desktop** (>768px): Layout completo com todos os elementos
- **Tablet** (481px-768px): Layout ajustado, label do tema oculto
- **Mobile** (<480px): Layout compacto e otimizado para touch

---

## ♿ Acessibilidade

- ✅ Labels associados aos inputs
- ✅ Aria-labels em botões de ação
- ✅ Contraste adequado de cores
- ✅ Feedback visual para estados (focus, hover, disabled)
- ✅ Suporte a navegação por teclado

---

## 🚧 Próximos Passos (Opcional)

- [ ] Adicionar "Esqueci minha senha"
- [ ] Implementar registro de novos usuários
- [ ] Login com Google/GitHub (OAuth)
- [ ] Autenticação de dois fatores (2FA)
- [ ] Remember me (manter conectado)
- [ ] Rate limiting no lado do cliente

---

## 📝 Notas Importantes

1. **Segurança**: As credenciais do Firebase estão no código. Para produção, considere usar variáveis de ambiente.

2. **Persistência**: O Firebase mantém o usuário logado entre sessões por padrão.

3. **Performance**: O glassmorphism usa `backdrop-filter`, que pode ter impacto em dispositivos mais antigos. Consider adicionar fallback.

4. **Temas**: O tema escolhido persiste no LocalStorage e é aplicado automaticamente.

---

## 👨‍💻 Autor

Desenvolvido com 💜 pela equipe Oficina ERP

---

## 📝 License

Private - Todos os direitos reservados

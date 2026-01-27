# 🔥 Integração Firebase - Tela de Login

## 🎯 Visão Geral

Implementação completa de uma tela de login moderna e profissional integrada ao Firebase Authentication, seguindo o design system do Oficina ERP com **glassmorphism**, **bubbles interativos** e suporte a temas (Dark/Pastel).

---

## ✨ Funcionalidades Implementadas

### 🔐 Autenticação Completa
- **Login com Email e Senha** via Firebase Authentication
- **Registro de Novos Usuários** direto no aplicativo
- **Recuperação de Senha** com envio de email
- **Validação de Formulário** com feedback em tempo real
- **Mensagens de Erro Amigáveis** traduzidas do Firebase
- **Botão de Toggle de Senha** (mostrar/ocultar)
- **Loading State** com spinner durante autenticação
- **Auto-Login** com listener de mudanças de estado

### 🎨 Design & UX Premium
- **Glassmorphism Effect** com blur e transparência
- **Bubbles Interativos** que reagem ao cursor do mouse
  - Tema Dark: Iluminação ao passar o mouse
  - Tema Claro: Sombra suave ao passar o mouse
- **Logo JDM** - Silhueta de carro japonês estilo anos 90 (Skyline GT-R R34)
- **Animações Fluidas** em todos os elementos
- **Troca de Tema** (Dark/Pastel) direto na tela de login
- **Navegação entre Modos** (Login, Registro, Recuperação)
- **Responsivo** para mobile, tablet e desktop
- **Acessibilidade** com labels e aria-labels adequados

### 💡 Persistência
- **Tema salvo no LocalStorage** para preferência do usuário
- **Auto-aplicação do tema** ao carregar a página
- **Sessão mantida** via Firebase Authentication

---

## 📁 Estrutura de Arquivos

```
src/
├── lib/
│   └── firebase.ts              # Configuração do Firebase
├── services/
│   ├── authService.ts          # Serviços de autenticação (login, signup, resetPassword)
│   └── clientService.ts        # Serviços de cliente
├── pages/
│   └── LoginPage.tsx           # Componente completo da tela de login
├── styles/
│   └── LoginPage.css           # Estilos glassmorphism + bubbles
└── main.tsx                     # Wrapper de autenticação
```

---

## 🛠️ Modos de Uso

### 1️⃣ Modo Login (Padrão)
- Email e senha
- Links para "Esqueci minha senha" e "Criar conta"
- Botão "Entrar"

### 2️⃣ Modo Registro
- Email, senha e confirmação de senha
- Validação de senha (mínimo 6 caracteres)
- Verificação de correspondência de senhas
- Botão "Criar Conta"
- Link para voltar ao login

### 3️⃣ Modo Recuperação de Senha
- Apenas email
- Envia email de recuperação via Firebase
- Botão "Enviar Email"
- Link para voltar ao login
- Mensagem de sucesso após envio

---

## 🔑 Tratamento de Erros

O sistema traduz automaticamente os códigos de erro do Firebase:

| Código Firebase | Mensagem Exibida |
|-------------------|------------------|
| `auth/invalid-credential` | Email ou senha incorretos. |
| `auth/user-not-found` | Usuário não encontrado. |
| `auth/wrong-password` | Senha incorreta. |
| `auth/invalid-email` | Email inválido. |
| `auth/user-disabled` | Esta conta foi desativada. |
| `auth/too-many-requests` | Muitas tentativas. Tente novamente mais tarde. |
| `auth/email-already-in-use` | Este email já está em uso. |
| `auth/weak-password` | Senha muito fraca. Use pelo menos 6 caracteres. |

---

## 🎨 Bubbles Interativos

### Comportamento
- **Movimento Autônomo**: Bubbles flutuam suavemente pela tela
- **Reação ao Mouse**: Aumentam de tamanho e se afastam levemente
- **Iluminação Dinâmica**:
  - **Tema Dark**: Glow roxo ao passar o mouse (iluminação)
  - **Tema Pastel**: Sombra suave ao passar o mouse
- **Performance Otimizada**: Canvas HTML5 com requestAnimationFrame
- **Responsivo**: Menos bubbles em dispositivos móveis

### Implementação Técnica
```typescript
// Raio base do bubble
baseRadius: 40-120px

// Distância de interação
maxDistance: 200px

// Velocidade
vx, vy: -0.25 a 0.25 px/frame

// Quantidade
- Desktop: 8 bubbles
- Mobile: 5 bubbles
```

---

## 🚗 Logo JDM

Silhueta SVG de um carro japonês icônico dos anos 90 (inspirado no Nissan Skyline GT-R R34):

- **Elementos**: Carroceria, janelas, rodas, spoiler
- **Estilo**: Stencil minimalista
- **Cores**: Branco com opacidade variável
- **Animação**: Efeito de brilho (shine) a cada 3 segundos
- **Movimento**: Float vertical suave

---

## 📝 Fluxo de Navegação

```
        Login (Padrão)
            │
    ┌───────┼───────┐
    │               │
 Esqueci      Criar Conta
 minha senha      │
    │               │
    │               ↓
    ↓           Registro
  Reset         (email + senha + confirmar)
 (email)            │
    │               │
    └───────────────┘
         ↓
    Autenticação
      Firebase
         ↓
      Dashboard
```

---

## 🚀 Como Testar Todas as Funcionalidades

### 1. Testar Login
```bash
1. Acesse a tela de login
2. Digite email e senha válidos
3. Clique em "Entrar"
4. Verifique redirecionamento para o dashboard
```

### 2. Testar Registro
```bash
1. Clique em "Criar nova conta"
2. Digite email, senha e confirmação
3. Clique em "Criar Conta"
4. Aguarde mensagem de sucesso
5. Verifique auto-login
```

### 3. Testar Recuperação de Senha
```bash
1. Clique em "Esqueci minha senha"
2. Digite email cadastrado
3. Clique em "Enviar Email"
4. Verifique caixa de entrada do email
5. Siga link de recuperação
```

### 4. Testar Bubbles Interativos
```bash
1. Mova o mouse pela tela
2. Observe bubbles reagindo
3. Tema Dark: Veja iluminação roxo
4. Tema Pastel: Veja sombra sutil
5. Alterne temas e compare
```

### 5. Testar Responsividade
```bash
1. Redimensione a janela
2. Teste em 1920x1080 (desktop)
3. Teste em 768x1024 (tablet)
4. Teste em 375x667 (mobile)
5. Verifique adaptação do layout
```

---

## 🔧 authService.ts - Funções Disponíveis

```typescript
// Login
export function login(email: string, password: string)

// Registro de novo usuário
export function signup(email: string, password: string)

// Logout
export function logout()

// Recuperação de senha
export function resetPassword(email: string)

// Listener de autenticação
export function listenAuthChanges(callback: (user: User | null) => void)
```

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
--glass-border: rgba(255,255,255,0.1);
```

#### Tema Pastel
```css
--bg-app: #F8F5FA;
--bg-panel: #FFFFFF;
--primary: #8B5CF6;
--primary-hover: #A78BFA;
--text-main: #2D2438;
--text-muted: #6B6078;
--glass-border: rgba(255,255,255,0.8);
```

### Animações

- **cardEntrance**: Entrada suave do card com scale e fade (0.8s)
- **logoFloat**: Logo flutuante com movimento vertical (3s loop)
- **logoShine**: Efeito de brilho no logo (3s loop)
- **iconSpin**: Rotação do ícone de tema (1s)
- **errorShake**: Shake horizontal para erros (0.4s)
- **successSlide**: Slide de baixo para cima (0.4s)

---

## 📦 Firebase Setup

### 1. Console do Firebase
1. Acesse [Firebase Console](https://console.firebase.google.com/)
2. Vá em **Authentication** > **Sign-in method**
3. Habilite **Email/Password**
4. (Opcional) Configure templates de email personalizados

### 2. Configurar Email de Recuperação
1. **Authentication** > **Templates**
2. Edite template "Password reset"
3. Personalize mensagem e design
4. Configure domínio de envio

---

## 💡 Dicas de Uso

### Criação de Usuários
- Senha mínima: 6 caracteres
- Firebase valida formato de email automaticamente
- Emails devem ser únicos no sistema

### Recuperação de Senha
- Email válido por 1 hora (padrão Firebase)
- Pode ser solicitado múltiplas vezes
- Rate limiting automático para segurança

### Performance
- Bubbles otimizados com requestAnimationFrame
- Canvas redimensiona automaticamente
- Menos bubbles em mobile para performance

---

## ♿ Acessibilidade

- ✅ Labels associados aos inputs
- ✅ Aria-labels em botões de ação
- ✅ Contraste adequado de cores (WCAG AA)
- ✅ Feedback visual para estados (focus, hover, disabled)
- ✅ Suporte a navegação por teclado
- ✅ Mensagens de erro descritivas
- ✅ Loading states com spinner visual

---

## 🚧 Próximos Passos (Opcional)

- [ ] Login com Google/GitHub (OAuth)
- [ ] Autenticação de dois fatores (2FA)
- [ ] Remember me (manter conectado)
- [ ] Verificação de email após registro
- [ ] Perfil de usuário com foto
- [ ] Edição de dados de usuário

---

## 📝 Notas Importantes

1. **Email de Recuperação**: Configure o template no Firebase Console para melhor UX

2. **Validação de Senha**: Firebase requer mínimo 6 caracteres

3. **Performance**: Bubbles canvas pode ter impacto em dispositivos antigos. Consider adicionar opção de desativar

4. **Segurança**: Credenciais Firebase no código. Para produção, use variáveis de ambiente

5. **Temas**: LocalStorage persiste escolha do usuário

---

## 👨‍💻 Autor

**Desenvolvido por Gabriel Ferigato**

---

## 📝 License

Private - Todos os direitos reservados

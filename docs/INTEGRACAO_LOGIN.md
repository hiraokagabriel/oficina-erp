# Integração do Sistema de Login e Sincronização

## Visão Geral

O sistema agora possui integração completa entre autenticação Firebase e sincronização de banco de dados. O fluxo é gerenciado pelo componente `AppWrapper` que decide qual tela mostrar baseado no estado de autenticação e sincronização.

## Fluxo de Autenticação e Sincronização

```
1. Usuário acessa aplicação
   ↓
2. AppWrapper verifica autenticação
   ↓
3a. Não autenticado          3b. Autenticado
    ↓                           ↓
    LoginPage                   useDatabaseSync inicia
    ↓                           ↓
    Faz login                   Sincroniza dados
    ↓                           ↓
    volta para 2                4. App principal
```

## Componentes Principais

### AppWrapper.tsx

Componente principal que orquestra todo o fluxo:

```typescript
import AppWrapper from './AppWrapper';

ReactDOM.createRoot(document.getElementById('root')).render(
  <AppWrapper />
);
```

**Estados gerenciados:**

1. **authLoading** - Verificando autenticação inicial
2. **user === null** - Mostra `LoginPage`
3. **syncStatus === 'syncing'** - Mostra tela de loading
4. **syncStatus === 'error'** - Mostra tela de erro
5. **syncStatus === 'success' ou 'idle'** - Mostra `App` principal

### LoginPage.tsx

Tela de login com múltiplas funcionalidades:

- Login com email/senha
- Login com Google OAuth
- Registro de nova conta
- Recuperação de senha
- Animações interativas (bubbles)
- Suporte a temas dark/pastel

### useDatabaseSync Hook

Gerencia sincronização automática:

```typescript
const { syncStatus, syncMessage, syncService } = useDatabaseSync();
```

**Status possíveis:**
- `idle` - Aguardando
- `syncing` - Sincronizando
- `success` - Sincronizado
- `error` - Erro
- `offline` - Modo offline

## Estrutura de Arquivos

```
src/
├── AppWrapper.tsx              # Wrapper principal
├── main.tsx                    # Ponto de entrada
├── App.tsx                     # App principal (ERP)
├── pages/
│   └── LoginPage.tsx           # Tela de login
├── components/
│   ├── SyncStatusIndicator.tsx # Indicador de sync
│   └── DatabaseResetModal.tsx  # Modal de reset
├── hooks/
│   └── useDatabaseSync.ts      # Hook de sincronização
├── services/
│   ├── authService.ts          # Autenticação Firebase
│   └── databaseSyncService.ts  # Sincronização de dados
└── styles/
    └── LoginPage.css           # Estilos do login
```

## Telas do Fluxo

### 1. Loading Inicial

Mostrada enquanto verifica se usuário está autenticado:

```typescript
if (authLoading) {
  return <LoadingScreen message="Carregando..." />;
}
```

### 2. Tela de Login

Mostrada quando usuário não está autenticado:

```typescript
if (!user) {
  return <LoginPage onLoginSuccess={setUser} />;
}
```

**Funcionalidades:**
- Login com email/senha
- Login com Google (popup)
- Registro de nova conta
- Recuperação de senha via email
- Validação de formulários
- Mensagens de erro traduzidas
- Animações fluidas

### 3. Loading de Sincronização

Mostrada durante sincronização inicial:

```typescript
if (syncStatus === 'syncing' && !syncService) {
  return <SyncLoadingScreen message={syncMessage} />;
}
```

**Mensagens exibidas:**
- "Verificando dados..."
- "Enviando dados locais para nuvem..."
- "Baixando dados da nuvem..."
- "Dados migrados para nuvem!"

### 4. Tela de Erro

Mostrada se sincronização falhar:

```typescript
if (syncStatus === 'error') {
  return (
    <ErrorScreen 
      message={syncMessage}
      onRetry={() => window.location.reload()}
      onLogout={logout}
    />
  );
}
```

### 5. App Principal

Mostrado quando tudo está pronto:

```typescript
return (
  <>
    <SyncStatusIndicator status={syncStatus} message={syncMessage} />
    <App />
  </>
);
```

## Recursos de Segurança

### 1. Autenticação Obrigatória

Não é possível acessar o app sem estar autenticado:

```typescript
if (!user) {
  return <LoginPage />; // Força login
}
```

### 2. Isolamento de Dados

Cada usuário tem seus próprios dados no Firestore:

```
firestore/
└── users/
    ├── {userId1}/  <-- Usuário 1
    │   ├── clients/
    │   └── workOrders/
    └── {userId2}/  <-- Usuário 2
        ├── clients/
        └── workOrders/
```

### 3. Regras de Segurança Firestore

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    // Apenas o próprio usuário pode acessar seus dados
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null 
        && request.auth.uid == userId;
    }
  }
}
```

## Funcionalidades do Login

### Login com Email/Senha

```typescript
const handleEmailLogin = async (email: string, password: string) => {
  const userCredential = await login(email, password);
  // Sincronização inicia automaticamente
};
```

### Login com Google

```typescript
const handleGoogleLogin = async () => {
  const userCredential = await loginWithGoogle();
  // Popup do Google OAuth
  // Sincronização inicia automaticamente
};
```

**Tratamento de erros:**
- Popup bloqueado pelo navegador
- Popup fechado pelo usuário
- Conta já existe com outro método

### Registro de Nova Conta

```typescript
const handleRegister = async (email: string, password: string) => {
  // Validações:
  // - Senha mínimo 6 caracteres
  // - Senhas devem coincidir
  // - Email válido
  
  const userCredential = await signup(email, password);
  // Banco de dados inicializado vazio
};
```

### Recuperação de Senha

```typescript
const handleResetPassword = async (email: string) => {
  await resetPassword(email);
  // Email enviado via Firebase Auth
};
```

## Indicadores Visuais

### SyncStatusIndicator

Mostra status de sincronização em tempo real:

```typescript
<SyncStatusIndicator 
  status={syncStatus}  // 'syncing' | 'success' | 'error' | 'offline'
  message={syncMessage} // Mensagem descritiva
/>
```

**Posição:** Canto superior direito (fixed)

**Animações:**
- Pulse durante sincronização
- Spin do ícone
- Fade out após sucesso

## Mensagens de Erro

Mensagens traduzidas e amigáveis:

| Código Firebase | Mensagem Exibida |
|------------------|------------------|
| `auth/invalid-credential` | Email ou senha incorretos |
| `auth/user-not-found` | Usuário não encontrado |
| `auth/wrong-password` | Senha incorreta |
| `auth/invalid-email` | Email inválido |
| `auth/too-many-requests` | Muitas tentativas. Tente novamente mais tarde |
| `auth/email-already-in-use` | Este email já está em uso |
| `auth/popup-blocked` | Popup bloqueado pelo navegador |

## Testes Recomendados

### 1. Fluxo Completo de Novo Usuário

1. Abrir aplicação (não autenticado)
2. Criar nova conta
3. Verificar sincronização inicial
4. Criar alguns dados (clientes, OSs)
5. Fazer logout
6. Fazer login novamente
7. Verificar se dados foram carregados

### 2. Login com Google

1. Clicar em "Continuar com Google"
2. Selecionar conta no popup
3. Verificar sincronização
4. Criar dados
5. Fazer logout e login novamente

### 3. Múltiplos Dispositivos

1. Fazer login em dois navegadores diferentes
2. Criar dados no navegador 1
3. Verificar se dados aparecem no navegador 2 (tempo real)
4. Editar dados no navegador 2
5. Verificar se edições aparecem no navegador 1

### 4. Modo Offline

1. Fazer login
2. Aguardar sincronização
3. Desconectar internet
4. Criar/editar dados (salva local)
5. Reconectar internet
6. Verificar se dados sincronizam

### 5. Recuperação de Senha

1. Clicar em "Esqueci minha senha"
2. Digite email
3. Verificar recebimento do email
4. Clicar no link e redefinir senha
5. Fazer login com nova senha

## Troubleshooting

### Problema: "Popup bloqueado pelo navegador"

**Solução:** Permitir popups para localhost (desenvolvimento) ou domínio (produção)

**Chrome:**
1. Ícone de bloqueio na barra de endereço
2. Configurações do site
3. Popups e redirecionamentos → Permitir

### Problema: "Erro na sincronização"

**Causas comuns:**
1. Regras do Firestore não configuradas
2. Sem conexão com internet
3. userId não corresponde

**Solução:** Verificar regras do Firestore e console do navegador

### Problema: "Loading infinito"

**Causas:**
1. Hook useDatabaseSync não atualiza status
2. Erro não tratado

**Solução:** Verificar console do navegador e adicionar logs

## Próximos Passos

### Melhorias Futuras

1. **Login com mais providers:**
   - Facebook
   - Microsoft
   - Apple

2. **Autenticação de dois fatores (2FA)**

3. **Perfil de usuário:**
   - Avatar
   - Nome completo
   - Configurações pessoais

4. **Gestão de sessão:**
   - Logout automático após inatividade
   - Renovar token

5. **Migração de conta:**
   - Vincular múltiplos providers
   - Migrar dados entre contas

## Referências

- [Firebase Authentication Docs](https://firebase.google.com/docs/auth)
- [Firebase Firestore Docs](https://firebase.google.com/docs/firestore)
- [React Hooks Documentation](https://react.dev/reference/react)

---

**Desenvolvido por:** Gabriel Ferigato  
**Data:** 27 de Janeiro de 2026  
**Versão:** 1.0.0

# 🔑 Configuração do Google Sign-In no Firebase

## 🎯 Visão Geral

Guia passo a passo para configurar autenticação com Google (OAuth) no projeto oficina-erp.

---

## ✅ Pré-requisitos

- Projeto Firebase já criado e configurado
- Arquivo `firebase.ts` com credenciais configuradas
- Código do Google Sign-In já implementado (LoginPage.tsx e authService.ts)

---

## 🛠️ Passo 1: Habilitar Google Provider no Firebase Console

### 1.1 Acessar Authentication

1. Acesse o [Firebase Console](https://console.firebase.google.com/)
2. Selecione seu projeto: **oficina-erp**
3. No menu lateral, clique em **Build** → **Authentication**
4. Clique na aba **Sign-in method**

### 1.2 Adicionar Google Provider

1. Clique no botão **Add new provider** (ou "Adicionar novo provedor")
2. Na lista de provedores, selecione **Google**
3. **Ative o toggle** no topo para habilitar o Google Sign-In

### 1.3 Configurar Informações do Projeto

Preencha os campos obrigatórios:

- **Nome público do projeto**: `Oficina ERP` (ou o nome que preferir)
  - Este nome será exibido na tela de consentimento do Google
  
- **Email de suporte do projeto**: Seu email (ex: `hiraokagabriel@gmail.com`)
  - Email que aparecerá na tela de autenticação

### 1.4 Salvar Configuração

1. Clique em **Save** (Salvar)
2. Aguarde alguns segundos para propagação das configurações
3. O provedor Google agora estará **Enabled** (Habilitado)

---

## 🌐 Passo 2: Configurar Domínios Autorizados

### 2.1 Domínios Padrão (Já Configurados Automaticamente)

O Firebase adiciona automaticamente:
- `localhost` (desenvolvimento local)
- `*.firebaseapp.com` (deploy do Firebase Hosting)
- `*.web.app` (deploy do Firebase Hosting)

### 2.2 Adicionar Domínio Customizado (Se Necessário)

Se você usar domínio próprio:

1. Em **Authentication** → **Settings** → **Authorized domains**
2. Clique em **Add domain**
3. Digite seu domínio (ex: `oficina-erp.com.br`)
4. Clique em **Add**

---

## 💻 Passo 3: Verificar Implementação no Código

### 3.1 authService.ts

Verifique se o arquivo contém:

```typescript
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";

// Provider do Google
const googleProvider = new GoogleAuthProvider();

// Configurações opcionais
googleProvider.setCustomParameters({
  prompt: 'select_account' // Força seleção de conta
});

// Função de login
export function loginWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}
```

### 3.2 LoginPage.tsx

Verifique se o botão está implementado:

```tsx
<button 
  type="button"
  onClick={handleGoogleLogin}
  className="google-login-btn"
  disabled={loading}
>
  <svg className="google-icon" viewBox="0 0 24 24" width="20" height="20">
    {/* Logo do Google em SVG */}
  </svg>
  <span>Continuar com Google</span>
</button>
```

---

## ⚙️ Configurações Avançadas (Opcional)

### Personalizar Tela de Consentimento

1. Acesse [Google Cloud Console](https://console.cloud.google.com/)
2. Selecione o projeto Firebase (mesmo nome)
3. Vá em **APIs & Services** → **OAuth consent screen**
4. Personalize:
   - Logo da aplicação
   - Links de política de privacidade
   - Links de termos de serviço
   - Escopos de permissões

### Obter Client ID Manualmente (Se Necessário)

1. [Google Cloud Console](https://console.cloud.google.com/)
2. **APIs & Services** → **Credentials**
3. Copie o **OAuth 2.0 Client ID**
4. Use em configurações avançadas se necessário

---

## 🧪 Testar a Integração

### Teste Local

```bash
# 1. Instalar dependências
npm install

# 2. Iniciar servidor de desenvolvimento
npm run dev

# 3. Acessar: http://localhost:5173
```

### Fluxo de Teste

1. **Abrir aplicação** no navegador
2. **Clicar** no botão "Continuar com Google"
3. **Popup** do Google abrirá automaticamente
4. **Selecionar** conta Google
5. **Permitir** acesso à aplicação
6. **Redirecionamento** automático para o dashboard

### Verificar Usuário Criado

1. Acesse Firebase Console
2. **Authentication** → **Users**
3. Você verá o usuário listado com:
   - Email da conta Google
   - Nome completo
   - Foto de perfil
   - Provider: Google

---

## 🛡️ Segurança

### Boas Práticas

1. **Sempre use HTTPS** em produção
2. **Configure CSP** (Content Security Policy) adequadamente
3. **Limite domínios autorizados** apenas aos necessários
4. **Monitore logs** de autenticação no Firebase Console
5. **Habilite rate limiting** para prevenir abusos

### Configurações de Segurança no Firebase

```javascript
// Em firebase.ts ou rules de segurança
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

---

## ⚠️ Problemas Comuns

### Erro: "Popup blocked by browser"

**Solução:**
- Permita popups para o domínio da aplicação
- Ou use `signInWithRedirect` ao invés de `signInWithPopup`

```typescript
import { signInWithRedirect } from "firebase/auth";

export function loginWithGoogle() {
  return signInWithRedirect(auth, googleProvider);
}
```

### Erro: "auth/unauthorized-domain"

**Solução:**
1. Firebase Console → Authentication → Settings
2. Authorized domains
3. Adicione o domínio atual

### Erro: "auth/popup-closed-by-user"

**Solução:**
- Normal quando usuário fecha popup
- Já tratado no código com mensagem amigável

### Erro: "auth/account-exists-with-different-credential"

**Solução:**
- Usuário já cadastrado com Email/Senha
- Faça login com método original primeiro
- Depois vincule conta Google nas configurações

---

## 📊 Monitoramento

### Firebase Console - Analytics

1. **Authentication** → **Users**
   - Total de usuários
   - Provedores usados
   - Últimos logins

2. **Analytics** → **Events**
   - `sign_in` (login)
   - `sign_up` (registro)
   - Filtrar por provider: `google.com`

### Logs de Erro

Implementado no código:

```typescript
console.log('✅ Login com Google bem-sucedido:', user.email);
console.error('❌ Erro no login com Google:', error);
```

---

## 🚀 Deploy para Produção

### Firebase Hosting

```bash
# 1. Build da aplicação
npm run build

# 2. Deploy
firebase deploy --only hosting

# 3. URL gerada automaticamente:
# https://oficina-erp.web.app
```

### Domínio Customizado

1. Firebase Console → Hosting → **Add custom domain**
2. Siga instruções de configuração DNS
3. Aguarde propagação (até 24h)
4. SSL automático provido pelo Firebase

---

## 📝 Checklist Final

### Configuração
- [ ] Google Provider habilitado no Firebase
- [ ] Email de suporte configurado
- [ ] Domínios autorizados adicionados
- [ ] authService.ts implementado
- [ ] LoginPage.tsx com botão Google
- [ ] CSS do botão estilizado

### Testes
- [ ] Login com Google funciona localmente
- [ ] Popup abre corretamente
- [ ] Usuário criado no Firebase
- [ ] Redirecionamento funciona
- [ ] Logout funciona
- [ ] Mensagens de erro são exibidas

### Segurança
- [ ] HTTPS configurado (produção)
- [ ] Domínios limitados
- [ ] Rules de segurança configuradas
- [ ] Monitoramento ativo

---

## 📚 Referências

- [Firebase Authentication - Google](https://firebase.google.com/docs/auth/web/google-signin)
- [Google Cloud Console](https://console.cloud.google.com/)
- [OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Firebase Hosting](https://firebase.google.com/docs/hosting)

---

## 👨‍💻 Suporte

Em caso de dúvidas:
1. Consulte [documentação oficial do Firebase](https://firebase.google.com/docs/auth)
2. Verifique [status do Firebase](https://status.firebase.google.com/)
3. Entre em contato com desenvolvedor: **Gabriel Ferigato**

---

**✅ Configuração concluída! Google Sign-In pronto para uso.**

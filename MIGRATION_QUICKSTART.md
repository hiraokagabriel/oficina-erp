# ⚡ Migração Rápida para Firebase

## 1️⃣ Instalar Firebase

```bash
npm install firebase
```

---

## 2️⃣ Configurar Firebase Console

### Criar Projeto
1. Acesse https://console.firebase.google.com/
2. Clique em **"Adicionar Projeto"**
3. Nome: `oficina-erp`
4. Desabilite Analytics (opcional)

### Habilitar Firestore
1. Menu lateral → **Firestore Database**
2. **Criar banco de dados**
3. **Modo de produção**
4. Localização: **southamerica-east1 (São Paulo)**

### Configurar Regras de Segurança
Vá em **Firestore → Regras** e cole:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Clique em **Publicar**.

### Habilitar Authentication
1. Menu lateral → **Authentication**
2. **Começar**
3. Ative:
   - ✅ Email/Senha
   - ✅ Google (opcional)

---

## 3️⃣ Obter Credenciais

1. **Configurações do Projeto** (⚙️ no topo)
2. Role até **"Seus aplicativos"**
3. Clique no ícone **Web** (`</>`)
4. Nome: `oficina-erp-web`
5. **Registrar app**
6. Copie o `firebaseConfig`

---

## 4️⃣ Configurar Variáveis de Ambiente

Crie o arquivo `.env` na raiz:

```bash
cp .env.example .env
```

Edite o `.env` e cole suas credenciais:

```env
VITE_FIREBASE_API_KEY=AIzaSyC...
VITE_FIREBASE_AUTH_DOMAIN=oficina-erp.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=oficina-erp
VITE_FIREBASE_STORAGE_BUCKET=oficina-erp.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

---

## 5️⃣ Iniciar Aplicativo

```bash
npm run dev
```

---

## 6️⃣ Migrar Dados

1. Faça **login** no app
2. Clique no botão **"🔥 Painel de Migração"** (canto inferior direito)
3. Clique em **"🔍 Verificar Dados"**
4. Clique em **"🚀 Migrar Tudo"**
5. Aguarde a conclusão

✅ **Pronto!** Seus dados agora estão na nuvem!

---

## 🔧 Troubleshooting

### Erro: "User not authenticated"
- **Causa:** Tentou migrar sem fazer login
- **Solução:** Faça login antes de abrir o painel

### Erro: "Permission denied"
- **Causa:** Regras de segurança mal configuradas
- **Solução:** Verifique as regras no Firebase Console

### Botão de migração não aparece
- **Causa:** Variáveis de ambiente não configuradas
- **Solução:** Verifique se o `.env` está correto e reinicie o servidor

### Dados não aparecem após migração
- **Causa:** Cache do navegador
- **Solução:** Recarregue a página (Ctrl+R ou F5)

---

## 📚 Documentação Completa

Consulte [docs/FIREBASE_MIGRATION.md](docs/FIREBASE_MIGRATION.md) para mais detalhes.

---

## 🎉 Próximos Passos

- ✅ Dados migrados
- 🔄 Testar sincronização em tempo real
- 📱 Testar em múltiplos dispositivos
- 🔒 Revisar regras de segurança (opcional)
- 📊 Monitorar uso no Firebase Console

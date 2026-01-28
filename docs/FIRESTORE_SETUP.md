# 🔥 Guia Rápido: Firebase Firestore Setup

## ✅ Migração Concluída!

Seu sistema **Oficina ERP** agora possui:

- ✅ **Sincronização em nuvem** via Firebase Firestore
- ✅ **Cache offline** automático
- ✅ **Atualizações em tempo real** entre dispositivos
- ✅ **Fallback inteligente** (Firestore → LocalStorage → Tauri)
- ✅ **Indicador visual** de status de sync

---

## 🚀 Setup em 4 Passos

### **1. Instalar Firebase**
```bash
npm install firebase
```

### **2. Criar Projeto Firebase**

1. Acesse [Firebase Console](https://console.firebase.google.com/)
2. Clique em **"Adicionar projeto"**
3. Escolha um nome (ex: `oficina-erp`)
4. Desabilite Google Analytics (opcional)
5. Clique em **"Criar projeto"**

### **3. Configurar Firestore**

No projeto criado:

1. **Firestore Database**
   - Menu lateral → **Build** → **Firestore Database**
   - Clique em **"Criar banco de dados"**
   - Escolha **"Iniciar no modo de produção"**
   - Selecione localização (ex: `southamerica-east1`)

2. **Authentication**
   - Menu lateral → **Build** → **Authentication**
   - Clique em **"Começar"**
   - Habilite **"Google"** e **"E-mail/senha"**

3. **Regras de Segurança** (Firestore Database → Regras)
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       // Cada usuário só acessa seus próprios dados
       match /users/{userId}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```

### **4. Configurar Credenciais**

1. No Firebase Console, clique no ícone de **engrenagem** → **Configurações do projeto**
2. Role até **"Seus aplicativos"** → clique no ícone **Web** (`</>`)
3. Registre o app (nome: `Oficina ERP Web`)
4. Copie as credenciais

5. **Crie o arquivo `.env`** na raiz do projeto:
   ```bash
   cp .env.example .env
   ```

6. **Cole as credenciais** no `.env`:
   ```env
   VITE_FIREBASE_API_KEY=AIzaSyC...
   VITE_FIREBASE_AUTH_DOMAIN=oficina-erp.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=oficina-erp
   VITE_FIREBASE_STORAGE_BUCKET=oficina-erp.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
   VITE_FIREBASE_APP_ID=1:123456789:web:abc123
   ```

7. **Reinicie o servidor de desenvolvimento**:
   ```bash
   npm run dev
   ```

---

## 🔍 Verificação

### **Console do Navegador**

Ao abrir o app, você deve ver:

```
🔥 FIREBASE FIRESTORE DISPONÍVEL
✅ Serviços criados:
  • src/config/firebase.ts
  • src/services/firestoreService.ts
...
🔄 Carregando banco (Firestore)...
🔥 Firestore ativo: seuemail@gmail.com
✅ Carregados X registros
```

### **Indicador Visual**

No canto inferior direito da tela, você verá:

- 🔥 **Firestore** (laranja) = Sincronizado na nuvem
- 💾 **Cache Local** (roxo) = Offline, usando cache
- ⚠️ **Offline** (cinza) = Sem conexão
- 🔄 **Sincronizando...** (verde) = Salvando dados

---

## 🏛️ Arquitetura

### **Estrutura no Firestore**

```
users/
  ├── {userId}/
      ├── clientes/          # CRM
      ├── processos/         # Ordens de Serviço
      ├── financeiro/        # Lançamentos
      ├── oficina/           # Catálogo (peças + serviços)
      └── config/            # Configurações
```

### **Fluxo de Dados**

1. **Usuário faz login** → Firebase Auth autentica
2. **DatabaseContext carrega** dados do Firestore
3. **Cache local** é atualizado (LocalStorage)
4. **Listeners em tempo real** monitoram mudanças
5. **Auto-save** sincroniza alterações (debounce 2s)

### **Prioridades de Storage**

1. **Firestore** (se autenticado + online)
2. **Tauri** (se desktop app)
3. **LocalStorage** (cache de fallback)

---

## 🛠️ Troubleshooting

### **Erro: "Firebase not configured"**

✅ **Solução:** Verifique se o `.env` existe e contém todas as variáveis.

```bash
cat .env  # Linux/Mac
type .env  # Windows
```

### **Erro: "Permission denied"**

✅ **Solução:** Configure as regras de segurança no Firestore (passo 3 acima).

### **Indicador mostra "Cache Local" após login**

✅ **Solução:** 
1. Abra DevTools (F12) → Console
2. Veja se há erros do Firebase
3. Verifique se está online (teste: `navigator.onLine`)

### **Dados não sincronizam entre dispositivos**

✅ **Solução:**
1. Faça login com a mesma conta em ambos
2. Aguarde alguns segundos (debounce)
3. Verifique no Firebase Console se os dados estão lá

---

## 📚 Documentos Relacionados

- [FIREBASE_MIGRATION.md](./FIREBASE_MIGRATION.md) - Guia técnico completo
- [.env.example](../.env.example) - Template de configuração
- [Firebase Console](https://console.firebase.google.com/)
- [Firestore Documentation](https://firebase.google.com/docs/firestore)

---

## ✨ Recursos Adicionais

### **Multi-dispositivo**

Agora você pode:
- ✅ Abrir o sistema em vários computadores
- ✅ Ver alterações em tempo real
- ✅ Trabalhar offline (com cache)
- ✅ Sincronizar automaticamente ao voltar online

### **Backup Automático**

Todos os dados ficam na nuvem:
- 🛡️ Protegidos contra perda de dados local
- ♻️ Recuperáveis em caso de formatação
- 🔄 Sincronizados automaticamente

---

## 🎉 Pronto!

Seu sistema agora está na nuvem! 🚀

Qualquer dúvida, consulte a [documentação técnica](./FIREBASE_MIGRATION.md).

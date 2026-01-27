# 🔥 Migração para Firebase Firestore

## 🎯 Objetivo

Substituir o **IndexedDB** (armazenamento local) pelo **Firebase Firestore** (nuvem + cache offline).

---

## 📄 **Vantagens da Migração**

| Recurso | IndexedDB | Firebase Firestore |
|---------|-----------|--------------------|
| **Sincronização** | ❌ Local apenas | ✅ Nuvem + Tempo Real |
| **Multi-dispositivo** | ❌ Não suporta | ✅ Acesso de qualquer lugar |
| **Backup automático** | ❌ Manual | ✅ Automático |
| **Cache offline** | ✅ Sim | ✅ Sim (melhor) |
| **Escalabilidade** | ❌ Limitado | ✅ Ilimitado |

---

## 🛠️ **Passo a Passo**

### **1️⃣ Criar Projeto no Firebase Console**

1. Acesse [Firebase Console](https://console.firebase.google.com/)
2. Clique em **"Adicionar Projeto"**
3. Dê um nome (ex: `oficina-erp`)
4. Desabilite o Google Analytics (opcional)
5. Clique em **"Criar Projeto"**

---

### **2️⃣ Configurar Firestore Database**

1. No menu lateral, clique em **"Firestore Database"**
2. Clique em **"Criar banco de dados"**
3. **Modo de produção** (recomendado)
4. Escolha a localização: **`southamerica-east1` (São Paulo)**
5. Aguarde a criação

#### **Configurar Regras de Segurança**

Vá em **Firestore > Regras** e cole:

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

Clique em **"Publicar"**.

---

### **3️⃣ Configurar Authentication**

1. No menu lateral, clique em **"Authentication"**
2. Clique em **"Começar"**
3. Ative os provedores:
   - ✅ **Email/Senha**
   - ✅ **Google** (opcional)

#### **Configurar Google Sign-In** (se usar)

1. Em **Authentication > Provedores de Login > Google**
2. Ative o provedor
3. Configure o nome público e email de suporte
4. Salve

---

### **4️⃣ Obter Credenciais do Firebase**

1. Vá em **Configurações do Projeto** (⚙️ ícone no topo)
2. Role até **"Seus aplicativos"**
3. Clique no ícone **Web** (`</>`)
4. Dê um nome (ex: `oficina-erp-web`)
5. **NÃO** marque "Firebase Hosting"
6. Clique em **"Registrar app"**
7. Copie o objeto `firebaseConfig`

---

### **5️⃣ Configurar Variáveis de Ambiente**

Na **raiz do projeto**, crie o arquivo `.env`:

```bash
cp .env.example .env
```

Edite o `.env` e cole as credenciais:

```env
VITE_FIREBASE_API_KEY=AIzaSyC...
VITE_FIREBASE_AUTH_DOMAIN=oficina-erp.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=oficina-erp
VITE_FIREBASE_STORAGE_BUCKET=oficina-erp.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

---

### **6️⃣ Instalar Dependências**

```bash
npm install firebase
```

Ou com Yarn:

```bash
yarn add firebase
```

---

### **7️⃣ Migrar o Código**

Substitua as importações de `storageService` por `firestoreService`:

#### **Antes (IndexedDB):**

```typescript
import {
  saveToLocal,
  getAllFromLocal,
  putInLocal,
  deleteFromLocal
} from './services/storageService';
```

#### **Depois (Firestore):**

```typescript
import {
  saveToFirestore as saveToLocal,
  getAllFromFirestore as getAllFromLocal,
  putInFirestore as putInLocal,
  deleteFromFirestore as deleteFromLocal
} from './services/firestoreService';
```

**Ou use aliases no import:**

```typescript
import * as storage from './services/firestoreService';

// Uso:
await storage.saveToFirestore('processos', data);
await storage.getAllFromFirestore('clientes');
```

---

### **8️⃣ Migrar Dados Existentes** (Opcional)

Se você já tem dados no IndexedDB e quer migrá-los:

```typescript
import { exportAllData as exportLocal } from './services/storageService';
import { importAllData as importFirestore } from './services/firestoreService';

// 1. Exportar do IndexedDB
const backup = await exportLocal();

// 2. Importar para o Firestore
await importFirestore(backup);

console.log('✅ Migração concluída!');
```

**Atenção:** Execute isso **UMA VEZ** apenas, de preferência no console do navegador.

---

## 📚 **Exemplos de Uso**

### **Salvar Processos**

```typescript
import { putInFirestore } from './services/firestoreService';

const novoProcesso = {
  id: 'OS-2026-001',
  cliente: 'João Silva',
  veiculo: 'Gol 2015',
  status: 'ORCAMENTO',
  valor: 1500.00
};

await putInFirestore('processos', novoProcesso);
```

### **Buscar Todos os Clientes**

```typescript
import { getAllFromFirestore } from './services/firestoreService';

const clientes = await getAllFromFirestore('clientes');
console.log(clientes);
```

### **Listener em Tempo Real**

```typescript
import { subscribeToCollection } from './services/firestoreService';

const unsubscribe = subscribeToCollection('processos', (processos) => {
  console.log('🔄 Dados atualizados:', processos);
  // Atualizar estado do React aqui
});

// Para parar de escutar:
unsubscribe();
```

### **Buscar com Filtros**

```typescript
import { queryFirestore } from './services/firestoreService';
import { where, orderBy } from 'firebase/firestore';

const processosFinalizados = await queryFirestore('processos', [
  where('status', '==', 'FINALIZADO'),
  orderBy('createdAt', 'desc')
]);
```

---

## ✅ **Checklist de Migração**

- [ ] Projeto criado no Firebase Console
- [ ] Firestore habilitado com regras de segurança
- [ ] Authentication configurado (Email/Senha + Google)
- [ ] Arquivo `.env` criado com credenciais
- [ ] Dependência `firebase` instalada
- [ ] Importações atualizadas no código
- [ ] Dados migrados (se necessário)
- [ ] Testado login e CRUD

---

## 🔍 **Troubleshooting**

### **Erro: "User not authenticated"**

- **Causa:** Tentou acessar Firestore sem fazer login
- **Solução:** Sempre use `auth.currentUser` antes de chamar os serviços

### **Erro: "Permission denied"**

- **Causa:** Regras de segurança mal configuradas
- **Solução:** Verifique as regras no Firebase Console > Firestore > Regras

### **Dados não aparecem**

- **Causa:** Usuário não autenticado ou coleção vazia
- **Solução:** Verifique `auth.currentUser` e adicione dados manualmente no Console

---

## 📊 **Monitoramento**

Acompanhe o uso no **Firebase Console > Firestore > Uso**:

- **Leituras/Escritas diárias**
- **Tamanho do banco**
- **Número de documentos**

**Plano Gratuito (Spark):**
- 50.000 leituras/dia
- 20.000 escritas/dia
- 1 GB de armazenamento

---

## 🚀 **Próximos Passos**

1. ✅ Migrar banco de dados
2. 🔄 Implementar sincronização em tempo real
3. 📱 Testar em múltiplos dispositivos
4. 📊 Configurar analytics (opcional)
5. 🔒 Revisar regras de segurança

---

🎉 **Parabéns! Seu sistema agora está na nuvem!** 🎉

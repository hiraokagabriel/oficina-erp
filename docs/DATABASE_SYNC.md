# 🔄 Sistema de Sincronização do Banco de Dados

## 🎯 Visão Geral

Sistema completo de sincronização bidirecional entre Firestore (nuvem) e LocalStorage (cache local) com suporte a modo offline, backup automático e reset controlado.

---

## ✨ Funcionalidades

### 🔑 Principais
- ✅ **Sincronização Automática** no primeiro login
- ✅ **Cache Local** (LocalStorage) para modo offline
- ✅ **Sincronização em Tempo Real** com Firestore snapshots
- ✅ **Merge Inteligente** de dados locais e remotos
- ✅ **Indicador Visual** de status (online/offline/syncing/error)
- ✅ **Reset do Banco** com autenticação obrigatória
- ✅ **Backup Automático** antes de operações destrutivas
- ✅ **Detecção de Conflitos** com estratégia remote-wins
- ✅ **Modo Offline** completo com sincronização posterior

---

## 📚 Arquitetura

### Estrutura do Sistema

```
Firestore (Nuvem)
  │
  ├─ users/{userId}/data/database
  │  └─ DatabaseSchema + _metadata
  │
  ├─ users/{userId}/metadata/sync
  │  └─ SyncMetadata (timestamps, counts)
  │
  └─ users/{userId}/backups/backup_{timestamp}
     └─ Backups automáticos

      ↕️ (Sincronização Bidirecional)

LocalStorage (Cache)
  ├─ oficina-erp-data: DatabaseSchema
  └─ device-id: ID único do dispositivo
```

### Fluxo de Sincronização

```
1. Usuário faz Login
   ↓
2. syncService.initialize(userId)
   ↓
3. Verifica se é primeiro login
   │
   ├── SIM → Upload dados locais → Firestore
   │
   └── NÃO → Download Firestore → Merge → Cache local
   ↓
4. Ativa listener tempo real
   ↓
5. Monitora mudanças (local ↔ remoto)
```

---

## 🚀 Como Usar

### 1. Instalação

Já vem integrado! Não precisa instalar nada.

### 2. Hook React (Recomendado)

```typescript
import { useDatabaseSync } from './hooks/useDatabaseSync';

function App() {
  const { status, isInitialized, syncNow, uploadData, createBackup } = useDatabaseSync();

  return (
    <div>
      <p>Status: {status.isSyncing ? 'Sincronizando...' : 'Online'}</p>
      <button onClick={syncNow}>Sincronizar Agora</button>
    </div>
  );
}
```

### 3. Indicador Visual

```typescript
import SyncIndicator from './components/SyncIndicator';

function Header() {
  return (
    <header>
      <SyncIndicator showDetails={true} />
    </header>
  );
}
```

### 4. Modal de Reset

```typescript
import DatabaseResetModal from './modals/DatabaseResetModal';

function Settings() {
  const [showResetModal, setShowResetModal] = useState(false);

  return (
    <div>
      <button onClick={() => setShowResetModal(true)}>
        Resetar Banco de Dados
      </button>

      <DatabaseResetModal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        onSuccess={() => {
          console.log('Banco resetado!');
          window.location.reload();
        }}
      />
    </div>
  );
}
```

### 5. Uso Direto do Service

```typescript
import { syncService } from './services/syncService';

// Inicializar manualmente
await syncService.initialize(userId);

// Sincronizar dados
await syncService.syncFromFirestore();
await syncService.syncToFirestore(data);

// Criar backup
await syncService.createBackup();

// Resetar banco
await syncService.resetDatabase();

// Monitorar status
syncService.onStatusChange((status) => {
  console.log('Status:', status);
});

// Cleanup
syncService.cleanup();
```

---

## 🛠️ Configuração do Firestore

### Rules de Segurança (Obrigatório)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Dados do usuário
    match /users/{userId} {
      // Permite acesso apenas ao próprio usuário
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      // Subcollections
      match /data/{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
      
      match /metadata/{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
      
      match /backups/{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

### Indexes (Recomendado)

```javascript
// Firebase Console → Firestore → Indexes

// Collection: users/{userId}/data
// Fields: _metadata.lastModified (Descending)

// Collection: users/{userId}/backups  
// Fields: createdAt (Descending)
```

---

## 📊 Status de Sincronização

### Estados Possíveis

| Status | Ícone | Descrição |
|--------|------|-------------|
| **Online** | ✅ | Conectado e sincronizado |
| **Syncing** | 🔄 | Sincronizando dados |
| **Offline** | 🚫 | Sem conexão, usando cache |
| **Error** | ⚠️ | Erro de sincronização |

### Interface `SyncStatus`

```typescript
interface SyncStatus {
  isOnline: boolean;      // Conexão com internet
  isSyncing: boolean;     // Sincronização em andamento
  lastSync: Date | null;  // Última sincronização
  error: string | null;   // Mensagem de erro
}
```

---

## 🔒 Reset do Banco de Dados

### Processo de Reset

1. **Usuário clica** em "Resetar Banco"
2. **Modal de confirmação** é exibido
3. **Usuário confirma** a ação
4. **Modal de senha** é exibido
5. **Usuário digita senha** atual
6. **Reautenticação** no Firebase
7. **Backup automático** é criado
8. **Dados são apagados** (local + remoto)
9. **Estrutura vazia** é criada
10. **Sucesso!** ✅

### Segurança

- ⚠️ **Requer senha** do usuário logado
- 💾 **Backup automático** antes de apagar
- ❌ **Não pode ser desfeito** (exceto restaurando backup)
- 🔒 **Reautenticação obrigatória**

---

## 💾 Sistema de Backup

### Backup Automático

Backups são criados automaticamente:
- Antes de resetar o banco
- Podem ser criados manualmente com `createBackup()`

### Estrutura do Backup

```typescript
// Firestore: users/{userId}/backups/backup_{timestamp}
{
  data: DatabaseSchema,      // Dados completos
  createdAt: Timestamp,      // Data/hora
  deviceId: string          // ID do dispositivo
}
```

### Listar Backups

```typescript
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db, auth } from './lib/firebase';

async function listBackups() {
  const userId = auth.currentUser?.uid;
  if (!userId) return [];

  const backupsRef = collection(db, 'users', userId, 'backups');
  const q = query(backupsRef, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}
```

### Restaurar Backup

```typescript
import { doc, getDoc } from 'firebase/firestore';
import { syncService } from './services/syncService';

async function restoreBackup(backupId: string) {
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Não autenticado');

  // Busca backup
  const backupRef = doc(db, 'users', userId, 'backups', backupId);
  const backupSnap = await getDoc(backupRef);

  if (!backupSnap.exists()) {
    throw new Error('Backup não encontrado');
  }

  const backupData = backupSnap.data();
  
  // Restaura dados
  await syncService.syncToFirestore(backupData.data);
  
  console.log('✅ Backup restaurado com sucesso!');
}
```

---

## 🧠 Merge Inteligente

### Estratégia: Remote Wins

Quando há conflito entre dados locais e remotos:

1. **Dados remotos têm prioridade** (mais recentes)
2. **Dados locais exclusivos são preservados** (não existem no remoto)
3. **Merge por ID** em arrays (ledger, workOrders, clients, etc)

### Exemplo de Merge

```typescript
// Local
ledger: [
  { id: '1', description: 'Item A', amount: 100 },
  { id: '2', description: 'Item B', amount: 200 }
]

// Remoto
ledger: [
  { id: '1', description: 'Item A Editado', amount: 150 },
  { id: '3', description: 'Item C', amount: 300 }
]

// Resultado do Merge
ledger: [
  { id: '1', description: 'Item A Editado', amount: 150 }, // Remote wins
  { id: '2', description: 'Item B', amount: 200 },        // Local preservado
  { id: '3', description: 'Item C', amount: 300 }         // Remote adicionado
]
```

---

## 🔥 Modo Offline

### Funcionalidades

- ✅ **Leitura completa** dos dados em cache
- ✅ **Escrita local** com sincronização posterior
- ✅ **Indicador visual** de status offline
- ✅ **Sincronização automática** ao voltar online
- ✅ **Sem perda de dados** – tudo é sincronizado depois

### Como Funciona

```typescript
// Detecta mudança de conexão
window.addEventListener('online', () => {
  console.log('✅ Online! Sincronizando...');
  syncService.syncFromFirestore();
});

window.addEventListener('offline', () => {
  console.log('🚫 Offline. Usando cache local.');
});
```

---

## 🐞 Troubleshooting

### Erro: "Usuário não autenticado"

**Solução:**
```typescript
// Certifique-se de chamar initialize() após login
await syncService.initialize(user.uid);
```

### Erro: "Permission denied" no Firestore

**Solução:**
- Verifique as rules de segurança no Firestore
- Garanta que `request.auth.uid == userId`

### Dados não sincronizando

**Diagnóstico:**
```typescript
const status = syncService.getStatus();
console.log('Status:', status);

// Verifica:
// - isOnline: true?
// - isSyncing: false?
// - error: null?
```

**Solução:**
```typescript
// Forçar sincronização manual
await syncService.syncFromFirestore();
```

### Reset não funciona

**Possíveis causas:**
- Senha incorreta
- Usuário logado com Google (não tem senha)

**Solução para Google:**
```typescript
// Adicionar suporte a reauthenticateWithPopup
import { GoogleAuthProvider, reauthenticateWithPopup } from 'firebase/auth';

const provider = new GoogleAuthProvider();
await reauthenticateWithPopup(user, provider);
```

---

## 📊 Monitoramento

### Logs Automáticos

O sistema loga automaticamente:
- 🔄 Inicialização de sincronização
- ✅ Sucesso em operações
- ❌ Erros e exceções
- 💾 Criação de backups
- 🗑️ Reset do banco

### Metadata de Sincronização

```typescript
// Firestore: users/{userId}/metadata/sync
interface SyncMetadata {
  lastSyncTimestamp: number;
  lastSyncDate: string;
  syncCount: number;          // Total de sincronizações
  userId: string;
  deviceId: string;
}
```

### Firebase Console

1. **Firestore → Data**
   - Veja estrutura de dados
   - Monitore mudanças em tempo real

2. **Firestore → Usage**
   - Reads, Writes, Deletes
   - Custo estimado

---

## ⚡ Performance

### Otimizações

- ✅ **Cache local** reduz reads do Firestore
- ✅ **Merge inteligente** evita rewrites desnecessários
- ✅ **Snapshots em tempo real** só para mudanças
- ✅ **Batching** em operações múltiplas (futuro)

### Limitações do Firestore

| Operação | Limite Gratuito/Dia |
|-----------|---------------------|
| Reads | 50.000 |
| Writes | 20.000 |
| Deletes | 20.000 |
| Armazenamento | 1 GB |

---

## 🚀 Próximos Passos

### Melhorias Futuras

- [ ] **Batching** de operações múltiplas
- [ ] **IndexedDB** ao invés de LocalStorage (maior capacidade)
- [ ] **Comprimir dados** antes de salvar
- [ ] **Sincronização incremental** (apenas mudanças)
- [ ] **Versionamento** de dados com histórico
- [ ] **Restauração de backup** via UI
- [ ] **Export/Import** manual de dados
- [ ] **Multi-device sync** com resolução de conflitos avançada

---

## 📝 Checklist de Integração

### Firestore
- [ ] Rules de segurança configuradas
- [ ] Indexes criados (se necessário)
- [ ] Testes de leitura/escrita funcionando

### Código
- [ ] `syncService.initialize()` chamado após login
- [ ] `syncService.cleanup()` chamado no logout
- [ ] `SyncIndicator` visível no header
- [ ] `DatabaseResetModal` acessível nas configurações
- [ ] Tratamento de erros implementado

### Testes
- [ ] Primeiro login sincroniza dados
- [ ] Modo offline funciona
- [ ] Sincronização em tempo real ativa
- [ ] Reset com senha funciona
- [ ] Backup é criado antes de reset

---

## 📚 Referências

- [Firebase Firestore Docs](https://firebase.google.com/docs/firestore)
- [Offline Data](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- [Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [Best Practices](https://firebase.google.com/docs/firestore/best-practices)

---

**✅ Sistema de sincronização completo e pronto para uso!**

**Desenvolvido por Gabriel Ferigato** 💜

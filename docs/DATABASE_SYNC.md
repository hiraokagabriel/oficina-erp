# 💾 Sistema de Sincronização Híbrida (Cloud + Local)

## 🎯 Visão Geral

Sistema completo de sincronização de banco de dados com arquitetura híbrida:
- **Firebase Firestore** (nuvem)
- **IndexedDB** (local no navegador)
- **Sincronização automática** bidirecional
- **Backup e restauração** de dados
- **Reset autenticado** do banco

---

## ✨ Funcionalidades

### 🔄 Sincronização
- ✅ **Primeiro Login**: Baixa todos os dados da nuvem para local
- ✅ **Sincronização Incremental**: Apenas dados modificados
- ✅ **Tempo Real**: Atualizações instantâneas via listeners
- ✅ **Offline First**: Funciona sem internet
- ✅ **Auto-Sync**: Sincroniza quando voltar online

### 💾 Armazenamento Local
- ✅ **IndexedDB**: Banco estruturado no navegador
- ✅ **Persistência**: Dados salvos localmente
- ✅ **Performance**: Acesso instantâneo aos dados
- ✅ **Backup Automático**: Cache local sempre atualizado

### 🛡️ Segurança
- ✅ **Reset Autenticado**: Requer senha para resetar
- ✅ **Usuário Específico**: Cada usuário vê apenas seus dados
- ✅ **Backup Download**: Exportar dados em JSON
- ✅ **Restore Upload**: Importar backup anterior

---

## 🏛️ Arquitetura

### Camadas

```
┌──────────────────────────────────┐
│          APLICAÇÃO (React)         │
└──────────────┬───────────────────┘
               │
       ┌───────┼───────┐
       │               │
       ↓               ↓
┌──────────┐   ┌──────────────────┐
│ IndexedDB │   │  Firestore      │
│  (Local)  │⇄─│  (Cloud/Rede)   │
│  Offline  │   │  Real-time Sync │
│  Cache    │   │  Multi-device   │
└──────────┘   └──────────────────┘
```

### Fluxo de Dados

#### Primeiro Login
```
Usuário Loga → Sync Service Inicializa
    │
    └──→ Verifica IndexedDB
         │
         ├─ Vazio? → Sincronização Completa
         │            │
         │            └─→ Baixa TUDO do Firestore
         │                 │
         │                 └─→ Salva em IndexedDB
         │                      │
         │                      └─→ Pronto para usar!
         │
         └─ Tem dados? → Sincronização Incremental
                        │
                        └─→ Baixa apenas novos/modificados
```

#### Operação Normal (Online)
```
Usuário cria/edita dado
    │
    ├─→ Salva em IndexedDB (instantâneo)
    │
    └─→ Sincroniza com Firestore (background)
         │
         └─→ Firestore propaga para outros dispositivos
```

#### Operação Offline
```
Usuário cria/edita dado (sem internet)
    │
    ├─→ Salva em IndexedDB (funciona normalmente)
    │
    └─→ Marca como "pending sync"
         │
         └─→ Quando voltar online:
              └─→ Sincroniza automaticamente
```

---

## 📝 Estrutura do IndexedDB

### Object Stores (Tabelas)

```typescript
clients: {
  id: string (PK)
  name: string
  email: string
  phone: string
  // ... outros campos
  userId: string
  updatedAt: timestamp
  _localUpdatedAt: timestamp
}

orders: {
  id: string (PK)
  clientId: string
  items: array
  total: number
  status: string
  // ... outros campos
  userId: string
  updatedAt: timestamp
  _localUpdatedAt: timestamp
}

processes: {
  id: string (PK)
  title: string
  description: string
  status: string
  // ... outros campos
  userId: string
  updatedAt: timestamp
  _localUpdatedAt: timestamp
}

financial: {
  id: string (PK)
  type: 'income' | 'expense'
  amount: number
  category: string
  date: timestamp
  // ... outros campos
  userId: string
  updatedAt: timestamp
  _localUpdatedAt: timestamp
}

sync_metadata: {
  key: 'main'
  lastSync: timestamp
  userId: string
  version: string
  deviceId: string
}
```

---

## 🚀 Implementação

### Instalação de Dependências

```bash
npm install idb
```

### Uso Básico

```typescript
import { syncService } from './services/syncService';

// 1. Inicializar (no App.tsx ou após login)
await syncService.initialize();

// 2. Obter dados locais (instantâneo)
const clients = await syncService.getLocalData('clients');

// 3. Salvar dados (auto-sync)
await syncService.saveLocal('clients', {
  id: 'client-123',
  name: 'João Silva',
  email: 'joao@email.com',
  // ...
});

// 4. Deletar dados
await syncService.deleteLocal('clients', 'client-123');

// 5. Monitorar status de sync
syncService.onStatusChange((status) => {
  console.log('Online:', status.isOnline);
  console.log('Última sync:', status.lastSync);
  console.log('Sincronizando:', status.isSyncing);
  console.log('Pendentes:', status.pendingChanges);
});
```

---

## 💾 Backup e Restauração

### Criar e Baixar Backup

```typescript
// Botão na interface
async function handleBackup() {
  try {
    await syncService.downloadBackup();
    alert('Backup criado com sucesso!');
  } catch (error) {
    console.error('Erro ao criar backup:', error);
    alert('Erro ao criar backup');
  }
}
```

### Restaurar Backup

```typescript
// Input de arquivo na interface
async function handleRestore(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!confirm('Restaurar backup? Dados atuais serão substituídos!')) {
    return;
  }

  try {
    await syncService.restoreFromBackup(file);
    // Página recarrega automaticamente
  } catch (error) {
    console.error('Erro ao restaurar:', error);
    alert('Erro ao restaurar backup');
  }
}
```

---

## 🛡️ Reset do Banco de Dados

### Com Autenticação

```typescript
async function handleReset() {
  const password = prompt('🔑 Digite sua senha para confirmar o RESET:');
  
  if (!password) return;

  if (!confirm('⚠️ ATENÇÃO: Isso apagará TODOS os dados! Continuar?')) {
    return;
  }

  try {
    await syncService.resetDatabase(password);
    alert('✅ Banco de dados resetado com sucesso!');
    window.location.reload();
  } catch (error) {
    if (error.message === 'Senha incorreta') {
      alert('❌ Senha incorreta!');
    } else {
      alert('❌ Erro ao resetar banco de dados');
    }
    console.error(error);
  }
}
```

---

## 🎨 Componente de Controle

Exemplo de componente React para gerenciar sincronização:

```tsx
import { useState, useEffect } from 'react';
import { syncService, SyncStatus } from '../services/syncService';

function SyncControl() {
  const [status, setStatus] = useState<SyncStatus>(syncService.getStatus());
  const [showResetDialog, setShowResetDialog] = useState(false);

  useEffect(() => {
    syncService.onStatusChange(setStatus);
  }, []);

  return (
    <div className="sync-control">
      {/* Status Indicator */}
      <div className="status-badge">
        <span className={status.isOnline ? 'dot-green' : 'dot-red'} />
        {status.isOnline ? 'Online' : 'Offline'}
      </div>

      {/* Last Sync */}
      {status.lastSync && (
        <div className="last-sync">
          Última sincronização: {status.lastSync.toLocaleTimeString()}
        </div>
      )}

      {/* Syncing Indicator */}
      {status.isSyncing && (
        <div className="syncing">
          <span className="spinner" />
          Sincronizando...
        </div>
      )}

      {/* Pending Changes */}
      {status.pendingChanges > 0 && (
        <div className="pending">
          {status.pendingChanges} alterações pendentes
        </div>
      )}

      {/* Actions */}
      <div className="actions">
        <button onClick={() => syncService.incrementalSync()}>
          🔄 Forçar Sync
        </button>
        
        <button onClick={() => syncService.downloadBackup()}>
          💾 Backup
        </button>
        
        <label className="btn-secondary">
          📝 Restaurar
          <input 
            type="file" 
            accept=".json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) syncService.restoreFromBackup(file);
            }}
            style={{ display: 'none' }}
          />
        </label>

        <button 
          onClick={() => setShowResetDialog(true)}
          className="btn-danger"
        >
          🛡️ Reset Banco
        </button>
      </div>

      {/* Reset Dialog */}
      {showResetDialog && (
        <ResetDialog 
          onConfirm={async (password) => {
            await syncService.resetDatabase(password);
            setShowResetDialog(false);
          }}
          onCancel={() => setShowResetDialog(false)}
        />
      )}
    </div>
  );
}
```

---

## 📊 Monitoramento

### Console Logs

O SyncService produz logs detalhados:

```
💾 IndexedDB inicializado com sucesso
🆕 Primeiro login detectado - iniciando sincronização completa
📥 Baixando clients...
✅ clients: 45 itens salvos localmente
📥 Baixando orders...
✅ orders: 128 itens salvos localmente
✅ Sincronização completa finalizada!
✅ Listeners em tempo real ativados
🔄 Real-time: clients/client-123 modified
☁️ Sincronizado para cloud: clients/client-123
```

### DevTools

**Application Tab** (Chrome):
- IndexedDB → `oficina-erp-local` → Ver dados salvos
- Storage → Ver tamanho usado

---

## ⚡ Performance

### Otimizações Implementadas

1. **Lazy Loading**: Apenas dados necessários
2. **Sincronização Incremental**: Apenas deltas
3. **Batch Operations**: Múltiplas operações em uma transação
4. **IndexedDB Indexes**: Busca rápida por updatedAt
5. **Real-time Listeners**: Apenas para usuário atual

### Limites

- **IndexedDB**: ~50-100 MB por origem (navegador dependente)
- **Firestore**: 1 MB por documento, 1 escrita/segundo por documento
- **Real-time Listeners**: 100 listeners simultâneos

---

## 🛡️ Segurança

### Firestore Rules

Adicionar no Firebase Console:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Função auxiliar
    function isOwner(userId) {
      return request.auth != null && request.auth.uid == userId;
    }
    
    // Clientes
    match /clients/{clientId} {
      allow read, write: if isOwner(resource.data.userId);
      allow create: if isOwner(request.resource.data.userId);
    }
    
    // Pedidos
    match /orders/{orderId} {
      allow read, write: if isOwner(resource.data.userId);
      allow create: if isOwner(request.resource.data.userId);
    }
    
    // Processos
    match /processes/{processId} {
      allow read, write: if isOwner(resource.data.userId);
      allow create: if isOwner(request.resource.data.userId);
    }
    
    // Financeiro
    match /financial/{financialId} {
      allow read, write: if isOwner(resource.data.userId);
      allow create: if isOwner(request.resource.data.userId);
    }
  }
}
```

---

## ❓ FAQ

### O que acontece se eu usar em múltiplos dispositivos?
**R**: Dados sincronizam automaticamente entre dispositivos. Mudanças em um aparecem em tempo real no outro.

### E se eu ficar offline?
**R**: Aplicativo funciona normalmente. Dados são salvos localmente e sincronizam quando voltar online.

### Posso perder dados?
**R**: Não. Dados estão em 3 lugares: Firestore (cloud), IndexedDB (local) e backup JSON (download).

### Como funciona o reset?
**R**: Requer senha para confirmar. Apaga tudo do Firestore E IndexedDB. Irreversível (a menos que tenha backup).

### Quanto espaço usa?
**R**: Depende dos dados. Ex: 1000 clientes + 5000 pedidos ≈ 20-30 MB.

---

## 📚 Referências

- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [Firestore Documentation](https://firebase.google.com/docs/firestore)
- [idb Library](https://github.com/jakearchibald/idb)
- [Offline First Patterns](https://developers.google.com/web/fundamentals/instant-and-offline/offline-cookbook)

---

**💡 Desenvolvido por Gabriel Ferigato**

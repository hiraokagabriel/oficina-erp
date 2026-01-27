# Sincronização de Banco de Dados

## Visão Geral

Sistema completo de sincronização bidirecional entre LocalStorage (banco local) e Firebase Firestore (nuvem), com isolamento de dados por usuário e funcionalidades avançadas de backup e reset.

## Arquitetura

### Estrutura no Firestore

```
firestore/
└── users/
    └── {userId}/
        ├── clients/
        │   └── {clientId}: { nome, telefone, ... }
        ├── workOrders/
        │   └── {workOrderId}: { osNumber, clientName, ... }
        ├── ledger/
        │   └── {entryId}: { description, amount, type, ... }
        ├── catalogParts/
        │   └── {partId}: { name, price, ... }
        ├── catalogServices/
        │   └── {serviceId}: { name, price, ... }
        └── settings/
            └── preferences: { theme, exportPath, ... }
```

### Isolamento de Dados

Cada usuário possui uma coleção isolada identificada por `userId` (Firebase Auth UID). As regras de segurança do Firestore garantem que:

- Usuários só podem acessar suas próprias coleções
- Nenhum usuário pode ver dados de outros usuários
- Operações de leitura/escrita requerem autenticação

## Funcionalidades

### 1. Sincronização no Primeiro Login

**Fluxo:**
1. Usuário faz login
2. Sistema verifica se há dados no Firestore
3. **Se há dados locais mas não na nuvem:** Upload automático (migração)
4. **Se há dados na nuvem:** Download e substituição local
5. **Se não há dados:** Inicialização vazia

**Código:**
```typescript
const { syncStatus, syncMessage, syncService } = useDatabaseSync();

if (syncStatus === 'syncing') {
  return <LoadingScreen message={syncMessage} />;
}
```

### 2. Backup Local Automático

- Todos os dados são salvos em `localStorage` com a chave `oficina-erp-database`
- Backup atualizado em tempo real via listeners do Firestore
- Suporte para modo offline (dados locais disponíveis)

### 3. Sincronização em Tempo Real

Listeners ativos para:
- Clientes
- Ordens de Serviço
- Lançamentos Financeiros
- Catálogo de Peças
- Catálogo de Serviços

Quando outro dispositivo/aba modifica dados, a sincronização acontece automaticamente.

### 4. Reset de Banco de Dados

**Requisitos:**
- Reautenticação com senha
- Confirmação explícita do usuário

**Ações:**
- Deleta **TODOS** os dados do Firestore do usuário
- Limpa backup local
- Recarrega aplicação

**Código:**
```typescript
const [showResetModal, setShowResetModal] = useState(false);

<DatabaseResetModal 
  isOpen={showResetModal}
  onClose={() => setShowResetModal(false)}
  syncService={syncService}
/>
```

## Implementação

### Passo 1: Configurar Hook no App.tsx

```typescript
import { useDatabaseSync } from './hooks/useDatabaseSync';
import { SyncStatusIndicator } from './components/SyncStatusIndicator';
import { DatabaseResetModal } from './components/DatabaseResetModal';

function App() {
  const { syncStatus, syncMessage, syncService } = useDatabaseSync();
  const [showResetModal, setShowResetModal] = useState(false);

  // Mostrar tela de loading durante sincronização inicial
  if (syncStatus === 'syncing' && !syncService) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>{syncMessage || 'Sincronizando dados...'}</p>
      </div>
    );
  }

  // Mostrar erro se houver
  if (syncStatus === 'error') {
    return (
      <div className="error-screen">
        <h2>❌ Erro na Sincronização</h2>
        <p>{syncMessage}</p>
        <button onClick={() => window.location.reload()}>Tentar Novamente</button>
      </div>
    );
  }

  return (
    <>
      {/* Indicador de status */}
      <SyncStatusIndicator status={syncStatus} message={syncMessage} />

      {/* Seu app principal */}
      <YourMainApp />

      {/* Modal de reset (pode adicionar em ConfigPage) */}
      <DatabaseResetModal 
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        syncService={syncService}
      />
    </>
  );
}
```

### Passo 2: Adicionar Botão de Reset (ConfigPage)

```typescript
<button 
  onClick={() => setShowResetModal(true)}
  className="danger-button"
  style={{
    background: 'var(--danger-color)',
    color: 'white',
    padding: '12px 24px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 'bold'
  }}
>
  🗑️ Resetar Banco de Dados
</button>
```

### Passo 3: Configurar Regras de Segurança no Firestore

Acesse Firebase Console → Firestore Database → Regras:

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    // Cada usuário só acessa seus próprios dados
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null 
        && request.auth.uid == userId;
    }
    
    // Negar acesso a tudo mais
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

## Fluxo de Dados

### Upload (Local → Firestore)

1. Usuário modifica dados localmente
2. Componente atualiza estado React
3. DatabaseContext salva em LocalStorage
4. (Futuro) Trigger de sincronização envia para Firestore

### Download (Firestore → Local)

1. Listener detecta mudança no Firestore
2. Dados atualizados são baixados
3. LocalStorage é atualizado
4. (Opcional) Notificação visual ao usuário

## Status de Sincronização

| Status | Descrição | Ícone |
|--------|-----------|-------|
| `idle` | Aguardando | ⚪ |
| `syncing` | Sincronizando | 🔄 |
| `success` | Sucesso | ✅ |
| `error` | Erro | ❌ |
| `offline` | Modo offline | 📡 |

## Boas Práticas

### 1. Sempre use o hook useDatabaseSync

```typescript
const { syncStatus, syncMessage, syncService } = useDatabaseSync();
```

### 2. Verifique status antes de operações críticas

```typescript
if (syncStatus === 'offline') {
  alert('Você está offline. Dados serão sincronizados quando reconectar.');
}
```

### 3. Trate erros adequadamente

```typescript
if (syncStatus === 'error') {
  console.error('Erro de sincronização:', syncMessage);
  // Mostrar notificação ao usuário
}
```

### 4. Forneça feedback visual

Use o componente `SyncStatusIndicator` para mostrar status em tempo real.

## Troubleshooting

### Problema: Dados não sincronizam

**Soluções:**
1. Verificar se usuário está autenticado (`auth.currentUser`)
2. Verificar regras de segurança do Firestore
3. Verificar console do navegador para erros
4. Limpar cache do navegador

### Problema: Erro "Permission Denied"

**Causa:** Regras de segurança incorretas ou userId não corresponde.

**Solução:** Verificar regras do Firestore e garantir que `userId` no documento = `auth.currentUser.uid`

### Problema: Sincronização lenta

**Causas:**
- Grande quantidade de dados
- Conexão lenta
- Muitos listeners ativos

**Soluções:**
- Implementar paginação
- Usar queries com `limit()`
- Desativar listeners desnecessários

## Próximos Passos

### Melhorias Futuras

1. **Sincronização Incremental:** Apenas sincronizar dados modificados
2. **Compressão:** Reduzir tamanho dos dados no LocalStorage
3. **IndexedDB:** Migrar de LocalStorage para IndexedDB (mais robusto)
4. **Conflitos:** Resolver conflitos quando mesmo dado é editado em dispositivos diferentes
5. **Backup Agendado:** Backup automático para Google Drive
6. **Histórico:** Manter histórico de mudanças para rollback
7. **Export/Import:** Exportar dados para JSON/CSV

## Referências

- [Firebase Firestore Documentation](https://firebase.google.com/docs/firestore)
- [Firebase Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [React Hooks Documentation](https://react.dev/reference/react)
- [LocalStorage API](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)

---

**Desenvolvido por:** Gabriel Ferigato  
**Data:** Janeiro 2026  
**Versão:** 1.0.0

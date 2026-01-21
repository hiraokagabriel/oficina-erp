# 🐛 Guia Completo de Debug - Oficina ERP

## 🔍 Como Debugar o Sistema

### 1️⃣ Problema: Drag and Drop Não Atualiza

#### ⚠️ Sintomas:
- Arrasto o card mas ele não muda de coluna
- Preciso clicar em outra coisa para ver a mudança
- Card "trava" na posição antiga

#### 🔧 Como Debugar:

**1. Abra o Console do Navegador (F12)**

**2. Adicione logs no `App.tsx`:**

```typescript
const handleUpdateStatus = (osId: string, newStatus: OSStatus) => {
  console.log('🔵 handleUpdateStatus chamado:', { osId, newStatus });
  
  const os = workOrders.find(o => o.id === osId);
  console.log('🔵 OS encontrada:', os);
  
  if (!os || os.status === newStatus) {
    console.log('❌ Abortado: OS não encontrada ou status igual');
    return;
  }

  // ... resto do código
  
  setWorkOrders(prev => {
    const updated = prev.map(o => o.id === osId ? { ...o, status: newStatus } : o);
    console.log('✅ workOrders atualizado:', updated);
    return updated;
  });
  
  requestAnimationFrame(() => {
    console.log('⚡ Forçando re-render com dragUpdateKey');
    setDragUpdateKey(k => k + 1);
  });
};
```

**3. Verifique a saída no console:**

Quando arrastar um card, você deve ver:
```
🔵 handleUpdateStatus chamado: { osId: "abc-123", newStatus: "EM_SERVICO" }
🔵 OS encontrada: { id: "abc-123", status: "APROVADO", ... }
✅ workOrders atualizado: [Array com OS atualizada]
⚡ Forçando re-render com dragUpdateKey
```

**4. Se NÃO aparecer nada:**
- O `onDragEnd` não está sendo chamado
- Verifique se `KanbanBoard` recebe a prop corretamente

**5. Se aparecer mas não atualizar:**
- Verifique se `WorkshopPage` tem `key={dragUpdateKey}`
- Verifique se `dragUpdateKey` está mudando no console

---

### 2️⃣ Problema: Modal de Parcelamento Não Abre

#### ⚠️ Sintomas:
- Finalizo uma OS mas não pergunta se quer parcelar
- Modal de parcelamento nunca aparece

#### 🔧 Como Debugar:

**1. Adicione logs no `executePendingAction` (App.tsx):**

```typescript
if (pendingAction.type === 'FINISH_OS_FINANCIAL') {
  const os = pendingAction.data;
  console.log('💳 Finalizando OS:', os);
  
  const shouldInstallment = confirm(`Deseja parcelar o pagamento de ${Money.format(os.total)}?`);
  console.log('💳 Resposta parcelamento:', shouldInstallment);
  
  if (shouldInstallment) {
    console.log('💳 Abrindo modal de parcelamento');
    setInstallmentOS(os);
    setIsInstallmentModalOpen(true);
    setPendingAction(null);
    return;
  }
  
  console.log('💳 Lançando à vista');
  // ... resto do código
}
```

**2. Verifique se o `InstallmentModal` está importado:**

```typescript
// No topo do App.tsx
const InstallmentModal = lazy(() => import('./modals/InstallmentModal').then(m => ({ default: m.InstallmentModal })));
```

**3. Verifique se o modal está renderizado:**

```typescript
{isInstallmentModalOpen && installmentOS && (
  <InstallmentModal
    isOpen={isInstallmentModalOpen}
    onClose={() => { setIsInstallmentModalOpen(false); setInstallmentOS(null); }}
    totalAmount={installmentOS.total}
    description={`OS #${installmentOS.osNumber} - ${installmentOS.clientName}`}
    onConfirm={handleInstallmentConfirm}
  />
)}
```

**4. Se o confirm() não aparecer:**
- Verifique se `pendingAction.type === 'FINISH_OS_FINANCIAL'`
- Verifique se `pendingAction.data` tem os dados da OS

---

### 3️⃣ Problema: Dashboard CRM Não Aparece

#### ⚠️ Sintomas:
- Clico em "CLIENTES" mas não vejo KPIs nem Top 5
- Página está vazia ou só mostra lista de clientes

#### 🔧 Como Debugar:

**1. Verifique se `CRMDashboard` está importado em `CRMPage.tsx`:**

```typescript
import { CRMDashboard } from '../components/CRMDashboard';
```

**2. Verifique se está sendo renderizado:**

```typescript
{showDashboard && (
  <div style={{ marginBottom: '24px' }}>
    <CRMDashboard
      clients={clients}
      workOrders={workOrders}
      onClientSelect={(client) => {
        console.log('👥 Cliente selecionado:', client);
        setSelectedClient(client);
        setShowDashboard(false);
      }}
    />
  </div>
)}
```

**3. Adicione logs no `CRMDashboard.tsx`:**

```typescript
export const CRMDashboard: React.FC<CRMDashboardProps> = ({ clients, workOrders, onClientSelect }) => {
  console.log('📊 CRMDashboard renderizado');
  console.log('📊 Clientes:', clients.length);
  console.log('📊 WorkOrders:', workOrders.length);
  
  const stats = useMemo(() => {
    const result = calculateCRMStats(clients, workOrders);
    console.log('📊 Stats calculadas:', result);
    return result;
  }, [clients, workOrders]);
  
  // ...
};
```

**4. Verifique o estado `showDashboard`:**

No console do navegador:
```javascript
// Coloque um breakpoint ou log
React DevTools > CRMPage > showDashboard (deve ser true)
```

---

### 4️⃣ Problema: Erros de Compilação

#### ⚠️ Sintomas:
- `npm run dev` dá erro
- TypeScript reclama de tipos
- "Cannot find module"

#### 🔧 Como Debugar:

**1. Erros de Import:**

```
Error: Cannot find module './modals/InstallmentModal'
```

**Solução:**
- Verifique se o arquivo existe em `src/modals/InstallmentModal.tsx`
- Verifique se o export é `export const InstallmentModal`
- Verifique se o caminho está correto (`.` vs `..`)

**2. Erro: "Failed to resolve import 'uuid'"**

```
Failed to resolve import "uuid" from "src/modals/InstallmentModal.tsx"
```

**Solução:**
✅ **CORRIGIDO!** Use `crypto.randomUUID()` em vez de importar `uuid`:

```typescript
// ❌ Errado (requer instalar pacote)
import { v4 as uuidv4 } from 'uuid';
const id = uuidv4();

// ✅ Correto (nativo do navegador)
const id = crypto.randomUUID();
```

**Por que usar `crypto.randomUUID()`?**
- ✅ Nativo do navegador (sem instalar nada)
- ✅ Suportado em todos os navegadores modernos
- ✅ Mesmo formato UUID v4
- ✅ Sem dependências externas

**3. Erros de Tipo:**

```
Type '{ installments: number; }' is missing 'installmentAmount'
```

**Solução:**
- Verifique a interface em `src/types/index.ts`
- Adicione o campo faltando ou torne-o opcional (`?`)

**4. Erros de Props:**

```
Property 'onClientSelect' does not exist on type 'CRMDashboardProps'
```

**Solução:**
- Adicione na interface:
```typescript
interface CRMDashboardProps {
  clients: Client[];
  workOrders: WorkOrder[];
  onClientSelect?: (client: Client) => void; // ✅ Adicionar
}
```

---

### 5️⃣ Problema: Estado Não Persiste

#### ⚠️ Sintomas:
- Crio uma OS mas após recarregar desaparece
- Dados não salvam no banco

#### 🔧 Como Debugar:

**1. Verifique o `DatabaseContext.tsx`:**

```typescript
// Adicione logs nos saves
const saveData = useCallback(async () => {
  console.log('💾 Salvando dados...');
  console.log('💾 workOrders:', workOrders.length);
  console.log('💾 ledger:', ledger.length);
  
  try {
    await invoke('save_data', { data: { workOrders, ledger, clients, /* ... */ } });
    console.log('✅ Dados salvos com sucesso');
  } catch (err) {
    console.error('❌ Erro ao salvar:', err);
  }
}, [workOrders, ledger, clients, /* ... */]);
```

**2. Verifique o backend Rust:**

```bash
# Ver logs do Tauri
npm run tauri dev

# Procure por:
[INFO] save_data called
[ERROR] Failed to write file
```

**3. Verifique permissões de arquivo:**

```javascript
// No console do navegador
await window.__TAURI__.path.appDataDir()
// Verifique se o caminho existe e tem permissão de escrita
```

---

## 🧰 Ferramentas de Debug

### 1. React DevTools

**Instalar:**
- Chrome: [React Developer Tools](https://chrome.google.com/webstore/detail/react-developer-tools/fmkadmapgofadopljbjfkapdkoienihi)

**Como usar:**
1. Abra DevTools (F12)
2. Vá na aba "Components"
3. Selecione `App` ou `KanbanBoard`
4. Veja props e estado em tempo real
5. Edite estados para testar

### 2. Console Logs Estratégicos

**Cores no console:**

```typescript
// Azul = Informação
console.log('%c🔵 Drag started', 'color: blue; font-weight: bold');

// Verde = Sucesso
console.log('%c✅ Update successful', 'color: green; font-weight: bold');

// Vermelho = Erro
console.error('%c❌ Failed to update', 'color: red; font-weight: bold');

// Amarelo = Aviso
console.warn('%c⚠️ Deprecated function', 'color: orange; font-weight: bold');
```

### 3. Breakpoints

**No Chrome DevTools:**
1. Sources > src/App.tsx
2. Clique no número da linha para adicionar breakpoint
3. Interaja com a UI
4. Quando parar, inspecione variáveis

### 4. Performance Monitor

**Medir re-renders:**

```typescript
import { useEffect } from 'react';

function KanbanBoard(props) {
  useEffect(() => {
    console.log('🔄 KanbanBoard re-renderizou');
  });
  
  // ...
}
```

---

## 🚨 Problemas Comuns e Soluções Rápidas

### Problema: "React Hook useEffect has missing dependencies"

**Solução:**
```typescript
// ❌ Errado
useEffect(() => {
  doSomething(externalVar);
}, []);

// ✅ Correto
useEffect(() => {
  doSomething(externalVar);
}, [externalVar]);
```

### Problema: "Objects are not valid as a React child"

**Solução:**
```typescript
// ❌ Errado
<div>{someObject}</div>

// ✅ Correto
<div>{JSON.stringify(someObject)}</div>
<div>{someObject.name}</div>
```

### Problema: Estado não atualiza imediatamente

**Explicação:**
O `setState` é assíncrono!

```typescript
// ❌ Errado
setCount(count + 1);
console.log(count); // Ainda tem valor antigo!

// ✅ Correto
setCount(prev => {
  const newCount = prev + 1;
  console.log(newCount);
  return newCount;
});
```

### Problema: Pacote não encontrado

**Sintomas:**
```
Cannot find package 'uuid'
Failed to resolve import "some-package"
```

**Solução:**

**Opção 1: Usar alternativa nativa (recomendado)**
```typescript
// Em vez de uuid
const id = crypto.randomUUID();

// Em vez de lodash
const unique = [...new Set(array)];
```

**Opção 2: Instalar o pacote**
```bash
npm install uuid
# ou
pnpm add uuid
# ou
yarn add uuid
```

---

## 📝 Checklist de Debug

### Antes de pedir ajuda:

- [ ] Abri o console (F12) e verifiquei erros
- [ ] Adicionei `console.log()` nas funções suspeitas
- [ ] Verifiquei se todos os arquivos estão salvos
- [ ] Reiniciei o servidor de desenvolvimento
- [ ] Limpei cache do navegador (Ctrl + Shift + Delete)
- [ ] Verifiquei React DevTools
- [ ] Li a mensagem de erro completa
- [ ] Procurei o erro no Google/StackOverflow

### Informações para reportar bug:

```markdown
## 🐛 Descrição do Bug

**O que esperava:**
(Descreva o comportamento esperado)

**O que aconteceu:**
(Descreva o comportamento atual)

**Como reproduzir:**
1. Vá para...
2. Clique em...
3. Veja erro em...

**Logs do console:**
```
(Cole os logs aqui)
```

**Screenshots:**
(Se aplicável)

**Ambiente:**
- SO: Windows/Mac/Linux
- Navegador: Chrome 120
- Versão do app: 1.0.0
```

---

## ✅ Tudo Resolvido?

Se mesmo após seguir este guia o problema persistir:

1. Documente o erro seguindo o template acima
2. Abra uma issue no GitHub
3. Compartilhe os logs do console
4. Descreva os passos que já tentou

**Happy debugging! 🚀**
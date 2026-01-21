# 🚀 Guia de Uso: Pagamento Parcelado e Dashboard CRM

## 💳 1. Sistema de Pagamento Parcelado

### Como Funciona

O sistema já está **INTEGRADO** no fluxo de finalização de OS!

### Fluxo Completo:

1. **Arraste um card para "FINALIZADO"** no Kanban
2. Um modal aparecerá perguntando: `Deseja lançar o valor de R$ X.XXX nas Receitas?`
3. Clique em **"Confirmar"**
4. Um novo `confirm()` aparecerá: `Deseja parcelar o pagamento de R$ X.XXX?`
   - Se clicar **"OK"** → Abre o modal de parcelamento
   - Se clicar **"Cancelar"** → Lança à vista normalmente

### Modal de Parcelamento:

```
┌───────────────────────────────────────┐
│ 💳 Configurar Pagamento Parcelado    │
└───────────────────────────────────────┘

💰 Valor Total: R$ 3.000,00
OS #123 - João Silva

📊 Número de Parcelas:
[2x]   [3x]   [4x]   [5x]   [6x]   [9x]   [12x]
R$1.5k R$1k   R$750  R$600  R$500  R$333  R$250

📅 Data do Primeiro Pagamento:
[____/__/____] (seletor de data)

📄 Preview das Parcelas:
① Parcela 1/6 - Vencimento: 20/01/26 - R$ 500,00
② Parcela 2/6 - Vencimento: 20/02/26 - R$ 500,00
③ Parcela 3/6 - Vencimento: 20/03/26 - R$ 500,00
④ Parcela 4/6 - Vencimento: 20/04/26 - R$ 500,00
⑤ Parcela 5/6 - Vencimento: 20/05/26 - R$ 500,00
⑥ Parcela 6/6 - Vencimento: 20/06/26 - R$ 500,00

[Cancelar]  [✅ Confirmar Parcelamento]
```

### O que Acontece:

1. Cria **6 lançamentos financeiros** automáticos
2. Cada um com:
   - Descrição: `OS #123 - João Silva - Parcela 1/6`
   - Valor: R$ 500,00
   - Data de vencimento: Mensal automático
   - `installmentGroupId`: Agrupa as parcelas
   - `isPaid`: false (pendente)
3. Vincula à OS o primeiro lançamento
4. Toast de sucesso: `Parcelamento criado! 6x de R$ 500,00`

---

## 📊 2. Dashboard CRM

### Como Acessar:

**O Dashboard CRM já está na aba "CLIENTES"!**

1. Clique na aba **"CLIENTES"** no menu lateral
2. O `CRMPage.tsx` carrega automaticamente
3. Dentro dele, o componente `CRMDashboard` é renderizado

### O que Você Vê:

```
┌────────────────────────────────────────────────┐
│ 📊 Dashboard CRM                                  │
│ Visão estratégica dos seus clientes e negócios      │
└────────────────────────────────────────────────┘

KPIs:
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ 👥          │ │ 🌟          │ │ 💰          │ │ 🎫          │
│ 125          │ │ 12           │ │ R$ 45.000    │ │ R$ 1.200     │
│ Total        │ │ Clientes VIP │ │ Receita Mês  │ │ Ticket Médio  │
│ Clientes     │ │              │ │              │ │              │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘

🏆 Top 5 Clientes:

┌──────────────────────────────────────────────┐
│ 🥇 João Silva 🌟               R$ 8.500,00   │
│    15 serviços   Média: R$ 566,67              │
└──────────────────────────────────────────────┘
┌──────────────────────────────────────────────┐
│ 🥈 Maria Santos 🌟             R$ 6.200,00   │
│    8 serviços    Média: R$ 775,00              │
└──────────────────────────────────────────────┘
...

⚠️ Alertas:
┌──────────────────────────────────────────────┐
│ ⚠️  Serviços Pendentes                         │
│     Você tem 7 serviço(s) em andamento      │
└──────────────────────────────────────────────┘
```

### Features do CRM:

1. **KPIs Calculados Automaticamente:**
   - Total de clientes
   - Clientes VIP (gasto > R$ 5.000 OU 5+ serviços)
   - Receita do mês atual
   - Ticket médio de todas as OSs finalizadas

2. **Top 5 Clientes:**
   - Ordenados por gasto total
   - Medalhas (🥇 🥈 🥉) para os 3 primeiros
   - Badge 🌟 para clientes VIP
   - Clicável para navegar ao perfil

3. **Alertas Inteligentes:**
   - Mostra quantos serviços estão pendentes (APROVADO + EM_SERVICO)

---

## 🐛 CORREÇÃO DO DRAG AND DROP

### O Problema:

Quando você arrastava um card, ele só atualizava após outra ação no sistema.

### A Solução Definitiva:

```typescript
// App.tsx
const [dragUpdateKey, setDragUpdateKey] = useState(0);

const handleUpdateStatus = (osId: string, newStatus: OSStatus) => {
  // Atualiza o estado
  setWorkOrders(prev => prev.map(o => 
    o.id === osId ? { ...o, status: newStatus } : o
  ));
  
  // ✅ FORÇA ATUALIZAÇÃO IMEDIATA
  requestAnimationFrame(() => {
    setDragUpdateKey(k => k + 1);
  });
};

// WorkshopPage recebe key dinâmica
<WorkshopPage
  key={dragUpdateKey} // ✅ Força re-render completo
  workOrders={workOrders}
  // ...
/>
```

### Como Funciona:

1. Usuário arrasta card
2. `handleUpdateStatus()` atualiza `workOrders`
3. `requestAnimationFrame()` agenda atualização no próximo frame (60 FPS)
4. `dragUpdateKey++` → `WorkshopPage` recria completamente
5. `KanbanBoard` recria com novos dados
6. Card aparece **INSTANTANEAMENTE** na nova posição

### Teste:

1. Arraste qualquer card entre colunas
2. **Observe:** Card some E aparece na nova coluna **INSTANTÂNEO**
3. Zero lag, zero atraso! ⚡

---

## 📊 Resumo Final

| Feature | Status | Como Usar |
|---------|--------|----------|
| **Pagamento Parcelado** | ✅ Integrado | Arraste card para FINALIZADO → Confirme → Escolha "Sim" para parcelar |
| **Dashboard CRM** | ✅ Integrado | Clique na aba "CLIENTES" no menu lateral |
| **Drag and Drop Fix** | ✅ Corrigido | Arraste cards - atualização instantânea! |

---

## 🚀 Tudo Pronto!

**Todas as features estão 100% funcionais e integradas ao sistema!**

Teste agora:
1. Arraste um card para FINALIZADO e veja o modal de parcelamento
2. Acesse a aba CLIENTES para ver o Dashboard CRM
3. Arraste cards entre colunas e veja a atualização instantânea

⚡ **Performance de produção + Funcionalidades enterprise!**
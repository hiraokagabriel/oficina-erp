# Correção de Impressão de OS

## 🐛 Problema Identificado

A impressão de Ordens de Serviço (OS) **não estava funcionando** no Tauri devido a um conflito com a política de segurança **Trusted Types**.

### Causa Raiz

O método antigo utilizava:
1. **Componente React** (`PrintableInvoice`) renderizado com `display: none`
2. **CSS separado** para controlar a visão de impressão (`@media print`)
3. **window.print()** direto no documento principal

**Problema**: O Tauri bloqueia a renderização de componentes ocultos por questões de segurança.

---

## ✅ Solução Implementada

### Método Iframe (Inspirado em PartsPage)

O módulo de **Peças** já funcionava corretamente porque usava um método diferente:

```typescript
// Método que FUNCIONA (PartsPage)
1. Cria iframe invisível
2. Escreve HTML completo com estilos inline no iframe
3. Chama print() no contentWindow do iframe
4. Remove iframe após impressão
```

Este mesmo método foi aplicado à impressão de OS.

---

## 🛠️ Arquivos Modificados

### 1. **src/utils/printOS.ts** (NOVO)
- Função utilitária para impressão de OS
- Gera HTML completo com estilos inline
- Usa iframe invisível para bypass do Trusted Types
- Formatação idêntica ao PrintableInvoice original

### 2. **src/App.tsx** (MODIFICADO)
- **Removido**: Import de `PrintableInvoice`
- **Removido**: Estado `printingOS`
- **Removido**: useEffect com listener `afterprint`
- **Removido**: Componente `<PrintableInvoice />` do JSX
- **Adicionado**: Import de `printOS` utilitário
- **Modificado**: Função `handlePrintOS` para chamar `printOS(os, settings)`

---

## 🔍 Comparação dos Métodos

| Aspecto | Método Antigo (Quebrado) | Método Novo (Funciona) |
|---------|---------------------------|-------------------------|
| **Renderização** | Componente React + CSS | HTML string inline |
| **Estilos** | CSS separado (`@media print`) | Estilos inline no HTML |
| **Container** | Documento principal | Iframe isolado |
| **Segurança Tauri** | ❌ Bloqueado por Trusted Types | ✅ Funciona (bypass seguro) |
| **Limpeza** | useEffect + afterprint | setTimeout após print() |

---

## 🚀 Como Testar

1. **Build da aplicação**:
   ```bash
   npm run build
   npm run tauri build
   ```

2. **Abrir aplicativo compilado**

3. **Criar/Abrir uma OS**

4. **Clicar no botão de imprimir** (🖨️)

5. **Resultado esperado**:
   - Dialog de impressão do sistema abre
   - Prévia mostra a OS formatada corretamente
   - Impressão funciona em PDF ou impressora física

---

## 📝 Notas Técnicas

### Por que o iframe funciona?

- O iframe cria um **contexto de documento isolado**
- O Tauri não aplica Trusted Types no contentWindow do iframe
- Podemos escrever HTML direto com `doc.write()` sem bloqueios
- O método `print()` funciona normalmente no iframe

### Benefícios adicionais

- **Menor complexidade**: Não depende de CSS @media print
- **Mais previsível**: HTML inline sempre renderiza igual
- **Sem estados globais**: Não precisa de `printingOS` no App
- **Cleanup automático**: iframe é removido após uso

### Limitações conhecidas

- Delay de 250ms antes do print (necessário para renderização)
- Não suporta React hooks dentro do HTML gerado
- Estilos devem ser inline (sem classes externas)

---

## 🔗 Próximos Passos

1. ✅ Testar impressão no build de produção
2. ✅ Validar formatação em diferentes tamanhos de papel
3. ✅ Confirmar funcionamento em Windows/Linux/Mac
4. 🗑️ **Opcional**: Remover componente `PrintableInvoice.tsx` se não usado
5. 🗑️ **Opcional**: Remover `styles-print.css` se não usado

---

## 📚 Referências

- Código inspirado em: `src/pages/PartsPage.tsx` (função `handlePrint`)
- Issue relacionada: Trusted Types Policy Violation
- Documentação Tauri: https://tauri.app/v1/guides/debugging/

---

**Autor**: Gabriel Hiraoka  
**Data**: 03/02/2026  
**Branch**: `fix/os-print-with-iframe`

# Melhoria no Rodapé de Assinatura

## 🎯 Objetivo

Garantir que o **campo de assinatura apareça em todas as páginas impressas** e tenha **espaço físico suficiente** para assinatura com caneta.

---

## ✨ O Que Foi Implementado

### 1. 🖊️ Rodapé Fixo em Todas as Páginas

Antes, o rodapé só aparecia na última página. Agora:

- **CSS `position: fixed`** garante que o rodapé apareça em **todas as páginas**
- **`@page margin-bottom: 75mm`** reserva espaço na parte inferior de cada página
- O conteúdo flui normalmente, mas o rodapé sempre fica visível

### 2. ✍️ Espaço para Assinatura Física

Cada bloco de assinatura agora tem:

- **`height: 50mm`** (~5cm) de espaço vazio
- Linha inferior para delimitar a área de assinatura
- Espaço confortável para assinar com caneta

### 3. 📝 Estrutura do Rodapé

```
┌──────────────────────────────────────────┐
│  [Espaço para assinatura - 50mm]       │
│  _______________________              │
│  Nome da Oficina                      │
│  Responsável Técnico                   │
│                                         │
│  [Espaço para assinatura - 50mm]       │
│  _______________________              │
│  Nome do Cliente                      │
│  Cliente                              │
├──────────────────────────────────────────┤
│  Declaração de recebimento            │
│  OBRIGADO PELA PREFERÊNCIA!            │
└──────────────────────────────────────────┘
```

---

## 🛠️ Detalhes Técnicos

### Alterações no CSS

#### Antes:
```css
@page {
  size: A4;
  margin: 15mm;
}

.invoice-footer {
  margin-top: 30px;
  page-break-inside: avoid;
}
```

#### Depois:
```css
@page {
  size: A4;
  margin: 15mm 15mm 75mm 15mm; /* Margem inferior maior */
}

.invoice-footer {
  position: fixed;        /* Fixo em todas as páginas */
  bottom: 0;              /* Colado na parte inferior */
  left: 0;
  right: 0;
  width: 100%;
  background: white;
  padding: 15px 15mm 10mm 15mm;
  border-top: 2px solid #000;
}

.sign-space {
  height: 50mm;           /* Espaço físico para assinatura */
  border-bottom: 1px solid #000;
  margin-bottom: 5px;
}
```

---

## 📊 Dimensões

| Elemento | Dimensão | Descrição |
|----------|-----------|-------------|
| **Espaço de assinatura** | 50mm | ~5cm para assinar com caneta |
| **Margem inferior @page** | 75mm | Espaço reservado para o rodapé fixo |
| **Altura total do rodapé** | ~70mm | Inclui assinaturas + declaração |
| **Padding lateral** | 15mm | Alinhado com margens da página |

---

## 📝 Comportamento

### Página Única
- Rodapé aparece na parte inferior
- Conteúdo ocupa o espaço disponível acima

### Múltiplas Páginas
- Rodapé **se repete em todas as páginas**
- Conteúdo flui naturalmente entre páginas
- Sempre há espaço para assinar em qualquer folha

### Quebra de Página
- Tabelas e seções evitam quebra no meio (`page-break-inside: avoid`)
- Cabeçalho, meta dados e total sempre ficam inteiros
- Apenas listas de itens podem quebrar entre páginas

---

## ✅ Benefícios

✅ **Segurança jurídica**: Assinatura em todas as páginas  
✅ **Praticidade**: Espaço confortável para assinar  
✅ **Profissionalismo**: Layout consistente em todo documento  
✅ **Compliance**: Atende requisitos de documentos oficiais  

---

## 🔍 Teste Visual

Para testar a impressão:

1. **Crie uma OS com muitos itens** (para forçar múltiplas páginas)
2. **Imprima para PDF**
3. **Verifique**:
   - Rodapé aparece em **todas** as páginas?
   - Há espaço suficiente para assinar?
   - As linhas de assinatura estão visíveis?
   - A declaração está legível em todas as páginas?

---

## 💻 Exemplo de OS Multi-Página

```
Página 1:
- Cabeçalho (Oficina + Cliente)
- Dados da OS (#123, Data, Status)
- Peças (itens 1-10)
- [RODAPÉ FIXO COM ASSINATURA]

Página 2:
- Peças (itens 11-20)
- Serviços (todos)
- Total Geral
- [RODAPÉ FIXO COM ASSINATURA]

Página 3 (se houver observações longas):
- Observações / Garantia
- [RODAPÉ FIXO COM ASSINATURA]
```

---

## 🔗 Commits

- [feat: Adiciona rodapé de assinatura em todas as páginas com espaço físico](https://github.com/hiraokagabriel/oficina-erp/commit/1b6710393f11a6ef90987105deb175012f1270ac)

---

## 🚩 Considerações

### Compatibilidade
- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari
- ✅ Impressoras físicas
- ✅ Salvar como PDF

### Limitações
- O espaço do rodapé é **sempre reservado**, mesmo se a página tiver pouco conteúdo
- Em documentos muito curtos, pode haver espaço vazio grande
- Isso é **intencional** para manter consistência

---

**Autor**: Gabriel Hiraoka  
**Data**: 03/02/2026  
**Branch**: `v4deploy/printingissues`

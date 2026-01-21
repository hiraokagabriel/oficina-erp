# 🎨 InputModal - Guia de Uso

## ❌ Antes (usando window.prompt - feio!)

```typescript
const handleEdit = () => {
  const newValue = window.prompt('Digite o novo valor:');
  if (newValue) {
    updateValue(newValue);
  }
};
```

## ✅ Depois (usando InputModal - lindo!)

```typescript
import { InputModal } from '../modals/InputModal';

const MyComponent = () => {
  const [showInputModal, setShowInputModal] = useState(false);

  const handleEdit = () => {
    setShowInputModal(true);
  };

  const handleConfirm = (value: string) => {
    updateValue(value);
  };

  return (
    <>
      <button onClick={handleEdit}>Editar</button>

      <InputModal
        isOpen={showInputModal}
        onClose={() => setShowInputModal(false)}
        onConfirm={handleConfirm}
        title="Editar Valor"
        message="Digite o novo valor para atualizar"
        placeholder="Ex: 100"
        defaultValue=""
        icon="✏️"
      />
    </>
  );
};
```

---

## 📦 Propriedades do InputModal

| Prop | Tipo | Obrigatório | Padrão | Descrição |
|------|------|--------------|--------|-------------|
| `isOpen` | `boolean` | ✅ | - | Controla visibilidade do modal |
| `onClose` | `() => void` | ✅ | - | Callback ao fechar modal |
| `onConfirm` | `(value: string) => void` | ✅ | - | Callback ao confirmar (recebe o valor digitado) |
| `title` | `string` | ✅ | - | Título do modal |
| `message` | `string` | ❌ | - | Mensagem explicativa opcional |
| `placeholder` | `string` | ❌ | `"Digite aqui..."` | Placeholder do input |
| `defaultValue` | `string` | ❌ | `""` | Valor inicial do input |
| `inputType` | `'text' \| 'number' \| 'email' \| 'tel'` | ❌ | `'text'` | Tipo do input |
| `icon` | `string` | ❌ | `"✏️"` | Emoji/ícone do modal |
| `confirmButtonText` | `string` | ❌ | `"Confirmar"` | Texto do botão confirmar |
| `cancelButtonText` | `string` | ❌ | `"Cancelar"` | Texto do botão cancelar |
| `validateInput` | `(value: string) => { valid: boolean; error?: string }` | ❌ | - | Função de validação customizada |

---

## 🎯 Exemplos Práticos

### 1️⃣ Input de Texto Simples

```typescript
<InputModal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  onConfirm={(value) => console.log(value)}
  title="Digite seu nome"
  placeholder="Ex: João Silva"
  icon="👤"
/>
```

### 2️⃣ Input Numérico (Número de Parcelas)

```typescript
<InputModal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  onConfirm={(value) => setInstallments(parseInt(value))}
  title="Número de Parcelas"
  message="Em quantas vezes deseja parcelar?"
  placeholder="Ex: 12"
  defaultValue="2"
  inputType="number"
  icon="💳"
  validateInput={(value) => {
    const num = parseInt(value);
    if (isNaN(num) || num < 1 || num > 12) {
      return { valid: false, error: 'Digite um número entre 1 e 12' };
    }
    return { valid: true };
  }}
/>
```

### 3️⃣ Input de Email

```typescript
<InputModal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  onConfirm={(email) => sendEmail(email)}
  title="Digite seu email"
  message="Enviaremos uma confirmação para este endereço"
  placeholder="email@exemplo.com"
  inputType="email"
  icon="📧"
  validateInput={(value) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return { valid: false, error: 'Email inválido' };
    }
    return { valid: true };
  }}
/>
```

### 4️⃣ Input de Telefone

```typescript
<InputModal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  onConfirm={(phone) => updatePhone(phone)}
  title="Telefone de Contato"
  placeholder="(11) 99999-9999"
  inputType="tel"
  icon="📞"
  confirmButtonText="Salvar"
/>
```

### 5️⃣ Input com Validação de CPF

```typescript
<InputModal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  onConfirm={(cpf) => saveCPF(cpf)}
  title="Digite o CPF"
  message="CPF do cliente para nota fiscal"
  placeholder="000.000.000-00"
  icon="🎫"
  validateInput={(value) => {
    // Remove caracteres não numéricos
    const cleaned = value.replace(/\D/g, '');
    
    if (cleaned.length !== 11) {
      return { valid: false, error: 'CPF deve ter 11 dígitos' };
    }
    
    // Aqui você pode adicionar validação completa do CPF
    return { valid: true };
  }}
/>
```

---

## ⌨️ Atalhos de Teclado

- **Enter** → Confirma e fecha o modal
- **Esc** → Cancela e fecha o modal
- **Auto-focus** → Input recebe foco automaticamente ao abrir

---

## 🎨 Recursos Visuais

✅ Design seguindo a estética do app  
✅ Animações suaves (fadeIn + scaleUp)  
✅ Ícone circular com gradiente  
✅ Feedback de erro visual  
✅ Botões estilizados  
✅ Dicas de atalhos de teclado  
✅ Responsívo e acessível  

---

## 🔄 Migração de window.prompt para InputModal

### Passo 1: Adicionar estado

```typescript
const [showInputModal, setShowInputModal] = useState(false);
```

### Passo 2: Substituir prompt por modal

**Antes:**
```typescript
const value = window.prompt('Digite algo:');
if (value) {
  doSomething(value);
}
```

**Depois:**
```typescript
setShowInputModal(true);

const handleConfirm = (value: string) => {
  doSomething(value);
};
```

### Passo 3: Adicionar componente

```tsx
<InputModal
  isOpen={showInputModal}
  onClose={() => setShowInputModal(false)}
  onConfirm={handleConfirm}
  title="Digite algo"
/>
```

---

🎉 **Pronto! Agora seu app tem modais lindos e funcionais!**
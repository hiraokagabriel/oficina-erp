
# 🛠️ OficinaPro - Sistema de Gestão para Oficinas Mecânicas

**OficinaPro** é uma aplicação desktop moderna, de alta performance e visualmente refinada, projetada para gerenciar o fluxo de trabalho, finanças e relacionamento com clientes de oficinas mecânicas e centros automotivos.

Construído sobre a robustez do **Rust (Tauri)** e a flexibilidade do **React**, o sistema oferece uma experiência nativa, segura e com uma interface de usuário polida.

-----

## 🚀 Funcionalidades Principais

### 📋 Gestão Operacional (Kanban & Processos)

  * **Quadro Kanban Interativo:** Organize Ordens de Serviço (OS) visualmente arrastando e soltando entre colunas: *Orçamento*, *Aprovado*, *Em Serviço* e *Finalizado*.
  * **Drag & Drop Fluido:** Cartões que seguem o mouse com precisão, rotação física e efeitos visuais.
  * **Lista de Processos:** Visualização tabular agrupada por status com ordenação independente (por Data, Cliente ou Nº OS) e alteração rápida de status via dropdown.
  * **Gamificação:** Efeitos sonoros e visuais (confetes) ao finalizar serviços e bater metas.

### 💰 Gestão Financeira

  * **Dashboard Completo:** Gráficos de fluxo de caixa diário (Área) e distribuição de receita (Pizza: Peças vs. Serviços).
  * **KPIs em Tempo Real:** Acompanhamento de Saldo, Receitas, Despesas e Ticket Médio.
  * **Livro Caixa:** Registro automático de receitas ao finalizar OS e lançamentos manuais de despesas/receitas avulsas.
  * **Exportação:** Capacidade de exportar relatórios financeiros.

### 👥 CRM & Clientes

  * **Histórico Completo:** Linha do tempo visual (Timeline) mostrando todas as visitas do cliente.
  * **Lembretes Automáticos:** O sistema analisa o histórico e avisa sobre trocas de óleo vencidas ou revisões necessárias.
  * **Gestão de Frota:** Cadastro de múltiplos veículos por cliente.

### 🎨 Personalização & UI

  * **Temas Visuais:**
      * 🌑 **Dark Aero:** Tema escuro, moderno, com alto contraste e cores neon.
      * 🌅 **Pastel Ultraviolet Dawn:** Tema claro, sofisticado, com gradientes suaves de lavanda e pêssego.
  * **Impressão de Invoice:** Geração de Nota de Serviço (A4) formatada profissionalmente, com separação clara entre Peças e Mão de Obra.
  * **Feedback Visual:** Sistema de notificações "Toast" para sucessos e erros.

### ☁️ Dados & Segurança

  * **Persistência Local:** Banco de dados em arquivo JSON local (rápido e fácil de transportar).
  * **Backup em Nuvem:** Integração direta com **Google Drive API** para backup e restauração de dados.
  * **Importação Manual:** Capacidade de carregar backups `.json` ou `.bak` manualmente.

-----

## 🛠️ Stack Tecnológica

O projeto utiliza uma arquitetura híbrida para garantir performance nativa com desenvolvimento ágil de interface.

  * **Backend / Core:** [Tauri](https://tauri.app/) (Rust) - Responsável pela gestão de arquivos, janelas e segurança.
  * **Frontend:** [React](https://reactjs.org/) (TypeScript) - Interface do usuário.
  * **Estilização:** CSS3 Puro (Variáveis CSS para temas dinâmicos).
  * **Gráficos:** [Recharts](https://recharts.org/).
  * **Drag and Drop:** [@hello-pangea/dnd](https://github.com/hello-pangea/dnd).

-----

## 📦 Instalação e Configuração

### Pré-requisitos

Antes de começar, certifique-se de ter instalado:

1.  **Node.js** (v16 ou superior).
2.  **Rust & Cargo** (Necessário para compilar o Tauri).
3.  **C++ Build Tools** (No Windows, via Visual Studio Installer).

### Passo a Passo

1.  **Clone o repositório:**

    ```bash
    git clone https://github.com/seu-usuario/oficina-pro.git
    cd oficina-pro
    ```

2.  **Instale as dependências do Frontend:**

    ```bash
    npm install
    # Ou se usar yarn:
    yarn install
    ```

3.  **Instale as dependências específicas:**
    Certifique-se de que as libs gráficas estão instaladas:

    ```bash
    npm install recharts @hello-pangea/dnd
    ```

4.  **Execute em modo de desenvolvimento:**
    Este comando iniciará o servidor React e abrirá a janela do Tauri.

    ```bash
    npm run tauri dev
    ```

### Compilação (Build)

Para gerar o executável final (`.exe` ou `.dmg`):

```bash
npm run tauri build
```

O instalador será gerado na pasta `src-tauri/target/release/bundle`.

-----

## 🖥️ Guia de Uso

### 1\. Configuração Inicial

Ao abrir o programa pela primeira vez, vá até a aba **Config (⚙️)**:

  * Preencha os dados da sua oficina (Nome, CNPJ, Endereço). Isso sairá nas impressões.
  * Escolha o tema de sua preferência.
  * (Opcional) Insira seu Token de Acesso do Google Drive para habilitar backups na nuvem.

### 2\. Criando uma Ordem de Serviço (OS)

1.  Clique em **"+ Nova OS"** na aba Oficina ou Processos.
2.  Preencha os dados do cliente (o sistema sugere clientes já cadastrados).
3.  Adicione itens de **Peças** e **Serviços** (o sistema aprende preços automaticamente).
4.  Salve. A OS será criada com status "Orçamento".

### 3\. Fluxo de Trabalho (Kanban)

1.  Vá para a aba **Oficina**.
2.  Arraste o cartão da OS para a coluna **Aprovado** quando o cliente autorizar.
3.  Arraste para **Em Serviço** durante a execução.
4.  Ao arrastar para **Finalizado**, o sistema perguntará se deseja lançar o valor como Receita no Financeiro.

### 4\. Impressão

Na aba Oficina, no cartão da OS, clique no ícone de **Impressora (🖨️)**. Uma janela de visualização limpa será aberta para impressão em A4.

-----

## 📂 Estrutura do Projeto

```text
/
├── public/              # Assets estáticos
├── src-tauri/           # Backend Rust e Configurações Tauri
│   ├── src/             # Código Rust (Comandos, FS, etc)
│   ├── Cargo.toml       # Dependências Rust
│   └── tauri.conf.json  # Configuração da Janela/Permissões
├── src/                 # Frontend React
│   ├── components/      # Componentes Reutilizáveis
│   │   ├── Sidebar.tsx
│   │   ├── KanbanBoard.tsx
│   │   ├── PrintableInvoice.tsx
│   │   └── ui/          (Toasts, Confetti)
│   ├── modals/          # Janelas de Ação
│   │   ├── OSModal.tsx
│   │   ├── EntryModal.tsx
│   │   └── ...
│   ├── pages/           # Telas Principais
│   │   ├── FinancialPage.tsx
│   │   ├── WorkshopPage.tsx
│   │   ├── ProcessPage.tsx
│   │   └── ...
│   ├── utils/           # Funções Auxiliares (Helpers, Audio)
│   ├── styles.css       # Estilos Globais e Temas
│   ├── App.tsx          # Ponto de Entrada Lógico
│   └── types/           # Definições TypeScript
└── package.json
```

-----

## 🔒 Backup e Dados

O sistema utiliza um arquivo local (`C:\OficinaData\database.json` por padrão no Windows) para salvar todos os dados.

  * **Salvamento Atômico:** O sistema salva automaticamente 1.5 segundos após a última alteração.
  * **Backup Google:** Se configurado, o botão "Fazer Backup" na aba Config envia uma cópia datada para o seu Google Drive.

-----

## 📄 Licença

Este projeto é de uso proprietário. A distribuição não autorizada é proibida.

-----

*Desenvolvido com ❤️, Rust e React.*
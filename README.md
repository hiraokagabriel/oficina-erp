
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

### 🗓️ Agenda e Prazos

  * **Agenda de Entrada:** Agendamentos por dia e semana, com ação "Criar OS" a partir do agendamento.
  * **Previsão de Entrega:** Selo de OS atrasada ou para hoje no Kanban e em Processos.

### 💰 Gestão Financeira

  * **Dashboard Completo:** Gráficos de fluxo de caixa diário (Área) e distribuição de receita (Pizza: Peças vs. Serviços).
  * **KPIs em Tempo Real:** Acompanhamento de Saldo, Receitas, Despesas e Ticket Médio.
  * **Livro Caixa:** Registro automático de receitas ao finalizar OS e lançamentos manuais de despesas/receitas avulsas.
  * **Margem e Preço:** Custo por item, meta de margem (Config), selo no Kanban, sugestão de preço e relatório de margem na aba Margem do Financeiro.
  * **Exportação:** Capacidade de exportar relatórios financeiros.

### 👥 CRM & Clientes

  * **Histórico Completo:** Linha do tempo visual (Timeline) mostrando todas as visitas do cliente.
  * **Lembretes Automáticos:** O sistema analisa o histórico e avisa sobre trocas de óleo vencidas ou revisões necessárias.
  * **Gestão de Frota:** Cadastro de múltiplos veículos por cliente, com sugestões de marca/modelo/ano (base FIPE embutida; texto livre continua permitido).
  * **Contas a Receber:** Parcelas, adiantamentos e atrasos por cliente.

### 🎨 Personalização & UI

  * **Temas Visuais:**
      * 🌑 **Escuro:** visual "Painel de instrumentos", com alto contraste.
      * 🌅 **Pastel (claro):** tema claro suave, com contraste mínimo WCAG AA.
  * **Impressão de OS (A4/PDF):** via geral, via do cliente (assinatura da oficina, com o técnico responsável ou o nome da oficina) e via da oficina (assinatura do cliente). Logo configurável (letras e prévia) em Configurações.
  * **Checklist de vistoria impresso:** completo (com caixas para marcar à mão) ou resumido (só itens marcados), em preto e branco, com paginação.
  * **Resumo do serviço para o cliente:** Modo cliente em tela cheia e impressão A4, com os itens marcados da vistoria, total, adiantamento e restante.
  * **Fotos dos carros:** até 20 fotos por OS, com legenda e visualizador, e galeria de todas as fotos do mesmo cliente e carro em Clientes. Ficam em arquivos na pasta `fotos` ao lado do banco (não entram nos backups em JSON).
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
  * **Drag and Drop:** [@dnd-kit](https://dndkit.com/).

-----

## 📦 Instalação e Configuração

### Pré-requisitos

Antes de começar, certifique-se de ter instalado:

1.  **Node.js** (v20.19 ou superior, exigido pelo Vite 7).
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

3.  **Execute em modo de desenvolvimento:**
    Este comando iniciará o servidor React e abrirá a janela do Tauri.

    ```bash
    npm run tauri dev
    ```

### Testes

```bash
npm test     # Vitest: lógica pura (banco, financeiro, agenda, margem, veículos)
npm run build  # tsc + vite build
```

Para atualizar a base de veículos: `npm run vehicles:build` (manual).

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

Na aba Oficina, no cartão da OS, abra o menu **Mais** (ou clique com o botão direito) e escolha **Imprimir OS**: via geral, via do cliente ou via da oficina. **Mostrar ao cliente** abre o resumo em tela cheia e **Imprimir resumo** gera a versão A4. A vistoria tem o seu próprio botão Imprimir (completo ou resumido).

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

  * **Salvamento Atômico:** O sistema salva automaticamente 3 segundos após a última alteração, recusa gravar se outro PC alterou o arquivo e guarda backups rotativos fora da pasta do banco.
  * **Backup Google:** Se configurado, o botão "Fazer Backup" na aba Config envia uma cópia datada para o seu Google Drive.

-----

## 📄 Licença

Este projeto é de uso proprietário. A distribuição não autorizada é proibida.

-----

*Desenvolvido com ❤️, Rust e React.*
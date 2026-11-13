# NUVEM-UX: telas e textos do login, papéis e nuvem (etapa 2)

Base: `docs/NUVEM.md` (Q2/Q10/Q12/Q15/Q16/Q17/Q21/Q22/Q23 e "Padrões assumidos"), `docs/NUVEM-SPEC.md` seções 4 e 5, `src/services/permissions.ts`, `src/sync/rejectMessages.ts`. Visual: tokens de `src/styles-tokens.css`, ícones de `src/components/ui/Icon.tsx`, temas Escuro e Pastel. Sem marca nova. Nada aqui muda regra de negócio ou formato de dados.

Lentes (peso): design > automotivo > oficina. Quando houver conflito, a decisão fica anotada com [Design], [Auto] ou [Oficina].

## 0. Regras gerais desta etapa

### 0.1 Vocabulário (vale para toda a interface)

| Proibido | Use |
|---|---|
| sincronizar, sincronização, sync | "enviar", "salvo", "guardado neste aparelho" |
| token, sessão, login (substantivo) | "acesso", "entrar", "entrar de novo" |
| offline / online | "sem internet" / "com internet" |
| cache, IndexedDB, servidor (evitar) | "neste aparelho"; "o sistema" |
| usuário (em título) | "pessoa" |
| role, perfil | "papel" (Dono, Recepção, Mecânico) |
| device, dispositivo | "aparelho"; "computador" quando for PC; "celular" |

Nomes dos papéis sempre com inicial maiúscula: **Dono**, **Recepção**, **Mecânico**.

### 0.2 Componentes e classes reaproveitados

- Botões: `.btn` (ação principal, `--accent`), `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.btn-sm`, `.btn-accent-outline`.
- Campos: `.form-group`, `.form-label`, `.form-input`, `.field-error` (com `role="alert"`), `.field-hint`, `.cfg-help`.
- Cartões e páginas: `.card`, `.cfg-card`, `.cfg-title`, `.cfg-row`, `.cfg-warn`, `.cfg-ok`, `.cfg-bad`, `.empty-state*`, `.chip`, `.chip--accent`, `.segmented`, `.status-light`.
- Janelas: `.modal-overlay`, `.modal-content`, `.modal-title`, `.modal-actions`; `ConfirmationModal` e `DeleteConfirmationModal` para confirmações; `useFocusTrap`, `useTopmostEscape`, `useDirtyGuard`.
- Avisos: `ToastContainer` (`toast-item--info|success|error`), `.app-banner--warning|danger`.
- Menu: `ContextMenu` (submenu, foco preso, Esc), já usado no card do Kanban.
- Estado de salvar: `SaveIndicator` e `utils/saveStatus.ts`, que viram o selo de nuvem (seção 6).
- Logo: `.logo-text` com `.logo-highlight` ("OFICINA**PRO**").

### 0.3 Ícones novos no sprite

Mesma grade 24×24, traço 1,75, `currentColor`. Acrescentar em `ICON_NAMES` e no teste.

| Nome | Desenho | Uso |
|---|---|---|
| `pessoa` | busto simples | menu da pessoa, cartões, Usuários |
| `cadeado` | cadeado fechado | bloqueio, botão "Precisa de internet" |
| `nuvem` | nuvem simples | selo "Salvo" no modo nuvem, Config |
| `sem-internet` | nuvem cortada por diagonal | selo sem internet, botões de dinheiro travados |
| `apagar` | seta para a esquerda com ✕ (tecla backspace) | teclado do PIN |
| `olho` | olho aberto | "Mostrar" senha e PIN |
| `sair` | porta com seta | "Sair deste aparelho" |
| `computador` | monitor | Config > Aparelhos |
| `celular` | retângulo vertical | Config > Aparelhos |

### 0.4 Acessibilidade (vale para todas as telas)

- Alvos de toque e clique com pelo menos 44 px (`--control-h`). Teclas do PIN com 72 px. Nada abaixo de `--control-h-min` (40 px).
- Fonte base 16 px. Campos no celular com no mínimo 16 px, senão o iOS dá zoom.
- Contraste: texto comum só com `--text` ou `--text-2`. Texto de status só com as variantes `--text-success|warning|danger|info`, que já passam 4,5:1 nos dois temas. Nunca use `--warning` como cor de texto no Pastel (`#D97706` fica abaixo de 4,5:1 sobre branco); use `--text-warning` (`#7A5200`). Bordas de controle com `--border-strong` (3:1 ou mais).
- Cor nunca é o único sinal: o selo, os chips de situação e as luzes sempre levam ícone e texto.
- Botão que não pode agir (sem internet, sem permissão, último Dono) usa `aria-disabled="true"` e continua focável. Um texto visível ao lado ou abaixo explica o motivo (`aria-describedby`). Clicar mostra um toast com o mesmo motivo. Não use `disabled` puro com o motivo só no `title`: não aparece no toque nem para o leitor de tela.
- Foco visível global (`:focus-visible`, 3 px `--focus-ring`). Em tela inteira (Entrar, Quem está usando, Bloqueio), o resto do app recebe `inert`.
- Telas de bloqueio são opacas (`--bg-app`, sem transparência): o cliente no balcão não vê o que está atrás. [Oficina]
- `prefers-reduced-motion`: sem animação de tremer no PIN errado; só a troca de cor e o texto.

### 0.5 Novos arquivos de estilo (sugestão para o `ui-dev`)

`src/styles-auth.css` (Entrar, convite, PIN, quem está usando, bloqueio), `src/styles-topbar.css` (barra do topo e selo) e `src/styles-mobile.css` (abaixo de 800 px). Sem cor nova: só tokens.

---

## 1. Entrar, Esqueci a senha, Nova senha

### 1.1 Entrar (e-mail e senha)

**Objetivo:** primeira entrada num aparelho, PC não autorizado, celular, ou quando o PIN não serve (5 erros, sem PIN).

**Quando aparece:** sem acesso guardado neste aparelho; botão "Entrar com e-mail e senha" na tela "Quem está usando"; depois de 5 erros de PIN; depois de "Entre de novo".

**Layout (800 px e celular):** tela inteira `--bg-app`, cartão central `.card` com largura máxima de 420 px, centralizado na vertical. No celular o cartão ocupa a largura com 16 px de margem.

```
┌──────────────────────────────────────┐
│          OFICINAPRO  (logo-text)     │
│                                      │
│  Entrar                      (h1)    │
│  Use o e-mail e a senha do seu       │
│  convite.                            │
│                                      │
│  E-mail                              │
│  [______________________________]    │
│  Senha                    [👁 Mostrar]│
│  [______________________________]    │
│  ⚠ Caps Lock ligado     (se ligado)  │
│                                      │
│  [        Entrar         ]  (.btn)   │
│                                      │
│  Esqueci a senha        (btn-ghost)  │
│ ───────────────────────────────────  │
│  ← Voltar para a escolha de pessoa   │  (só em PC compartilhado)
└──────────────────────────────────────┘
```

**Textos:**
- Título: **Entrar**
- Ajuda: "Use o e-mail e a senha do seu convite."
- Rótulos: "E-mail" (`type=email`, `autocomplete=username`); "Senha" (`type=password`, `autocomplete=current-password`).
- Botão de ver senha: "Mostrar" ou "Esconder" (ícone `olho`, `aria-pressed`).
- Aviso de Caps Lock: "Caps Lock ligado: a senha pode sair em maiúsculas."
- Botão principal: **Entrar**; carregando: "Entrando..." (spinner, `aria-busy`).
- Link: "Esqueci a senha"
- Rodapé (só em PC compartilhado autorizado): "Voltar para a escolha de pessoa"

**Erros** (em `.field-error` acima do botão, `role="alert"`; o foco vai para o campo culpado):

| Caso | Texto |
|---|---|
| E-mail vazio | "Digite seu e-mail." |
| E-mail sem @ | "Este e-mail parece incompleto. Exemplo: nome@gmail.com" |
| Senha vazia | "Digite sua senha." |
| E-mail ou senha errados | "E-mail ou senha não conferem. Confira e tente de novo." |
| Pessoa desativada | "Este acesso foi desativado. Fale com o Dono da oficina." |
| Convite ainda não aceito | "Você ainda não criou sua senha. Abra o e-mail do convite e toque em \"Aceitar convite\"." |
| Muitas tentativas (limite) | "Muitas tentativas seguidas. Espere 1 minuto e tente de novo." |
| Sem internet | "Sem internet. Para entrar neste aparelho é preciso estar com internet." |
| Falha desconhecida | "Não foi possível entrar agora. Tente de novo em instantes." |

**Estados:** carregando (botão "Entrando...", campos travados); sem internet (faixa `.app-banner--warning` no topo do cartão: "Sem internet. Conecte o aparelho para entrar." e botão Entrar com `aria-disabled` e o mesmo motivo); sucesso: vai para o app. No primeiro uso neste aparelho, vai para a tela "Abrindo os dados" (1.4).

**Dono com verificação em 2 etapas** (depois da senha ou do PIN): mesmo cartão. Título "Código de verificação". Texto: "Abra o aplicativo de códigos no seu celular (Google Authenticator ou parecido) e digite os 6 números." Campo "Código" (`inputMode=numeric`, `autocomplete=one-time-code`). Botão "Confirmar". Erro: "Código errado ou vencido. Use o código que está aparecendo agora."

**Teclado e foco:** abre com foco no E-mail (ou na Senha, se o e-mail já vier preenchido). Enter envia. Ordem do Tab: E-mail, Senha, Mostrar, Entrar, Esqueci a senha, Voltar.

**Papéis:** igual para todos.

### 1.2 Esqueci a senha

**Layout:** mesmo cartão.

- Título: **Esqueci a senha**
- Texto: "Digite o e-mail do seu acesso. Vamos mandar um link para você criar uma senha nova."
- Campo: "E-mail"
- Botões: **Enviar link** (`.btn`); "Voltar para Entrar" (`btn-ghost`).
- Carregando: "Enviando..."
- Sucesso (substitui o formulário; ícone `check` em `--text-success`):
  - Título: "Confira seu e-mail"
  - Texto: "Se **ana@exemplo.com** tiver acesso ao OficinaPro, o link chega em alguns minutos."
  - Destaque (`.attention-note`, ícone `alerta`): "**Não achou?** Olhe também na caixa **Spam** ou **Lixo eletrônico**. Procure por \"OficinaPro\". Se estiver lá, marque como \"Não é spam\"."
  - Botões: "Voltar para Entrar" (`.btn`); "Mandar de novo" (`.btn-secondary`), travado por 60 s com o texto "Mandar de novo em 45 s".
- Erros: e-mail vazio ou inválido, como em 1.1. Sem internet: "Sem internet. Conecte o aparelho para pedir o link." Limite: "Já mandamos um link há pouco. Espere 1 minuto para pedir outro."
- Por segurança, a resposta é a mesma para e-mail cadastrado ou não.

### 1.3 Nova senha (link do e-mail, abre no navegador em `/nova-senha`)

- Título: **Criar senha nova**
- Campos: "Senha nova" e "Repita a senha nova", ambos com "Mostrar".
- Ajuda fixa abaixo do 1º campo: "Pelo menos 8 letras ou números. Dica: use uma frase fácil de lembrar, como `carro-azul-2026`."
- Indicador de regra ao vivo: ícone `check` em `--text-success` com "8 ou mais caracteres", ou ícone `info` em `--text-2` enquanto faltar.
- Botão: **Salvar senha nova**; carregando "Salvando...".
- Erros: "A senha precisa ter pelo menos 8 caracteres." · "As duas senhas estão diferentes. Digite de novo." · "Sem internet. Conecte o aparelho e tente de novo."
- Link vencido ou usado (tela própria, ícone `alerta`): título "Este link não vale mais"; texto "O link venceu ou já foi usado. Peça um novo."; botão **Pedir link novo** (vai para 1.2).
- Sucesso: título "Senha trocada"; texto "Pronto. Agora entre com a senha nova. No computador da oficina, continue usando seu PIN normalmente."; botão **Entrar** (web) ou texto "Pode fechar esta página." quando a página foi aberta só para isso.

### 1.4 Abrindo os dados (primeira vez no aparelho e abertura normal)

- Abertura normal: `LoadingSkeleton type="page"` e o texto "Abrindo o OficinaPro..."
- Primeira vez neste aparelho (cache vazio): cartão central, ícone `nuvem`.
  - Título: "Preparando este aparelho"
  - Texto: "Baixando os dados da oficina para este aparelho. Na primeira vez pode levar alguns minutos. Não feche o programa."
  - Barra de progresso (`role=progressbar`) com o texto "1.240 de 3.000 registros".
  - Se a internet cair: "A internet caiu. Assim que voltar, continuamos de onde parou." (sem botão).

---

## 2. Aceitar convite (navegador, `/convite`)

**Objetivo:** a pessoa convidada cria senha e PIN em 2 passos, de preferência no celular, a partir do e-mail.

**Layout:** mesmo cartão de 420 px. Indicador de passos no topo: "Passo 1 de 2" (texto, não só bolinhas).

**Cabeçalho (os dois passos):**
- Título: **Bem-vindo(a), Ana!**
- Texto: "O Dono da **Oficina Anderson** convidou você para usar o OficinaPro como **Recepção**." Uma linha abaixo, com a descrição curta do papel (6.4).

**Passo 1 de 2: Crie sua senha**
- Subtítulo: "Crie sua senha"
- Texto: "Você vai usar esta senha com o seu e-mail para entrar no celular ou num computador novo."
- Campos, ajuda e regra iguais a 1.3.
- Botão: **Continuar**
- Erros iguais a 1.3.

**Passo 2 de 2: Crie seu PIN**
- Subtítulo: "Crie seu PIN"
- Texto: "O PIN são **6 números** para entrar rápido no computador da oficina, tocando no seu nome. Não conte para ninguém."
- Campos: "PIN (6 números)" e "Repita o PIN". `type=password`, `inputMode=numeric`, `maxLength=6`, `autocomplete=off`, botão "Mostrar". Visual: 6 caixas largas com bolinha preenchida, `--font-tech`.
- Ajuda: "Evite números fáceis, como 123456, 111111 ou sua data de nascimento."
- Botão: **Concluir**; carregando "Salvando...".
- Erros:
  - "O PIN precisa ter 6 números."
  - "Use só números no PIN."
  - "Os dois PINs estão diferentes. Digite de novo."
  - "Esse PIN é fácil demais de adivinhar. Escolha outro, sem números repetidos ou em sequência." Validação no aparelho: todos iguais, sequência crescente ou decrescente.
  - "Sem internet. Conecte o aparelho para concluir."
- Voltar: "← Voltar para a senha" (`btn-ghost`); a senha já salva continua valendo.

**Concluído:**
- Ícone `check` grande em `--text-success`. Título: "Tudo pronto, Ana!"
- Texto: "**No computador da oficina:** toque no seu nome e digite o PIN.<br>**No celular:** entre com seu e-mail e senha."
- Botão (web): **Entrar agora**.

**Erros de link:**
- Link vencido ou usado: título "Este convite não vale mais"; texto "O link do convite venceu ou já foi usado. Peça ao Dono para reenviar o convite. Se você já criou sua senha, é só entrar."; botões **Entrar** e "Esqueci a senha".
- Pessoa desativada antes de aceitar: "Este convite foi cancelado. Fale com o Dono da oficina."

**Teclado:** foco no 1º campo de cada passo; Enter avança; o Tab segue a ordem visual.

---

## 3. "Quem está usando agora?" (PC compartilhado)

**Objetivo:** num PC da recepção autorizado como compartilhado, cada pessoa entra tocando no nome e digitando o PIN. [Oficina] Alvo grande, de pé, mão suja: cartões enormes e teclado numérico na tela. [Auto] O PIN lembra o mostrador de 6 dígitos de um painel: bolinhas que acendem em `--accent`.

**Quando aparece:** ao abrir o app num PC compartilhado; em "Trocar de pessoa"; no bloqueio por inatividade (seção 4).

### 3.1 Tela de cartões

```
┌───────────────────────────────────────────────────────────────┐
│ OFICINAPRO                     [selo: ☁ Salvo]  (topo simples) │
│                                                               │
│            Quem está usando agora?            (fs-2xl)        │
│            Toque no seu nome.                 (--text-2)      │
│                                                               │
│   ┌──────────┐   ┌──────────┐   ┌──────────┐                  │
│   │   (AN)   │   │   (CA)   │   │   (JO)   │   cartões 180×160│
│   │   Ana    │   │  Carlos  │   │   João   │   nome fs-lg bold│
│   │ Recepção │   │ Mecânico │   │   Dono   │   papel em chip  │
│   └──────────┘   └──────────┘   └──────────┘                  │
│   ┌──────────┐                                                │
│   │   (PE)   │                                                │
│   │  Pedro   │                                                │
│   │ Mecânico │                                                │
│   └──────────┘                                                │
│                                                               │
│           [ Entrar com e-mail e senha ]  (.btn-secondary)     │
│   Computador: PC da recepção                (--text-3, fs-sm) │
└───────────────────────────────────────────────────────────────┘
```

- Grade com `repeat(auto-fill, minmax(180px, 1fr))`, `gap: var(--sp-4)`, largura máxima de 800 px centralizada. A 800 px cabem 4 por linha; abaixo disso, 2 ou 3.
- Cartão: `<button>` com `.card`, raio `--radius-lg`, borda `--border-strong`, hover `--surface-3`. Círculo com as iniciais (reaproveita o desenho de `.cfg-logo-circle`; cor `--accent-soft` e texto `--accent-text`). Nome em `--fs-lg` e `--fw-bold`. Papel como `.chip`.
- Ordem: alfabética. A pessoa que usou por último fica primeiro e leva a etiqueta "Usou por último".
- Cartão de quem ainda não criou PIN: chip "Sem PIN"; tocar vai para Entrar (1.1) com a ajuda "Você ainda não tem PIN neste computador. Entre com e-mail e senha."
- Estado vazio (ninguém com PIN): `.empty-state`, ícone `pessoa`, título "Ninguém tem PIN ainda", texto "Cada pessoa cria o PIN ao aceitar o convite. Por enquanto, entre com e-mail e senha.", botão **Entrar com e-mail e senha**.
- Carregando a lista: 3 cartões de esqueleto. Se a lista não chegar e houver cópia guardada, mostra a cópia.

### 3.2 Painel do PIN (abre ao tocar no cartão, na mesma tela)

```
┌───────────────────────────────────────┐
│ ← Voltar                              │
│              (AN)                     │
│              Ana                      │
│           Recepção                    │
│                                       │
│   Digite seu PIN                      │
│     ●  ●  ●  ○  ○  ○                  │  6 bolinhas 20 px, gap 16
│   (erro aqui, role=alert)             │
│                                       │
│     [ 1 ]  [ 2 ]  [ 3 ]               │  teclas 72×72, fs-xl
│     [ 4 ]  [ 5 ]  [ 6 ]               │
│     [ 7 ]  [ 8 ]  [ 9 ]               │
│   [Apagar] [ 0 ] [Limpar]             │
│                                       │
│   Esqueci meu PIN                     │  btn-ghost
└───────────────────────────────────────┘
```

- Teclas: `<button>` com `--surface-2`, borda `--border-strong`, texto `--text`, raio `--radius-md`, número em `--fs-xl` com `tabular-nums`. "Apagar" leva o ícone `apagar` e o texto. "Limpar" apaga tudo.
- Bolinhas: vazia com borda `--border-strong`; cheia com `--accent`. [Auto] Luz de painel. Fora isso, as bolinhas não usam cor.
- Campo real por trás: `<input type="password" inputMode="numeric" maxLength=6 autocomplete="off" aria-label="PIN de Ana, 6 números">`, com o visual das bolinhas por cima. O teclado físico e o teclado numérico do PC (NumLock) escrevem nele.
- Envia sozinho ao chegar a 6 números. Não há botão "Entrar".
- Conferindo: as bolinhas pulsam com opacidade (sem tremer), teclado travado, texto "Conferindo..." (`role=status`).
- Acerto: entra no app. Se havia outra pessoa entrada e com alterações não enviadas, primeiro aparece "Enviando o que a Ana fez..." e depois entra.

**Erros (abaixo das bolinhas):**

| Caso | Texto | O que acontece |
|---|---|---|
| PIN errado (1 a 4) | "PIN errado. Restam 3 tentativas." | Limpa as bolinhas; o foco fica no campo |
| 5º erro | "Seu PIN foi bloqueado depois de 5 erros. Entre com seu e-mail e senha para liberar." | Botão **Entrar com e-mail e senha**; o cartão mostra o chip "PIN bloqueado" |
| PIN bloqueado (ao tocar no cartão) | o mesmo texto do 5º erro | vai direto para o formulário de e-mail e senha |
| Aparelho suspenso (mais de 20 erros por hora) | Tela inteira: "Este computador foi bloqueado por muitas tentativas de PIN erradas. Peça ao Dono para liberar em Configurações > Aparelhos. Enquanto isso, entre com e-mail e senha." | Só o botão de e-mail e senha |
| Aparelho revogado | Tela inteira: "Este computador não está mais autorizado. Entre com e-mail e senha." | Some a lista de cartões |
| Pessoa desativada | "O acesso de Carlos foi desativado. Fale com o Dono." | O cartão some na próxima atualização |
| Falha de rede no meio | "Não deu para conferir o PIN. Confira a internet e tente de novo." | Não conta como erro |

- "Esqueci meu PIN": texto "Entre com seu e-mail e senha e crie um PIN novo em **Trocar meu PIN**, no menu com o seu nome." e botão **Entrar com e-mail e senha**.

### 3.3 Sem internet (decisão 1 do dono: só a pessoa atual continua)

- Faixa no topo da tela (`.app-banner--warning`, ícone `sem-internet`): "**Sem internet.** Só **Ana**, que estava usando, pode desbloquear agora. As outras pessoas entram quando a internet voltar."
- O cartão da pessoa atual fica normal, com a etiqueta "Usando agora".
- Os outros cartões ficam com `aria-disabled`, fundo `--surface-1`, texto `--text-2` (não `--text-3`) e uma linha extra "Precisa de internet" com o ícone `cadeado`. Tocar mostra o toast: "Sem internet, só Ana pode entrar agora."
- "Entrar com e-mail e senha" fica com `aria-disabled` e o motivo "Precisa de internet".
- PIN conferido no próprio aparelho. 5 erros: "Muitas tentativas erradas. Espere a internet voltar para tentar de novo." O teclado trava até voltar a internet.
- Quando a internet volta, a faixa some e os cartões se liberam sozinhos. Toast: "A internet voltou. Todos podem entrar."
- Se ninguém estava entrado e não há internet: título "Sem internet"; texto "Para entrar neste computador é preciso internet. Confira o cabo ou o Wi-Fi."; sem cartões.

### 3.4 Teclado e foco

- Tela de cartões: foco inicial no cartão "Usou por último". Setas movem entre os cartões (tabindex móvel); Tab vai para "Entrar com e-mail e senha"; Enter ou Espaço abre o PIN.
- Painel do PIN: o foco vai para o campo do PIN. Números (fileira de cima ou teclado numérico) digitam; Backspace apaga; Delete limpa; Esc volta aos cartões. As teclas na tela vêm depois no Tab.
- O leitor de tela anuncia "3 de 6 números digitados" (`aria-live=polite`), nunca os números.

### 3.5 Papéis

Todos os papéis aparecem nos cartões. O Dono com verificação em 2 etapas recebe o pedido de código (1.1) depois do PIN.

---

## 4. Bloqueio por inatividade e "Trocar de pessoa"

### 4.1 Barra do topo (todas as telas do app em PC e navegador; seção 6 tem o selo)

```
800 px (menu lateral compacto à esquerda):
┌────┬──────────────────────────────────────────────────────────────┐
│ OP │                 [☁ Salvo às 14:32] [(AN) Ana · Recepção ▾] [⇄ Trocar de pessoa] │
│ ...│──────────────────────────────────────────────────────────────│
```

- `<header class="app-topbar">` dentro de `.main-content`, `position: sticky; top: 0`, altura de 52 px, `--surface-1`, borda de baixo `--border`.
- Itens alinhados à direita, `gap: var(--sp-3)`:
  1. **Selo de nuvem** (seção 6).
  2. **Botão da pessoa**: iniciais em círculo pequeno, "Ana · Recepção" e uma seta. Abre o `ContextMenu` com:
     - cabeçalho (sem ação): "Ana" / "ana@exemplo.com" / "Papel: Recepção";
     - "Trocar meu PIN" (ícone `chave`);
     - "Trocar minha senha" (ícone `chave`);
     - "Aparência: Escuro / Pastel" (submenu de rádio). Recepção e Mecânico não têm Config, então o tema mora aqui;
     - "Sair deste aparelho" (ícone `sair`). Só aparece em aparelho pessoal ou não autorizado.
  3. **"Trocar de pessoa"** (`.btn-secondary`, ícone `pessoa`). Só em PC compartilhado autorizado. `title="Trocar de pessoa (F8)"`.
- A 800 px o nome da pessoa pode virar só as iniciais e o papel ("(AN) Recepção") se não couber; o nome completo continua em `aria-label`.

**Trocar meu PIN** (modal pequeno): título "Trocar meu PIN"; campos "PIN atual", "PIN novo (6 números)" e "Repita o PIN novo"; botões **Salvar PIN** e Cancelar. Erros como em 2. Sucesso, em toast: "PIN trocado. Use o novo da próxima vez." Sem internet: botão travado, "Precisa de internet".

**Trocar minha senha:** campos "Senha atual", "Senha nova" e "Repita a senha nova"; mesmas regras de 1.3. Toast: "Senha trocada."

**Sair deste aparelho:** confirmação (`ConfirmationModal`).
- Título: "Sair deste aparelho?"
- Texto: "Você vai precisar do e-mail e da senha para entrar de novo aqui."
- Se houver alteração não enviada, o texto vira: "Ainda há 3 alterações suas que não foram enviadas. Se sair agora sem internet, elas ficam numa cópia de recuperação e não aparecem para os outros."
- Botões: **Sair** e Cancelar.

### 4.2 Trocar de pessoa

1. Se houver janela com edição não salva, o `useDirtyGuard` pergunta como hoje ("Descartar alterações?").
2. Com internet: estado "Enviando o que a Ana fez..." no selo (até 10 s). Depois abre a tela "Quem está usando" (3.1), sem ninguém pré-selecionado.
3. Sem internet: abre a tela no modo 3.3. Ana continua podendo voltar.

Atalho: **F8**, que não conflita com F2 (Nova OS).

### 4.3 Bloqueio por inatividade

- Tempo vindo do aparelho (5, 15 ou 30 min, ou nunca; padrão 15). Só em PC compartilhado.
- **Aviso 60 s antes** (faixa `.app-banner--warning` no topo, `role=alert` uma vez):
  - "Sem uso há 14 minutos. Este computador vai bloquear em **60** segundos." O contador só é anunciado no início.
  - Botão **Continuar usando**. Qualquer clique ou tecla também cancela.
- **Ao bloquear:** a tela "Quem está usando" cobre tudo (opaca, app `inert`), já com o PIN da pessoa atual aberto.
  - Título acima do cartão: "Computador bloqueado"
  - Texto: "Ana estava usando. Digite o PIN para continuar de onde parou."
  - Link: "Não é a Ana? Escolher outra pessoa" (volta aos cartões).
- O app continua montado por baixo. A mesma pessoa volta exatamente onde estava, inclusive com a janela da OS aberta.
- **Outra pessoa entra com Ana tendo deixado uma janela com edição não salva:** depois do PIN certo, antes de entrar, aparece a confirmação.
  - Título: "Ana deixou a OS 1234 aberta sem salvar"
  - Texto: "Se você entrar, o que ela digitou nessa janela se perde. O que já estava salvo continua."
  - Botões: **Entrar mesmo assim** (`.btn-danger`) e "Voltar" (`btn-secondary`).
  - O cartão da Ana mostra o chip "Deixou uma OS sem salvar".
- Bloqueio "Nunca": sem aviso nem bloqueio.

### 4.4 Papéis

"Trocar de pessoa" aparece para todos os papéis em PC compartilhado. Em aparelho pessoal (celular) nada disso aparece.

---

## 5. Config > Usuários e papéis, e Config > Aparelhos (só Dono)

A Config inteira some do menu para Recepção e Mecânico (seção 7). As duas seções novas ficam no topo da página, antes de "Cadastros".

### 5.1 Usuários e papéis

**Layout (cartão `.cfg-card`, título `<h3 class="cfg-title">` com ícone `pessoa`):**

```
Usuários e papéis                                   [+ Convidar pessoa]
Quem pode entrar no OficinaPro e o que cada um vê.

┌──────────────────────────────────────────────────────────────────┐
│ (JO) João (você)       joao@...      Dono       ● Ativo           │
│ (AN) Ana               ana@...       [Recepção ▾]  ● Ativo   [Desativar] │
│ (CA) Carlos            carlos@...    [Mecânico ▾]  ✉ Convite enviado 12/11 [Reenviar] [Cancelar convite] │
│ (PE) Pedro             pedro@...     Mecânico   ⊘ Desativado      [Reativar] │
└──────────────────────────────────────────────────────────────────┘
O que cada papel faz  ▸  (details recolhido)
```

- A 800 px cada pessoa é uma linha de cartão com duas faixas: (1) iniciais, nome e e-mail; (2) papel, situação e ações, com quebra de linha. Nada de tabela larga.
- Ordem: ativos, depois convites, depois desativados.
- **Situação** (chip com ícone e texto):
  - "Ativo" (`check`, `--text-success`)
  - "Convite enviado em 12/11" (`relogio`, `--text-info`)
  - "Convite vencido" (`alerta`, `--text-warning`). Só se o sistema conseguir saber; senão, fica só "Convite enviado".
  - "Desativado" (`fechar`, `--text-2`)
- **Papel:** `<select class="form-input">` com Dono, Recepção e Mecânico, rótulo invisível "Papel de Ana". Na própria linha do Dono que está usando, só texto (não muda o próprio papel por aqui).
- **Detalhe "O que cada papel faz"** (`<details>`):
  - **Dono:** "Vê e faz tudo: preços, custos, margem, Financeiro, Configurações, pessoas e aparelhos."
  - **Recepção:** "Abre e edita OS com preços, recebe e parcela pagamentos e vê o que falta receber. Não vê custo nem margem, não apaga lançamentos e não entra em Configurações."
  - **Mecânico:** "Vê o quadro e as OS sem nenhum valor em R$. Muda o status, faz a vistoria, tira fotos, anota a quilometragem e usa a agenda. Não cria OS."

**Convidar pessoa (modal):**
- Título: "Convidar pessoa"
- Campos: "Nome" (como aparece nos cartões; até 30 letras), "E-mail".
- "Papel": 3 cartões de rádio (`role=radiogroup`), cada um com nome em negrito e a descrição acima. Nenhum vem marcado.
- Ajuda: "A pessoa recebe um e-mail com um link para criar a senha e o PIN."
- Botões: **Enviar convite** e Cancelar. Carregando: "Enviando...".
- Erros: "Digite o nome." · "Digite um e-mail válido." · "Escolha o papel." · "Este e-mail já tem acesso a esta oficina." · "Sem internet. Conecte para convidar."
- Sucesso (dentro do modal, antes de fechar): título "Convite enviado"; texto "Avise a **Ana**: o e-mail pode demorar alguns minutos e **pode cair no Spam ou Lixo eletrônico**. O link vale por tempo limitado; se vencer, use **Reenviar convite**."; botão **Entendi**.

**Mudar papel:** ao trocar o select, abre a confirmação (o select volta ao valor antigo se cancelar).
- Título: "Mudar o papel de Ana para Mecânico?"
- Texto por destino:
  - Mecânico: "Ana deixa de ver valores em R$, o Financeiro e não cria mais OS. Vale na hora, em todos os aparelhos dela."
  - Recepção: "Ana passa a ver preços e a receber pagamentos, sem custo nem margem. Vale na hora."
  - Dono: "Ana passa a ver e fazer tudo, inclusive custos, margem, pessoas e aparelhos. Vale na hora."
- Botões: **Mudar papel** e Cancelar. Sucesso, em toast: "Papel de Ana mudado para Mecânico."

**Desativar:** `DeleteConfirmationModal`.
- Título: "Desativar Carlos?"
- Texto: "Carlos sai do OficinaPro na hora, em todos os aparelhos, e o PIN dele é apagado. O que ele já fez continua salvo. Você pode reativar depois."
- Botões: **Desativar** (`.btn-danger`) e Cancelar. Toast: "Carlos foi desativado."

**Reativar:** confirmação simples. "Reativar Pedro?" / "Pedro volta a entrar com e-mail e senha e cria um PIN novo no primeiro acesso." Botões **Reativar** e Cancelar.

**Último Dono:** na linha do único Dono ativo, "Desativar" e a opção de outro papel no select ficam com `aria-disabled` e um texto abaixo, em `--text-2`: "É o único Dono. Antes, dê o papel de Dono a outra pessoa." O servidor também recusa; se recusar, o toast usa o mesmo texto.

**Reenviar e cancelar convite:** "Reenviar convite" gera o toast "Convite reenviado para carlos@... Pode cair no Spam." "Cancelar convite" pede confirmação: "Cancelar o convite de Carlos?" / "O link do e-mail para de funcionar." Botões **Cancelar convite** e Voltar.

**Estados:** carregando (3 linhas de esqueleto); sem internet (cartão com faixa "Sem internet: a lista pode estar desatualizada e não dá para convidar nem mudar papéis agora.", ações com `aria-disabled` e motivo "Precisa de internet"); erro ao carregar ("Não foi possível carregar as pessoas." + **Tentar de novo**); vazio (impossível: há pelo menos o Dono).

### 5.2 Aparelhos

**Cartão "Este computador" (sempre o primeiro, ícone `computador`):**

Não autorizado:
```
Este computador ainda não está autorizado
Autorize para várias pessoas entrarem aqui com o PIN.

Nome do aparelho   [PC da recepção________]
Como ele é usado
 ( ) Compartilhado: várias pessoas usam; cada uma entra tocando no nome e digitando o PIN.
 ( ) Pessoal: só uma pessoa usa; fica sempre entrado, sem PIN.
[ Autorizar este computador ]
```
- Erros: "Dê um nome ao aparelho." · "Escolha como ele é usado." · "Sem internet."
- Sucesso, em toast: "PC da recepção autorizado. A partir de agora, a tela 'Quem está usando agora?' aparece aqui."

Autorizado e compartilhado:
- "**PC da recepção** · Compartilhado · autorizado por João em 12/11/2026"
- "Bloquear quando ficar sem uso por": `.segmented` com **5 min / 15 min / 30 min / Nunca**. Salva ao tocar; toast "Bloqueio mudado para 30 minutos."
- Ajuda: "Depois desse tempo parado, a tela volta para 'Quem está usando agora?' e pede o PIN."
- Ao escolher "Nunca", aparece `.cfg-warn`: "Com 'Nunca', o computador fica aberto com a última pessoa. Use só se ele fica num lugar onde clientes não chegam."

**Lista "Outros aparelhos"** (linha por aparelho, ícone `computador` ou `celular`):
- "PC da oficina · Compartilhado · bloqueio 15 min" → [Revogar]
- "Celular do Carlos · Pessoal" → [Revogar]
- "PC do escritório · **Bloqueado por muitas tentativas de PIN**" (chip `alerta` `--text-danger`) → [Liberar de novo] [Revogar]
- "Revogado em 10/11" (chip `--text-2`), sem ações.
- Para o PC compartilhado de outra máquina, o tempo de bloqueio pode ser mudado num `<select>` na própria linha.

**Revogar:** `DeleteConfirmationModal`.
- Título: "Revogar o PC da oficina?"
- Texto: "Ninguém mais entra com PIN nesse computador. Quem estiver usando volta para a tela de e-mail e senha. Para usar de novo, será preciso autorizar outra vez nele."
- Botões: **Revogar** e Cancelar.

**Estado vazio de "Outros aparelhos":** "Nenhum outro aparelho ainda. Os celulares aparecem aqui quando a pessoa entra neles pela primeira vez."

**Recepção e Mecânico num PC não autorizado:** nada de aparelho aparece. Funciona como pessoal: entra com e-mail e senha e fica entrado.

### 5.3 Espaço das fotos (decisão 5)

Cartão pequeno "Espaço das fotos" (ícone `camera`): "Usado: 820 MB de 1 GB (82%)" e uma barra. A partir de 80%, `.cfg-warn`: "O espaço grátis das fotos está quase cheio. Para continuar guardando fotos, será preciso passar para o plano pago. Fale com quem configurou o sistema."

---

## 6. Selo de nuvem, dinheiro sem internet e "sem acesso"

### 6.1 Selo fixo no topo (Q23)

Substitui o `SaveIndicator` do rodapé do menu no modo nuvem; no modo arquivo continua onde está. Componente novo `CloudBadge`, com a lógica pura de texto num `utils/cloudStatus.ts` (como `saveStatus.ts`, testável). É um `<button>` que abre um painel de detalhes.

| Estado (`syncState`) | Ícone | Texto do selo (PC) | Texto curto (celular) | Cor do texto | Borda |
|---|---|---|---|---|---|
| `salvo` | `nuvem` + `check` | "Salvo às 14:32" | "Salvo" | `--text-success` | `--border` |
| `enviando` (N ≥ 1) | `relogio` | "Enviando 3 alterações..." / "Enviando 1 alteração..." | "Enviando 3" | `--text-2` | `--border` |
| `offline`, N = 0 | `sem-internet` | "Sem internet · tudo guardado aqui" | "Sem internet" | `--text-warning` | `--warning` |
| `offline`, N ≥ 1 | `sem-internet` | "Sem internet · 3 guardadas aqui" | "Sem internet (3)" | `--text-warning` | `--warning` |
| `erro` | `alerta` | "Não enviado · ver o que fazer" | "Não enviado" | `--text-danger` | `--danger` |

- Altura de 36 px dentro da barra de 52 px. A área de clique tem 44 px (padding vertical).
- Leitor de tela: `role=status`, `aria-live="polite"` só nas mudanças para `offline`, `erro` e de volta para `salvo` após erro ou sem internet. "Enviando" não é anunciado (igual ao `SaveIndicator`).
- Fundo sempre `--surface-2`. Pastel: o texto de aviso usa `--text-warning` (#7A5200), nunca `--warning`.

**Painel de detalhes (popover ancorado, foco preso, Esc fecha):**
- Salvo: "Tudo o que foi feito neste aparelho já está salvo na internet. Última vez: 14:32."
- Enviando: "Enviando 3 alterações. Pode continuar trabalhando."
- Sem internet: "**Sem internet.** Você pode continuar abrindo OS, mudando status, fazendo vistoria, tirando fotos, agendando e cadastrando clientes. As 3 alterações ficam guardadas neste aparelho e são enviadas sozinhas quando a internet voltar.<br>**Não funciona sem internet:** receber, parcelar, finalizar com pagamento, reabrir, excluir OS e lançamentos do Financeiro.<br>Não desinstale o programa nem limpe os dados do navegador enquanto houver alterações guardadas."
- Erro: o texto de `describeSyncError` reescrito (abaixo) e o botão **Tentar enviar agora**.

**Textos de erro:** reescreve a parte que usa jargão de `describeSyncError` em `src/sync/rejectMessages.ts`.

| Código | Texto novo | O que fazer (no painel) |
|---|---|---|
| `sem_acesso` | Vai para a tela 6.3, não para o selo | — |
| `Cache local…` | "Este aparelho não conseguiu guardar os dados." | "Feche outras janelas do OficinaPro e libere espaço no aparelho. Não feche o programa até o selo mostrar 'Salvo'." |
| `registro_incompleto` | "Um registro chegou pela metade. O programa vai buscar de novo sozinho." | (sem ação) |
| outros | "Não deu para enviar agora. Suas alterações estão guardadas neste aparelho." | "Confira a internet. O programa tenta de novo sozinho; se quiser, toque em Tentar enviar agora." |

Em `CloudDatabaseProvider.tsx:278`, o texto reserva "Erro de sincronização" vira "Não deu para enviar agora."

Os toasts de recusa de `rejectionMessage` ficam como estão. "Servidor" é aceitável nesses textos porque só aparecem em casos raros, mas no `denied` troque "O servidor não aceitou" por "O sistema não aceitou".

### 6.2 Botões de dinheiro sem internet (Q17, Q23)

**Padrão visual "Precisa de internet"** (componente `OnlineOnlyButton` que envolve o botão atual):
- Mantém o tamanho e o rótulo do botão. Fundo `--surface-2`, borda `--border-strong`, texto `--text-2`, ícone `sem-internet` antes do rótulo.
- `aria-disabled="true"`, `aria-describedby` apontando para a linha abaixo ou ao lado: "Precisa de internet" (`--fs-xs`, `--text-2`).
- Em tabela, onde não cabe a linha: o motivo vai num `title` e no toast ao clicar. A linha de cabeçalho da tabela leva uma vez a faixa "Sem internet: receber e marcar como pago voltam quando a internet voltar."
- Clicar ou apertar Enter abre o toast `info`: "**Sem internet.** Receber, parcelar, finalizar, reabrir e excluir só funcionam com internet, para o caixa não ficar errado. O resto continua funcionando."

**Onde se aplica:**

| Tela | Controle |
|---|---|
| Financeiro | "Lançamento" (novo), "Receber" (A receber), "Marcar como pago" / "Desmarcar", "Editar" e "Excluir" de lançamento |
| Kanban (cartão e menu) | Soltar na coluna Finalizado; "Avançar Status" a partir de Aguardando Pagamento; "Voltar Status" a partir de Finalizado; "Restaurar OS"; "Excluir Permanentemente" |
| Kanban (arrastar) | Ao arrastar sem internet, a coluna Finalizado mostra a faixa "Precisa de internet" com `cadeado` e recusa a soltura (o cartão volta). Toast com o motivo acima |
| Processos | No select de status, a opção "Finalizado" fica desabilitada com o texto "Finalizado (precisa de internet)" |
| Janela da OS | Bloco "Pagamento": "Adicionar adiantamento" e remover adiantamento travados, com `.cfg-warn` "Sem internet: adiantamentos só podem ser lançados com internet." Em OS finalizada, preços e itens também travam ("Sem internet: OS finalizada só pode ser mudada com internet, porque mexe no caixa."). O "Salvar OS" continua para o resto |
| Hoje | "Receber pagamento" só leva ao Financeiro: continua ativo |
| Parcelar (InstallmentModal) | Não abre; toast com o motivo |

**Com internet, durante a operação:** o botão mostra "Recebendo..." (ou "Finalizando...", "Excluindo...") com spinner e `aria-busy`.
- Conflito (409), em toast `error`: "Outra pessoa mexeu nesta OS agora há pouco. Os dados foram atualizados. Confira e tente de novo."
- Internet caiu no meio, em toast com ação **Tentar de novo**: "Não deu para confirmar. Toque em Tentar de novo: o pagamento não será lançado duas vezes."

**Papel sem permissão:** o controle **some** (seção 7), nunca aparece travado. A trava "Precisa de internet" é só para quem tem permissão.

### 6.3 "Sem acesso"

Tela inteira opaca, app `inert`. Dois casos distintos (o motor precisa dizer qual):

**A. Pessoa desativada** (broadcast de membership ou RLS negando tudo):
- Ícone `cadeado`. Título: "Seu acesso foi desativado"
- Texto: "Fale com o Dono da oficina. Se havia alterações suas que ainda não tinham sido enviadas, elas ficaram numa cópia de recuperação neste aparelho."
- Botão: **Voltar para a tela de entrada** (em PC compartilhado vai para "Quem está usando"; senão, para Entrar).

**B. Precisa entrar de novo** (acesso vencido ou senha trocada em outro aparelho):
- Ícone `pessoa`. Título: "Entre de novo para continuar"
- Texto: "Por segurança, digite sua senha outra vez. Nada do que você fez se perdeu: está guardado neste aparelho."
- E-mail já preenchido e travado ("ana@exemplo.com" com o link "Não é você?"), campo Senha e botão **Entrar**. Em PC compartilhado também vale o PIN: botão "Usar meu PIN".

**C. Papel mudou enquanto usava** (o toast `cache_discarded` não basta):
- Título: "Seu papel mudou para Mecânico"
- Texto: "O Dono mudou o que você pode ver. O programa vai abrir de novo com o que esse papel permite."
- Botão: **Continuar**.

---

## 7. Controle por papel nas telas existentes

### 7.1 Regras de como esconder

1. **Some, não trava.** Ação sem permissão é retirada do DOM (botão, item de menu, aba, coluna). Nada de botão cinza "sem permissão".
2. **Nunca mostrar "R$ 0,00" no lugar de valor escondido.** Para quem não vê preços, a junção da OS traz `price: 0` e `total: 0`: o componente testa `access.canSeePrices` antes de qualquer `formatMoney`.
3. **Sem buraco no layout:**
   - Tabela: remove a coluna inteira (`<th>` e `<td>`), não deixa célula vazia.
   - Grade de KPIs ou cartões: remove o bloco; a grade (`auto-fill`) reorganiza sozinha.
   - Linha com valor e outra coisa (rodapé do cartão do Kanban): o contêiner só é desenhado se sobrar algum filho.
   - Frase com valor: reescreve sem o valor (ex.: "3 itens · R$ 450,00" vira "3 itens").
   - Abas: com só uma aba sobrando, tira a `tablist` inteira e mostra o conteúdo direto.
4. **Uma fonte de verdade:** hook `useAccess()` que lê `cloud.role` e devolve `can(action)` e `accessFor(role)` de `permissions.ts`. No modo arquivo, tudo liberado (como hoje).
5. **Atalho de uma ação proibida** (ex.: F2 para o Mecânico): toast `info` "Seu papel não cria OS. Peça para a Recepção ou o Dono." Sem efeito.
6. **Aba guardada proibida** (ex.: a "Tela inicial" do PC era Financeiro e quem entrou é Mecânico): abre "Oficina", sem aviso.

### 7.2 Menu lateral (`Sidebar.tsx`, `NAV_ITEMS`)

| Item | Dono | Recepção | Mecânico |
|---|---|---|---|
| Hoje | sim | sim | sim |
| Oficina | sim | sim | sim |
| Agenda | sim | sim | sim |
| Processos | sim | sim | sim |
| Clientes | sim | sim | sim |
| Financeiro | sim | sim | **some** |
| Peças a comprar | sim | sim | sim (não tem R$) |
| Configurações | sim | **some** | **some** |

### 7.3 Por tela e componente

Legenda: **R** = Recepção, **M** = Mecânico. O Dono vê tudo como hoje.

**Kanban (`WorkshopPage`, `KanbanBoard`, `KanbanCard`, `KanbanCardMenu`)**
- Cartão, `.kcard-total`: some para M. `.kcard-foot` só aparece se houver o selo de margem ou fotos.
- Cartão, selo de margem (`marginBadge`): some para R e M, mesmo com `showMarginOnBoard` ligado (precisa de custo).
- Cabeçalho, "Nova OS" e atalho F2: some para M.
- Menu do cartão:
  - "Editar OS" vira "Abrir OS" para M (abre a visão do Mecânico, abaixo).
  - "Documentos...": para M vira "Imprimir vistoria" (só o checklist; a OS impressa tem preços).
  - "Mostrar ao cliente": some para M (mostra valores).
  - "Enviar WhatsApp": todos (a mensagem não tem valor).
  - "Avançar Status" em Aguardando Pagamento e "Voltar Status" em Finalizado: some para M (é finalizar ou reabrir).
  - "Arquivar OS" e "Restaurar OS": some para M.
  - "Excluir Permanentemente": some para M.
- Arrastar para a coluna Finalizado (M): ao começar a arrastar, a coluna mostra "Só Recepção ou Dono finaliza (envolve pagamento)" com `cadeado`. Se soltar, o cartão volta e aparece o toast com o mesmo texto. As outras colunas funcionam.

**Janela da OS (`OSModal`)**
- Recepção:
  - somem o botão de custo (`costToggle`), os campos de custo (`osm-num--cost`) e o `MarginIndicator`;
  - some o bloco "Ver lucro" (`osm-profit-toggle` e o painel);
  - ficam: preços, sugestão do histórico (`HistoryHint`), adiantamentos e total.
- Mecânico ("visão de campo"):
  - Título "OS 1234" (não "Editar OS"). Nº e Data como texto, não como campo travado: campo travado parece quebrado e tem pouco contraste. [Design]
  - **Situação** (bloco novo no topo): luz de status e botões dos próximos passos permitidos, ex. **Passar para Em serviço**; sem Finalizado.
  - **Cliente e veículo**: texto (nome, telefone com "Ligar" e "WhatsApp", veículo, placa). Campo **Km** editável (`os.mileage`).
  - **Serviço**: título "Serviço · 3 itens" (sem R$); lista só com as descrições (peças e serviços, categoria em chip). Sem linha de adicionar, sem remover, sem preço.
  - **Pagamento**: some inteiro.
  - **Vistoria**: botão **Fazer vistoria** (abre o `ChecklistModal`).
  - **Fotos**: igual a hoje (`OSPhotos`).
  - **Observações**: texto só de leitura. Se vazio, a seção some. Ver a pendência 2 na seção 13.
  - Rodapé: sem "Total da OS" nem "Adiantado/Falta pagar". Botões "Fechar" e **Salvar** (aparece só com Km, fotos ou status alterados).

**Processos (`ProcessPage`, `ProcessRow`)**
- Chips "Valor total" e "Valor médio por OS": somem para M.
- Colunas Total (`pr-c-total`) e Pagamento ("A receber" ou "—"): somem para M (`<th>` e `<td>`).
- Total do grupo (`pr-group-total`): some para M.
- "Nova OS": some para M.
- Select de status na linha: M não vê a opção Finalizado nem consegue sair de Finalizado.

**Financeiro (`FinancialPage`, `MarginReport`, `EntryModal`, `ExportModal`)**
- M: tela inteira some (menu).
- R:
  - aba "Margem" some, e com ela a `fin-tabs` (fica só a Visão geral, sem abas);
  - botão "Excluir" do lançamento (`fin-del`) some (`ledger.delete` é só do Dono);
  - KPI "Lucro do período / Prejuízo do período" vira "Saldo positivo do período / Saldo negativo do período" (é caixa, não margem);
  - "Exportar": fica (o relatório não tem custo; o `dev` confere o `ExportModal` antes).

**Clientes (`CRMPage`, `CRMDashboard`)**
- Painel de clientes, para M:
  - somem "Clientes VIP", "Receita do mês", "Ticket médio";
  - somem o cartão "Maiores devedores" e os valores e a "Média" do ranking. O ranking vira só nomes com "N serviços", ou some se ficar vazio de sentido: o `dev` decide pelo menor código; preferência: some;
  - fica "Total de clientes" e "Serviços pendentes".
- Lista, para M: "Em aberto R$ / Atrasado R$" (`ClientRow`) some.
- Detalhe, para M:
  - somem os blocos "Total gasto na oficina" e "Em aberto"; fica "Serviços";
  - o preço na linha do tempo (`tl-price`) some;
  - "Editar cliente" some (`clients.edit`);
  - "Novo cliente" fica (`clients.create`).
- R: igual ao Dono.

**Hoje (`TodayPage`)**
- Ações rápidas, para M: somem "Nova OS" e "Receber pagamento"; fica "Agendar veículo" e entra **Abrir o quadro da oficina** (ícone `oficina`). Com 2 botões, a linha de ações continua com o mesmo tamanho de botão.
- Cartões "Contas vencidas" e "Aguardando pagamento": somem para M.
- Guia de primeiros passos: só para o Dono (os passos levam à Config).
- R: tudo, menos o guia.

**Agenda (`AgendaPage`, `AppointmentModal`)**
- "Excluir" agendamento: some para M (ele usa "Cancelado" ou "Faltou").
- "Criar OS" a partir do agendamento: some para M.

**Peças a comprar (`PartsPage`):** igual para todos (não mostra R$).

**Cadastros (`DatabaseModal`):** só pela Config, então só o Dono. Ver a pendência 3 na seção 13.

**Impressão e documentos (`DocumentsModal`, `ClientSummaryModal`, `printOS`, `printServiceSummary`, `printChecklist`)**
- M: no `DocumentsModal` só a opção "Checklist de vistoria". "OS via geral/cliente/oficina" e "Resumo do serviço" somem (têm preços). "Mostrar ao cliente" some.
- R: tudo, como hoje. O `printOS` não imprime custo; o `dev` confere a variante `SHOP`.

**Atalhos:** F2 (Nova OS) é ignorado para M, com o toast da regra 5.

---

## 8. Celular (Q15), abaixo de 800 px

### 8.1 Moldura

```
┌───────────────────────────┐
│ Oficina    [☁ Salvo] (AN) │  topo 56 px: título da tela, selo curto, iniciais
├───────────────────────────┤
│                           │
│        conteúdo           │
│                           │
├───────────────────────────┤
│ [🔧]   [📅]   [👥]   [⋯]  │  barra de baixo 64 px, ícone + texto
│Oficina Agenda Clientes Mais│
└───────────────────────────┘
```

- Abaixo de 800 px o menu lateral some e entra a barra de baixo (`nav` com `aria-label="Menu principal"`, `aria-current` no item ativo). Respeita `env(safe-area-inset-bottom)`.
- Itens: **Oficina**, **Agenda**, **Clientes**, **Mais**.
- "Mais" abre uma folha de baixo com: Hoje, Processos, Financeiro (se o papel vê), Peças a comprar, Configurações (só o Dono), Aparência (Escuro e Pastel), "Sair deste aparelho". Os itens que não são de campo levam a etiqueta "No computador".
- Iniciais no topo: o mesmo menu da pessoa (4.1), em folha de baixo.
- Sem "Trocar de pessoa" (celular é pessoal).

### 8.2 "Disponível no computador"

Tela de qualquer item fora do Q15 (Hoje, Processos, Financeiro, Margem, Peças a comprar, Configurações, Cadastros, impressão):
- `.empty-state` com ícone `computador`.
- Título: "Disponível no computador"
- Texto: "A tela **Financeiro** precisa de uma tela maior. Abra o OficinaPro no computador da oficina ou num tablet deitado."
- Botão: **Voltar para a Oficina**.
- No menu do cartão e nos documentos, "Documentos..." vira o item travado "Imprimir: no computador", e o toque mostra o mesmo texto em toast.

### 8.3 Oficina (Kanban no celular)

- Campo de busca no topo: rótulo "Buscar", placeholder "Placa, cliente ou nº da OS".
- Linha de chips de status com rolagem horizontal, cada chip com luz, nome e quantidade: "Orçamento 4", "Aprovado 2", "Em serviço 5", "Aguardando pagamento 1", "Finalizado 3". O chip ativo usa `.chip--accent` e `aria-pressed`. Arquivados ficam de fora.
- Abre no último chip usado neste aparelho; na primeira vez, em "Em serviço" para o Mecânico e "Orçamento" para os outros.
- Lista em coluna única, cartão com a largura toda (mesmo `KanbanCard`, com as regras de papel). Sem arrastar no celular: o status muda dentro da OS.
- Toque no cartão abre a OS em tela cheia. Toque longo ou o botão "⋯" abre o menu do cartão em folha de baixo.
- "Nova OS" (Dono e Recepção): botão `.btn` com a largura toda abaixo dos chips: "+ Nova OS". Ver a pendência 1 na seção 13.
- Vazio no chip: "Nenhuma OS em Em serviço."

### 8.4 Ficha da OS no celular (o `OSModal` em tela cheia, coluna única)

- Cabeçalho fixo: "← Voltar", "OS 1234", luz de status.
- Ordem das seções: Situação (botões grandes do próximo passo), Cliente e veículo (com **Ligar** em `tel:` e **WhatsApp**), Km, **Fazer vistoria**, Fotos, Serviço, Observações. Pagamento só para Dono e Recepção, só de leitura: total, adiantado e falta pagar. Mudar valores fica no computador ("Para mudar preços e pagamentos, use o computador.").
- **Fotos:** dois botões com a largura toda:
  - **Tirar foto** (ícone `camera`): `input accept="image/*" capture="environment"`;
  - **Escolher da galeria**: `accept="image/*" multiple`.
  - Miniaturas em 3 colunas.
  - Foto guardada sem internet: selo na miniatura "Guardada · envia com internet" (ícone `relogio`).
  - Erro: "Não deu para guardar esta foto. Tente de novo."
- Rodapé fixo com **Salvar** quando houver mudança.
- Vistoria (`ChecklistModal`) em tela cheia, itens com alvos de 44 px e botões de situação lado a lado.

### 8.5 Agenda no celular

- Topo: "‹ Semana anterior", "Hoje", "Próxima semana ›", e uma linha de chips com os dias (Seg 10 ... Dom 16; o dia de hoje marcado com a etiqueta "Hoje").
- Lista do dia escolhido. Cada agendamento é um cartão com hora, cliente, veículo, motivo e situação.
- **Agendar veículo**: `.btn` com a largura toda no topo.
- `AppointmentModal` em tela cheia.

### 8.6 Busca de cliente no celular

- Lista e detalhe em telas separadas. Lista: campo "Buscar cliente" e itens com 56 px de altura, nome e telefone.
- Detalhe: "← Clientes"; nome; **Ligar** e **WhatsApp**; veículos; histórico de OS com toque para abrir. Valores conforme o papel (7.3).
- O painel de clientes (`CRMDashboard`) não aparece no celular.

---

## 9. Modo nuvem: o que muda nos controles do modo arquivo

| Controle atual | Onde | No modo nuvem |
|---|---|---|
| "Avançado > Local do arquivo de dados (database.json)" (`dbPath`) | Config | **Some.** Entra o cartão "Onde ficam os dados" (abaixo) |
| "Voltar uma cópia salva neste computador" (importar `.json`/`.bak`) | Config > Cópia de segurança | **Some** (trocaria os dados de todos). A restauração vira procedimento de suporte |
| "Cópia no Google Drive" | Config | Fica, só para o Dono (Q20, opcional). Rótulo "Token de acesso" vira "Código de acesso do Google"; ajuda "Um código que identifica o seu acesso ao Google" vira "Um código do Google que libera o envio. Você cria no Google Cloud Console." |
| Pasta dos PDFs | Config | Fica no app de computador. Some no navegador (lá só imprime) |
| `SaveIndicator` no rodapé do menu | Sidebar | Sai; vira o selo no topo |
| Diálogo de conflito de arquivo, "Somente leitura" | `DatabaseContext` | Não aparece no modo nuvem |
| Exportar (Financeiro) | `ExportModal` | Fica; no navegador vira download |
| Toast pós-migração do banco | App | Não se aplica |

**Cartão novo "Onde ficam os dados"** (Dono; ícone `nuvem`):
- "Os dados da oficina ficam guardados na internet. Cada aparelho guarda uma cópia para continuar funcionando sem internet."
- "**Cópia de segurança diária:** todo dia este computador guarda uma cópia completa dos dados nele mesmo." Aparece só no PC do Dono com o app instalado.
- "Última cópia: hoje às 08:12" (ou, em `.cfg-warn`, "Nenhuma cópia nos últimos 2 dias. Abra o OficinaPro neste computador para fazer a cópia.").
- Botões: **Fazer cópia agora** e "Abrir pasta das cópias".
- Fora do app instalado: "A cópia diária é feita pelo computador do Dono, com o programa instalado."

**"Trazer os dados deste computador para a internet"** (etapa 9; só o Dono, só no app instalado, só enquanto a oficina estiver vazia na nuvem):
- Texto: "Envia uma vez o arquivo de dados deste computador para a internet. Depois disso, todos passam a usar os dados da internet."
- Botão: **Escolher arquivo e enviar**.
- Progresso: "Enviando: 1.200 de 3.400 registros".
- Conferência no fim: "Conferido: 812 OS, 340 clientes, caixa de R$ 123.456,78. Igual ao arquivo." Se não bater, em `--text-danger`: "Os números não bateram. Nada foi apagado do computador. Chame o suporte antes de continuar."

---

## 10. Rodadas de implementação

Cada rodada passa por `npm run build`, `npm test` e `$env:TZ='UTC'; npm test`, e depois pelo `ux-revisor` e pelo `verificador`.

| # | Rodada | Agente | Arquivos (principais) | Depende de | Paralelo com |
|---|---|---|---|---|---|
| 1 | Base: ícones novos (0.3); `utils/cloudStatus.ts` (puro + teste); textos de `describeSyncError` e `CloudDatabaseProvider:278`; `OnlineOnlyButton` (visual) | `ui-dev` (textos e CSS) + `dev` (`cloudStatus` e teste) | `Icon.tsx`, `Icon.test.tsx`, `utils/cloudStatus.ts`, `sync/rejectMessages.ts` (+ teste), `styles-components.css` | — | 2 |
| 2 | Barra do topo + selo + painel de detalhes; tela 6.3 (sem acesso, entre de novo, papel mudou) | `ui-dev` | `components/AppTopbar.tsx`, `CloudBadge.tsx`, `styles-topbar.css`; `App.tsx` só para montar | 1; PR 4 do `dev` (provider) | 3 |
| 3 | Telas de Auth: Entrar, Esqueci, Nova senha, Convite (2 passos), Abrindo os dados, código do Dono | `dev` (Auth) + `ui-dev` (telas) | `src/auth/*`, `styles-auth.css` | PR 5 (funções `users`/`pin`) | 2 |
| 4 | Quem está usando + PIN + sem internet + bloqueio por inatividade + Trocar de pessoa + Trocar PIN/senha | `dev` (timer, PIN, verificador local) + `ui-dev` | `src/auth/WhoIsUsing.tsx`, `PinPad.tsx`, `IdleLock.tsx`, `styles-auth.css` | 3 | 5 |
| 5 | Config > Usuários e papéis, Aparelhos, Espaço das fotos | `ui-dev` + `dev` (chamadas `users`/`device`) | `ConfigPage.tsx` (seções novas em componentes próprios: `UsersSection.tsx`, `DevicesSection.tsx`), `styles-config.css` | 3 | 4 |
| 6 | Papéis nas telas: `useAccess()` + regras da seção 7, tela por tela | `ui-dev` | `Sidebar`, `KanbanCard`, `KanbanCardMenu`, `KanbanBoard`, `WorkshopPage`, `OSModal`, `ProcessPage`, `ProcessRow`, `FinancialPage`, `CRMPage`, `CRMDashboard`, `TodayPage`, `AgendaPage`, `DocumentsModal` | 2 | 7 em arquivos disjuntos (6a: Kanban, Processos e Hoje; 6b: OSModal; 6c: Financeiro e CRM) |
| 7 | Dinheiro sem internet: `OnlineOnlyButton` aplicado (6.2); estados "Recebendo..."; toasts de 409 e de falha no meio | `dev` (ligar a `cloud.online` e `moneyClient`) + `ui-dev` | `FinancialPage`, `KanbanBoard`, `KanbanCardMenu`, `ProcessRow`, `OSModal`, `AdvancesList` | 6; PR 6 | — |
| 8 | Celular: moldura (barra de baixo, folha "Mais"), "Disponível no computador", Kanban por chips, OS em tela cheia, câmera, Agenda por dia, Clientes lista e detalhe | `ui-dev` + `dev` (desligar dnd abaixo de 800 px, `capture`) | `styles-mobile.css`, `Sidebar`, `MobileNav.tsx`, `KanbanBoard`, `OSModal`, `OSPhotos`, `AgendaPage`, `CRMPage` | 6, 7; PR 8 | — |
| 9 | Modo nuvem na Config (seção 9) + importação (etapa 9) | `ui-dev` + `dev` | `ConfigPage.tsx` | 5; PR 9 | 8 |

Riscos de regressão:
- (a) O `OSModal` é grande (946 linhas). A visão do Mecânico deve ser um ramo de renderização, não um segundo modal, e o salvar não pode gravar preços zerados (regra do splitter).
- (b) `inert` no app durante o bloqueio não pode desmontar modais.
- (c) Esconder colunas da tabela de Processos sem desalinhar o `colSpan` dos grupos.
- (d) O modo arquivo continua intacto até a virada: todo `useAccess()` devolve "tudo liberado" sem `cloud`.

---

## 11. Critérios de verificação para o `ux-revisor`

Banco sintético, Playwright + Edge, temas Escuro e Pastel, janelas de 800×600 e 390×844 (celular). Cada tarefa é feita "como novato": sem ler código, contando cliques e anotando qualquer texto que não se entenda.

### 11.1 Tarefas (cada uma com o resultado esperado)

1. **Primeiro acesso por convite (celular, 390 px):** abrir o link do convite, criar senha e PIN. Esperado: 2 passos com "Passo 1 de 2"; erros de PIN fácil, PINs diferentes e senha curta legíveis; tela final explica PC e celular.
2. **Esqueci a senha:** pedir o link. Esperado: aviso de Spam visível sem rolar a 800 px; "Mandar de novo" travado por 60 s com contagem.
3. **Entrar no PC compartilhado com PIN** só pelo teclado físico (Tab, setas, números, Esc) e depois só com o mouse no teclado da tela. Esperado: no máximo 1 clique + 6 números; foco sempre visível.
4. **Errar o PIN 5 vezes.** Esperado: contagem regressiva ("Restam N"), bloqueio no 5º com o caminho para e-mail e senha; nenhum número anunciado pelo leitor de tela.
5. **Sem internet (DevTools offline) no PC compartilhado:** "Trocar de pessoa". Esperado: só a pessoa atual entra; os outros cartões mostram "Precisa de internet"; a faixa explica.
6. **Bloqueio por inatividade** (tempo de teste de 1 min): aviso 60 s antes, bloqueio opaco e volta exatamente para a OS aberta com o mesmo PIN. Com outra pessoa: aparece a confirmação "deixou a OS sem salvar".
7. **Dono convida, muda papel, desativa e reativa.** Esperado: confirmações com o efeito descrito; o último Dono não pode ser desativado e o motivo está visível sem passar o mouse.
8. **Dono autoriza este PC como compartilhado e muda o bloqueio para 5 min;** revoga outro aparelho.
9. **Selo:** editar uma OS com internet (vê "Enviando..." e depois "Salvo às HH:MM"); cortar a internet e editar 3 vezes ("Sem internet · 3 guardadas aqui"); voltar a internet ("Salvo"). Painel de detalhes legível nos dois temas.
10. **Dinheiro sem internet:** tentar Receber, Marcar como pago, Lançamento, arrastar para Finalizado, Excluir OS e adicionar adiantamento. Esperado: nada acontece além do toast com o motivo; o motivo está visível ao lado do botão; o botão continua focável.
11. **Como Recepção:** procurar custo, margem, "Lucro", a aba Margem, "Excluir" de lançamento e Configurações. Esperado: nada disso aparece e não sobra buraco.
12. **Como Mecânico:**
    - procurar qualquer "R$" em Oficina, Processos, Clientes, Hoje, Agenda e na janela da OS. Esperado: zero ocorrências de "R$", inclusive "R$ 0,00";
    - mudar o status, fazer a vistoria, tirar foto e anotar km sem ajuda;
    - tentar F2 e arrastar para Finalizado. Esperado: toast claro.
13. **Celular (390 px), como Mecânico:** achar a OS pela placa, passar para "Em serviço", tirar 2 fotos pela câmera, salvar; abrir a Agenda de amanhã; achar um cliente e tocar em Ligar. Esperado: sem rolagem horizontal, alvos de 44 px ou mais, campos sem zoom.
14. **Celular, Mais > Financeiro (Dono):** aparece "Disponível no computador" com "Voltar para a Oficina".
15. **Config no modo nuvem:** não existe campo `database.json` nem "Voltar uma cópia". O cartão "Onde ficam os dados" mostra a última cópia diária.

### 11.2 Conferências gerais

- Varrer a interface buscando as palavras proibidas da 0.1 ("sincroniz", "token", "sessão", "online", "offline", "cache"). Esperado: nenhuma.
- Contraste de 4,5:1 ou mais em todo texto novo nos dois temas, inclusive o selo em aviso no Pastel (`--text-warning`), o "Precisa de internet" (`--text-2`) e os cartões travados. Bordas de controle com 3:1 ou mais.
- A 800 px: a barra do topo cabe sem cortar o selo nem o botão "Trocar de pessoa"; os cartões de "Quem está usando" e as linhas de Usuários não estouram a largura.
- Ícone sempre com texto (ou `aria-label`); cor nunca como único sinal.
- `prefers-reduced-motion`: sem animação no PIN errado.
- Modo arquivo (sem nuvem): nada mudou em relação à versão atual (regressão).

---

## 12. Conflitos de lente registrados

- **Campos travados ou texto na visão do Mecânico:** [Design] venceu [Oficina]. Campo travado parece defeito e tem pouco contraste; texto puro lê melhor de longe.
- **Bolinhas acesas do PIN:** [Auto] só como luz de painel em `--accent`. Nenhuma outra cor nova e sem efeito de brilho, para não pesar.
- **Bloqueio opaco em vez de desfocado:** [Oficina] (privacidade no balcão) e desempenho venceram o [Design] do vidro fosco, que também é proibido nos tokens (sem `backdrop-filter`).

## 13. Pendências para o dono decidir

1. "Abrir OS" no celular (Q15) foi lido como **criar OS** (Dono e Recepção), com a mesma janela da OS em tela cheia. Se for só abrir a ficha de OS existente, a Rodada 8 encolhe.
2. O Mecânico não edita observações (regra atual: `os.editFields` só Dono e Recepção). Na prática ele não registra o diagnóstico. Manter assim?
3. A Recepção perde a tela "Cadastros" (fica dentro de Config). Pela regra (`catalog.create`/`catalog.edit`) ela pode cadastrar. Quer um atalho "Cadastros" fora da Config para a Recepção?
4. Aparelho pessoal (celular) se registra sozinho no primeiro acesso, e o Dono só vê e revoga? (Confirmar com o `arquiteto`.)
5. A tela "Hoje" no celular fica como "Disponível no computador" (seguindo o Q15). Liberar como tela de campo?
6. O sistema consegue saber se um convite venceu? Se não, a situação "Convite vencido" sai da lista.

## Decisões do dono sobre os pontos em aberto (2026-11-12)

Fechadas pela sessão principal com autorização do dono para seguir os planos:
1. "Abrir OS" no celular = abrir a ficha de uma OS existente (status, vistoria, fotos, km). Criar OS só em tela ≥ 800 px.
2. Mecânico não escreve observação (decisão 3 da spec mantida).
3. Recepção acessa **Cadastros** (catálogo e técnicos), conforme `src/services/permissions.ts`; o resto da Config continua só do Dono.
4. Aparelho pessoal **não** se registra: fica logado, sem PIN nem bloqueio. Só PC compartilhado é autorizado pelo Dono (Config > Aparelhos).
5. "Hoje" no celular: "Disponível no computador".
6. Sem estado "Convite vencido": a lista mostra "Convite enviado em <data>" e o botão "Reenviar convite".

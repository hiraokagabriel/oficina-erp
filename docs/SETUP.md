# SETUP: guia do que vamos fazer e como configurar a nuvem

Guia para o dono, passo a passo, do ponto em que estamos (2026-11-18) até a oficina trabalhando na nuvem. Siga as fases **na ordem**. Cada fase diz quem faz, quanto tempo leva, o que pode dar errado e como saber que deu certo.

Documentos de apoio: estado e ordem técnica da virada em `docs/NUVEM-ESTADO.md`; detalhes do site e do celular em `docs/NUVEM-PR8.md`; importação em `docs/NUVEM-PR9.md`; regras técnicas em `docs/NUVEM-SPEC.md`.

> **Regra de ouro:** até o dia da virada (Fase F), **nada usa os dados reais**. Todo teste usa o projeto Supabase de **teste** e bancos **sintéticos** (inventados). O banco real em `C:\OficinaData\database.json` só é tocado no dia da virada, depois de uma cópia de segurança.

---

## 0. Visão geral

| Fase | O que é | Quem | Risco para os dados reais |
|---|---|---|---|
| A | Preparar este PC (ferramentas e logins) | Você | Nenhum |
| B | Testar o modo nuvem no navegador com a sua conta de teste | Você | Nenhum |
| C | Testar o app instalado (exe) com banco sintético: regra de segurança nova (CSP) e importação | Você | Nenhum (banco sintético) |
| D | Publicar o site no Cloudflare Pages (apontando para o **teste**) e testar no celular | Você (contas) + Claude (comandos) | Nenhum |
| E | Preparar o projeto Supabase **real** (sem dados ainda) | Claude, com o seu ok em cada passo | Nenhum (o projeto real está vazio) |
| F | **Dia da virada**: enviar o banco real para a nuvem e atualizar todos os PCs | Você presente + Claude | **Sim**: só com cópia de segurança antes |
| G | Depois da virada: convidar a equipe, autorizar PCs, conferir cópias | Você | Baixo |

Projetos Supabase:
- **Teste**: `xtnnayaxufhmyrqcwwnr` (`oficinapro-teste`). Pode mexer à vontade.
- **Real**: `stblagzkkffbjuzltfrt`. Hoje vazio: nenhuma migração aplicada, nenhuma função, nenhum dado.

---

## Fase A. Preparar este PC

> **Onde digitar os comandos.** Os comandos deste guia são para o **PowerShell** (`$env:TEMP...`). Se digitar pelo `!` dentro do Claude, ele roda no **Git Bash**: troque `$env:TEMPpasta` por `$TEMP/pasta` (ex.: `node scripts/make-synthetic-db.mjs "$TEMP/oficina-teste" --fotos`).

Tempo: 15 a 30 minutos. Uma vez só.

1. **Node e dependências.** No terminal, na pasta do projeto:
   ```powershell
   npm install
   npm run build
   npm test
   ```
   Deu certo se o build termina com `built in` e os testes mostram `1930 passed`.

2. **Login no Supabase pela linha de comando** (abre o navegador para você autorizar):
   ```powershell
   npx supabase login
   ```

3. **Arquivos de ambiente** (ficam fora do git; nunca envie a ninguém):
   - `.env.local`: chave pública do projeto **real** (já existe).
   - `.env.test.local`: acesso ao projeto de **teste** (`TEST_DB_URL`, `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`; já existe).
   - `.env.cloud.local`: app no modo nuvem contra o **teste** (já existe). Conteúdo esperado, só os nomes:
     ```
     VITE_CLOUD=1
     VITE_SUPABASE_URL=https://xtnnayaxufhmyrqcwwnr.supabase.co
     VITE_SUPABASE_ANON_KEY=<chave pública do teste>
     VITE_SITE_URL=http://localhost:1420
     ```

4. **Espaço em disco.** O disco C: deste PC fica cheio com facilidade (o build do Rust usa vários GB). Se faltar espaço, rode `cargo clean` dentro de `src-tauri` (apaga só o cache de compilação; o próximo build recria).

---

## Fase B. Testar o modo nuvem no navegador

Tempo: 20 minutos. Usa a sua conta na "Oficina Teste" (projeto de teste).

1. Rode:
   ```powershell
   npx vite --mode cloud
   ```
2. Abra `http://localhost:1420` no Edge ou Chrome.
3. Entre com o seu e-mail e a **senha temporária** que o Claude passou por último (começa com `Teste-`). Se não tiver, peça: o Claude gera outra com `node scripts/test-seed-owner.cjs <seu e-mail>`.
4. O app pede para criar um **PIN de 6 dígitos**. Crie.
5. A senha temporária vale só no projeto de teste; se quiser outra, peça ao Claude uma nova (`test-seed-owner.cjs`).
6. Experimente: criar OS, mudar de status, receber, parcelar, fotos, agenda, clientes, Financeiro, Config > Usuários, Aparelhos, Cópias e "Onde ficam os dados".
7. Teste sem internet: desligue o Wi-Fi, edite uma OS (funciona; botões de dinheiro ficam cinza) e religue (as edições sobem sozinhas).
8. Teste o celular no próprio PC: aperte F12, clique no ícone de celular e escolha largura 390. Aparecem a barra de baixo e o Kanban por chips.

**Limitações do teste:** convite e "esqueci a senha" **não chegam por e-mail** no projeto de teste (ele não tem SMTP). Para convidar alguém no teste, peça ao Claude o link de convite gerado pela API.

**Dados de exemplo.** A oficina nasce vazia. Para encher com dados falsos (24 OS, 12 clientes, 28 lançamentos, agendamentos), com a oficina ainda sem dados:
```powershell
node scripts/make-synthetic-db.mjs "$env:TEMPoficina-sintetico"
npx vite-node scripts/test-seed-data.ts <seu e-mail> "$env:TEMPoficina-sinteticodatabase.json"
```
O segundo comando usa o mesmo caminho da importação real (conferindo os totais) e imprime uma senha temporária nova.

> Atenção: quando o Claude roda o teste completo do banco (`npm run test:db`), a "Oficina Teste" é apagada e recriada, e você recebe uma senha temporária nova.

---

## Fase C. Testar o app instalado (exe) com banco sintético

Tempo: 40 minutos. **Obrigatório antes de instalar qualquer versão nova nos PCs da oficina.** A versão nova traz uma regra de segurança do Windows/WebView (CSP) que pode, em tese, bloquear algo; só o app de verdade confirma.

### C.1 Gerar um banco sintético

```powershell
node scripts/make-synthetic-db.mjs "$env:TEMP\oficina-teste" --fotos
```
Cria `%TEMP%\oficina-teste\database.json` com 24 OS, clientes falsos e fotos pequenas. Nunca aponta para `C:\OficinaData` (o script recusa).

### C.2 Gerar e abrir o exe (modo arquivo)

```powershell
npm run tauri build -- --debug
```
O exe sai em `src-tauri\target\debug\oficina-erp.exe`.

**Cuidado:** o exe abre o banco do caminho salvo neste PC, e neste PC existe o banco real em `C:\OficinaData`. Para não abrir o real:
1. Antes de abrir o exe, **feche** o OficinaPro que estiver aberto.
2. Abra o exe. Se ele abrir o banco real, **não mexa em nada**: vá direto em Config > Pasta do banco (`dbPath`) e troque para `%TEMP%\oficina-teste`. Feche e abra de novo.
3. Confirme no topo que são os dados falsos ("Cliente Teste 1"...).

### C.3 Roteiro de teste do exe

Aperte F12 para abrir o console (no exe de debug) e deixe aberto. Em cada passo, não pode aparecer mensagem vermelha com "Refused to...".

1. Abrir o app e ver o Kanban com estilo normal.
2. Salvar uma OS (mudar o km e salvar).
3. Foto: adicionar uma foto numa OS, ver a miniatura e abrir em tela cheia.
4. Imprimir a OS (cliente e oficina) e a vistoria: a prévia sai formatada.
5. Salvar PDF.
6. Financeiro > Exportar CSV.
7. WhatsApp pelo cartão e pelo cliente: abre o link.
8. Tema Pastel: escolher, fechar o app, abrir de novo: não pisca escuro.
9. Backup no Google Drive (se você usa): enviar.

Deu certo se tudo funciona e o console não mostra "Refused to". Se aparecer, copie a mensagem e mande ao Claude.

> **Feito pelo dono em 2026-11-18** (C.3 e C.4 sem falhas).

### C.4 Testar a importação no app instalado (opcional, recomendado)

A importação "Enviar banco para a nuvem" só funciona no app instalado, e até agora foi testada de forma simulada. Para testá-la de verdade, o Claude precisa gerar um exe no **modo nuvem apontando para o teste** (ainda não há script pronto para isso; ver "O que ainda falta construir"). Peça ao Claude: "gere o exe nuvem de teste". Depois:
1. O Claude cria uma oficina de teste vazia para você (`test-seed-owner.cjs <e-mail> --vazio`).
2. Abra o exe nuvem, entre, e a tela "Falta trazer os dados da oficina" aparece.
3. Aponte para `%TEMP%\oficina-teste\database.json` e clique "Enviar banco para a nuvem".
4. Confira o relatório "Arquivo × Internet": todas as linhas iguais. Clique "Concluir".
5. Confira: o app abre com os dados; o arquivo sintético ficou "lacrado" (o app antigo o abre só para leitura).

---

## Fase D. Publicar o site e testar no celular

Tempo: 1 hora. O site aponta para o projeto de **teste** até a virada.

### D.1 Escolher o nome do site

O endereço será `https://<nome>.pages.dev` e aparece nos e-mails de convite. Exemplos: `andersonmecanica`, `oficina-anderson`. Só letras minúsculas, números e hífen. **Decida e avise o Claude.**

### D.2 Criar a conta Cloudflare (você)

1. Acesse `dash.cloudflare.com` e crie a conta (grátis).
2. No terminal deste PC:
   ```powershell
   npx wrangler login
   ```
   Autorize no navegador.
3. Crie o projeto do site (troque `<nome>`):
   ```powershell
   npx wrangler pages project create <nome> --production-branch main
   ```

### D.3 Publicar (Claude pode fazer)

1. Em `.env.cloud.local`, troque `VITE_SITE_URL` para `https://<nome>.pages.dev`.
2. Gere e envie:
   ```powershell
   npm run build:web
   npx wrangler pages deploy dist --project-name <nome> --branch main
   ```
   Publique sempre na `main`: os endereços de prévia (`<hash>.<nome>.pages.dev`) não passam na trava de origem das funções.
3. Volte `VITE_SITE_URL` para `http://localhost:1420` se quiser continuar testando localmente.

### D.4 Avisar o Supabase de teste do endereço novo

No painel do Supabase, projeto **teste** (`xtnnayaxufhmyrqcwwnr`):
1. **Authentication > URL Configuration**:
   - Site URL: `https://<nome>.pages.dev`
   - Redirect URLs (adicione as três): `https://<nome>.pages.dev/convite`, `https://<nome>.pages.dev/nova-senha`, `http://localhost:1420/*`
2. Segredos das funções (Claude faz):
   ```powershell
   npx supabase secrets set SITE_URL=https://<nome>.pages.dev CORS_ORIGINS=https://<nome>.pages.dev --project-ref xtnnayaxufhmyrqcwwnr
   ```

Confira: `curl -I https://<nome>.pages.dev` responde 200 e mostra o cabeçalho `content-security-policy`.

### D.5 Testar no celular real

Para cada celular (um Android e, se houver, um iPhone):
1. Abra `https://<nome>.pages.dev` no Chrome (Android) ou Safari (iPhone).
2. Entre com a sua conta de teste.
3. **Instale na tela inicial**: Android, menu ⋮ > "Instalar app"; iPhone, botão Compartilhar > "Adicionar à Tela de Início". No iPhone isso é importante: sem instalar, o Safari apaga os dados guardados após 7 dias sem uso.
4. Teste: achar OS pela placa, abrir OS, "Tirar foto" (câmera de verdade), anotar km, salvar.
5. Feche o app, ponha o celular em modo avião e abra de novo: ele abre com os dados.
6. Tire uma foto em modo avião; tire o modo avião: a foto sobe sozinha.

Anote o que estranhar e mande ao Claude.

---

## Fase E. Preparar o projeto Supabase real (antes do dia)

Tempo: 1 a 2 horas. O projeto real está vazio, então esta fase não arrisca dados, mas cada passo aplica coisas permanentes no projeto real: **o Claude pede o seu ok antes de cada um**.

### E.1 E-mail (SMTP) que não caia no spam (você)

O real já usa o Brevo com remetente Gmail, mas os e-mails caem no spam. Sem isso, convite e "esqueci a senha" ficam difíceis.
- Opção simples (piloto): manter e avisar cada pessoa para olhar o spam e marcar "Não é spam".
- Opção definitiva: domínio próprio no Brevo com SPF e DKIM (exige comprar um domínio).

Teste: no painel do real, Authentication > Users > "Invite user" para um e-mail seu secundário; veja se chega e onde.

### E.2 Endereços do site no Auth do real (você, no painel)

Projeto **real** (`stblagzkkffbjuzltfrt`), Authentication > URL Configuration:
- Site URL: `https://<nome>.pages.dev` (hoje está `localhost:3000`, errado).
- Redirect URLs: `https://<nome>.pages.dev/convite`, `https://<nome>.pages.dev/nova-senha`.
- **Não** adicione `localhost` no real.

### E.3 Revisão final do SQL (Claude)

Antes de aplicar no real, o `revisor` confere as 7 migrações em ordem contra o projeto vazio. É a única revisão ainda não feita.

### E.4 Aplicar as migrações no real (Claude, com o seu ok)

Ordem obrigatória (o comando aplica todas, na ordem do nome):
1. `20261111120000_nuvem_inicial.sql`
2. `20261112120000_auth_pin_device.sql`
3. `20261112130000_pin_unlock.sql`
4. `20261117120000_money_op_hash.sql`
5. `20261118120000_import_aal2.sql`
6. `20261118130000_import_finish_expected.sql`
7. `20261118140000_member_reactivated_at.sql`

```powershell
npx supabase db push --dry-run   # mostra o que vai aplicar, sem aplicar
npx supabase db push             # aplica no projeto ligado (o real)
```

### E.5 Implantar as funções no real (Claude, com o seu ok)

**Só depois das migrações** (a função nova lê colunas que as migrações criam):
```powershell
npm run build:functions
npx supabase functions deploy users  --project-ref stblagzkkffbjuzltfrt --use-api
npx supabase functions deploy pin    --project-ref stblagzkkffbjuzltfrt --use-api
npx supabase functions deploy device --project-ref stblagzkkffbjuzltfrt --use-api
npx supabase functions deploy money  --project-ref stblagzkkffbjuzltfrt --use-api
npx supabase secrets set SITE_URL=https://<nome>.pages.dev CORS_ORIGINS=https://<nome>.pages.dev --project-ref stblagzkkffbjuzltfrt
```
**Nunca** ligue `CORS_ALLOW_LOCALHOST` no real (só existe para o teste).

### E.6 Criar a oficina real e a sua conta de Dono (você, no painel)

1. Authentication > Users > "Add user" > "Create new user": seu e-mail, uma senha forte, marque "Auto Confirm User".
2. SQL Editor do projeto real, rode (troque os valores entre `< >`):
   ```sql
   insert into public.workshops (name) values ('<nome da oficina>') returning id;
   ```
   Anote o `id`. A oficina nasce com `import_state = 'vazio'`: o dinheiro fica travado até a importação ser concluída.
   ```sql
   insert into public.memberships (workshop_id, user_id, role, display_name)
   select '<id anotado>', id, 'dono', '<seu nome>' from auth.users where email = '<seu e-mail>';
   ```
3. Não crie ninguém mais agora: a equipe entra por convite depois da virada (Fase G).

### E.7 Publicar o site apontando para o real (Claude)

Na véspera ou no dia, o Claude gera o site com as chaves do **real** e publica no mesmo endereço (ver "O que ainda falta construir": falta o script de build com as chaves do real).

### E.8 Gerar o instalador do app nuvem (Claude + entregador)

O `entregador` prepara a versão nova (número de versão, notas em `docs/VERSOES.md`, instalador) já no modo nuvem apontando para o real, e você testa o instalador em um PC antes do dia (com o real ainda vazio: só login e a tela "Falta trazer os dados").

---

## Fase F. Dia da virada

Tempo: meio período. **Você precisa estar presente**, de preferência num dia de pouco movimento (fim de semana ou fim do expediente). Todos os PCs são atualizados **no mesmo dia**.

### F.1 Antes de começar (checklist)

- [ ] Fases C, D e E concluídas, sem pendência.
- [ ] Instalador nuvem testado num PC (E.8).
- [ ] Ninguém vai usar o sistema nas próximas horas.
- [ ] Internet estável no seu PC.

### F.2 Passo a passo

1. **Fechar o OficinaPro em todos os PCs.** Confirme um por um. Ninguém pode salvar no arquivo durante o envio (o app detecta e não conclui, mas é melhor evitar).
2. **Esperar a sincronização da pasta** (OneDrive/Drive/etc.) terminar no seu PC.
3. **Cópia de segurança manual**: copie `C:\OficinaData\database.json` e a pasta `C:\OficinaData\fotos` para um pendrive. (O app também faz uma cópia automática, `database-pre-nuvem-*.json`, mas a do pendrive é a sua garantia.)
4. **No seu PC, instale o app nuvem** (instalador da Fase E.8).
5. Abra, entre com a sua conta de Dono do real. Aparece "Falta trazer os dados da oficina".
6. Confira o caminho do banco (`C:\OficinaData\database.json`) e clique **"Enviar banco para a nuvem"**.
7. Espere. O app mostra as etapas: cópia de segurança, conferência, envio, fotos, conferência de volta. As fotos podem levar alguns minutos.
   - Se aparecer **"Há dados para consertar"**: o app achou algo estranho no arquivo (ex.: identificador repetido). Nada foi enviado. Mande a lista ao Claude.
   - Se a internet cair: "Tentar de novo" é seguro (não duplica nada).
8. **Confira o relatório "Arquivo × Internet"**: número de OS, clientes, lançamentos, caixa em R$, total das OS, adiantamentos e fotos. Todas as linhas devem estar iguais. Compare dois ou três números com o que você conhece (ex.: saldo do caixa).
9. Clique **"Concluir"**. O app libera a oficina, lacra o arquivo antigo (o app antigo passa a abri-lo só para leitura, com o aviso "Este banco foi enviado para a nuvem") e abre normalmente.
10. Teste rápido no seu PC: abra 3 OS conhecidas, confira valores, faça um recebimento de teste se quiser.
11. **Instale o app nuvem nos outros PCs**, um por um. Em cada um, você entra com a sua conta, vai em Config > Aparelhos e clica **"Autorizar este computador"** (para o balcão, que é compartilhado).
12. Publique o site com as chaves do real (E.7), se ainda não fez.
13. Convide a equipe (Fase G).

### F.3 Se algo der errado no dia (reversão)

- **Antes de clicar "Concluir"**: basta fechar o app nuvem e reabrir o app antigo. Nada mudou no arquivo. Se quiser limpar o que subiu, "Apagar e recomeçar" (pede para digitar APAGAR).
- **Depois de "Concluir"**:
  1. Reinstale a versão antiga (0.2.0) nos PCs.
  2. Restaure o arquivo: copie o `database.json` do pendrive (ou o `database-pre-nuvem-*.json` de `%LOCALAPPDATA%\com.oficinapro.app\backups\`) de volta para `C:\OficinaData\`.
  3. Avise o Claude para zerar a oficina no real antes de tentar de novo.
- O que for feito na nuvem depois da virada não volta para o arquivo automaticamente. A cópia diária (Fase G) é um arquivo no formato antigo que serve de ponte, mas **fotos tiradas na nuvem não entram nela**.

---

## Fase G. Depois da virada

1. **Convidar a equipe**: Config > Usuários > Convidar, com e-mail e papel:
   - **Dono**: tudo.
   - **Recepção**: OS, clientes, agenda, financeiro; não vê custos nem margem; não mexe em configurações.
   - **Mecânico**: só km, fotos e situação permitida; não vê preços nem financeiro.
   A pessoa recebe o e-mail (avise para olhar o spam), cria a senha e o PIN.
2. **PC do balcão (compartilhado)**: com ele autorizado, cada pessoa entra pelo PIN em "Quem está usando". O PC bloqueia sozinho depois de alguns minutos sem uso.
3. **Celulares**: cada pessoa abre o site, entra e instala na tela inicial. Celular pessoal fica entrado, sem PIN.
4. **Cópia de segurança diária**: o app do Dono, no seu PC, faz uma cópia sozinho a cada abertura (se a última tiver mais de 20 h). Elas ficam em `%LOCALAPPDATA%\com.oficinapro.app\backups\nuvem\` (as 30 mais recentes) e vão ao Google Drive se ele estiver configurado. Em Config > "Onde ficam os dados" aparece a data da última cópia; se passar de 2 dias, aparece um aviso.
5. **Desligar alguém**: Config > Usuários > Desativar. A pessoa perde o acesso na hora; se for o caso, revogue também o aparelho dela em Config > Aparelhos.
6. **Fotos**: o espaço grátis do Supabase é 1 GB. O "Espaço das fotos" em Config mostra o uso aproximado.

---

## Problemas comuns

| O que aparece | O que é | O que fazer |
|---|---|---|
| "Disse que enviou o e-mail, mas não chegou" | No teste não há SMTP; no real, spam | Teste: peça o link ao Claude. Real: olhe o spam |
| Botões de dinheiro cinza | Sem internet | Receber, parcelar, finalizar, reabrir e excluir só com internet; o resto funciona |
| "Não deu para confirmar. Tentar de novo" | A resposta do servidor se perdeu | Toque em "Tentar de novo": não lança duas vezes |
| "Outra pessoa mexeu nesta OS agora há pouco" | Dois PCs no mesmo pagamento | Os dados já foram atualizados; confira e refaça se precisar |
| "Os dados antigos ainda estão sendo trazidos para a nuvem" | A importação não foi concluída | Termine a importação no PC do Dono |
| "Somente leitura: este banco não aceita alterações" | O app antigo abriu um banco lacrado ou de versão nova | Use o app novo |
| "Preparando este aparelho" demora | Primeira abertura baixando tudo | Espere; se falhar, "Tentar de novo" |
| "N fotos ainda não subiram" ao sair | Fotos tiradas sem internet | Espere a internet antes de sair, ou elas sobem quando a mesma pessoa entrar de novo |
| PIN bloqueado | 5 erros seguidos | Entre com e-mail e senha e crie um PIN novo |

---

## O que ainda falta construir (o Claude faz antes do dia)

1. **Script para gerar o exe no modo nuvem** apontando para o real (Fase E.8). Para o **teste** já há a receita (identificador próprio `com.oficinapro.nuvemteste`, dados separados do app instalado, chaves do `.env.cloud.local`), numa pasta de compilação à parte para não sobrescrever o exe do modo arquivo:
   ```powershell
   $env:CARGO_TARGET_DIR = "$env:TEMP	arget-nuvem"
   npm run tauri build -- --debug --no-bundle --config scripts/tauri.nuvem-teste.json
   ```
   O exe sai em `%TEMP%	arget-nuvemdebugoficina-erp.exe`. Precisa de uns 4 GB livres no C:. Hoje o `npm run tauri build` sem `--config` gera só o modo arquivo.
2. **Script de build do site com as chaves do real** (Fase E.7). Hoje o `npm run build:web` usa `.env.cloud.local`, que aponta para o teste.
3. **Revisão do SQL** antes de aplicar no real (Fase E.3).
4. **Cadastro da verificação em 2 etapas (TOTP) do Dono pelo app**: ainda não existe tela para isso. Sem TOTP, o Dono entra só com e-mail e senha (o sistema já aceita assim). Recomendado ativar depois da virada.
5. **Pergunta em aberto para você**: no Financeiro, "Receitas" hoje soma OS que ainda estão em aberto. É essa a regra que você quer?

Depois da virada, o PR 12 remove o modo arquivo do código e os comandos Rust sem uso.

# Versões do OficinaPro

Notas em linguagem simples para a oficina. A versão mais nova fica no topo.

## 0.3.0 (nuvem) (não lançada: aguardando o dia da virada)

Esta é a versão em que o OficinaPro **passa a guardar os dados na internet** (nuvem), em vez de um arquivo na pasta sincronizada. O instalador da 0.3.0 já nasce no modo nuvem, apontando para o projeto real. Só instale no dia da virada, com o dono presente (passo a passo em `docs/SETUP.md`, Fase F).

### O que muda para quem usa

- **Login com e-mail e senha.** Cada pessoa entra com a própria conta. Quem convida a equipe é o Dono.
- **PIN no computador do balcão.** O PC compartilhado fica autorizado pelo Dono (Config > Aparelhos). Cada pessoa escolhe o próprio nome em "Quem está usando" e digita o PIN de 6 números. O PC bloqueia sozinho depois de alguns minutos parado. 5 erros seguidos bloqueiam o PIN: entre de novo com e-mail e senha e crie outro.
- **Três papéis.** Dono vê tudo. Recepção cuida de OS, clientes, agenda e financeiro, mas não vê custos nem margem e não mexe em configurações. Mecânico só vê o que precisa (km, fotos, situação), sem preços nem financeiro.
- **Celular e site.** O sistema abre no celular pelo endereço **https://andersonmecanica.pages.dev**. Dá para instalar na tela inicial. No celular: Kanban, OS, Agenda e Clientes.
- **Vários aparelhos ao mesmo tempo.** O que uma pessoa muda aparece nos outros aparelhos sem precisar reabrir.
- **Fotos na nuvem.** As fotos das OS sobem para a internet e aparecem em todos os aparelhos. O espaço grátis é 1 GB (Config mostra o uso). Foto tirada sem internet sobe quando voltar a conexão.
- **Dinheiro só com internet.** Receber, parcelar, finalizar, reabrir e excluir OS precisam de internet (o resto funciona sem). Se aparecer "Não deu para confirmar", toque em "Tentar de novo": não lança duas vezes.
- **Financeiro novo, "Três caixas".** A Visão geral do computador foi refeita com três caixas: o que entrou, o que saiu e o que está previsto. Regra nova: **os totais contam só o que foi pago**. OS em aberto e despesa ainda não paga ficam como "previsto", não como dinheiro no caixa.
- **Despesas: "Já paguei" ou "Vou pagar em [data]".** Ao lançar uma saída, escolha se já foi paga ou quando vai pagar. Dono e Recepção podem marcar "Paguei" depois, e "Desfazer" se foi engano.
- **Correções:** janela de parcelamento legível nos dois temas; título "Gestão de Oficina" e "Terça-feira" com acento certo; "Em Serviço" legível no tema Pastel; menu do card com "Voltar situação" e "Avançar situação"; telefone com máscara em Clientes; excluir OS diz o nome do cliente e avisa que não dá para desfazer; banco somente leitura avisa "Somente leitura: este banco não aceita alterações." em vez de fingir que salvou.

### O que muda no procedimento

- **Instalar em todos os PCs no mesmo dia.** Primeiro o PC do Dono: importar o banco antigo, conferir o relatório "Arquivo × Internet" e só então "Concluir". Depois os outros PCs, um por um.
- **O banco antigo fica lacrado.** Depois de "Concluir", o `database.json` antigo é marcado como enviado para a nuvem e a versão 0.2.0 só abre ele em leitura ("Este banco foi enviado para a nuvem"). Não use mais esse arquivo no dia a dia. As fotos antigas continuam na pasta `fotos`, mas já foram copiadas para a nuvem.
- **Cópia diária automática.** O app do Dono, ao abrir (se a última cópia tiver mais de 20 horas), guarda uma cópia em `%LOCALAPPDATA%\com.oficinapro.app\backups\nuvem\` (as 30 mais recentes) e envia ao Google Drive, se estiver configurado. Config > "Onde ficam os dados" mostra a data da última; passou de 2 dias, aparece um aviso. Fotos tiradas na nuvem não entram nessa cópia.
- **Cópia de segurança antes da importação.** O app guarda `database-pre-nuvem-*.json` em `%LOCALAPPDATA%\com.oficinapro.app\backups\`. Faça também a sua cópia no pendrive (banco e pasta `fotos`).
- Formato do arquivo antigo: não muda (segue v5).

### Mudanças técnicas

- Modo nuvem (Supabase, cache IndexedDB, PWA) ligado por `VITE_CLOUD=1`; o instalador sai de `npm run tauri:build:real` (identificador `com.oficinapro.app`, o mesmo de hoje; chaves em `.env.real.local`, fora do git) e o site de `npm run deploy:web:real`.
- Política de segurança do conteúdo (CSP) no app Tauri, já testada pelo dono no exe de teste.
- `npm run build` também confere os tipos do `vite.config.ts`; teste de guarda contra acentos corrompidos.
- `LedgerEntry.pending` (opcional, só despesa) para despesa prevista; sem migração.

### Voltar (reversão)

- **Antes de "Concluir" a importação:** feche o app nuvem e reabra o antigo. Nada mudou no arquivo. "Apagar e recomeçar" limpa o que subiu.
- **Depois de "Concluir":**
  1. Feche o OficinaPro em todos os PCs.
  2. Desinstale a 0.3.0 e reinstale a 0.2.0 em todos.
  3. Restaure o banco: copie o `database.json` do pendrive (ou o `database-pre-nuvem-*.json` de `%LOCALAPPDATA%\com.oficinapro.app\backups\`, renomeando para `database.json`) por cima de `C:\OficinaData\database.json`, com o app fechado.
  4. Avise o Claude para zerar a oficina no projeto real antes de tentar de novo.
- **O que se perde:** tudo o que foi lançado na nuvem depois da virada (OS, pagamentos, fotos novas). A cópia diária em `backups\nuvem\` está no formato antigo e serve de ponte para recuperar os lançamentos, mas sem as fotos novas. Reverter no mesmo dia da virada perde pouco ou nada.

## 0.2.0 (novembro de 2026)

### O que mudou

- **Financeiro mais seguro.** O sistema agora impede erros que bagunçavam o caixa: não deixa excluir ou reabrir uma OS de forma que quebre os lançamentos, e avisa ao receber uma OS parcelada.
- **Salvar a OS com dois computadores.** Se outra pessoa mexeu na mesma OS em outro PC, o sistema junta as duas alterações ao salvar, em vez de apagar o que o outro fez. Fotos retiradas vão para a lixeira, não são apagadas.
- **Dívida e última visita na OS.** Ao abrir a OS, aparecem quanto o cliente ainda deve e quando foi a última visita dele.
- **Campo "Data de pagamento" removido** do cadastro da OS. A data passa a ser a do recebimento.
- **A receber e Hoje.** Agora mostram também as OS pendentes (ainda não pagas).
- **Aviso ao editar OS finalizada.** O sistema avisa antes de alterar uma OS que já foi finalizada.

### Banco de dados

- O formato do banco **não mudou** (continua na versão 5). Nenhuma migração, nenhum backup `pre-v` novo é criado por esta versão.
- Mesmo assim, **atualize todos os computadores no mesmo dia.** A versão antiga não entende o salvamento novo da OS e pode perder informação de controle do banco ao salvar.

### O que fazer (atualizar os PCs)

1. Combine um dia em que ninguém esteja usando o sistema. Feche o OficinaPro em todos os PCs.
2. No PC principal: execute o instalador novo (`OficinaPro_0.2.0_x64-setup.exe`, ou `OficinaPro_0.2.0_x64_en-US.msi`) e abra o programa.
3. Em Configurações, confira que o caminho do banco é o de sempre (padrão `C:\OficinaData\database.json`).
4. Espere a pasta sincronizar (o ícone do serviço de sincronização sem setas girando).
5. Só então instale e abra nos outros PCs, um de cada vez, no mesmo dia.
6. Nunca abra uma versão antiga depois de ter aberto a nova.

### Teste rápido depois de instalar (use um banco de teste antes do real)

1. Abrir o app e conferir o caminho do banco em Configurações.
2. Abrir uma OS, mudar uma observação e salvar.
3. Ver o Kanban.
4. Abrir o Financeiro (A receber e Margem) e a Agenda.
5. Imprimir uma OS em PDF e olhar se a página A4 está certa.
6. Conferir se o backup do Google Drive foi feito.
7. Em dois PCs: editar a mesma OS nos dois e salvar; conferir que as duas mudanças ficaram.
8. Editar uma OS finalizada: deve aparecer o aviso.

### Voltar para a versão anterior (0.1.0)

1. Feche o OficinaPro em todos os PCs.
2. Desinstale a versão 0.2.0 (Configurações do Windows, Aplicativos) e instale o instalador antigo (0.1.0).
3. Como o formato do banco não mudou, o banco atual abre na versão antiga. Se houver problema com os dados, restaure um backup da pasta `%LOCALAPPDATA%\com.oficinapro.app\backups` (copie o arquivo escolhido por cima do `database.json`, com o app fechado). Backups `pre-vN` só existem quando uma versão sobe o formato do banco.
4. O que se perde ao restaurar: tudo o que foi lançado depois da data do backup. As fotos ficam na pasta `fotos` ao lado do banco e não entram no backup.
5. Reverta todos os PCs no mesmo dia.

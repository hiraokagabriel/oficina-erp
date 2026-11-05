# Versões do OficinaPro

Notas em linguagem simples para a oficina. A versão mais nova fica no topo.

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

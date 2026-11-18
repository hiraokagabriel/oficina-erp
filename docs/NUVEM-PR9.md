# PR 9: importação e cópia diária (plano)

Plano do `arquiteto` (2026-11-17). O formato do `database.json` não muda (`CURRENT_SCHEMA_VERSION` continua 5); a única mudança no arquivo é a lacração opcional (D4), que só troca `meta.schemaVersion` para 1000 e acrescenta `meta.cloud`.

## Decisões (tomadas pela sessão com autonomia do dono, pelas recomendações do arquiteto)

| # | Decisão | Escolha |
|---|---|---|
| D1 | `aal2` nas `import_*` para Dono com TOTP | Sim (migração pequena) |
| D2 | Dados problemáticos no arquivo | Bloquear e mostrar a lista |
| D3 | Foto que falta no disco | Concluir mesmo assim, com a lista no relatório |
| D4 | Lacrar o `database.json` ao concluir | Sim, já no PR 9, testado só com banco sintético |
| D5 | Aviso de cópia atrasada / retenção | 2 dias / 30 cópias |
| D6 | Auditoria em arquivo / Drive | Auditoria fica na nuvem; cópia diária vai ao Drive se configurado (`uploadToDrive`) |
| D7 | `money` recusa com importação pendente | Sim |

## Fluxo "Enviar banco para a nuvem"

Só o Dono, só no app instalado, oficina em `vazio` ou `importando`. Tela de bloqueio antes do app (`pickScreen`: `importar` para o Dono, `preparando` para os outros) enquanto `import_state !== 'concluido'`: sem motor de envio, fila nem Realtime.

1. Caminho do banco (padrão: `localStorage.oficina_db_path` deste PC); `load_database`; guarda `meta.revision`.
2. `parseDatabase` + `migrate`; versão futura ou lacrado é recusado.
3. `backup_pre_cloud(content)` → `backups\database-pre-nuvem-<stamp>.json`; falhou, para.
4. `prepareForCloud` + `checkImportable` (ids vazios/repetidos, dinheiro não inteiro, `type` fora de CREDIT/DEBIT, `\u0000`).
5. `splitDatabase` → lotes ≤ 500 linhas e ≤ ~1 MB → `import_rows`; 57014 divide o lote; retomar = reenviar tudo (idempotente).
6. `import_finish(false)` × `expectedTotals(prepared)`.
7. Fotos pelos metadados das OS + `photo_inventory` (Rust); `storage.list` pula as já enviadas; 3 em paralelo.
8. Volta completa: `pullAllRows` → `joinDatabaseReport` × `prepareForCloud(db)`.
9. `read_db_meta` de novo: revision mudou → não conclui; oferece `import_reset`.
10. Relatório "Arquivo × Internet"; "Concluir" só com tudo igual → `import_finish(true)`.
11. Lacrar: `save_database_atomic` com a revision esperada, `schemaVersion = 1000`, `meta.cloud = {workshopId, at}`.

Oficina `importando`: "Continuar envio" / "Apagar e recomeçar". Oficina nova sem arquivo: "Começar sem dados".

## Cópia diária

App do Dono no Tauri, ao abrir, se `last_export_at` > 20 h ou vazio, e botão "Fazer cópia agora". Fonte: o servidor (`pullAllRows` + `joinDatabaseReport` + `exportV5`). `save_daily_export` → `backups\nuvem\nuvem-<stamp>.json`; retenção só do prefixo `nuvem-`. Config: cartão "Onde ficam os dados" (última cópia, aviso após 2 dias, "Fazer cópia agora", "Abrir pasta das cópias").

## Rodadas

| R | Escopo | Ordem |
|---|---|---|
| 1 | `src/sync/importCheck.ts` (`checkImportable`, `expectedTotals`, `compareTotals`, `buildBatches`, `photoManifest`, `roundTripDiff`); fixture para `src/sync/testKit.ts` | paralela 2, 3 |
| 2 | Rust: `save_daily_export`, `backup_pre_cloud`, `photo_inventory`, retenção por prefixo | paralela 1, 3 |
| 3 | Migração `import_aal2`; `money` recusa com importação pendente; `test-seed-owner --vazio`; pgTAP | paralela 1, 2 (reseta o teste: refazer a conta do dono) |
| 4 | `src/sync/fullPull.ts`, `src/sync/importRunner.ts` (dependências injetadas) | depois de 1 |
| 5 | `src/sync/dailyExport.ts` | com 4 |
| 6 | Telas: `membership`, `screens`, `ImportScreen`, `DataPlaceSection`, gancho da cópia, banner de lacrado | depois de 4 e 5 |
| 7 | `scripts/make-synthetic-db.mjs` (banco v3/v5 sintético com fotos) | com 6 |
| 8 | `verificador` + `revisor` no projeto de teste com oficina `vazio` | por último |

Banco de teste da importação: `node scripts/make-synthetic-db.mjs <pasta> [--versao 3|5] [--os N] [--fotos]` (nunca sobrescreve; recusa `C:\OficinaData` e as pastas em `OFICINA_PASTA_SINCRONIZADA`, separadas por `;`; `--fotos` exige v5).

## Riscos

- Fotos não entram em nenhuma cópia; Storage grátis sem backup. Voltar à versão antiga perde fotos tiradas na nuvem.
- Dois PCs importando arquivos diferentes se misturam; a conferência acusa e o Dono usa `import_reset`.
- 1 GB grátis do Storage: o relatório mostra o total antes e avisa acima de 80%.

## Documentos a corrigir

NUVEM-SPEC seção 3 (não há função `import`; são funções do banco) e seção 7 (`backups\nuvem\`, `backup_pre_cloud`, `photo_inventory`, tela de bloqueio). Alinhar "2 dias" entre NUVEM-SPEC e NUVEM-UX.

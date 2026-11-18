# Próximos passos do OficinaPro

Lista viva das atualizações futuras, discutidas com o dono. Cada item diz o que é, por que e o estado. Ao começar uma sessão de trabalho, leia este arquivo junto com `docs/NUVEM-ESTADO.md` (estado atual e como mudar o programa sem quebrar a oficina em uso).

Desde 2026-11-18 a oficina usa o modo nuvem (versão 0.3.0) com dados reais. Toda mudança segue o procedimento de `docs/NUVEM-ESTADO.md` ("Virada feita em 2026-11-18").

## Em discussão com o dono

### A. Compressão de fotos abaixo de 100 KB (2026-11-18)

**Pedido do dono:** cada foto da OS com menos de 100 KB, para poupar o espaço da nuvem.

**Hoje:** `src/utils/imageCompress.ts` usa o JPEG do próprio navegador (canvas), 1600 px no lado maior a 80% de qualidade (foto típica de 200 a 500 KB) e miniatura de 320 px a 70%.

**Opções pesquisadas:**
| Opção | O que é | Prós | Contras |
|---|---|---|---|
| 1. Busca de qualidade com o canvas atual | Reduzir para 1280 px e baixar a qualidade aos poucos até caber em ~95 KB | Zero dependência nova; muda só `imageCompress.ts` | O JPEG do navegador é o menos eficiente: abaixo de 100 KB aparecem blocos e borrões em fotos com muito detalhe |
| 2. **MozJPEG em WebAssembly** (`@jsquash/jpeg`, do projeto jSquash, derivado do Squoosh do Google; licença Apache-2.0) | Mesmo formato JPEG, com um codificador melhor, mais a mesma busca de qualidade até ~95 KB | Mais qualidade no mesmo tamanho; continua JPEG, então **nada muda** no Storage (bucket só JPEG), no Rust (`save_photo` confere bytes JPEG) nem nos nomes `.jpg` | Arquivo WebAssembly carregado só na hora de comprimir; a CSP precisa de `'wasm-unsafe-eval'` em `script-src` (Tauri e `public/_headers`); tem um bug conhecido de build com Vite em workers (issue #19 do repositório) |
| 3. `browser-image-compression` (npm, MIT) | Biblioteca pronta com `maxSizeMB` | Simples de usar | Usa o mesmo JPEG do navegador (mesma qualidade da opção 1); repositório parado desde 2024 |
| 4. WebP ou AVIF | Formatos mais modernos, 25 a 35% menores | Menor tamanho | O Safari do iPhone não gera WebP pelo canvas (devolve PNG); exigiria WebAssembly do mesmo jeito e mudar o bucket, o Rust e os nomes de arquivo; mudança grande |

**Recomendação:** opção 2, com a opção 1 como reserva automática se o WebAssembly falhar. Proposta: foto em 1280 px no lado maior, busca de qualidade até ≤ 95 KB, nunca abaixo de ~55% de qualidade (se não couber, reduz para 1024 px), e miniatura de 320 px com cerca de 15 KB. Vale só para fotos novas; as já enviadas ficam como estão. Antes de decidir, um teste com 10 fotos reais de carro em 1280 e 1600 px para o dono ver a diferença lado a lado.

**Estado:** aguardando decisão do dono (opção e tamanho máximo).

## Já levantados (2026-11-18)

| # | Item | Por quê | Estado |
|---|---|---|---|
| 1 | Remover o modo arquivo do código (PR 12) e os comandos Rust sem uso | A oficina já está na nuvem; o modo arquivo vira peso e risco | Planejado |
| 2 | Tela para o Dono cadastrar a verificação em 2 etapas (TOTP) | O sistema já aceita TOTP, mas não há tela para cadastrar | A fazer |
| 3 | Plano Pro do Supabase (~US$ 25/mês) | Sem pausa por inatividade e com backup diário do banco; hoje a garantia é só a cópia diária do PC do Dono | Decisão do dono |
| 4 | Espaço das fotos: contagem exata (`app.storage_usage`) e, se apertar, compressão maior (1280 px / 70%) | 1 GB grátis comporta ~2.000 a 4.000 fotos com a compressão atual (1600 px / 80%) | Observar |
| 5 | E-mails de convite fora do spam (domínio próprio com SPF/DKIM no Brevo) | Hoje o remetente é Gmail e cai no spam | A fazer |
| 6 | Trocar a senha do banco real e apagar `.env.real-db.local` | A senha passou pela conversa no dia da virada | Pendência do dono |
| 7 | Lista de Lançamentos do Financeiro pela data do pagamento (hoje pela data do lançamento; os totais já usam o pagamento) | Evitar confusão entre a lista e os totais | Avaliar |
| 8 | Atualização automática do app nos PCs (updater do Tauri) | Hoje cada versão nova exige instalar à mão em todos os PCs | Avaliar |
| 9 | Criar OS e a tela "Hoje" no celular | Ficaram fora do PR 8 (decisões 1 e 5 do dono) | Avaliar |

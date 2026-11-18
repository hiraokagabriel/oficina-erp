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

**Estado:** **planejada** (dono, 2026-11-18): opção 2 (MozJPEG via `@jsquash/jpeg`) com a opção 1 como reserva. Ainda não implementada.

**Plano de implementação:**
1. Teste de qualidade: 10 fotos reais de carro, 1280 e 1600 px abaixo de 100 KB, lado a lado para o dono escolher o tamanho (a confirmar antes do passo 2).
2. `src/utils/imageCompress.ts`: codificador MozJPEG carregado sob demanda (import dinâmico, só quando há foto para comprimir), busca de qualidade até ≤ 95 KB com piso de ~55% e queda para 1024 px se não couber; miniatura ~15 KB; reserva com o canvas atual se o WebAssembly falhar. Testes Vitest da busca (função pura com codificador injetado).
3. CSP: acrescentar `'wasm-unsafe-eval'` em `script-src` no `src-tauri/tauri.conf.json` e no `public/_headers` (o `src/utils/csp.test.ts` confere os dois iguais); contornar o bug de build do Vite com workers (issue #19 do jSquash) carregando o `.wasm` como asset.
4. Conferir no celular (Android e iPhone) e no exe: tempo de compressão por foto e peso final.
5. Entrega: `npm run deploy:web:real` (celulares) e instalador novo em todos os PCs. Sem migração; vale só para fotos novas.

### B. Serviços organizados por sistema, com base pronta (2026-11-18)

**Pedido do dono:** partir de uma base maior de categorias (mantendo criar sob demanda) e categorizar os serviços (disco de freio, cabeçote, fluido de freio, filtro da cabine...). Hoje peças, serviços e mão de obra parecem "uma grande lista sendo adicionada".

**Hoje:** a OS tem duas listas soltas (`parts`, `services`) de `OrderItem` com `category?` opcional entre 8 fixas (`PartCategory` em `src/types.ts`: Motor, Freio, Suspensão, Elétrica, Transmissão, Ar-condicionado, Carroceria, Outros). Mão de obra é uma linha de serviço; nada liga a peça à mão de obra do mesmo trabalho.

**Proposta (consultoria, padrão oficina premium):**
1. Orçamento em três níveis: Sistema, Serviço e itens (peças, mão de obra, insumos). O cliente aprova o serviço; impressão e resumo agrupados por sistema com subtotal por serviço.
2. Base pronta editável: ~14 sistemas (Motor, Arrefecimento, Alimentação/injeção, Ignição, Embreagem/câmbio, Suspensão, Direção, Freios, Elétrica/bateria, Ar-condicionado, Escapamento, Pneus/rodas/alinhamento, Fluidos e filtros, Diagnóstico) e ~150 operações padrão com peças típicas e tempo de mão de obra sugerido; a oficina edita, desliga e cria as suas.
3. Mão de obra por tempo: valor da hora configurável × tempo-padrão do serviço, com ajuste livre.
4. Pacotes prontos (ex.: "Revisão 10.000 km").
5. Ponte com a vistoria: item "precisa trocar" vira serviço sugerido.
6. Prioridade por serviço (Urgente / Recomendado / Pode esperar), aprovação ou recusa por serviço, e o recusado vira lembrete na próxima visita.
7. Histórico por sistema do veículo e lembrete de manutenção.

**Fases sugeridas:**
- Fase 1 (sem mudar a estrutura da OS): ampliar as 8 categorias para os ~14 sistemas, categorizar o catálogo, OS e impressão agrupadas por sistema.
- Fase 2 (muda o formato dos dados; passa pelo `arquiteto` e por migração na nuvem): "serviço" como grupo dentro da OS, mão de obra por tempo, pacotes.
- Fase 3: prioridade e aprovação por serviço, ponte com a vistoria, lembretes e histórico por sistema.

**Respostas do dono (2026-11-18) e ajustes:**
1. **Mão de obra por valor fixo, conforme modelo e ano do carro.** Sai a hora técnica (proposta 3). Entra o **preço sugerido por serviço e por veículo**: ao pôr um serviço na OS, sugerir pelo histórico do mesmo serviço em carro do mesmo modelo e ano próximo; sem histórico, mesma marca ou porte; por fim, qualquer carro. Valor sempre editável. Evolui o `suggestHistoricalPrice` (`src/services/pricing.ts`, mediana com mínimo de 3 vendas em 12 meses), que hoje não considera o veículo; o veículo vem de `vehicleCatalog`/`vehicleField` (marca e modelo da FIPE).
2. **Aprovação quase sempre inteira; às vezes o cliente tira partes.** Sai a prioridade em três níveis (proposta 6). Entra um botão por serviço, **"Cliente não quis"**: sai do total, fica registrado e aparece como pendente na próxima visita do mesmo veículo.
3. **Sistemas:** os ~14 bastam (sem diesel, híbridos nem funilaria). Mapeamento das 8 categorias atuais: Motor, Freios, Suspensão, Ar-condicionado e Outros iguais; Elétrica vira "Elétrica e bateria"; Transmissão vira "Embreagem e câmbio"; Carroceria vira "Carroceria e acessórios" (preserva o que já foi categorizado).

**Fases revisadas:**
- Fase 1 (sem mudar a estrutura da OS): os ~14 sistemas com o mapeamento acima; base de operações padrão no catálogo (editável e criável sob demanda); OS, impressão e resumo ao cliente agrupados por sistema.
- Fase 2 (muda o formato; `arquiteto` + migração na nuvem): "serviço" como grupo dentro da OS (peças e mão de obra do mesmo trabalho juntas), pacotes prontos, preço sugerido por serviço e veículo.
- Fase 3: "Cliente não quis" com pendência na próxima visita, ponte com a vistoria e histórico por sistema do veículo.

**Mão de obra pela tabela do dono (2026-11-18):** o dono aprovou os pontos 2 e 3 acima. No ponto 1, em vez de só o histórico, quer automatizar o valor da mão de obra com a **tabela própria** que já usava (tipo de custo de mão de obra por serviço, inspirada em tempários nacionais e internacionais). Desenho provável, a confirmar com a tabela: cada serviço da base guarda o seu tipo de custo; cada veículo da OS cai numa categoria (marca e modelo da FIPE + faixa de ano); valor sugerido = tabela(tipo de custo, categoria do veículo), sempre editável; tabela editável em Configurações com reajuste em lote (ex.: +8%). O histórico de vendas (`pricing.ts`) fica como conferência ao lado do valor sugerido.

**A tabela antiga se perdeu; a lógica dela (dono, 2026-11-18):** `valor da mão de obra = valor-hora base × tempo do serviço (h) × coeficiente do tipo de serviço (0,5 a 1,5)`. Proposta para reconstruir:
- **Valor-hora base** único da oficina, em Configurações.
- Cada serviço da base pronta guarda **tempo (h)** e **coeficiente** (0,5 simples/rápido, 1,0 padrão, 1,5 complexo/alto risco).
- **Fator do veículo opcional** (ex.: popular 1,0, médio 1,15, premium/importado 1,3), pela marca e modelo da FIPE, trocável na OS; sem ele a conta fica igual à tabela antiga.
- Base inicial de ~150 serviços com tempo e coeficiente **sugeridos** (estimativas de tempário para o dono calibrar, não valores definitivos).
- **Calibração pelo histórico real:** comparar a fórmula com o que a oficina já cobrou (1096 OS na nuvem) e mostrar o valor-hora praticado por serviço, apontando onde a tabela está acima ou abaixo.
- Na OS, valor sugerido pela fórmula, sempre editável, com o histórico ao lado; arredondamento configurável.

**Decisões do dono (2026-11-18):**
- **Fator do veículo: sim, com 4 categorias:** Popular 1,0; Médio 1,15; Premium/importado 1,3; **Vintage 1,5** (pedido do dono; trabalho mais lento, peças difíceis, risco maior). Valores iniciais, editáveis.
- **Sem arredondamento.**
- **Valor-hora base:** calcular para oficina no Brooklin/Chácara Santo Antônio (SP), aluguel R$ 5.000 + outros fixos ~R$ 1.000/mês, margem-alvo 50 a 70% com a mão de obra inclusa.

**Cálculo do valor-hora (premissas a confirmar com o dono):** 132 h faturáveis por mecânico/mês (22 dias × 8 h × 75%); custo do mecânico com encargos ~R$ 4.500/mês (≈ R$ 34 por hora faturável); preço = custo ÷ (1 − margem).

| | Custo/h | Margem 50% | 60% | 70% |
|---|---|---|---|---|
| 1 mecânico | ~R$ 80 | R$ 160 | R$ 200 | R$ 265 |
| 2 mecânicos | ~R$ 57 | R$ 115 | R$ 140 | R$ 190 |

**Valor-hora base inicial recomendado: R$ 180/h** (dentro da faixa de 50 a 70% nos dois cenários; perfil premium da região). Sem fonte pública atual e confiável de hora técnica em SP (pesquisa de 2026-11-18): o número final sai da calibração pelo histórico das 1096 OS.

**Pessoal (dono, 2026-11-18):** 2 mecânicos; um contratado a R$ 1.700 + R$ 300 de vale-transporte; o outro fica com o lucro (não entra no custo). Custo mensal: R$ 6.000 fixos + R$ 2.000 = **R$ 8.000/mês**. Margem = sobra ÷ preço.

| Tempo produtivo | Horas cobráveis/mês | Custo/h | Margem 50% | 60% | 70% |
|---|---|---|---|---|---|
| 75% | 264 h | R$ 30 | R$ 61 | R$ 76 | R$ 101 |
| 60% | 211 h | R$ 38 | R$ 76 | R$ 95 | R$ 126 |

**Valor-hora base recomendado: R$ 120/h** (≈ 70% de margem no cenário realista). Com o fator: Popular R$ 120, Médio R$ 138, Premium/importado R$ 156, Vintage R$ 180 por hora de coeficiente 1,0. Se o mecânico for CLT (FGTS, 13º, férias, ~R$ 800/mês a mais), o custo/h vai a R$ 34 a 42 e R$ 120 fica perto de 65 a 70%. O cálculo é o mínimo para a margem, não o preço da região: a calibração pelo histórico pode indicar subir a base. (Substitui a recomendação anterior de R$ 180/h, feita antes de saber o pessoal.)

**Simulação com 24 OS reais finalizadas (2026-11-18, só serviços e veículo, sem dados de cliente):** as OS lançam a mão de obra como uma linha genérica "MÃO DE OBRA", então o tempo de cada trabalho foi **estimado** pelas peças trocadas (padrão de tempário). Fórmula com R$ 120/h: total **R$ 7.851**; cobrado de fato: **R$ 16.185** (≈ 2,06×).
- Valor-hora praticado de fato ≈ **R$ 250/h** (R$ 120 é o mínimo para cobrir custos com 70% de margem, não o preço praticado).
- Por categoria (cobrado ÷ fórmula): Popular ≈ 2,3×; Médio ≈ 1,7×; Premium ≈ 2,7× (troca de óleo de Volvo 4,8×). O fator premium real fica perto de 1,6 a 2,0; popular e médio irregulares (parte é erro da estimativa de tempo).

**Calibração ampliada (2026-11-18), só OS do padrão atual:** de 1.080 finalizadas, ignoradas 703 com "TOTAL PEÇAS", 20 sem mão de obra e 207 com peça sem tempo conhecido; sobraram **150 OS**. Valor-hora praticado (mão de obra ÷ tempo estimado, coeficiente 1,0): **Todas** mediana R$ 260 (metade central R$ 150 a 429); **Popular** R$ 208 (74 OS; R$ 135 a 375); **Médio** R$ 267 (57 OS; R$ 167 a 400); **Premium** R$ 429 (17 OS; R$ 330 a 700); **Vintage** R$ 214 (2 OS, insuficiente). A ordem ficou coerente (popular < médio < premium) e dá os fatores: **Médio ≈ 1,3**, **Premium ≈ 2,0**. A variação dentro de cada categoria segue grande (tempos estimados, coeficiente não aplicado, preço negociado por serviço).

**Proposta calibrada:** base **R$ 210/h** (Popular 1,0); Médio 1,3 (R$ 273); Premium/importado 2,0 (R$ 420); Vintage 1,8 provisório (R$ 378). Acerta a mediana de cada categoria; a precisão por OS vem depois, com serviços com nome (Fase 1) e coeficiente medido por serviço.

**Recomendação anterior (24 OS, substituída pela calibração ampliada):** valor-hora base **R$ 200 a 250**; fatores iniciais Popular 1,0, Médio 1,1, Premium/importado 1,7, Vintage 1,8, todos calibráveis. A calibração confiável exige **serviços com nome** em vez de "MÃO DE OBRA" (Fase 1 do item B), para o app calcular o valor-hora real por serviço e categoria de veículo.

**Levantamento das peças nas 1096 OS reais (2026-11-18, só descrições e preços, sem dados de cliente):** 2.201 itens de peça, 523 descrições distintas.
- **706 itens são "TOTAL PEÇAS"** (uma linha com o valor somado, mediana R$ 780): nessas OS não se sabe o que foi trocado; o histórico delas não serve para calibrar.
- **Nomes duplicados** para a mesma peça (ex.: "FILTRO ÓLEO" / "FILTRO ÓLEO MOTOR" / "ÓLEO MOTOR E FILTRO"; "FLUIDO RADIADOR" / "ADITIVO RADIADOR"; "VELAS" / "VELAS IGNIÇÃO"; três nomes de fluido de freio): as 523 cairiam para ~150 padronizadas.
- **Mais usados por sistema (somando nomes parecidos):** Freios: pastilhas 64, discos 20, fluido ~34. Suspensão: amortecedores ~40, bieletas ~34, mancal da barra 12, pivô 10, buchas ~14. Fluidos e filtros: óleo ~49, filtro de combustível 32, de óleo ~28, de ar 23, cabine 6, óleo de câmbio 13. Arrefecimento: aditivo/fluido ~50, água desmineralizada ~21, bomba d'água 15, termostática 14, radiador 10. Ignição: velas ~37, cabos 14, bobina 10. Injeção: descarbonizante 21, TBI 14, bomba de combustível 14, injetores ~20, bicos ~11, sonda 6. Motor: correias ~26, coxins ~23, juntas ~23, correia dentada 5. Direção e rodas: alinhamento ~22, terminal 7, rolamento 10. Embreagem e câmbio: embreagem 8, coifas ~13. Elétrica: motor de partida ~13.

**Consequências para a Fase 1:**
1. A base de serviços sai destes números: ~40 serviços cobrem a grande maioria das OS.
2. Padronizar o catálogo antes (juntar nomes duplicados num item só, já com o sistema): o Claude propõe a lista de junções e o dono aprova antes de aplicar (dados reais).
3. ~~OS nova deve detalhar as peças~~: o dono confirmou (2026-11-18) que "TOTAL PEÇAS" é um padrão antigo, já abandonado; as OS atuais detalham as peças. Na calibração e nas análises, **ignorar as OS com "TOTAL PEÇAS"**; não precisa travar nada na tela.

**Estado:** fórmula e categorias definidas; valor-hora e fatores a fixar com o dono (faixa recomendada acima). Fase 1 (serviços com nome por sistema, catálogo padronizado, peças detalhadas) vira pré-requisito da calibração.

### C. Markup de peças, diagnóstico, insumos e garantia (2026-11-18)

**Pedido do dono:** deixar explícito o markup sobre as peças (logística, garantia, defeitos) e usá-lo também para proteger a mão de obra de pedidos de desconto (o cliente aceita peça cara e reclama de mão de obra cara). Pediu dois consultores (técnico de auto mecânica e marketing/precificação, Opus) e um equilíbrio focado em aumentar o lucro.

**Dados reais (377 OS do padrão atual, sem dados de cliente):** markup de peça medido em só 80 peças com custo informado: mediana 1,86× (metade central 1,15× a 2,80×; ponderado 2,05×). Faturamento: peças 51%, mão de obra 49%.

**Consenso dos dois consultores:** markup escalonado por faixa de custo (maior na peça barata, menor na cara); peça trazida pelo cliente com termo, sem garantia na peça e mão de obra × 1,3 (recusar peça de segurança duvidosa); garantia de 6 meses ou 10.000 km na peça fornecida pela oficina (além dos 90 dias legais); diagnóstico cobrado (1 h × fator do veículo) e abatido se aprovado; desconto nunca sobre o serviço (só 5% no PIX, peça linha econômica ou cortesia); orçamento agrupado por sistema, peça com marca e garantia, serviço dizendo o que inclui; fotos do defeito no orçamento.

**Divergência:** marketing limita peça de prateleira pesquisável (pastilha, disco, filtro, óleo, bateria) a ~1,6× para não ser "pego no flagra"; técnico mantém o ponderado em 1,8 a 1,9× porque peça barata e média pagam retrabalho e busca de peça.

**Equilíbrio proposto:**
| Peça (custo) | Markup |
|---|---|
| até R$ 50 | 2,5× (ganho mínimo R$ 25 por item) |
| R$ 50 a 200 | 2,0× |
| R$ 200 a 600 | 1,8× |
| R$ 600 a 1.500 | 1,6× |
| acima de R$ 1.500 | 1,4× |
| fluidos | 1,9× |
| peça marcada "pesquisável" | teto 1,7× |
| importado/original | teto no preço de balcão da concessionária |

Mais: linha de **insumos** de 3% da mão de obra (mínimo R$ 20, máximo R$ 80); diagnóstico; mão de obra pela fórmula do item B (R$ 210/h; médio 1,3; premium 2,0; vintage 1,8). Ganho estimado pelo consultor técnico: +4 a 8% de lucro sobre o faturamento, sem subir peças caras.

**Pré-requisito:** lançar o custo em 100% das peças (hoje 80 peças com custo em 377 OS). Depois, simular a tabela nas OS reais antes de mudar preços.

**Para o sistema:** tabela de markup por faixa editável em Configurações e marca "pesquisável" no catálogo; preço sugerido = custo × markup, editável; linhas automáticas de diagnóstico (abatido se aprovado) e insumos; opção "linha econômica / original" por peça; termo de peça do cliente e garantia no orçamento; painel de indicadores (porcentagem de peças com custo, valor-hora efetivo, produtividade, markup ponderado do mês, retrabalho, descontos concedidos, valor recusado com retorno).

**Avisos legais (CDC, levantados pelo marketing):** orçamento discriminado com validade (10 dias); nada executado sem aprovação; peça usada só com autorização escrita; nenhuma âncora falsa de concessionária ou "preço de custo" falso; diagnóstico cobrado só se avisado antes; serviço extra exige nova aprovação; WhatsApp de retorno só com consentimento (LGPD).

**Estado:** em discussão; equilíbrio proposto, aguardando o dono.

### D. Claude (IA) integrado ao programa (2026-11-18)

**Pedido do dono:** usar o próprio Claude em alguma função do programa para melhorar algo.

**Arquitetura proposta:** função nova no Supabase (como a `money`), chave `ANTHROPIC_API_KEY` só como segredo do servidor (nunca no app nem no celular), uso só para Dono e Recepção com limite diário, envio do mínimo de dados (sem nome nem telefone de cliente), resposta sempre como sugestão confirmada por uma pessoa. SDK oficial `@anthropic-ai/sdk`; modelo padrão `claude-opus-5-5` (US$ 4 / US$ 20 por milhão de tokens de entrada/saída; Sonnet 5.5 e Haiku 5.5 são mais baratos, decisão do dono); saída estruturada (`output_config.format`) para dados que vão para a OS.

**Usos, em ordem de valor:**
1. **Ler nota ou orçamento do fornecedor** (foto ou PDF) e lançar peças com código, quantidade e custo na OS. Resolve a falta de custo nas peças (80 em 377 OS), pré-requisito do item C.
2. **Padronizar o catálogo** (uma vez): 523 descrições → ~150 nomes padrão com sistema; o dono revisa antes de aplicar. Acelera a Fase 1 do item B.
3. **Montar o orçamento a partir do relato** (texto ou voz + vistoria): sugere serviços da base com tempo e coeficiente; o mecânico confirma.
4. **Mensagem ao cliente** em linguagem simples (resumo, WhatsApp, lembrete do "cliente não quis").
5. **Perguntas sobre o negócio** em português (mais tarde).
Não fazer: diagnóstico automático por foto do carro (risco alto; no máximo apoio).

**Custo estimado:** centavos de real por nota lida; R$ 10 a 50/mês no volume atual. **Cuidados:** LGPD (dados passam pela Anthropic; não enviar dados pessoais de cliente); chave da API em conta própria da Anthropic (console.anthropic.com), cobrada à parte.

**Estado:** em discussão; aguardando o dono escolher por qual uso começar.

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

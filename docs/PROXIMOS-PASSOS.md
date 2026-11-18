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

**Recomendação revisada:** valor-hora base **R$ 200 a 250**; fatores iniciais Popular 1,0, Médio 1,1, Premium/importado 1,7, Vintage 1,8, todos calibráveis. A calibração confiável exige **serviços com nome** em vez de "MÃO DE OBRA" (Fase 1 do item B), para o app calcular o valor-hora real por serviço e categoria de veículo.

**Estado:** fórmula e categorias definidas; valor-hora e fatores a fixar com o dono (faixa recomendada acima). Fase 1 (serviços com nome por sistema) vira pré-requisito da calibração.

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

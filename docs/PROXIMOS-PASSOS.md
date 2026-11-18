# Próximos passos do OficinaPro

Lista viva das atualizações futuras, discutidas com o dono. Cada item diz o que é, por que e o estado. Ao começar uma sessão de trabalho, leia este arquivo junto com `docs/NUVEM-ESTADO.md` (estado atual e como mudar o programa sem quebrar a oficina em uso).

Desde 2026-11-18 a oficina usa o modo nuvem (versão 0.3.0) com dados reais. Toda mudança segue o procedimento de `docs/NUVEM-ESTADO.md` ("Virada feita em 2026-11-18").

## Em discussão com o dono

_(itens novos entram aqui conforme a conversa)_

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

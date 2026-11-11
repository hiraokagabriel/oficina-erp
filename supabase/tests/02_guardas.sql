select no_plan();
insert into public.work_order_finance (workshop_id, id, data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'os2', '{"prices":{},"total":777}');

-- ===== Mecânico =====
insert into public.catalog_parts (workshop_id, id, data) values ('aaaaaaaa-0000-0000-0000-000000000001', 'cpa2', '{}');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select throws_ok($$update public.work_orders set data = data || '{"clientName":"Trocado"}' where id = 'os1'$$,
  '42501', 'mecanico_campo_proibido', 'mecânico não altera clientName');
select throws_ok($$update public.work_orders set data = data || '{"parts":[]}' where id = 'os1'$$,
  '42501', 'mecanico_campo_proibido', 'mecânico não altera parts');
select lives_ok($$update public.work_orders set data = data || '{"status":"EM_SERVICO","mileage":150,"checklist":[{"k":1}]}' where id = 'os1'$$,
  'mecânico altera status, mileage e checklist');
select is((select (data ->> 'status') from public.work_orders where id = 'os1'), 'EM_SERVICO', 'status gravado pelo mecânico');
select throws_ok($$update public.work_orders set data = data || '{"status":"FINALIZADO"}' where id = 'os1'$$,
  '42501', 'money_op_required', 'mecânico não finaliza');
select throws_ok($$update public.work_orders set data = data || '{"mileage":"abc"}' where id = 'os1'$$,
  '22023', 'mecanico_campo_invalido', 'mecânico: mileage precisa ser número');
select throws_ok($$update public.work_orders set data = data || '{"photos":"x"}' where id = 'os1'$$,
  '22023', 'mecanico_campo_invalido', 'mecânico: photos precisa ser array');
select throws_ok($$update public.work_orders set data = data || '{"checklist":{}}' where id = 'os1'$$,
  '22023', 'mecanico_campo_invalido', 'mecânico: checklist precisa ser array');
select throws_ok($$update public.work_orders set data = data || '{"status":"XYZ"}' where id = 'os1'$$,
  '22023', 'mecanico_campo_invalido', 'mecânico: status fora de OSStatus');
select lives_ok($$update public.work_orders set data = data || '{"mileage":null,"photos":[{"id":"f1"}]}' where id = 'os1'$$,
  'mecânico: mileage null e photos array valem');
select throws_ok($$insert into public.work_orders (workshop_id, id, data) values ('aaaaaaaa-0000-0000-0000-000000000001', 'osN', '{"status":"ORCAMENTO"}')$$,
  '42501', null, 'mecânico não cria OS (RLS)');
select is(pg_temp.rows_affected($q$update public.clients set data = data || '{"name":"X"}' where id = 'c1'$q$),
  0::bigint, 'mecânico não atualiza clients (RLS: 0 linhas)');

-- ===== Recepção: work_orders =====
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select throws_ok($$update public.work_orders set data = data || '{"status":"FINALIZADO"}' where id = 'os1'$$,
  '42501', 'money_op_required', 'FINALIZADO sem service: money_op_required');
select throws_ok($$update public.work_orders set data = data || '{"status":"EM_SERVICO"}' where id = 'os2'$$,
  '42501', 'money_op_required', 'sair de FINALIZADO sem service: money_op_required');
select lives_ok($$update public.work_orders set data = data || '{"status":"ARQUIVADO"}' where id = 'os2'$$,
  'FINALIZADO para ARQUIVADO é permitido');
select throws_ok($$update public.work_orders set data = data || '{"status":"EM_SERVICO"}' where id = 'os3'$$,
  '42501', 'money_op_required', 'não sai de ARQUIVADO');
select throws_ok($$update public.work_orders set data = data || '{"status":"EM_SERVICO"}' where id = 'os4'$$,
  '42501', 'money_op_required', 'não volta de AGUARDANDO_PAGAMENTO com receita');
select lives_ok($$update public.work_orders set data = data || '{"status":"EM_SERVICO"}' where id = 'os5'$$,
  'volta de AGUARDANDO_PAGAMENTO sem receita');
select throws_ok($$update public.work_orders set deleted_at = now() where id = 'os1'$$,
  '42501', 'money_op_required', 'deleted_at em OS: money_op_required');
select lives_ok($$update public.work_orders set data = data || '{"clientName":"Joao S."}' where id = 'os1'$$,
  'recepção altera clientName');
select throws_ok($$insert into public.work_orders (workshop_id, id, data, deleted_at) values ('aaaaaaaa-0000-0000-0000-000000000001', 'osD', '{"status":"ORCAMENTO"}', now())$$,
  '42501', 'money_op_required', 'OS nova não nasce excluída');
select throws_ok($$update public.work_orders set workshop_id = 'bbbbbbbb-0000-0000-0000-000000000002' where id = 'os1'$$,
  '42501', null, 'workshop_id imutável / RLS');

-- ===== Recepção: work_order_finance =====
select throws_ok($$update public.work_order_finance set data = data || '{"advances":[{"amount":100}]}' where id = 'os1'$$,
  '42501', 'money_op_required', 'recepção não mexe em advances');
select throws_ok($$update public.work_order_finance set data = data || '{"paymentDate":"2026-01-01"}' where id = 'os1'$$,
  '42501', 'money_op_required', 'recepção não mexe em paymentDate');
select throws_ok($$update public.work_order_finance set data = data || '{"financialId":"x"}' where id = 'os1'$$,
  '42501', 'money_op_required', 'recepção não mexe em financialId');
select lives_ok($$update public.work_order_finance set data = data || '{"total":12000}' where id = 'os1'$$,
  'recepção altera total (fora da parte travada)');
select lives_ok($$update public.work_order_finance set data = jsonb_set(data, '{installmentConfig,description}', '"nova"') where id = 'os4'$$,
  'installmentConfig.description liberada (cascata)');
select throws_ok($$update public.work_order_finance set data = jsonb_set(data, '{installmentConfig,count}', '3') where id = 'os4'$$,
  '42501', 'money_op_required', 'installmentConfig.count travado');
select throws_ok($$insert into public.work_order_finance (workshop_id, id, data) values ('aaaaaaaa-0000-0000-0000-000000000001', 'os9', '{"financialId":"fx"}')$$,
  '42501', 'money_op_required', 'finance nova não nasce com financialId');
select lives_ok($$insert into public.work_order_finance (workshop_id, id, data) values ('aaaaaaaa-0000-0000-0000-000000000001', 'os9', '{"total":1,"advances":[]}')$$,
  'finance nova sem dinheiro gravado');

-- ===== Recepção: ledger =====
select throws_ok($$update public.ledger set deleted_at = now() where id = 'l1'$$,
  '42501', 'ledger_exclusao_proibida', 'recepção não exclui lançamento');
select throws_ok($$insert into public.ledger (workshop_id, id, data, os_id) values ('aaaaaaaa-0000-0000-0000-000000000001', 'l9', '{"type":"CREDIT","amount":1}', 'os1')$$,
  '42501', null, 'ledger com os_id por usuário: negado');
select lives_ok($$insert into public.ledger (workshop_id, id, data) values ('aaaaaaaa-0000-0000-0000-000000000001', 'l8', '{"type":"DEBIT","amount":1}')$$,
  'ledger manual (sem os_id) permitido');
select throws_ok($$update public.ledger set data = data || '{"amount":999}' where id = 'l2'$$,
  '42501', 'ledger_travado_por_os', 'lançamento de OS: só description muda');
select lives_ok($$update public.ledger set data = data || '{"description":"renomeado"}' where id = 'l2'$$,
  'lançamento de OS: description liberada');
select throws_ok($$update public.ledger set os_id = null where id = 'l2'$$,
  '42501', 'ledger_os_id_imutavel', 'os_id imutável');

-- ===== Recepção: itens novos =====
select throws_ok($$insert into public.work_orders (workshop_id, id, data) values ('aaaaaaaa-0000-0000-0000-000000000001', 'osF', '{"status":"FINALIZADO"}')$$,
  '42501', 'money_op_required', 'OS não nasce FINALIZADO');
select throws_ok($$insert into public.work_orders (workshop_id, id, data) values ('aaaaaaaa-0000-0000-0000-000000000001', 'osQ', '{"status":"ARQUIVADO"}')$$,
  '42501', 'money_op_required', 'OS não nasce ARQUIVADO');
select throws_ok($$insert into public.work_orders (workshop_id, id, data) values ('aaaaaaaa-0000-0000-0000-000000000001', 'osX', '{"status":"XYZ"}')$$,
  '22023', 'status_invalido', 'OS não nasce com status desconhecido');
select throws_ok($$insert into public.work_orders (workshop_id, id, data) values ('aaaaaaaa-0000-0000-0000-000000000001', 'osY', '{"clientName":"sem status"}')$$,
  '22023', 'status_invalido', 'OS não nasce sem status');
select lives_ok($$insert into public.work_orders (workshop_id, id, data) values ('aaaaaaaa-0000-0000-0000-000000000001', 'osO', '{"status":"ORCAMENTO"}')$$,
  'OS nasce em ORCAMENTO');
select lives_ok($$insert into public.work_orders (workshop_id, id, data) values ('aaaaaaaa-0000-0000-0000-000000000001', 'osP', '{"status":"AGUARDANDO_PAGAMENTO"}')$$,
  'OS nasce em AGUARDANDO_PAGAMENTO');

-- total/prices travados com receita ou OS FINALIZADO/ARQUIVADO
select throws_ok($$update public.work_order_finance set data = data || '{"total":1}' where id = 'os4'$$,
  '42501', 'money_op_required', 'total travado em OS com receita');
select throws_ok($$update public.work_order_finance set data = jsonb_set(data, '{prices,i2}', '1') where id = 'os4'$$,
  '42501', 'money_op_required', 'prices travado em OS com receita');
select throws_ok($$update public.work_order_finance set data = data || '{"total":1}' where id = 'os2'$$,
  '42501', 'money_op_required', 'total travado em OS FINALIZADO/ARQUIVADO');
select lives_ok($$update public.work_order_finance set data = jsonb_set(data, '{prices,i1}', '11000') || '{"total":11000}' where id = 'os1'$$,
  'total e prices livres em OS sem receita e em andamento');

-- id do data coerente com a chave
select throws_ok($$insert into public.clients (workshop_id, id, data) values ('aaaaaaaa-0000-0000-0000-000000000001', 'c77', '{"id":"zzz","name":"x"}')$$,
  '22023', 'id_divergente', 'data.id diferente da chave: recusado');
select lives_ok($$insert into public.clients (workshop_id, id, data) values ('aaaaaaaa-0000-0000-0000-000000000001', 'c77', '{"id":"c77","name":"x"}')$$,
  'data.id igual à chave: aceito');

-- upsert estilo PostgREST (insert ... on conflict do update) não fura os guardas
select throws_ok($$insert into public.ledger (workshop_id, id, data) values ('aaaaaaaa-0000-0000-0000-000000000001', 'l1', '{"type":"CREDIT","amount":1000}')
  on conflict (workshop_id, id) do update set deleted_at = now()$$,
  '42501', 'ledger_exclusao_proibida', 'upsert mudando deleted_at do ledger: negado');
select throws_ok($$insert into public.work_orders (workshop_id, id, data) values ('aaaaaaaa-0000-0000-0000-000000000001', 'os1', '{"status":"APROVADO"}')
  on conflict (workshop_id, id) do update set deleted_at = now()$$,
  '42501', 'money_op_required', 'upsert mudando deleted_at da OS: negado');
select throws_ok($$insert into public.work_orders (workshop_id, id, data) values ('aaaaaaaa-0000-0000-0000-000000000001', 'os2', '{"status":"FINALIZADO"}')
  on conflict (workshop_id, id) do update set data = excluded.data$$,
  '42501', null, 'upsert sobre OS existente não contorna o guarda de status (insert FINALIZADO negado)');
select lives_ok($$insert into public.clients (workshop_id, id, data) values ('aaaaaaaa-0000-0000-0000-000000000001', 'c1', '{"name":"Joao Upsert"}')
  on conflict (workshop_id, id) do update set data = excluded.data$$, 'upsert comum de cliente funciona');

-- ===== Dono =====
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select lives_ok($$update public.ledger set deleted_at = now() where id = 'l1'$$, 'dono exclui lançamento manual');
select throws_ok($$update public.ledger set deleted_at = now() where id = 'l2'$$,
  '42501', 'ledger_exclusao_proibida', 'dono não exclui lançamento de OS');
select throws_ok($$update public.work_orders set deleted_at = now() where id = 'os1'$$,
  '42501', 'money_op_required', 'dono não exclui OS direto');
select lives_ok($$update public.work_order_costs set deleted_at = now() where id = 'os1'$$, 'dono exclui custo');
select lives_ok($$update public.catalog_parts set deleted_at = now() where id = 'cpa1'$$, 'dono exclui peça do catálogo');
select lives_ok($$update public.workshops set last_export_at = now()$$, 'dono grava last_export_at');
select throws_ok($$update public.workshops set import_state = 'concluido'$$, '42501', null, 'dono não altera import_state direto');
select throws_ok($$update public.workshops set name = 'Roubada'$$, '42501', null, 'dono não renomeia oficina direto (sem grant)');
select throws_ok($$insert into public.audit_log (workshop_id, id, data) values ('aaaaaaaa-0000-0000-0000-000000000001', 'al2', '{}')$$,
  '42501', null, 'dono não escreve audit_log direto');

-- ===== Recepção: exclusões de cadastro =====
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select lives_ok($$update public.clients set deleted_at = now() where id = 'c1'$$, 'recepção exclui cliente');
select throws_ok($$update public.catalog_parts set deleted_at = now() where id = 'cpa2'$$, '42501', null, 'recepção não exclui peça do catálogo');

-- ===== Service role =====
select pg_temp.as_service();
select lives_ok($$update public.work_orders set data = data || '{"status":"FINALIZADO"}' where id = 'os1'$$, 'service finaliza OS');
select lives_ok($$update public.work_orders set deleted_at = now() where id = 'os3'$$, 'service exclui OS');
select is((select version from public.work_orders where id = 'os1'), 5::bigint, 'version incrementa a cada update (1 insert + 4 updates)');

-- ===== Auditoria =====
select pg_temp.as_admin();
select ok(exists (select 1 from public.audit_events where tbl = 'work_orders' and row_id = 'os1' and 'status' = any (changed_keys)),
  'audit_events registra mudança de status');
select ok(exists (select 1 from public.audit_events where tbl = 'ledger' and row_id = 'l1' and 'deleted_at' = any (changed_keys) and op = 'delete'),
  'audit_events registra exclusão do ledger');
select ok(exists (select 1 from public.audit_events where tbl = 'ledger' and row_id = 'l1' and after is not null),
  'ledger audita o valor completo');
select ok(exists (select 1 from public.audit_events where tbl = 'work_orders' and row_id = 'os1' and before is null and after is null and user_id is not null),
  'work_orders audita só as chaves e o usuário');

select * from finish();

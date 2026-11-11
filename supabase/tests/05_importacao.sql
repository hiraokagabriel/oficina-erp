select no_plan();

-- Oficina D: nova, sem dados legados (só para o fechamento sobre zero linhas)
insert into public.workshops (id, name, import_state) values ('dddddddd-0000-0000-0000-000000000004', 'Oficina D', 'vazio');
insert into public.memberships (workshop_id, user_id, role) values
  ('dddddddd-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000d1', 'dono'),
  ('cccccccc-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000e1', 'recepcao');

-- ===== quem pode =====
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select throws_ok($$select public.import_rows('cccccccc-0000-0000-0000-000000000003', '[]')$$, '42501', 'somente_dono', 'recepção não importa');
select throws_ok($$select public.import_reset('cccccccc-0000-0000-0000-000000000003')$$, '42501', 'somente_dono', 'recepção não apaga a importação');
select throws_ok($$select public.import_finish('cccccccc-0000-0000-0000-000000000003', true)$$, '42501', 'somente_dono', 'recepção não conclui a importação');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select throws_ok($$select public.import_rows('aaaaaaaa-0000-0000-0000-000000000001', '[]')$$, '42501', 'somente_dono', 'mecânico não importa');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
select throws_ok($$select public.import_rows('cccccccc-0000-0000-0000-000000000003', '[]')$$, '42501', 'somente_dono', 'dono de outra oficina não importa');

-- ===== import_state errado =====
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select throws_ok($$select public.import_rows('aaaaaaaa-0000-0000-0000-000000000001', '[]')$$, '42501', 'import_bloqueado', 'import_rows recusado com import_state concluido');
select throws_ok($$select public.import_reset('aaaaaaaa-0000-0000-0000-000000000001')$$, '42501', 'import_bloqueado', 'import_reset recusado com import_state concluido');
select throws_ok($$select public.import_reset('cccccccc-0000-0000-0000-000000000003')$$, '42501', 'import_bloqueado', 'import_reset recusado com import_state vazio');

-- ===== oficina nova: fecha sobre zero linhas =====
create temp table z1 as select public.import_finish('dddddddd-0000-0000-0000-000000000004', true) as j;
grant all on z1 to public;
select is((select j ->> 'state' from z1), 'concluido', 'oficina nova sem dados legados fecha sobre zero linhas');
select is((select (j ->> 'ledgerSignedCents')::numeric from z1), 0::numeric, 'totais zerados');
select is((select import_state from public.workshops where id = 'dddddddd-0000-0000-0000-000000000004'), 'concluido', 'estado concluido');
create temp table z2 as select public.sync_push('dddddddd-0000-0000-0000-000000000004',
  '[{"key":"z","rows":[{"table":"clients","id":"z1","version":0,"data":{"name":"liberado"}}]}]'::jsonb) as j;
grant all on z2 to public;
select is((select j -> 0 ->> 'status' from z2), 'ok', 'depois de concluir, o sync_push funciona');
select throws_ok($$select public.import_finish('dddddddd-0000-0000-0000-000000000004', true)$$, '42501', 'import_bloqueado', 'commit repetido recusado');

-- ===== importação em lote (oficina C) =====
select throws_ok($$select public.import_rows('cccccccc-0000-0000-0000-000000000003', '[{"table":"x","id":"1","data":{}}]')$$, '22023', 'linha_invalida', 'import: tabela inválida');
create temp table i1 as select public.import_rows('cccccccc-0000-0000-0000-000000000003',
  '[{"table":"clients","id":"ic1","data":{"name":"A"}},
    {"table":"clients","id":"ic1","data":{"name":"B"}},
    {"table":"work_orders","id":"iw1","data":{"status":"FINALIZADO"}},
    {"table":"ledger","id":"il1","os_id":"iw1","data":{"type":"CREDIT","amount":1000,"paymentDate":"2026-01-01"}},
    {"table":"ledger","id":"il2","data":{"type":"DEBIT","amount":300}},
    {"table":"work_order_finance","id":"iw1","data":{"prices":{},"total":1000,"advances":[{"amount":200},{"amount":50}]}}]') as j;
grant all on i1 to public;
select is((select j ->> 'received' from i1), '6', 'import_rows: recebidas');
select is((select j -> 'upserted' ->> 'clients' from i1), '1', 'id repetido no lote: vale o último');
select is((select data ->> 'name' from public.clients where id = 'ic1'), 'B', 'dados do último');
select is((select os_id from public.ledger where id = 'il1'), 'iw1', 'os_id preservado');
select is((select data ->> 'status' from public.work_orders where id = 'iw1'), 'FINALIZADO', 'import passa pelos guardas (security definer)');
select is((select import_state from public.workshops where id = 'cccccccc-0000-0000-0000-000000000003'), 'importando', 'estado vira importando');
select pg_temp.as_admin();
select is((select count(*) from public.audit_events where row_id in ('ic1', 'iw1', 'il1', 'il2')), 0::bigint, 'import em massa não audita linha a linha');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select lives_ok($$select public.import_rows('cccccccc-0000-0000-0000-000000000003', '[{"table":"clients","id":"ic1","data":{"name":"B"}}]')$$, 'reenvio do mesmo lote é aceito (retentativa)');
select is((select version from public.clients where id = 'ic1'), 1::bigint, 'reenvio não conta como edição (version continua 1)');

create temp table f1 as select public.import_finish('cccccccc-0000-0000-0000-000000000003') as j;
grant all on f1 to public;
select is((select (j ->> 'ledgerSignedCents')::numeric from f1), 700::numeric, 'import_finish: soma com sinal do ledger');
select is((select (j ->> 'paidEntries')::int from f1), 1, 'import_finish: lançamentos pagos');
select is((select (j ->> 'advancesCents')::numeric from f1), 250::numeric, 'import_finish: adiantamentos');
select is((select (j ->> 'osTotalCents')::numeric from f1), 1000::numeric, 'import_finish: total das OS');
select is((select j ->> 'state' from f1), 'importando', 'import_finish sem commit mantém o estado');

-- ===== import_reset audita =====
select lives_ok($$select public.import_reset('cccccccc-0000-0000-0000-000000000003')$$, 'import_reset com a oficina ainda sem uso');
select is((select count(*) from public.work_orders where workshop_id = 'cccccccc-0000-0000-0000-000000000003'), 0::bigint, 'import_reset apaga as OS');
select is((select import_state from public.workshops where id = 'cccccccc-0000-0000-0000-000000000003'), 'vazio', 'import_reset volta para vazio');
select pg_temp.as_admin();
select is((select count(*) from public.audit_events where tbl = 'workshops' and op = 'import_reset'
  and workshop_id = 'cccccccc-0000-0000-0000-000000000003' and user_id = '00000000-0000-0000-0000-0000000000d1'
  and (before ->> 'ledger') = '2' and (before ->> 'clients') = '1' and (before ->> 'work_orders') = '1'), 1::bigint,
  'import_reset grava audit_events com quem e a contagem por tabela');

-- ===== oficina já em uso: não importa nem apaga =====
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select lives_ok($$select public.import_rows('cccccccc-0000-0000-0000-000000000003', '[{"table":"clients","id":"ic1","data":{"name":"B"}},{"table":"clients","id":"ic2","data":{"name":"C"}}]')$$, 'nova importação após o reset');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select lives_ok($$update public.clients set data = data || '{"name":"Editado pela recepção"}' where id = 'ic1'$$, 'recepção edita um cliente');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select throws_ok($$select public.import_rows('cccccccc-0000-0000-0000-000000000003', '[{"table":"clients","id":"ic3","data":{}}]')$$, '42501', 'oficina_em_uso', 'import_rows recusado: linha com version > 1 / outro usuário');
select throws_ok($$select public.import_reset('cccccccc-0000-0000-0000-000000000003')$$, '42501', 'oficina_em_uso', 'import_reset recusado: oficina em uso');
select is((select count(*) from public.clients where workshop_id = 'cccccccc-0000-0000-0000-000000000003'), 2::bigint, 'nada foi apagado');

-- ===== concluir =====
select is((select public.import_finish('cccccccc-0000-0000-0000-000000000003', true) ->> 'state'), 'concluido', 'import_finish(commit) conclui');
select throws_ok($$select public.import_rows('cccccccc-0000-0000-0000-000000000003', '[]')$$, '42501', 'import_bloqueado', 'depois de concluir, import_rows é recusado');
select throws_ok($$select public.import_reset('cccccccc-0000-0000-0000-000000000003')$$, '42501', 'import_bloqueado', 'depois de concluir, import_reset é recusado');

-- ===== funções internas fora do alcance =====
select throws_ok($$select app.workshop_in_use('cccccccc-0000-0000-0000-000000000003', null)$$, '42501', null, 'app.workshop_in_use não é executável pelo usuário');
select ok(app.os_status('bbbbbbbb-0000-0000-0000-000000000002', 'osB') is null, 'app.os_status não vaza OS de outra oficina');
select ok(not app.os_has_receipt('bbbbbbbb-0000-0000-0000-000000000002', 'osB'), 'app.os_has_receipt não vaza finance de outra oficina');

select pg_temp.as_admin();
select * from finish();

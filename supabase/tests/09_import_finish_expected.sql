-- import_finish com p_expected (migração 20261118130000): concluir exige os totais conferidos e iguais aos do servidor.
-- Preâmbulo: setup.inc. Oficina C (vazio) e uma oficina D criada aqui, ambas com o dono d1.

select no_plan();

insert into public.workshops (id, name, import_state) values ('dddddddd-0000-0000-0000-000000000004', 'Oficina D', 'vazio');
insert into public.memberships (workshop_id, user_id, role) values
  ('dddddddd-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000d1', 'dono');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');

-- ===== Oficina C: 1 cliente enviado =====
select lives_ok($$select public.import_rows('cccccccc-0000-0000-0000-000000000003', '[{"table":"clients","id":"e1","data":{"name":"A"}}]')$$, 'envio');

create temp table t1 as select public.import_finish('cccccccc-0000-0000-0000-000000000003', false) as j;
grant all on t1 to public;
select is((select j ->> 'state' from t1), 'importando', 'sem commit só confere');

select throws_ok($$select public.import_finish('cccccccc-0000-0000-0000-000000000003', true)$$, '22023', 'expected_obrigatorio', 'commit sem expected é recusado');
select throws_ok($$select public.import_finish('cccccccc-0000-0000-0000-000000000003', true, null)$$, '22023', 'expected_obrigatorio', 'commit com expected nulo é recusado');
select is((select import_state from public.workshops where id = 'cccccccc-0000-0000-0000-000000000003'), 'importando', 'estado segue importando');

-- expected errado (zerado, como o "Começar sem dados")
select throws_ok($$select public.import_finish('cccccccc-0000-0000-0000-000000000003', true,
  '{"counts":{"work_orders":0,"work_order_finance":0,"work_order_costs":0,"ledger":0,"clients":0,"catalog_parts":0,"catalog_services":0,"catalog_prices":0,"catalog_costs":0,"technicians":0,"appointments":0,"audit_log":0,"settings":0},"ledgerSignedCents":0,"osTotalCents":0,"paidEntries":0,"advancesCents":0}')$$,
  '22023', 'totais_divergentes', 'começar sem dados com linhas no servidor é recusado');
select is((select import_state from public.workshops where id = 'cccccccc-0000-0000-0000-000000000003'), 'importando', 'recusa não muda o estado');

select throws_ok($$select public.import_finish('cccccccc-0000-0000-0000-000000000003', true,
  ((select j from t1) - 'state') || '{"ledgerSignedCents": 1}')$$,
  '22023', 'totais_divergentes', 'expected com um valor diferente é recusado');
select is((select import_state from public.workshops where id = 'cccccccc-0000-0000-0000-000000000003'), 'importando', 'estado continua importando');

-- expected certo (o próprio objeto devolvido, com ou sem `state`)
select is((select public.import_finish('cccccccc-0000-0000-0000-000000000003', true, (select j from t1)) ->> 'state'), 'concluido', 'expected certo conclui');
select is((select import_state from public.workshops where id = 'cccccccc-0000-0000-0000-000000000003'), 'concluido', 'estado concluido');
select throws_ok($$select public.import_finish('cccccccc-0000-0000-0000-000000000003', true, null)$$, '42501', 'import_bloqueado', 'depois de concluir, commit é recusado');

-- ===== Oficina D: zero linhas =====
select is((select public.import_finish('dddddddd-0000-0000-0000-000000000004', true,
  '{"counts":{"work_orders":0,"work_order_finance":0,"work_order_costs":0,"ledger":0,"clients":0,"catalog_parts":0,"catalog_services":0,"catalog_prices":0,"catalog_costs":0,"technicians":0,"appointments":0,"audit_log":0,"settings":0},"ledgerSignedCents":0,"osTotalCents":0,"paidEntries":0,"advancesCents":0}') ->> 'state'),
  'concluido', 'com zero linhas e expected zerado conclui');

select pg_temp.as_admin();
select * from finish();

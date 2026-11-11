select no_plan();

-- Dono lê tudo da própria oficina
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select is((select count(*) from public.work_orders), 5::bigint, 'dono lê as OS da oficina A');
select ok((select count(*) from public.work_order_finance) = 2, 'dono lê work_order_finance');
select ok((select count(*) from public.work_order_costs) = 1, 'dono lê work_order_costs');
select ok((select count(*) from public.catalog_costs) = 1, 'dono lê catalog_costs');
select ok((select count(*) from public.catalog_prices) = 1, 'dono lê catalog_prices');
select ok((select count(*) from public.ledger) = 2, 'dono lê ledger');
select ok((select count(*) from public.audit_log) = 1, 'dono lê audit_log');
select ok((select count(*) from public.audit_events) > 0, 'dono lê audit_events');
select ok((select count(*) from public.memberships) = 5, 'dono vê os membros das suas oficinas (4 da A + ele na C)');
select ok((select count(*) from public.devices) = 1, 'dono lê devices');
select is((select count(*) from public.work_orders where workshop_id = 'bbbbbbbb-0000-0000-0000-000000000002'), 0::bigint, 'oficina A não lê OS da B');
select is((select count(*) from public.workshops), 2::bigint, 'dono vê só as suas oficinas (A e C), não a B');
select is((select count(*) from public.workshops where id = 'bbbbbbbb-0000-0000-0000-000000000002'), 0::bigint, 'dono A não vê a oficina B');
select throws_ok($$select secret_hash from public.devices$$, '42501', null, 'secret_hash de devices não é legível');
select throws_ok($$select * from public.member_pins$$, '42501', null, 'member_pins sem grant: invisível');
select throws_ok($$select * from public.money_ops$$, '42501', null, 'money_ops sem grant: invisível');

-- Oficina B
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
select is((select count(*) from public.work_orders), 1::bigint, 'dono B lê só a OS da B');
select is((select count(*) from public.work_orders where workshop_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0::bigint, 'oficina B não lê a A');
select is((select count(*) from public.ledger), 0::bigint, 'dono B não lê ledger da A');

-- Recepção
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select ok((select count(*) from public.work_order_finance) = 2, 'recepção lê work_order_finance');
select ok((select count(*) from public.ledger) = 2, 'recepção lê ledger');
select ok((select count(*) from public.catalog_prices) = 1, 'recepção lê catalog_prices');
select is((select count(*) from public.work_order_costs), 0::bigint, 'recepção lê 0 de work_order_costs');
select is((select count(*) from public.catalog_costs), 0::bigint, 'recepção lê 0 de catalog_costs');
select is((select count(*) from public.audit_log), 0::bigint, 'recepção lê 0 de audit_log');
select is((select count(*) from public.audit_events), 0::bigint, 'recepção lê 0 de audit_events');
select is((select count(*) from public.devices), 0::bigint, 'recepção lê 0 de devices');

-- Mecânico
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select is((select count(*) from public.work_orders), 5::bigint, 'mecânico lê as OS');
select ok((select count(*) from public.clients) = 1, 'mecânico lê clients');
select ok((select count(*) from public.catalog_parts) = 1, 'mecânico lê catalog_parts');
select is((select count(*) from public.work_order_finance), 0::bigint, 'mecânico lê 0 de work_order_finance');
select is((select count(*) from public.work_order_costs), 0::bigint, 'mecânico lê 0 de work_order_costs');
select is((select count(*) from public.ledger), 0::bigint, 'mecânico lê 0 de ledger');
select is((select count(*) from public.catalog_prices), 0::bigint, 'mecânico lê 0 de catalog_prices');
select is((select count(*) from public.catalog_costs), 0::bigint, 'mecânico lê 0 de catalog_costs');
select is((select count(*) from public.audit_log), 0::bigint, 'mecânico lê 0 de audit_log');
select is((select count(*) from public.memberships), 1::bigint, 'mecânico vê só a própria linha de memberships');

-- Desativado
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select is((select count(*) from public.work_orders), 0::bigint, 'desativado lê 0 OS');
select is((select count(*) from public.clients), 0::bigint, 'desativado lê 0 clients');
select is((select count(*) from public.workshops), 0::bigint, 'desativado lê 0 workshops');
select is((select count(*) from public.ledger), 0::bigint, 'desativado lê 0 ledger');

-- anon
select pg_temp.as_anon();
select throws_ok($$select * from public.work_orders$$, '42501', null, 'anon não lê work_orders');
select throws_ok($$select * from public.workshops$$, '42501', null, 'anon não lê workshops');
select throws_ok($$select public.sync_push('aaaaaaaa-0000-0000-0000-000000000001', '[]')$$, '42501', null, 'anon não executa sync_push');
select throws_ok($$select public.import_rows('aaaaaaaa-0000-0000-0000-000000000001', '[]')$$, '42501', null, 'anon não executa import_rows');
select throws_ok($$select app.role_in('aaaaaaaa-0000-0000-0000-000000000001')$$, '42501', null, 'anon não usa o schema app');

select pg_temp.as_admin();
select * from finish();

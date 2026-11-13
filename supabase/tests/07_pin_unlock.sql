-- pin_unlock (migração 20261112130000). Preâmbulo: setup.inc.
-- Oficina A: dono d1 (com PIN 'x'), recepção e1, mecânico f1; oficina B: dono d2.

select no_plan();

select ok(not has_function_privilege('anon', 'public.pin_unlock(uuid,uuid)', 'execute'), 'anon não executa pin_unlock');
select ok(not has_function_privilege('authenticated', 'public.pin_unlock(uuid,uuid)', 'execute'), 'authenticated não executa pin_unlock');
select ok(has_function_privilege('service_role', 'public.pin_unlock(uuid,uuid)', 'execute'), 'service_role executa pin_unlock');
select is((select count(*) from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.pronamespace = 'public'::regnamespace and p.proname = 'pin_unlock' and a.privilege_type = 'EXECUTE'
      and (a.grantee = 0 or a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated')))), 0::bigint,
  'pin_unlock: EXECUTE nunca para public, anon ou authenticated');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select throws_ok($$select public.pin_unlock('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1')$$,
  '42501', null, 'authenticated (nem o dono) não chama pin_unlock');
select pg_temp.as_anon();
select throws_ok($$select public.pin_unlock('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1')$$,
  '42501', null, 'anon não chama pin_unlock');
select pg_temp.as_service();

select public.pin_set('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', '123456');
update public.member_pins set failed = 5, locked = true, last_failed_at = now() where user_id = '00000000-0000-0000-0000-0000000000f1';
select is((select public.pin_attempt('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', '123456', null) ->> 'status'),
  'locked', 'bloqueado recusa até o PIN certo');

select is(public.pin_unlock('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1'), true, 'pin_unlock devolve verdadeiro');
select is((select failed || '/' || locked || '/' || coalesce(last_failed_at::text, 'nulo') from public.member_pins where user_id = '00000000-0000-0000-0000-0000000000f1'),
  '0/false/nulo', 'zerou failed, locked e last_failed_at');
select is((select public.pin_attempt('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', '123456', null) ->> 'status'),
  'ok', 'o mesmo PIN volta a valer (o PIN não mudou)');

select is(public.pin_unlock('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1'), false, 'sem PIN: falso');
update public.member_pins set failed = 5, locked = true where user_id = '00000000-0000-0000-0000-0000000000f1';
select is(public.pin_unlock('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000f1'), false, 'oficina errada: falso');
select is((select locked from public.member_pins where user_id = '00000000-0000-0000-0000-0000000000f1'), true, 'pedido de outra oficina não desbloqueia');

select * from finish();

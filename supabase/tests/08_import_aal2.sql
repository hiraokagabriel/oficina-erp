-- import_aal2 (migração 20261118120000): Dono com TOTP verificado só importa com aal2. Preâmbulo: setup.inc.
-- Oficina C (import_state vazio): dono d1. Oficina A (concluido): recepção e1.

select no_plan();

create function pg_temp.as_user_aal(sub uuid, lvl text) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', sub, 'role', 'authenticated', 'aal', lvl)::text, true);
  perform set_config('role', 'authenticated', true);
end $f$;
grant execute on function pg_temp.as_user_aal(uuid, text) to public;

select ok(not has_function_privilege('authenticated', 'app.require_owner_aal()', 'execute'), 'require_owner_aal: authenticated não executa direto');

-- ===== Dono sem TOTP: importa como antes (mesmo com aal1) =====
select pg_temp.as_user_aal('00000000-0000-0000-0000-0000000000d1', 'aal1');
select lives_ok($$select public.import_rows('cccccccc-0000-0000-0000-000000000003', '[{"table":"clients","id":"x1","data":{"name":"A"}}]')$$, 'Dono sem TOTP importa (aal1)');
select lives_ok($$select public.import_finish('cccccccc-0000-0000-0000-000000000003')$$, 'Dono sem TOTP confere (aal1)');

-- Fator ainda não verificado não conta.
select pg_temp.as_admin();
insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
values ('11111111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'totp', 'unverified', now(), now());
select pg_temp.as_user_aal('00000000-0000-0000-0000-0000000000d1', 'aal1');
select lives_ok($$select public.import_rows('cccccccc-0000-0000-0000-000000000003', '[{"table":"clients","id":"x1","data":{"name":"A"}}]')$$, 'TOTP não verificado não exige aal2');

-- ===== Dono com TOTP verificado =====
select pg_temp.as_admin();
update auth.mfa_factors set status = 'verified' where id = '11111111-0000-0000-0000-000000000001';
select pg_temp.as_user_aal('00000000-0000-0000-0000-0000000000d1', 'aal1');
select throws_ok($$select public.import_rows('cccccccc-0000-0000-0000-000000000003', '[]')$$, '42501', 'exige_mfa', 'TOTP + aal1: import_rows recusado');
select throws_ok($$select public.import_finish('cccccccc-0000-0000-0000-000000000003', true)$$, '42501', 'exige_mfa', 'TOTP + aal1: import_finish recusado');
select throws_ok($$select public.import_reset('cccccccc-0000-0000-0000-000000000003')$$, '42501', 'exige_mfa', 'TOTP + aal1: import_reset recusado');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select throws_ok($$select public.import_rows('cccccccc-0000-0000-0000-000000000003', '[]')$$, '42501', 'exige_mfa', 'TOTP + JWT sem claim aal: recusado');

select pg_temp.as_user_aal('00000000-0000-0000-0000-0000000000d1', 'aal2');
select lives_ok($$select public.import_rows('cccccccc-0000-0000-0000-000000000003', '[{"table":"clients","id":"x2","data":{"name":"B"}}]')$$, 'TOTP + aal2: import_rows passa');
select lives_ok($$select public.import_finish('cccccccc-0000-0000-0000-000000000003')$$, 'TOTP + aal2: import_finish passa');
select lives_ok($$select public.import_reset('cccccccc-0000-0000-0000-000000000003')$$, 'TOTP + aal2: import_reset passa');
select is((select import_state from public.workshops where id = 'cccccccc-0000-0000-0000-000000000003'), 'vazio', 'reset com aal2 volta para vazio');

-- ===== não-Dono: recusado como antes (papel vem antes do aal) =====
select pg_temp.as_user_aal('00000000-0000-0000-0000-0000000000e1', 'aal1');
select throws_ok($$select public.import_rows('aaaaaaaa-0000-0000-0000-000000000001', '[]')$$, '42501', 'somente_dono', 'recepção continua recusada');
select pg_temp.as_user_aal('00000000-0000-0000-0000-0000000000d2', 'aal2');
select throws_ok($$select public.import_rows('cccccccc-0000-0000-0000-000000000003', '[]')$$, '42501', 'somente_dono', 'dono de outra oficina continua recusado');

select * from finish();

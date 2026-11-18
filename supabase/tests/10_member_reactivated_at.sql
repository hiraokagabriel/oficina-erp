-- memberships.reactivated_at (migração 20261118140000). Preâmbulo: setup.inc.
-- Oficina A: dono d1, recepção e1, mecânico f1.

select no_plan();

select pg_temp.as_service();
select is((select reactivated_at from public.memberships where user_id = '00000000-0000-0000-0000-0000000000f1'), null,
  'sem reativação: reactivated_at nulo');
select public.membership_apply('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'deactivate');
select is((select reactivated_at from public.memberships where user_id = '00000000-0000-0000-0000-0000000000f1'), null,
  'desativar não grava reactivated_at');
select public.membership_apply('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'reactivate');
select ok((select reactivated_at from public.memberships where user_id = '00000000-0000-0000-0000-0000000000f1') >= now() - interval '1 minute',
  'reativar grava reactivated_at agora');
select is((select reactivated_at from public.memberships where user_id = '00000000-0000-0000-0000-0000000000e1'), null,
  'outra pessoa não é afetada');
select public.membership_apply('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'set_role', 'recepcao');
select ok((select reactivated_at from public.memberships where user_id = '00000000-0000-0000-0000-0000000000f1') is not null,
  'set_role não zera reactivated_at');

select * from finish();

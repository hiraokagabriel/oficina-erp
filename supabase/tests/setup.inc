-- Preâmbulo comum (o runner antepõe a cada teste, dentro de begin/rollback).
create extension if not exists pgtap;

-- A migração revoga execute das funções de public; devolve só as do pgtap (rollback desfaz).
do $$
declare p regprocedure;
begin
  for p in select pr.oid::regprocedure from pg_proc pr
           join pg_depend d on d.objid = pr.oid and d.deptype = 'e'
           join pg_extension e on e.oid = d.refobjid and e.extname = 'pgtap'
  loop
    execute format('grant execute on function %s to public', p);
  end loop;
end $$;

-- Troca de identidade (valem até o fim da transação).
create function pg_temp.as_user(sub uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', sub, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $f$;
create function pg_temp.as_service() returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('role', 'service_role', true);
end $f$;
create function pg_temp.as_anon() returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end $f$;
create function pg_temp.as_admin() returns void language plpgsql as $f$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;
create function pg_temp.rows_affected(q text) returns bigint language plpgsql as $f$
declare n bigint;
begin
  execute q;
  get diagnostics n = row_count;
  return n;
end $f$;
grant execute on all functions in schema pg_temp to public;

-- Oficinas A e B; usuários: dono, recepção, mecânico, desativado (A) e dono (B).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'dono@a.test'),
  ('00000000-0000-0000-0000-0000000000e1', 'recepcao@a.test'),
  ('00000000-0000-0000-0000-0000000000f1', 'mecanico@a.test'),
  ('00000000-0000-0000-0000-0000000000a1', 'inativo@a.test'),
  ('00000000-0000-0000-0000-0000000000d2', 'dono@b.test');
insert into public.workshops (id, name, import_state) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Oficina A', 'concluido'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Oficina B', 'concluido'),
  ('cccccccc-0000-0000-0000-000000000003', 'Oficina C (importação)', 'vazio');
insert into public.memberships (workshop_id, user_id, role, active) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'dono', true),
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', 'recepcao', true),
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'mecanico', true),
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'recepcao', false),
  ('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d2', 'dono', true),
  ('cccccccc-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000d1', 'dono', true);
insert into public.member_pins (workshop_id, user_id, pin_hash) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'x');
insert into public.devices (workshop_id, name, kind, secret_hash) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'PC balcão', 'pc_compartilhado', 'segredo');

-- Dados da oficina A (gravados como postgres: guardas liberam).
insert into public.work_orders (workshop_id, id, data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'os1', '{"status":"APROVADO","clientName":"Joao","parts":[{"d":"filtro"}],"mileage":100,"checklist":[],"photos":[]}'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'os2', '{"status":"FINALIZADO","clientName":"Maria","parts":[]}'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'os3', '{"status":"ARQUIVADO","clientName":"Pedro","parts":[]}'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'os4', '{"status":"AGUARDANDO_PAGAMENTO","clientName":"Ana","parts":[]}'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'os5', '{"status":"AGUARDANDO_PAGAMENTO","clientName":"Rui","parts":[]}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'osB', '{"status":"APROVADO","clientName":"Outro","parts":[]}');
insert into public.work_order_finance (workshop_id, id, data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'os1', '{"prices":{"i1":10000},"total":10000,"advances":[]}'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'os4', '{"prices":{"i2":5000},"total":5000,"financialId":"fin1","installmentConfig":{"count":2,"description":"antiga"}}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'osB', '{"prices":{},"total":1}');
insert into public.work_order_costs (workshop_id, id, data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'os1', '{"costs":{"i1":100},"totalCost":100,"profit":9900}');
insert into public.catalog_costs (workshop_id, id, data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'part:CP1', '{"kind":"part","item_id":"CP1","cost":10}');
insert into public.catalog_prices (workshop_id, id, data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'part:CP1', '{"kind":"part","item_id":"CP1","price":20}');
insert into public.catalog_parts (workshop_id, id, data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cpa1', '{"name":"Filtro"}');
insert into public.clients (workshop_id, id, data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'c1', '{"name":"Joao"}');
insert into public.ledger (workshop_id, id, data, os_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'l1', '{"type":"CREDIT","amount":1000,"description":"manual"}', null),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'l2', '{"type":"CREDIT","amount":500,"description":"da os"}', 'os1');
insert into public.audit_log (workshop_id, id, data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'al1', '{"x":1}');

select no_plan();

select is((select public from storage.buckets where id = 'fotos'), false, 'bucket fotos é privado');
select is((select file_size_limit from storage.buckets where id = 'fotos'), 3145728::bigint, 'bucket fotos limita 3 MB');
select is((select allowed_mime_types from storage.buckets where id = 'fotos'), array['image/jpeg'], 'bucket fotos só aceita JPEG');
select is((select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
  and tablename in ('work_orders', 'work_order_finance', 'work_order_costs', 'ledger', 'clients', 'catalog_parts',
    'catalog_services', 'catalog_prices', 'catalog_costs', 'technicians', 'appointments', 'audit_log', 'settings')),
  13::bigint, 'as 13 tabelas estão na publicação realtime');
select is((select count(*) from pg_tables where schemaname = 'public' and not rowsecurity
  and tablename not like '%pg_%' and tablename not in ('__tcache__')), 0::bigint, 'toda tabela de public tem RLS ligada');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select lives_ok($$insert into storage.objects (bucket_id, name, owner) values ('fotos', 'aaaaaaaa-0000-0000-0000-000000000001/os1/foto1.jpg', null)$$, 'dono envia foto da própria oficina');
select lives_ok($$insert into storage.objects (bucket_id, name) values ('fotos', 'aaaaaaaa-0000-0000-0000-000000000001/os1/foto1.t.jpg')$$, 'miniatura .t.jpg aceita');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('fotos', 'aaaaaaaa-0000-0000-0000-000000000001/os1/foto1.png')$$, '42501', null, 'extensão fora do padrão: negada');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('fotos', 'bbbbbbbb-0000-0000-0000-000000000002/os1/foto1.jpg')$$, '42501', null, 'foto em pasta de outra oficina: negada');
select is((select count(*) from storage.objects where bucket_id = 'fotos'), 2::bigint, 'dono lê as fotos da própria oficina');
select is(pg_temp.rows_affected($q$update storage.objects set name = 'aaaaaaaa-0000-0000-0000-000000000001/os1/outra.jpg' where bucket_id = 'fotos'$q$), 0::bigint, 'sem update de foto (nunca sobrescreve)');
select is((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname in ('f_sel', 'f_ins') and cmd in ('UPDATE', 'DELETE', 'ALL')), 0::bigint, 'sem policy de update nem delete de foto');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select lives_ok($$insert into storage.objects (bucket_id, name) values ('fotos', 'aaaaaaaa-0000-0000-0000-000000000001/os1/foto-mec.jpg')$$, 'mecânico envia foto da própria oficina');
select is((select count(*) from storage.objects where bucket_id = 'fotos'), 3::bigint, 'mecânico lê as fotos da própria oficina');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('fotos', 'bbbbbbbb-0000-0000-0000-000000000002/os1/foto-mec.jpg')$$, '42501', null, 'mecânico não envia foto para a oficina B');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
select is((select count(*) from storage.objects where bucket_id = 'fotos'), 0::bigint, 'dono B não lê as fotos enviadas pelo mecânico da A');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
select is((select count(*) from storage.objects where bucket_id = 'fotos'), 0::bigint, 'oficina B não lê fotos da A');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select is((select count(*) from storage.objects where bucket_id = 'fotos'), 0::bigint, 'desativado não lê fotos');

select pg_temp.as_admin();
select * from finish();

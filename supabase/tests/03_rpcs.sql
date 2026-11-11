select no_plan();

-- ===== sync_push =====
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
create temp table r1 as select public.sync_push('aaaaaaaa-0000-0000-0000-000000000001',
  '[{"key":"g1","rows":[{"table":"clients","id":"c2","version":0,"data":{"name":"Novo"}}]}]'::jsonb) as j;
grant all on r1 to public;
select is((select j -> 0 ->> 'status' from r1), 'ok', 'sync_push: insert novo ok');
select is((select j -> 0 -> 'rows' -> 0 ->> 'version' from r1), '1', 'sync_push: versão 1 após insert');

create temp table r2 as select public.sync_push('aaaaaaaa-0000-0000-0000-000000000001',
  '[{"key":"g2","rows":[{"table":"clients","id":"c2","version":1,"data":{"name":"Editado"}}]}]'::jsonb) as j;
grant all on r2 to public;
select is((select j -> 0 -> 'rows' -> 0 ->> 'version' from r2), '2', 'sync_push: update com versão certa vira 2');

create temp table r3 as select public.sync_push('aaaaaaaa-0000-0000-0000-000000000001',
  '[{"key":"g3","rows":[{"table":"clients","id":"c2","version":1,"data":{"name":"Velho"}}]}]'::jsonb) as j;
grant all on r3 to public;
select is((select j -> 0 ->> 'status' from r3), 'conflict', 'sync_push: versão velha dá conflict');
select is((select j -> 0 -> 'rows' -> 0 ->> 'version' from r3), '2', 'conflict devolve a linha atual (versão 2)');
select is((select j -> 0 -> 'rows' -> 0 -> 'data' ->> 'name' from r3), 'Editado', 'conflict devolve os dados atuais');
select is((select data ->> 'name' from public.clients where id = 'c2'), 'Editado', 'conflict não grava nada');

create temp table r4 as select public.sync_push('aaaaaaaa-0000-0000-0000-000000000001',
  '[{"key":"g4","rows":[{"table":"clients","id":"c2","version":0,"data":{"name":"Dup"}}]}]'::jsonb) as j;
grant all on r4 to public;
select is((select j -> 0 ->> 'status' from r4), 'conflict', 'sync_push: insert de id existente dá conflict');

create temp table r5 as select public.sync_push('aaaaaaaa-0000-0000-0000-000000000001',
  '[{"key":"g5","rows":[{"table":"ledger","id":"l7","version":0,"data":{"type":"CREDIT","amount":5}},{"table":"clients","id":"c3","version":0,"data":{"name":"Atomico"}}]},
    {"key":"g6","rows":[{"table":"nao_existe","id":"z","version":0,"data":{}}]}]'::jsonb) as j;
grant all on r5 to public;
select is((select j -> 0 ->> 'status' from r5), 'ok', 'grupo com várias linhas ok');
select is((select j -> 1 ->> 'status' from r5), 'denied', 'tabela fora da lista: denied');
select is((select j -> 1 ->> 'code' from r5), '22023', 'tabela inválida: código 22023');
select is((select count(*) from public.ledger where id = 'l7'), 1::bigint, 'ledger criado via sync_push');

create temp table r6 as select public.sync_push('aaaaaaaa-0000-0000-0000-000000000001',
  '[{"key":"g7","rows":[{"table":"clients","id":"c4","version":0,"data":{"name":"Rollback"}},{"table":"ledger","id":"l6","version":0,"os_id":"os1","data":{"type":"CREDIT","amount":5}}]}]'::jsonb) as j;
grant all on r6 to public;
select is((select j -> 0 ->> 'status' from r6), 'denied', 'grupo com ledger os_id: denied');
select is((select count(*) from public.clients where id = 'c4'), 0::bigint, 'grupo negado desfaz todas as linhas');

select throws_ok($$select public.sync_push('bbbbbbbb-0000-0000-0000-000000000002', '[]')$$, '42501', 'sem_acesso', 'sync_push em oficina alheia: negado');
select throws_ok($$select public.sync_push('aaaaaaaa-0000-0000-0000-000000000001', '{}')$$, '22023', null, 'groups precisa ser array');

-- mecânico via sync_push: campo proibido e tabela sem permissão
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
create temp table r7 as select public.sync_push('aaaaaaaa-0000-0000-0000-000000000001',
  '[{"key":"m1","rows":[{"table":"work_orders","id":"os1","version":1,"data":{"status":"APROVADO","clientName":"Hack","parts":[{"d":"filtro"}],"mileage":100,"checklist":{"categories":[],"notes":""},"photos":[]}}]},
    {"key":"m2","rows":[{"table":"ledger","id":"lm","version":0,"data":{"type":"CREDIT","amount":1}}]}]'::jsonb) as j;
grant all on r7 to public;
select is((select j -> 0 ->> 'status' from r7), 'denied', 'mecânico: clientName via sync_push negado');
select is((select j -> 0 ->> 'code' from r7), '42501', 'mecânico: código 42501');
select is((select j -> 1 ->> 'status' from r7), 'denied', 'mecânico: ledger via sync_push negado');


-- importação pendente bloqueia o sync
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
create temp table rp as select public.sync_push('cccccccc-0000-0000-0000-000000000003',
  '[{"key":"p1","rows":[{"table":"clients","id":"x","version":0,"data":{"name":"x"}}]}]'::jsonb) as j;
grant all on rp to public;
select is((select j -> 0 ->> 'status' from rp), 'denied', 'sync_push com import_state vazio: denied');
select is((select j -> 0 ->> 'code' from rp), 'importacao_pendente', 'código importacao_pendente');
select is((select count(*) from public.clients where workshop_id = 'cccccccc-0000-0000-0000-000000000003'), 0::bigint, 'nada gravado durante a importação');

-- linha inexistente com versão > 0: denied nao_encontrado (nunca conflict vazio)
create temp table rn as select public.sync_push('aaaaaaaa-0000-0000-0000-000000000001',
  '[{"key":"n1","rows":[{"table":"clients","id":"nope","version":5,"data":{"name":"x"}}]}]'::jsonb) as j;
grant all on rn to public;
select is((select j -> 0 ->> 'status' from rn), 'denied', 'update de linha inexistente: denied');
select is((select j -> 0 ->> 'code' from rn), 'nao_encontrado', 'código nao_encontrado');

-- sync_push não mexe em os_id no update
create temp table ro as select public.sync_push('aaaaaaaa-0000-0000-0000-000000000001',
  '[{"key":"o1","rows":[{"table":"ledger","id":"l2","version":1,"data":{"type":"CREDIT","amount":500,"description":"so descricao"}}]}]'::jsonb) as j;
grant all on ro to public;
select is((select j -> 0 ->> 'status' from ro), 'ok', 'update de description em lançamento de OS, sem os_id no payload');
select is((select os_id from public.ledger where id = 'l2'), 'os1', 'os_id do servidor preservado');

-- OS nova FINALIZADO via sync_push: negada
create temp table rf as select public.sync_push('aaaaaaaa-0000-0000-0000-000000000001',
  '[{"key":"f1","rows":[{"table":"work_orders","id":"osZ","version":0,"data":{"status":"FINALIZADO"}}]}]'::jsonb) as j;
grant all on rf to public;
select is((select j -> 0 ->> 'code' from rf), '42501', 'sync_push: OS nova FINALIZADO negada');
select is((select j -> 0 ->> 'message' from rf), 'money_op_required', 'mensagem money_op_required');

-- mecânico: linha invisível com versão > 0
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
create temp table rm as select public.sync_push('aaaaaaaa-0000-0000-0000-000000000001',
  '[{"key":"h1","rows":[{"table":"ledger","id":"l1","version":1,"data":{"type":"CREDIT","amount":1}}]}]'::jsonb) as j;
grant all on rm to public;
select is((select j -> 0 ->> 'code' from rm), 'nao_encontrado', 'mecânico: linha que não enxerga vira nao_encontrado');

-- ===== apply_money_op =====
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select throws_ok($$select public.apply_money_op('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', null, 'x', '[]', '[]')$$,
  '42501', null, 'usuário não executa apply_money_op');

select pg_temp.as_service();
create temp table m1 as select public.apply_money_op('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000e1', null, 'finalizar',
  '[{"table":"work_orders","id":"os1","version":1},{"table":"work_order_finance","id":"os1","version":1},{"table":"ledger","id":"lr1","version":0}]',
  '[{"table":"work_orders","id":"os1","data":{"status":"FINALIZADO","clientName":"Joao","parts":[]}},
    {"table":"work_order_finance","id":"os1","data":{"prices":{"i1":10000},"total":10000,"financialId":"fin-os1","advances":[]}},
    {"table":"ledger","id":"lr1","os_id":"os1","data":{"type":"CREDIT","amount":10000,"description":"OS 1"}}]',
  '[{"id":"aud1","data":{"msg":"finalizou"}}]') as j;
grant all on m1 to public;
select is((select j ->> 'status' from m1), 'ok', 'apply_money_op: ok');
select is((select data ->> 'status' from public.work_orders where id = 'os1'), 'FINALIZADO', 'OS finalizada pela função');
select is((select os_id from public.ledger where id = 'lr1'), 'os1', 'ledger com os_id criado pela função');
select is((select updated_by from public.ledger where id = 'lr1'), '00000000-0000-0000-0000-0000000000e1'::uuid, 'updated_by é o usuário informado');
select is((select count(*) from public.audit_log where id = 'aud1'), 1::bigint, 'audit_log gravado');
select is((select count(*) from public.money_ops where op_id = '11111111-1111-1111-1111-111111111111'), 1::bigint, 'money_ops gravado');
select ok(exists (select 1 from public.audit_events where tbl = 'ledger' and row_id = 'lr1' and user_id = '00000000-0000-0000-0000-0000000000e1'), 'audit_events com o usuário real');

create temp table m2 as select public.apply_money_op('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000e1', null, 'finalizar', '[]', '[{"table":"clients","id":"nao-deve-criar","data":{}}]') as j;
grant all on m2 to public;
select is((select j from m2), (select j from m1), 'mesmo op_id devolve o resultado gravado');
select is((select count(*) from public.clients where id = 'nao-deve-criar'), 0::bigint, 'repetição não regrava');
select is((select version from public.work_orders where id = 'os1'), 2::bigint, 'repetição não incrementa version');
select is((select count(*) from public.ledger where id = 'lr1'), 1::bigint, 'repetição não duplica ledger');

create temp table m3 as select public.apply_money_op('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000e1', null, 'x',
  '[{"table":"work_orders","id":"os1","version":1}]',
  '[{"table":"clients","id":"nao-deve-criar2","data":{}}]') as j;
grant all on m3 to public;
select is((select j ->> 'status' from m3), 'conflict', 'versão esperada velha: conflict');
select is((select j -> 'rows' -> 0 ->> 'version' from m3), '2', 'conflict devolve a versão atual');
select is((select count(*) from public.money_ops where op_id = '22222222-2222-2222-2222-222222222222'), 0::bigint, 'conflict não grava money_ops');
select is((select count(*) from public.clients where id = 'nao-deve-criar2'), 0::bigint, 'conflict não grava nada');

select throws_ok($$select public.apply_money_op('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', null, 'x', '[]', '[]')$$,
  '42501', 'sem_permissao', 'mecânico não faz operação de dinheiro');
select throws_ok($$select public.apply_money_op('44444444-4444-4444-4444-444444444444', 'aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d2', null, 'x', '[]', '[]')$$,
  '42501', 'sem_permissao', 'usuário de outra oficina: negado');
select throws_ok($$select public.apply_money_op('55555555-5555-5555-5555-555555555555', 'aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', null, 'x', '[]', '[{"table":"nada","id":"a","data":{}}]')$$,
  '22023', null, 'tabela inválida em writes');


select pg_temp.as_service();
select throws_ok($$select public.apply_money_op('66666666-6666-6666-6666-666666666666', 'aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', null, 'x', '[]', '[{"table":"clients","id":"sem-exp","data":{}}]')$$,
  '22023', 'write_sem_expected', 'write sem entrada em p_expected: recusado');
select is((select count(*) from public.clients where id = 'sem-exp'), 0::bigint, 'write recusado não grava');

create temp table m4 as select public.apply_money_op('77777777-7777-7777-7777-777777777777', 'aaaaaaaa-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000e1', null, 'x',
  '[{"table":"ledger","id":"lr1","version":1}]',
  '[{"table":"ledger","id":"lr1","data":{"type":"CREDIT","amount":10000,"description":"OS 1 v2"}}]') as j;
grant all on m4 to public;
select is((select j ->> 'status' from m4), 'ok', 'update de ledger sem os_id no payload: ok');
select is((select os_id from public.ledger where id = 'lr1'), 'os1', 'os_id não é zerado quando o write omite a chave');
select is((select data ->> 'description' from public.ledger where id = 'lr1'), 'OS 1 v2', 'dados atualizados');
select throws_ok($$select public.apply_money_op('88888888-8888-8888-8888-888888888888', 'aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', null, 'x',
  '[{"table":"ledger","id":"lr1","version":2}]',
  '[{"table":"ledger","id":"lr1","os_id":"outra","data":{"type":"CREDIT","amount":1}}]')$$,
  '42501', 'ledger_os_id_imutavel', 'não troca os_id não nulo por outro valor');
select is((select os_id from public.ledger where id = 'lr1'), 'os1', 'os_id intacto após tentativa de troca');

create temp table m5 as select public.apply_money_op('99999999-9999-9999-9999-999999999999', 'aaaaaaaa-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000e1', null, 'x',
  '[{"table":"clients","id":"c1","version":0}]',
  '[{"table":"clients","id":"c1","data":{"name":"Sobrescrita"}}]') as j;
grant all on m5 to public;
select is((select j ->> 'status' from m5), 'conflict', 'expected 0 sobre linha existente: conflict');
select is((select data ->> 'name' from public.clients where id = 'c1'), 'Joao', 'conflict não sobrescreve');

select throws_ok($$select public.apply_money_op('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d2', null, 'finalizar', '[]', '[]')$$,
  '22023', 'op_id_reutilizado', 'op_id de outra oficina não devolve o resultado alheio');
select throws_ok($$select public.apply_money_op('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', null, 'finalizar', '[]', '[]')$$,
  '22023', 'op_id_reutilizado', 'op_id com outro usuário: erro');
select throws_ok($$select public.apply_money_op('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', null, 'receber', '[]', '[]')$$,
  '22023', 'op_id_reutilizado', 'op_id com outro tipo: erro');

select pg_temp.as_admin();
select * from finish();

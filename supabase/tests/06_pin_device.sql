-- PIN, aparelhos e membros (migração 20261112120000_auth_pin_device). Preâmbulo: setup.inc.
-- Oficina A: dono d1, recepção e1, mecânico f1, inativo a1 (recepção desativada); oficina B: dono d2.
-- Oficina A já tem o aparelho 'PC balcão' (pc_compartilhado) e um member_pins 'x' do dono d1.

select no_plan();
create temp table t_dev as select id from public.devices where name = 'PC balcão';
grant select on t_dev to public;

-- ===== Grants =====
select ok(not has_function_privilege('anon', 'public.pin_attempt(uuid,uuid,text,uuid)', 'execute'), 'anon não executa pin_attempt');
select ok(not has_function_privilege('authenticated', 'public.pin_attempt(uuid,uuid,text,uuid)', 'execute'), 'authenticated não executa pin_attempt');
select ok(not has_function_privilege('authenticated', 'public.pin_set(uuid,uuid,text)', 'execute'), 'authenticated não executa pin_set');
select ok(not has_function_privilege('authenticated', 'public.membership_apply(uuid,uuid,text,text)', 'execute'), 'authenticated não executa membership_apply');
select ok(not has_function_privilege('authenticated', 'public.pin_roster(uuid)', 'execute'), 'authenticated não executa pin_roster');
select ok(not has_function_privilege('authenticated', 'public.user_id_by_email(text)', 'execute'), 'authenticated não executa user_id_by_email');
select ok(has_function_privilege('service_role', 'public.pin_attempt(uuid,uuid,text,uuid)', 'execute'), 'service_role executa pin_attempt');
select ok(has_function_privilege('service_role', 'public.membership_apply(uuid,uuid,text,text)', 'execute'), 'service_role executa membership_apply');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select throws_ok($$select public.pin_set('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', '123456')$$,
  '42501', null, 'authenticated não chama pin_set (nem o próprio dono)');
select throws_ok($$select * from public.member_pins$$, '42501', null, 'authenticated não lê member_pins');
select pg_temp.as_anon();
select throws_ok($$select public.pin_attempt('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', '123456')$$,
  '42501', null, 'anon não chama pin_attempt');

select pg_temp.as_service();

-- ===== pin_set =====
select throws_ok($$select public.pin_set('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', '12345')$$,
  '22023', 'pin_invalido', 'PIN de 5 dígitos recusado');
select throws_ok($$select public.pin_set('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', '12345a')$$,
  '22023', 'pin_invalido', 'PIN não numérico recusado');
select throws_ok($$select public.pin_set('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', null)$$,
  '22023', 'pin_invalido', 'PIN nulo recusado');
select throws_ok($$select public.pin_set('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '123456')$$,
  '42501', 'sem_membership', 'membership inativa não define PIN');
select throws_ok($$select public.pin_set('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000f1', '123456')$$,
  '42501', 'sem_membership', 'PIN em outra oficina recusado');
select lives_ok($$select public.pin_set('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', '123456')$$, 'mecânico define PIN');
select lives_ok($$select public.pin_set('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', '111111')$$, 'dono redefine PIN (substitui o x)');
select matches((select pin_hash from public.member_pins where user_id = '00000000-0000-0000-0000-0000000000f1'), '^\$2[aby]\$10\$', 'hash bcrypt custo 10');
select isnt((select pin_hash from public.member_pins where user_id = '00000000-0000-0000-0000-0000000000f1'), '123456', 'PIN nunca guardado em claro');
select isnt((select pin_hash from public.member_pins where user_id = '00000000-0000-0000-0000-0000000000f1'),
  (select pin_hash from public.member_pins where user_id = '00000000-0000-0000-0000-0000000000d1'), 'salts diferentes');

-- ===== pin_attempt: acerto, erro, bloqueio =====
select is((select public.pin_attempt('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', '123456', null) ->> 'status'),
  'ok', 'PIN certo (sem aparelho, desbloqueio de inatividade)');
select is((select public.pin_attempt('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', '000000', null) ->> 'status'),
  'wrong', 'PIN errado');
select is((select failed from public.member_pins where user_id = '00000000-0000-0000-0000-0000000000f1'), 1, 'erro conta 1 (persistiu)');
select is((select public.pin_attempt('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', '123456', null) ->> 'status'),
  'ok', 'acerto depois de erro');
select is((select failed from public.member_pins where user_id = '00000000-0000-0000-0000-0000000000f1'), 1, 'acerto NÃO zera failed (só pin_set ou 24 h sem erro)');
select public.pin_attempt('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', '000000', null);
select public.pin_attempt('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', '000000', null);
select is((select public.pin_attempt('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', '000000', null) ->> 'status'),
  'wrong', '4º erro acumulado ainda é wrong (1 antes do acerto + 3)');
select is((select public.pin_attempt('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', '000000', null) ->> 'status'),
  'locked', '5º erro acumulado bloqueia, mesmo com um acerto no meio');
select is((select locked from public.member_pins where user_id = '00000000-0000-0000-0000-0000000000f1'), true, 'locked gravado');
select is((select public.pin_attempt('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', '123456', null) ->> 'status'),
  'locked', 'bloqueado: nem o PIN certo passa');
select public.pin_set('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', '123456');
select is((select public.pin_attempt('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', '123456', null) ->> 'status'),
  'ok', 'pin_set (depois de entrar com senha) desbloqueia');

-- ===== pessoa sem PIN, inativa, inexistente: wrong, sem efeito =====
select is((select public.pin_attempt('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', '123456', null) ->> 'status'),
  'wrong', 'pessoa sem PIN: wrong');
insert into public.member_pins (workshop_id, user_id, pin_hash)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', extensions.crypt('123456', extensions.gen_salt('bf', 4)));
select is((select public.pin_attempt('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '123456', null) ->> 'status'),
  'wrong', 'membership inativa: wrong mesmo com PIN certo');
select is((select failed from public.member_pins where user_id = '00000000-0000-0000-0000-0000000000a1'), 0, 'inativa: contador intacto');
select is((select public.pin_attempt('aaaaaaaa-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000000', '123456', null) ->> 'status'),
  'wrong', 'pessoa inexistente: wrong');
select is((select public.pin_attempt('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000f1', '123456', null) ->> 'status'),
  'wrong', 'pessoa de outra oficina: wrong');

-- ===== Aparelho =====
select is((select public.pin_attempt('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', '123456', (select id from t_dev)) ->> 'status'),
  'ok', 'unlock no aparelho compartilhado');
select is((select public.pin_attempt('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', '123456', '99999999-0000-0000-0000-000000000000') ->> 'status'),
  'suspended', 'aparelho inexistente: suspended');
select is((select public.pin_attempt('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d2', '123456', (select id from t_dev)) ->> 'status'),
  'suspended', 'aparelho de outra oficina: suspended');
insert into public.devices (workshop_id, name, kind, secret_hash)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'Celular', 'pessoal', 'x');
select is((select public.pin_attempt('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', '123456',
    (select id from public.devices where name = 'Celular')) ->> 'status'),
  'suspended', 'aparelho pessoal não desbloqueia por PIN');

-- erro conta no aparelho (janela deslizante de 60 min); 20 passam, o 21º suspende e revoga
select public.pin_attempt('aaaaaaaa-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000000', '000000', (select id from t_dev));
select is((select count(*) from public.pin_failures where device_id = (select id from t_dev)), 1::bigint, 'erro conta no aparelho (inclusive pessoa inexistente)');
do $$ begin
  for i in 1..19 loop
    perform public.pin_attempt('aaaaaaaa-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000000', '000000', (select id from t_dev));
  end loop;
end $$;
select is((select count(*) from public.pin_failures where device_id = (select id from t_dev) and at > now() - interval '60 minutes'), 20::bigint, '20 erros na hora: ainda ativo');
select ok((select revoked_at from public.devices where id = (select id from t_dev)) is null, 'com 20 erros o aparelho segue ativo');
select is((select public.pin_attempt('aaaaaaaa-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000000', '000000', (select id from t_dev)) ->> 'status'),
  'suspended', 'o 21º erro suspende');
select ok((select revoked_at from public.devices where id = (select id from t_dev)) is not null, 'aparelho revogado');
select is((select public.pin_attempt('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', '123456', (select id from t_dev)) ->> 'status'),
  'suspended', 'aparelho suspenso recusa até o PIN certo');

-- janela deslizante: erros de mais de 1 hora não contam na hora (mas contam no teto de 24 h)
insert into public.devices (id, workshop_id, name, kind, secret_hash)
  values ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'PC velho', 'pc_compartilhado', 'y');
insert into public.pin_failures (device_id, user_id, at)
  select 'dddddddd-0000-0000-0000-000000000001', null, now() - interval '2 hours' from generate_series(1, 20);
select is((select public.pin_attempt('aaaaaaaa-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000000', '000000', 'dddddddd-0000-0000-0000-000000000001') ->> 'status'),
  'wrong', '20 erros de 2 h atrás não contam na janela de 1 h: não suspende');
select is((select count(*) from public.pin_failures where device_id = 'dddddddd-0000-0000-0000-000000000001' and at > now() - interval '60 minutes'), 1::bigint, 'só o erro novo está na janela');

-- teto de 50 erros em 24 h (tentativa lenta, espalhada)
insert into public.devices (id, workshop_id, name, kind, secret_hash)
  values ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'PC lento', 'pc_compartilhado', 'z');
insert into public.pin_failures (device_id, user_id, at)
  select 'dddddddd-0000-0000-0000-000000000002', null, now() - interval '3 hours' - (g || ' minutes')::interval from generate_series(1, 49) g;
select is((select public.pin_attempt('aaaaaaaa-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000000', '000000', 'dddddddd-0000-0000-0000-000000000002') ->> 'status'),
  'wrong', '50 erros em 24 h ainda passam');
select is((select public.pin_attempt('aaaaaaaa-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000000', '000000', 'dddddddd-0000-0000-0000-000000000002') ->> 'status'),
  'suspended', 'o 51º erro em 24 h suspende o aparelho');
select ok((select revoked_at from public.devices where id = 'dddddddd-0000-0000-0000-000000000002') is not null, 'aparelho lento revogado');

-- limpeza: erros de mais de 24 h somem
insert into public.devices (id, workshop_id, name, kind, secret_hash)
  values ('dddddddd-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'PC limpo', 'pc_compartilhado', 'w');
insert into public.pin_failures (device_id, user_id, at)
  select 'dddddddd-0000-0000-0000-000000000003', null, now() - interval '30 hours' from generate_series(1, 60);
select is((select public.pin_attempt('aaaaaaaa-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000000', '000000', 'dddddddd-0000-0000-0000-000000000003') ->> 'status'),
  'wrong', 'erros de 30 h atrás não contam');
select is((select count(*) from public.pin_failures where device_id = 'dddddddd-0000-0000-0000-000000000003'), 1::bigint, 'erros de mais de 24 h foram apagados');
select is((select count(*) from pg_policies where tablename = 'pin_failures'), 0::bigint, 'pin_failures sem policy (só o service lê)');
select ok(not has_table_privilege('authenticated', 'public.pin_failures', 'select'), 'authenticated não lê pin_failures');

-- ===== pin_roster =====
select is((select jsonb_array_length(public.pin_roster('aaaaaaaa-0000-0000-0000-000000000001'))), 2,
  'roster: dono e mecânico (recepção sem PIN e inativa ficam de fora)');
select is((select count(*) from jsonb_array_elements(public.pin_roster('aaaaaaaa-0000-0000-0000-000000000001')) e
  where e ?| array['pin_hash', 'email', 'secret_hash']), 0::bigint, 'roster não traz hash nem e-mail');
select is((select jsonb_array_length(public.pin_roster('bbbbbbbb-0000-0000-0000-000000000002'))), 0, 'roster da B é só da B (ninguém tem PIN)');

-- ===== user_id_by_email =====
select is(public.user_id_by_email('DONO@a.test'), '00000000-0000-0000-0000-0000000000d1'::uuid, 'e-mail sem diferenciar caixa');
select is(public.user_id_by_email('nao@existe.test'), null, 'e-mail inexistente: nulo');

-- ===== membership_apply =====
select is((select public.membership_apply('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d2', 'deactivate') ->> 'status'),
  'last_owner', 'último Dono não é desativado');
select is((select public.membership_apply('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d2', 'set_role', 'recepcao') ->> 'status'),
  'last_owner', 'último Dono não é rebaixado');
select is((select active from public.memberships where user_id = '00000000-0000-0000-0000-0000000000d2'), true, 'último Dono segue ativo');
select is((select public.membership_apply('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d2', 'set_role', 'dono') ->> 'status'),
  'ok', 'set_role dono para dono: ok');
select is((select public.membership_apply('aaaaaaaa-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000000', 'deactivate') ->> 'status'),
  'not_found', 'pessoa inexistente');
select is((select public.membership_apply('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000f1', 'deactivate') ->> 'status'),
  'not_found', 'pessoa de outra oficina: not_found');
select is((select public.membership_apply('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'xx') ->> 'status'),
  'invalid', 'ação inválida');
select is((select public.membership_apply('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'set_role', 'admin') ->> 'status'),
  'invalid', 'papel inválido');
select is((select public.membership_apply('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'deactivate') ->> 'status'),
  'ok', 'desativa o mecânico');
select is((select active from public.memberships where user_id = '00000000-0000-0000-0000-0000000000f1'), false, 'active=false');
select is((select count(*) from public.member_pins where user_id = '00000000-0000-0000-0000-0000000000f1'), 0::bigint, 'desativar apaga o PIN');
select is((select public.pin_attempt('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', '123456', null) ->> 'status'),
  'wrong', 'desativado não passa no PIN');
select is((select public.membership_apply('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'deactivate') ->> 'status'),
  'ok', 'desativar de novo é idempotente');
select is((select public.membership_apply('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'reactivate') ->> 'status'),
  'ok', 'reativa');
select is((select active from public.memberships where user_id = '00000000-0000-0000-0000-0000000000f1'), true, 'active=true');
select is((select public.membership_apply('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'set_role', 'recepcao') ->> 'status'),
  'ok', 'set_role');
select is((select role from public.memberships where user_id = '00000000-0000-0000-0000-0000000000f1'), 'recepcao', 'papel gravado');
-- oficina A tem 1 Dono ativo (d1); a C também (d1), mas são oficinas separadas
select is((select public.membership_apply('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'deactivate') ->> 'status'),
  'last_owner', 'a contagem de Donos é por oficina (d1 é o único na A)');


-- ===== Força bruta lenta na pessoa: `failed` só zera com pin_set ou 24 h sem erro =====
select public.pin_set('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', '222222');
update public.member_pins set failed = 4, last_failed_at = now() - interval '25 hours' where user_id = '00000000-0000-0000-0000-0000000000e1';
select is((select public.pin_attempt('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', '000000', null) ->> 'status'),
  'wrong', '24 h sem erro: o contador recomeça (4 antigos viram 1, não trava)');
select is((select failed from public.member_pins where user_id = '00000000-0000-0000-0000-0000000000e1'), 1, 'failed recomeçou em 1');
update public.member_pins set failed = 4, last_failed_at = now() - interval '1 hour' where user_id = '00000000-0000-0000-0000-0000000000e1';
select is((select public.pin_attempt('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', '222222', null) ->> 'status'),
  'ok', 'acerto com 4 erros recentes passa...');
select is((select failed from public.member_pins where user_id = '00000000-0000-0000-0000-0000000000e1'), 4, '...e não zera o contador');
select is((select public.pin_attempt('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', '000000', null) ->> 'status'),
  'locked', 'o próximo erro (5º recente) bloqueia');
select ok((select last_failed_at from public.member_pins where user_id = '00000000-0000-0000-0000-0000000000e1') is not null, 'last_failed_at gravado');
select public.pin_set('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', '222222');
select is((select failed || '/' || locked || '/' || coalesce(last_failed_at::text, 'nulo') from public.member_pins where user_id = '00000000-0000-0000-0000-0000000000e1'),
  '0/false/nulo', 'pin_set zera failed, locked e last_failed_at');

-- ===== Broadcast privado: policy em realtime.messages e função de tópico =====
select ok(not has_function_privilege('anon', 'app.ws_topic_allowed(text)', 'execute'), 'anon não executa ws_topic_allowed');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select is(app.ws_topic_allowed('ws:aaaaaaaa-0000-0000-0000-000000000001'), true, 'dono recebe o canal da própria oficina');
select is(app.ws_topic_allowed('ws:bbbbbbbb-0000-0000-0000-000000000002'), false, 'dono da A não recebe o canal da B');
select is(app.ws_topic_allowed('ws:aaaaaaaa-0000-0000-0000-000000000001; drop'), false, 'tópico malformado: negado');
select is(app.ws_topic_allowed('outro'), false, 'tópico sem prefixo ws: negado');
select is(app.ws_topic_allowed(null), false, 'tópico nulo: negado');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select is(app.ws_topic_allowed('ws:aaaaaaaa-0000-0000-0000-000000000001'), true, 'mecânico ativo recebe o canal da oficina (aviso de membership)');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select is(app.ws_topic_allowed('ws:aaaaaaaa-0000-0000-0000-000000000001'), false, 'membro desativado não recebe');
select pg_temp.as_anon();
select pg_temp.as_service();
select is((select count(*) from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname = 'ws_broadcast_sel'
    and cmd = 'SELECT' and roles = '{authenticated}'), 1::bigint, 'policy ws_broadcast_sel: só SELECT, só authenticated');
select is((select count(*) from pg_policies where schemaname = 'realtime' and tablename = 'messages'
    and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL') and 'authenticated' = any (roles)), 0::bigint, 'authenticated não tem policy de escrita em realtime.messages');

-- ===== Funções novas e antigas: nada para anon, authenticated ou public (ACL de verdade, não só has_function_privilege) =====
select is((select count(*) from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('pin_set', 'pin_attempt', 'pin_roster', 'user_id_by_email', 'membership_apply')
      and a.privilege_type = 'EXECUTE'
      and (a.grantee = 0 or a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated')))), 0::bigint,
  'pin_set, pin_attempt, pin_roster, user_id_by_email e membership_apply: EXECUTE só para service_role e o dono (nunca public, anon, authenticated)');
select is((select count(*) from pg_proc p
    cross join lateral aclexplode(p.proacl) a
    where p.pronamespace = 'public'::regnamespace and p.proname in ('pin_set', 'pin_attempt', 'pin_roster', 'user_id_by_email', 'membership_apply')
      and a.privilege_type = 'EXECUTE' and a.grantee = (select oid from pg_roles where rolname = 'service_role')), 5::bigint,
  'as 5 funções são executáveis por service_role');
select ok(not has_function_privilege('anon', 'public.pin_set(uuid,uuid,text)', 'execute'), 'anon não executa pin_set');
select ok(not has_function_privilege('anon', 'public.pin_roster(uuid)', 'execute'), 'anon não executa pin_roster');
select ok(not has_function_privilege('anon', 'public.user_id_by_email(text)', 'execute'), 'anon não executa user_id_by_email');
select ok(not has_function_privilege('anon', 'public.membership_apply(uuid,uuid,text,text)', 'execute'), 'anon não executa membership_apply');
select pg_temp.as_anon();
select throws_ok($$select public.pin_roster('aaaaaaaa-0000-0000-0000-000000000001')$$, '42501', null, 'anon chamando pin_roster: negado');
select throws_ok($$select public.user_id_by_email('dono@a.test')$$, '42501', null, 'anon chamando user_id_by_email: negado');
select throws_ok($$select public.membership_apply('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'deactivate')$$, '42501', null, 'anon chamando membership_apply: negado');
select throws_ok($$select public.pin_set('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', '123456')$$, '42501', null, 'anon chamando pin_set: negado');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select throws_ok($$select public.pin_roster('aaaaaaaa-0000-0000-0000-000000000001')$$, '42501', null, 'authenticated chamando pin_roster: negado');
select throws_ok($$select public.user_id_by_email('dono@a.test')$$, '42501', null, 'authenticated chamando user_id_by_email: negado');
select throws_ok($$select public.membership_apply('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'deactivate')$$, '42501', null, 'authenticated chamando membership_apply: negado');
select pg_temp.as_service();

select * from finish();

-- OficinaPro nuvem: PIN, aparelhos e membros (docs/NUVEM-SPEC.md seções 3 e 5, PR 5 lado servidor).
-- Funções security definer com search_path vazio, chamadas só pelas Edge Functions `users`, `pin` e `device`
-- (service_role). Contadores e bloqueios são atômicos: `for update` nas linhas envolvidas.
-- Nenhuma delas é executável por anon, authenticated ou public.

-- pgcrypto: no Supabase fica no schema extensions.
create extension if not exists pgcrypto with schema extensions;

-- ============================================================================
-- PIN
-- ============================================================================

-- Quando foi o último erro de PIN da pessoa (o contador `failed` só zera com pin_set ou 24 h sem erro).
alter table public.member_pins add column last_failed_at timestamptz;

-- Erros de PIN por aparelho: janela deslizante (60 min) e teto de 24 h. Só o service lê (RLS sem policy).
-- user_id fica sem FK de propósito: registra também tentativas contra pessoas inexistentes.
create table public.pin_failures (
  id bigint generated always as identity primary key,
  device_id uuid not null references public.devices (id) on delete cascade,
  user_id uuid,
  at timestamptz not null default now()
);
create index pin_failures_device_idx on public.pin_failures (device_id, at);
alter table public.pin_failures enable row level security;   -- sem policy, de propósito
revoke all on public.pin_failures from anon, authenticated;

-- Grava o PIN (6 dígitos) da pessoa; zera erros e desbloqueia. Exige membership ativa.
create function public.pin_set(p_ws uuid, p_user uuid, p_pin text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    raise exception 'pin_invalido' using errcode = '22023';
  end if;
  if not exists (select 1 from public.memberships m where m.workshop_id = p_ws and m.user_id = p_user and m.active) then
    raise exception 'sem_membership' using errcode = '42501';
  end if;
  insert into public.member_pins (workshop_id, user_id, pin_hash, failed, locked, last_failed_at, updated_at)
  values (p_ws, p_user, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), 0, false, null, now())
  on conflict (workshop_id, user_id) do update
    set pin_hash = excluded.pin_hash, failed = 0, locked = false, last_failed_at = null, updated_at = now();
end $$;

-- Tentativa de PIN. Retorna {status, failed}:
--   ok         PIN certo. NÃO zera `failed` (senão quem tenta devagar nunca chega a 5): `failed` só zera com pin_set
--              ou depois de 24 h sem erro.
--   wrong      PIN errado, pessoa sem PIN ou inativa (indistinguíveis; conta no aparelho)
--   locked     5 erros acumulados (ou já bloqueado): exige senha
--   suspended  aparelho inválido/revogado, ou erros demais (> 20 na última hora, > 50 em 24 h): o aparelho é revogado
-- p_device nulo = desbloqueio de inatividade da própria pessoa (sem contagem de aparelho).
-- Erros persistem: a função retorna normalmente, nunca levanta exceção para "PIN errado".
create function public.pin_attempt(p_ws uuid, p_user uuid, p_pin text, p_device uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d public.devices%rowtype;
  mp public.member_pins%rowtype;
  v_found boolean;
  v_ok boolean := false;
  v_failed int := 0;
  v_status text;
  v_hour int;
  v_day int;
  -- hash fixo só para gastar o mesmo tempo quando a pessoa não existe (anti-enumeração por tempo)
  c_dummy constant text := '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
begin
  if p_device is not null then
    select * into d from public.devices
      where id = p_device and workshop_id = p_ws and revoked_at is null and kind = 'pc_compartilhado'
      for update;
    if not found then
      return jsonb_build_object('status', 'suspended', 'failed', 0);
    end if;
    -- limpeza: o que passou de 24 h não conta mais
    delete from public.pin_failures where device_id = d.id and at < now() - interval '24 hours';
  end if;

  select p.* into mp
    from public.member_pins p
    join public.memberships m on m.workshop_id = p.workshop_id and m.user_id = p.user_id and m.active
    where p.workshop_id = p_ws and p.user_id = p_user
    for update of p;
  v_found := found;

  if v_found and mp.failed > 0 and not mp.locked
     and (mp.last_failed_at is null or mp.last_failed_at < now() - interval '24 hours') then
    update public.member_pins set failed = 0, last_failed_at = null where workshop_id = p_ws and user_id = p_user;
    mp.failed := 0;
  end if;

  if v_found and mp.locked then
    return jsonb_build_object('status', 'locked', 'failed', mp.failed);
  end if;

  if v_found then
    v_ok := mp.pin_hash = extensions.crypt(coalesce(p_pin, ''), mp.pin_hash);
  else
    perform extensions.crypt(coalesce(p_pin, ''), c_dummy);
  end if;

  if v_ok then
    return jsonb_build_object('status', 'ok', 'failed', mp.failed);
  end if;

  v_status := 'wrong';
  if v_found then
    v_failed := mp.failed + 1;
    update public.member_pins set failed = v_failed, locked = v_failed >= 5, last_failed_at = now(), updated_at = now()
      where workshop_id = p_ws and user_id = p_user;
    if v_failed >= 5 then v_status := 'locked'; end if;
  end if;

  if p_device is not null then
    insert into public.pin_failures (device_id, user_id) values (d.id, p_user);
    select count(*) filter (where at > now() - interval '60 minutes'), count(*)
      into v_hour, v_day from public.pin_failures where device_id = d.id;
    if v_hour > 20 or v_day > 50 then
      update public.devices set revoked_at = now() where id = d.id;
      v_status := 'suspended';
    end if;
  end if;

  return jsonb_build_object('status', v_status, 'failed', v_failed);
end $$;

-- Cartões do "Quem está usando": membros ativos que já têm PIN. Sem e-mail, sem hash.
create function public.pin_roster(p_ws uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'userId', m.user_id, 'displayName', m.display_name, 'role', m.role, 'locked', p.locked)
      order by m.display_name, m.user_id), '[]'::jsonb)
  from public.memberships m
  join public.member_pins p on p.workshop_id = m.workshop_id and p.user_id = m.user_id
  where m.workshop_id = p_ws and m.active
$$;

-- ============================================================================
-- Membros
-- ============================================================================

create function public.user_id_by_email(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u where lower(u.email) = lower(p_email) limit 1
$$;

-- Ações: 'deactivate' (active=false e apaga o PIN), 'reactivate', 'set_role' (p_role).
-- Retorna {status: ok | not_found | last_owner | invalid, role, active}.
-- Trava as linhas dos Donos e a do alvo (ordem por user_id) para que dois pedidos simultâneos
-- não deixem a oficina sem Dono ativo.
create function public.membership_apply(p_ws uuid, p_user uuid, p_action text, p_role text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.memberships%rowtype;
  v_other_owners int;
begin
  if p_action not in ('deactivate', 'reactivate', 'set_role')
     or (p_action = 'set_role' and (p_role is null or p_role not in ('dono', 'recepcao', 'mecanico'))) then
    return jsonb_build_object('status', 'invalid');
  end if;

  perform 1 from public.memberships m
    where m.workshop_id = p_ws and (m.role = 'dono' or m.user_id = p_user)
    order by m.user_id for update;

  select * into t from public.memberships m where m.workshop_id = p_ws and m.user_id = p_user;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  select count(*) into v_other_owners from public.memberships m
    where m.workshop_id = p_ws and m.role = 'dono' and m.active and m.user_id <> p_user;

  if t.role = 'dono' and t.active and v_other_owners = 0
     and (p_action = 'deactivate' or (p_action = 'set_role' and p_role <> 'dono')) then
    return jsonb_build_object('status', 'last_owner', 'role', t.role, 'active', t.active);
  end if;

  if p_action = 'deactivate' then
    update public.memberships set active = false where workshop_id = p_ws and user_id = p_user;
    delete from public.member_pins where workshop_id = p_ws and user_id = p_user;
    t.active := false;
  elsif p_action = 'reactivate' then
    update public.memberships set active = true where workshop_id = p_ws and user_id = p_user;
    t.active := true;
  else
    update public.memberships set role = p_role where workshop_id = p_ws and user_id = p_user;
    t.role := p_role;
  end if;
  return jsonb_build_object('status', 'ok', 'role', t.role, 'active', t.active);
end $$;

-- ============================================================================
-- Broadcast privado `ws:<oficina>` (aviso de membership alterada)
-- ============================================================================
-- Só o service envia (REST /realtime/v1/api/broadcast com private:true); nenhuma policy de insert para authenticated.
-- Receber (select): membro ATIVO da oficina do tópico.
create function app.ws_topic_allowed(p_topic text) returns boolean
language sql stable set search_path = '' as $$
  select case
    when p_topic ~ '^ws:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then app.role_in(substr(p_topic, 4)::uuid) is not null
    else false
  end
$$;
revoke all on function app.ws_topic_allowed(text) from public, anon;
grant execute on function app.ws_topic_allowed(text) to authenticated, service_role;

do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'create policy ws_broadcast_sel on realtime.messages for select to authenticated
      using (extension = ''broadcast'' and app.ws_topic_allowed(realtime.topic()))';
  end if;
end $$;

-- ============================================================================
-- Grants: só service_role
-- ============================================================================
revoke all on function public.pin_set(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.pin_attempt(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.pin_roster(uuid) from public, anon, authenticated;
revoke all on function public.user_id_by_email(text) from public, anon, authenticated;
revoke all on function public.membership_apply(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.pin_set(uuid, uuid, text) to service_role;
grant execute on function public.pin_attempt(uuid, uuid, text, uuid) to service_role;
grant execute on function public.pin_roster(uuid) to service_role;
grant execute on function public.user_id_by_email(text) to service_role;
grant execute on function public.membership_apply(uuid, uuid, text, text) to service_role;

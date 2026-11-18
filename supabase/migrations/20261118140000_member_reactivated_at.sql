-- Reativar uma pessoa grava o instante em `memberships.reactivated_at`. A Edge Function `pin` só aceita o
-- magic link/convite (amr `otp`) para definir PIN se o `otp` for POSTERIOR a essa data: uma sessão de desbloqueio
-- aberta antes da desativação não pode criar PIN novo depois da reativação. Idempotente.

alter table public.memberships add column if not exists reactivated_at timestamptz;

create or replace function public.membership_apply(p_ws uuid, p_user uuid, p_action text, p_role text default null) returns jsonb
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
    update public.memberships set active = true, reactivated_at = clock_timestamp() where workshop_id = p_ws and user_id = p_user;
    t.active := true;
  else
    update public.memberships set role = p_role where workshop_id = p_ws and user_id = p_user;
    t.role := p_role;
  end if;
  return jsonb_build_object('status', 'ok', 'role', t.role, 'active', t.active);
end $$;

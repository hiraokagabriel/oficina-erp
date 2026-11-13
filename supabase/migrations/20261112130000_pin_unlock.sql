-- Liberar o PIN bloqueado por tentativas (Config > Usuários, PR 5). Só o Dono pede, pela Edge Function `users`
-- (ação `unlock_pin`, service_role). Zera `failed`, `locked` e `last_failed_at`; o PIN em si não muda.
-- Retorna falso se a pessoa não tem PIN nesta oficina.

create function public.pin_unlock(p_ws uuid, p_user uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  update public.member_pins
    set failed = 0, locked = false, last_failed_at = null, updated_at = now()
    where workshop_id = p_ws and user_id = p_user;
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;

revoke all on function public.pin_unlock(uuid, uuid) from public, anon, authenticated;
grant execute on function public.pin_unlock(uuid, uuid) to service_role;

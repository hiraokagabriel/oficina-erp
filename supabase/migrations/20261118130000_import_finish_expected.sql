-- PR 9, revisão A1: `import_finish(ws, true)` só conclui se o chamador mandar os totais que ele conferiu (`p_expected`) e eles
-- forem IGUAIS aos calculados aqui, na mesma transação. Assim, "Começar sem dados" (totais zerados) é recusado se outro
-- computador já enviou linhas, e uma conclusão feita sobre uma conferência velha também. Sem commit nada muda (continua
-- só devolvendo os totais). O resto do corpo é o de 20261118120000_import_aal2.sql (papel, aal2, import_state).
-- Troca a assinatura de 2 argumentos pela de 3; mesmos grants.

drop function if exists public.import_finish(uuid, boolean);

create or replace function public.import_finish(ws uuid, p_commit boolean default false, p_expected jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  tbls constant text[] := array['work_orders', 'work_order_finance', 'work_order_costs', 'ledger', 'clients',
    'catalog_parts', 'catalog_services', 'catalog_prices', 'catalog_costs', 'technicians',
    'appointments', 'audit_log', 'settings'];
  st text;
  t text;
  n bigint;
  counts jsonb := '{}';
  led numeric;
  ost numeric;
  paid bigint;
  adv numeric;
  totals jsonb;
begin
  if app.role_in(ws) is distinct from 'dono' then
    raise exception 'somente_dono' using errcode = '42501';
  end if;
  perform app.require_owner_aal();
  select w.import_state into st from public.workshops w where w.id = ws for update;
  if p_commit and (st is null or st not in ('vazio', 'importando')) then
    raise exception 'import_bloqueado' using errcode = '42501';
  end if;

  foreach t in array tbls loop
    execute format('select count(*) from public.%I where workshop_id = $1 and deleted_at is null', t) into n using ws;
    counts := counts || jsonb_build_object(t, n);
  end loop;

  select coalesce(sum(case l.data ->> 'type'
           when 'CREDIT' then (l.data ->> 'amount')::numeric
           when 'DEBIT' then -(l.data ->> 'amount')::numeric
           else 0 end), 0),
         count(*) filter (where coalesce(l.data ->> 'paymentDate', '') <> '')
    into led, paid
    from public.ledger l where l.workshop_id = ws and l.deleted_at is null;

  select coalesce(sum(coalesce((f.data ->> 'total')::numeric, 0)), 0) into ost
    from public.work_order_finance f where f.workshop_id = ws and f.deleted_at is null;

  select coalesce(sum((a.value ->> 'amount')::numeric), 0) into adv
    from public.work_order_finance f,
         jsonb_array_elements(case when jsonb_typeof(f.data -> 'advances') = 'array' then f.data -> 'advances' else '[]'::jsonb end) a
   where f.workshop_id = ws and f.deleted_at is null;

  totals := jsonb_build_object('counts', counts, 'ledgerSignedCents', led,
    'osTotalCents', ost, 'paidEntries', paid, 'advancesCents', adv);

  if p_commit then
    if p_expected is null or jsonb_typeof(p_expected) is distinct from 'object' then
      raise exception 'expected_obrigatorio' using errcode = '22023';
    end if;
    if (p_expected - 'state') is distinct from totals then
      raise exception 'totais_divergentes' using errcode = '22023';
    end if;
    update public.workshops set import_state = 'concluido' where id = ws;
    st := 'concluido';
  end if;

  return totals || jsonb_build_object('state', st);
end $$;

revoke execute on function public.import_finish(uuid, boolean, jsonb) from public, anon;
grant execute on function public.import_finish(uuid, boolean, jsonb) to authenticated, service_role;

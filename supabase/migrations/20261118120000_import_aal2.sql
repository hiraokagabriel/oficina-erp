-- PR 9, R3 (decisão D1): as RPCs de importação (`import_rows`, `import_finish`, `import_reset`) passam a exigir `aal2`
-- quando o Dono tem TOTP verificado. Sem TOTP, segue como antes. Só acrescenta a chamada de `app.require_owner_aal()`
-- logo depois da checagem de papel; o resto dos corpos é o da migração inicial. Idempotente (`create or replace`);
-- os grants e revokes das funções ficam como estavam.

create or replace function app.require_owner_aal() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.factor_type = 'totp' and f.status = 'verified')
     and coalesce(auth.jwt() ->> 'aal', 'aal1') is distinct from 'aal2' then
    raise exception 'exige_mfa' using errcode = '42501';
  end if;
end $$;
revoke execute on function app.require_owner_aal() from public, anon, authenticated, service_role;

create or replace function public.import_rows(ws uuid, rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  tbls constant text[] := array['work_orders', 'work_order_finance', 'work_order_costs', 'ledger', 'clients',
    'catalog_parts', 'catalog_services', 'catalog_prices', 'catalog_costs', 'technicians',
    'appointments', 'audit_log', 'settings'];
  st text;
  t text;
  n bigint;
  counts jsonb := '{}';
begin
  if app.role_in(ws) is distinct from 'dono' then
    raise exception 'somente_dono' using errcode = '42501';
  end if;
  perform app.require_owner_aal();
  select w.import_state into st from public.workshops w where w.id = ws for update;
  if st is null or st not in ('vazio', 'importando') then
    raise exception 'import_bloqueado' using errcode = '42501';
  end if;
  if app.workshop_in_use(ws, auth.uid()) then
    raise exception 'oficina_em_uso' using errcode = '42501';
  end if;
  if jsonb_typeof(rows) is distinct from 'array' then
    raise exception 'rows_invalido' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(rows) e(v)
    where e.v ->> 'table' is null or (e.v ->> 'table') <> all (tbls)
       or e.v ->> 'id' is null or jsonb_typeof(e.v -> 'data') is distinct from 'object'
  ) then
    raise exception 'linha_invalida' using errcode = '22023';
  end if;

  update public.workshops set import_state = 'importando' where id = ws and import_state = 'vazio';
  perform set_config('app.importing', 'on', true);

  foreach t in array tbls loop
    execute format($q$
      insert into public.%1$I (workshop_id, id, data %2$s)
      select $1, x.id, x.data - '{workshop_id,version,updated_at}'::text[] %3$s
      from (
        select distinct on (e.v ->> 'id') e.v ->> 'id' as id, e.v -> 'data' as data, e.v ->> 'os_id' as os_id
        from jsonb_array_elements($2) with ordinality as e(v, ord)
        where e.v ->> 'table' = %4$L
        order by e.v ->> 'id', e.ord desc
      ) x
      on conflict (workshop_id, id) do update set data = excluded.data, deleted_at = null %5$s$q$,
      t,
      case when t = 'ledger' then ', os_id' else '' end,
      case when t = 'ledger' then ', x.os_id' else '' end,
      t,
      case when t = 'ledger' then ', os_id = excluded.os_id' else '' end)
    using ws, rows;
    get diagnostics n = row_count;
    counts := counts || jsonb_build_object(t, n);
  end loop;

  perform set_config('app.importing', 'off', true);
  return jsonb_build_object('received', jsonb_array_length(rows), 'upserted', counts);
end $$;

create or replace function public.import_finish(ws uuid, p_commit boolean default false) returns jsonb
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
begin
  if app.role_in(ws) is distinct from 'dono' then
    raise exception 'somente_dono' using errcode = '42501';
  end if;
  perform app.require_owner_aal();
  select w.import_state into st from public.workshops w where w.id = ws for update;
  if p_commit then
    if st is null or st not in ('vazio', 'importando') then
      raise exception 'import_bloqueado' using errcode = '42501';
    end if;
    update public.workshops set import_state = 'concluido' where id = ws;
    st := 'concluido';
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

  return jsonb_build_object('state', st, 'counts', counts, 'ledgerSignedCents', led,
    'osTotalCents', ost, 'paidEntries', paid, 'advancesCents', adv);
end $$;

create or replace function public.import_reset(ws uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t text;
  st text;
  n bigint;
  counts jsonb := '{}';
  tbls constant text[] := array['work_orders', 'work_order_finance', 'work_order_costs', 'ledger', 'clients',
    'catalog_parts', 'catalog_services', 'catalog_prices', 'catalog_costs', 'technicians',
    'appointments', 'audit_log', 'settings'];
begin
  if app.role_in(ws) is distinct from 'dono' then
    raise exception 'somente_dono' using errcode = '42501';
  end if;
  perform app.require_owner_aal();
  select w.import_state into st from public.workshops w where w.id = ws for update;
  if st is distinct from 'importando' then
    raise exception 'import_bloqueado' using errcode = '42501';
  end if;
  if app.workshop_in_use(ws, auth.uid()) then
    raise exception 'oficina_em_uso' using errcode = '42501';
  end if;
  foreach t in array tbls loop
    execute format('select count(*) from public.%I where workshop_id = $1', t) into n using ws;
    counts := counts || jsonb_build_object(t, n);
  end loop;
  insert into public.audit_events (workshop_id, user_id, tbl, row_id, op, before)
  values (ws, auth.uid(), 'workshops', ws::text, 'import_reset', counts);
  perform set_config('app.importing', 'on', true);
  foreach t in array tbls loop
    execute format('delete from public.%I where workshop_id = $1', t) using ws;
  end loop;
  perform set_config('app.importing', 'off', true);
  update public.workshops set import_state = 'vazio' where id = ws;
end $$;


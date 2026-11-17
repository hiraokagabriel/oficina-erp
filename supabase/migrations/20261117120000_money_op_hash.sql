-- Correções da revisão do PR 6 (função `money`): op_id repetido com corpo diferente era replay silencioso (B1) e o
-- replay não devolvia o `info` (I2).
--   * money_ops.req_hash: sha256 de stable({kind, osId, entryId, payload}), calculado pela Edge Function.
--   * apply_money_op ganha p_req_hash e p_info; op_id repetido com hash diferente => 'op_id_reutilizado' (22023);
--     o resultado gravado passa a ter 'info', que o replay devolve.
-- Troca de assinatura: o drop remove a versão antiga (senão ficaria uma sobrecarga ao lado).

alter table public.money_ops add column if not exists req_hash text;

drop function if exists public.apply_money_op(uuid, uuid, uuid, uuid, text, jsonb, jsonb, jsonb);

create or replace function public.apply_money_op(
  p_op_id uuid, p_ws uuid, p_user uuid, p_device uuid, p_kind text,
  p_expected jsonb, p_writes jsonb, p_audit jsonb default '[]',
  p_req_hash text default null, p_info jsonb default '{}'
) returns jsonb
language plpgsql set search_path = '' as $$
declare
  tbls constant text[] := array['work_orders', 'work_order_finance', 'work_order_costs', 'ledger', 'clients',
    'catalog_parts', 'catalog_services', 'catalog_prices', 'catalog_costs', 'technicians',
    'appointments', 'audit_log', 'settings'];
  prev record;
  e jsonb;
  w jsonb;
  t text;
  rid text;
  ros text;
  del boolean;
  ev bigint;
  cv bigint;
  conflict boolean := false;
  cur_rows jsonb := '[]';
  out_rows jsonb := '[]';
  v bigint;
  res jsonb;
  cj jsonb;
  urole text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_op_id::text, 0));
  select m.workshop_id, m.user_id, m.kind, m.result, m.req_hash into prev from public.money_ops m where m.op_id = p_op_id;
  if found then
    -- op_id repetido só devolve o resultado para a MESMA oficina, usuário, tipo e corpo (hash). Hash nulo
    -- (op antiga ou chamada sem hash) não compara.
    if prev.workshop_id is distinct from p_ws or prev.user_id is distinct from p_user or prev.kind is distinct from p_kind
       or (prev.req_hash is not null and p_req_hash is not null and prev.req_hash <> p_req_hash) then
      raise exception 'op_id_reutilizado' using errcode = '22023';
    end if;
    return prev.result;
  end if;

  select m.role into urole from public.memberships m
   where m.workshop_id = p_ws and m.user_id = p_user and m.active;
  if urole is null or urole not in ('dono', 'recepcao') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  perform set_config('app.acting_user', p_user::text, true);
  perform set_config('app.acting_device', coalesce(p_device::text, ''), true);

  for e in select x.value from jsonb_array_elements(coalesce(p_expected, '[]')) x
           order by x.value ->> 'table', x.value ->> 'id' loop
    t := e ->> 'table';
    if t is null or t <> all (tbls) then
      raise exception 'tabela_invalida' using errcode = '22023';
    end if;
    cv := null;
    execute format('select version from public.%I where workshop_id = $1 and id = $2 for update', t)
      into cv using p_ws, e ->> 'id';
    if coalesce(cv, 0) <> coalesce((e ->> 'version')::bigint, 0) then
      conflict := true;
    end if;
  end loop;

  if not conflict then
    begin
      for w in select value from jsonb_array_elements(coalesce(p_writes, '[]')) loop
        t := w ->> 'table';
        rid := w ->> 'id';
        if t is null or t <> all (tbls) or t = 'audit_log' then
          raise exception 'tabela_invalida' using errcode = '22023';
        end if;
        if rid is null or jsonb_typeof(w -> 'data') is distinct from 'object' then
          raise exception 'linha_invalida' using errcode = '22023';
        end if;
        ev := null;
        select coalesce((x.value ->> 'version')::bigint, 0) into ev
          from jsonb_array_elements(coalesce(p_expected, '[]')) x
         where x.value ->> 'table' = t and x.value ->> 'id' = rid limit 1;
        if not found then
          raise exception 'write_sem_expected' using errcode = '22023';
        end if;
        del := coalesce((w ->> 'deleted')::boolean, false);
        ros := w ->> 'os_id';
        v := null;
        if ev = 0 then
          if t = 'ledger' then
            insert into public.ledger (workshop_id, id, data, deleted_at, updated_by, os_id)
            values (p_ws, rid, w -> 'data', case when del then clock_timestamp() end, p_user, ros)
            returning version into v;
          else
            execute format('insert into public.%I (workshop_id, id, data, deleted_at, updated_by) values ($1, $2, $3, case when $4 then clock_timestamp() end, $5) returning version', t)
              into v using p_ws, rid, w -> 'data', del, p_user;
          end if;
        else
          if t = 'ledger' then
            -- os_id omitido mantém o do servidor; não troca um os_id não nulo por outro valor.
            update public.ledger l
               set data = w -> 'data',
                   deleted_at = case when del then coalesce(l.deleted_at, clock_timestamp()) end,
                   updated_by = p_user,
                   os_id = coalesce(ros, l.os_id)
             where l.workshop_id = p_ws and l.id = rid
               and (l.os_id is null or ros is null or l.os_id = ros)
            returning l.version into v;
            if v is null then
              raise exception 'ledger_os_id_imutavel' using errcode = '42501';
            end if;
          else
            execute format('update public.%I set data = $3, deleted_at = case when $4 then coalesce(deleted_at, clock_timestamp()) end, updated_by = $5 where workshop_id = $1 and id = $2 returning version', t)
              into v using p_ws, rid, w -> 'data', del, p_user;
          end if;
        end if;
        out_rows := out_rows || jsonb_build_object('table', t, 'id', rid, 'version', v);
      end loop;
    exception when unique_violation then
      -- corrida em insert (expected 0): o sub-bloco desfez as gravações parciais
      conflict := true;
    end;
  end if;

  if conflict then
    for e in select value from jsonb_array_elements(coalesce(p_expected, '[]')) loop
      t := e ->> 'table';
      cj := null;
      execute format('select jsonb_build_object(''table'', %L::text, ''id'', x.id, ''version'', x.version, ''data'', x.data, ''deleted_at'', x.deleted_at, ''os_id'', to_jsonb(x) -> ''os_id'') from public.%I x where x.workshop_id = $1 and x.id = $2', t, t)
        into cj using p_ws, e ->> 'id';
      if cj is not null then
        cur_rows := cur_rows || cj;
      end if;
    end loop;
    return jsonb_build_object('status', 'conflict', 'rows', cur_rows);
  end if;

  for w in select value from jsonb_array_elements(coalesce(p_audit, '[]')) loop
    insert into public.audit_log (workshop_id, id, data, updated_by)
    values (p_ws, w ->> 'id', w -> 'data', p_user)
    on conflict (workshop_id, id) do nothing;
  end loop;

  res := jsonb_build_object('status', 'ok', 'rows', out_rows, 'info', coalesce(p_info, '{}'::jsonb));
  insert into public.money_ops (op_id, workshop_id, user_id, kind, result, req_hash)
  values (p_op_id, p_ws, p_user, p_kind, res, p_req_hash);
  return res;
end $$;

revoke execute on function public.apply_money_op(uuid, uuid, uuid, uuid, text, jsonb, jsonb, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_money_op(uuid, uuid, uuid, uuid, text, jsonb, jsonb, jsonb, text, jsonb) to service_role;

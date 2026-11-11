-- OficinaPro nuvem: migração inicial (docs/NUVEM-SPEC.md, PR 2).
-- Tabelas, RLS, triggers de guarda, RPCs (sync_push, apply_money_op, import_*), Realtime e Storage.
-- Decisões onde a spec era ambígua estão marcadas com "DECISÃO".

-- ============================================================================
-- 1. Tabelas de controle
-- ============================================================================
create schema if not exists app;

create table public.workshops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tz text not null default 'America/Sao_Paulo',
  last_export_at timestamptz,
  import_state text not null default 'vazio' check (import_state in ('vazio', 'importando', 'concluido'))
);

create table public.memberships (
  workshop_id uuid not null references public.workshops (id),
  user_id uuid not null references auth.users (id),
  role text not null check (role in ('dono', 'recepcao', 'mecanico')),
  display_name text,
  active boolean not null default true,
  invited_at timestamptz not null default now(),
  primary key (workshop_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

-- Sem nenhuma policy: só o service role lê.
create table public.member_pins (
  workshop_id uuid not null references public.workshops (id),
  user_id uuid not null references auth.users (id) on delete cascade,
  pin_hash text not null,
  failed int not null default 0,
  locked boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (workshop_id, user_id)
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops (id),
  name text not null,
  kind text not null check (kind in ('pc_compartilhado', 'pessoal')),
  secret_hash text,
  idle_lock_minutes int check (idle_lock_minutes is null or idle_lock_minutes in (5, 15, 30)),
  authorized_by uuid,
  authorized_at timestamptz not null default now(),
  revoked_at timestamptz,
  failed_pin_hour int not null default 0,
  failed_pin_window timestamptz
);
create index devices_ws_idx on public.devices (workshop_id);

create table public.money_ops (
  op_id uuid primary key,
  workshop_id uuid not null references public.workshops (id),
  user_id uuid,
  kind text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  workshop_id uuid not null references public.workshops (id),
  at timestamptz not null default clock_timestamp(),
  user_id uuid,
  device_id uuid,
  tbl text not null,
  row_id text not null,
  op text not null,
  changed_keys text[] not null default '{}',
  before jsonb,
  after jsonb
);
create index audit_events_ws_idx on public.audit_events (workshop_id, at);

-- ============================================================================
-- 2. Funções auxiliares (schema app)
-- ============================================================================
create function app.role_in(ws uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.memberships m
  where m.workshop_id = ws and m.user_id = auth.uid() and m.active
$$;

create function app.is_service() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(auth.role(), '') = 'service_role'
$$;

-- DECISÃO: os guardas também deixam passar sessões administrativas (postgres, supabase_admin) e as
-- funções security definer deste arquivo (import_*), onde current_user é o dono da função.
-- Usuários da API (authenticated) nunca têm esses papéis.
create function app.bypass() returns boolean
language sql stable set search_path = '' as $$
  select app.is_service() or current_user in ('postgres', 'supabase_admin', 'service_role')
$$;

-- Dinheiro da OS: leitura por security definer porque o Mecânico não lê work_order_finance.
create function app.os_has_receipt(ws uuid, os text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  -- plpgsql: a tabela work_order_finance ainda não existe quando a função é criada.
  if app.role_in(ws) is null and not app.is_service() then return false; end if;
  return exists (
    select 1 from public.work_order_finance f
    where f.workshop_id = ws and f.id = os
      and (coalesce(f.data ->> 'financialId', '') <> '' or jsonb_typeof(f.data -> 'installmentConfig') = 'object')
  );
end $$;

-- Status da OS (security definer: o Recepção que edita a finance enxerga, mas o helper não depende de RLS).
create function app.os_status(ws uuid, os text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare st text;
begin
  if app.role_in(ws) is null and not app.is_service() then return null; end if;
  select w.data ->> 'status' into st from public.work_orders w where w.workshop_id = ws and w.id = os;
  return st;
end $$;

-- Parte da finance que só o servidor (apply_money_op) pode mudar.
create function app.fin_money(d jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'financialId', nullif(d -> 'financialId', 'null'::jsonb),
    'paymentDate', nullif(d -> 'paymentDate', 'null'::jsonb),
    'paymentMethod', nullif(d -> 'paymentMethod', 'null'::jsonb),
    'advances', coalesce(nullif(d -> 'advances', 'null'::jsonb), '[]'::jsonb),
    'advanceAmount', nullif(nullif(d -> 'advanceAmount', 'null'::jsonb), '0'::jsonb),
    'advanceEntryId', nullif(d -> 'advanceEntryId', 'null'::jsonb),
    'installmentConfig',
      case when jsonb_typeof(d -> 'installmentConfig') = 'object'
           then (d -> 'installmentConfig') - 'description'
           else nullif(d -> 'installmentConfig', 'null'::jsonb) end
  )
$$;

create function app.ws_of_path(name text) returns uuid
language sql immutable set search_path = '' as $$
  select case
    when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(name))[1])::uuid
  end
$$;

-- ============================================================================
-- 3. Tabelas de coleção
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array['work_orders', 'work_order_finance', 'work_order_costs', 'ledger', 'clients',
    'catalog_parts', 'catalog_services', 'catalog_prices', 'catalog_costs', 'technicians',
    'appointments', 'audit_log', 'settings']
  loop
    execute format($f$
      create table public.%1$I (
        workshop_id uuid not null references public.workshops (id),
        id text not null,
        data jsonb not null check (jsonb_typeof(data) = 'object'),
        version bigint not null default 1,
        updated_at timestamptz not null default clock_timestamp(),
        updated_by uuid,
        deleted_at timestamptz,
        primary key (workshop_id, id)
      )$f$, t);
    execute format('create index %I on public.%I (workshop_id, updated_at, id)', t || '_pull_idx', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

alter table public.ledger add column os_id text;
create index ledger_os_idx on public.ledger (workshop_id, os_id) where os_id is not null;

-- ============================================================================
-- 4. Triggers: touch, auditoria, guardas
-- ============================================================================
create function app.touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.workshop_id is distinct from old.workshop_id or new.id is distinct from old.id then
      raise exception 'chave_imutavel' using errcode = '42501';
    end if;
    -- DECISÃO: a importação em massa (reenvio de lote) não conta como edição: preserva a versão.
    new.version := case when current_setting('app.importing', true) = 'on' then old.version else old.version + 1 end;
  else
    new.version := 1;
  end if;
  -- Nas tabelas cujo data traz `id`, ele tem de bater com a chave da linha.
  if tg_table_name in ('work_orders', 'ledger', 'clients', 'appointments', 'technicians', 'catalog_parts',
                       'catalog_services', 'audit_log')
     and new.data ? 'id' and new.data ->> 'id' is distinct from new.id then
    raise exception 'id_divergente' using errcode = '22023';
  end if;
  new.updated_at := clock_timestamp();
  -- apply_money_op (service role) informa o usuário real por app.acting_user.
  new.updated_by := coalesce(auth.uid(), nullif(current_setting('app.acting_user', true), '')::uuid, new.updated_by);
  return new;
end $$;

create function app.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  keys text[];
  full_ boolean := tg_table_name in ('ledger', 'work_order_finance');
  o text;
begin
  -- DECISÃO: a importação em massa não audita linha a linha.
  if current_setting('app.importing', true) = 'on' then
    return null;
  end if;
  if tg_op = 'INSERT' then
    o := 'insert';
    keys := array(select k from jsonb_object_keys(new.data) k order by k);
  else
    o := case when old.deleted_at is null and new.deleted_at is not null then 'delete' else 'update' end;
    keys := array(
      select k from jsonb_object_keys(old.data || new.data) k
      where old.data -> k is distinct from new.data -> k order by k);
    if old.deleted_at is distinct from new.deleted_at then
      keys := keys || 'deleted_at'::text;
    end if;
  end if;
  insert into public.audit_events (workshop_id, user_id, device_id, tbl, row_id, op, changed_keys, before, after)
  values (
    new.workshop_id,
    coalesce(auth.uid(), nullif(current_setting('app.acting_user', true), '')::uuid),
    nullif(current_setting('app.acting_device', true), '')::uuid,
    tg_table_name, new.id, o, keys,
    case when full_ and tg_op = 'UPDATE' then old.data end,
    case when full_ then new.data end);
  return null;
end $$;

-- Soft-delete genérico: quem pode mudar deleted_at (papéis em TG_ARGV; sem argumentos = só service).
create function app.guard_softdelete() returns trigger
language plpgsql set search_path = '' as $$
declare changed boolean;
begin
  if app.bypass() then return new; end if;
  if tg_op = 'INSERT' then
    changed := new.deleted_at is not null;
  else
    changed := new.deleted_at is distinct from old.deleted_at;
  end if;
  if changed and (tg_nargs = 0 or app.role_in(new.workshop_id) is null or app.role_in(new.workshop_id) <> all (tg_argv)) then
    raise exception 'exclusao_proibida' using errcode = '42501';
  end if;
  return new;
end $$;

create function app.guard_work_orders() returns trigger
language plpgsql set search_path = '' as $$
declare
  r text;
  os_ text;
  ns text;
begin
  if app.bypass() then return new; end if;
  if tg_op = 'INSERT' then
    if new.deleted_at is not null then
      raise exception 'money_op_required' using errcode = '42501';
    end if;
    -- OS nasce em ORCAMENTO, APROVADO, EM_SERVICO ou AGUARDANDO_PAGAMENTO; FINALIZADO/ARQUIVADO só pelo servidor.
    ns := new.data ->> 'status';
    if ns in ('FINALIZADO', 'ARQUIVADO') then
      raise exception 'money_op_required' using errcode = '42501';
    end if;
    if ns is null or ns not in ('ORCAMENTO', 'APROVADO', 'EM_SERVICO', 'AGUARDANDO_PAGAMENTO') then
      raise exception 'status_invalido' using errcode = '22023';
    end if;
    return new;
  end if;
  r := app.role_in(old.workshop_id);
  if new.deleted_at is distinct from old.deleted_at then
    raise exception 'money_op_required' using errcode = '42501';
  end if;
  if r = 'mecanico'
     and (old.data - '{status,checklist,photos,mileage}'::text[]) is distinct from (new.data - '{status,checklist,photos,mileage}'::text[]) then
    raise exception 'mecanico_campo_proibido' using errcode = '42501';
  end if;
  if r = 'mecanico' then
    -- tipos das chaves liberadas ao Mecânico
    if new.data ->> 'status' is null
       or new.data ->> 'status' not in ('ORCAMENTO', 'APROVADO', 'EM_SERVICO', 'AGUARDANDO_PAGAMENTO', 'FINALIZADO', 'ARQUIVADO')
       or coalesce(jsonb_typeof(new.data -> 'mileage'), 'null') not in ('number', 'null')
       or coalesce(jsonb_typeof(new.data -> 'photos'), 'null') not in ('array', 'null')
       or coalesce(jsonb_typeof(new.data -> 'checklist'), 'null') not in ('object', 'null') then -- ChecklistSchema (src/types.ts) é objeto
      raise exception 'mecanico_campo_invalido' using errcode = '22023';
    end if;
  end if;
  os_ := old.data ->> 'status';
  ns := new.data ->> 'status';
  if os_ is distinct from ns then
    -- Espelho de statusChangeEffects: dinheiro só pela função do servidor.
    if ns = 'FINALIZADO' or (os_ = 'FINALIZADO' and ns is distinct from 'ARQUIVADO') then
      raise exception 'money_op_required' using errcode = '42501';
    end if;
    if os_ = 'ARQUIVADO' then
      raise exception 'money_op_required' using errcode = '42501';
    end if;
    if os_ = 'AGUARDANDO_PAGAMENTO' and app.os_has_receipt(old.workshop_id, old.id) then
      raise exception 'money_op_required' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- DECISÃO: roda também no insert (a spec diz "insert + trigger"): OS nova não pode nascer com dinheiro gravado.
create function app.guard_finance() returns trigger
language plpgsql set search_path = '' as $$
begin
  if app.bypass() then return new; end if;
  if tg_op = 'UPDATE' then
    if new.deleted_at is distinct from old.deleted_at then
      raise exception 'money_op_required' using errcode = '42501';
    end if;
    if app.fin_money(old.data) is distinct from app.fin_money(new.data) then
      raise exception 'money_op_required' using errcode = '42501';
    end if;
    -- DECISÃO: com receita (financialId/installmentConfig) ou OS FINALIZADO/ARQUIVADO, total e prices também
    -- só mudam pela função de dinheiro (os.save).
    if (old.data -> 'total' is distinct from new.data -> 'total' or old.data -> 'prices' is distinct from new.data -> 'prices')
       and (coalesce(old.data ->> 'financialId', '') <> '' or jsonb_typeof(old.data -> 'installmentConfig') = 'object'
            or app.os_status(old.workshop_id, old.id) in ('FINALIZADO', 'ARQUIVADO')) then
      raise exception 'money_op_required' using errcode = '42501';
    end if;
  else
    if new.deleted_at is not null or app.fin_money(new.data) is distinct from app.fin_money('{}'::jsonb) then
      raise exception 'money_op_required' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create function app.guard_ledger() returns trigger
language plpgsql set search_path = '' as $$
begin
  if app.bypass() then return new; end if;
  if tg_op = 'INSERT' then
    if new.os_id is not null then
      raise exception 'ledger_os_id_proibido' using errcode = '42501';
    end if;
    if new.deleted_at is not null then
      raise exception 'ledger_exclusao_proibida' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.os_id is distinct from old.os_id then
    raise exception 'ledger_os_id_imutavel' using errcode = '42501';
  end if;
  if new.deleted_at is distinct from old.deleted_at
     and (old.os_id is not null or app.role_in(old.workshop_id) is distinct from 'dono') then
    raise exception 'ledger_exclusao_proibida' using errcode = '42501';
  end if;
  if old.os_id is not null and (old.data - 'description') is distinct from (new.data - 'description') then
    raise exception 'ledger_travado_por_os' using errcode = '42501';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['work_orders', 'work_order_finance', 'work_order_costs', 'ledger', 'clients',
    'catalog_parts', 'catalog_services', 'catalog_prices', 'catalog_costs', 'technicians',
    'appointments', 'audit_log', 'settings']
  loop
    execute format('create trigger b_touch before insert or update on public.%I for each row execute function app.touch()', t);
    if t <> 'audit_log' then
      execute format('create trigger z_audit after insert or update on public.%I for each row execute function app.audit()', t);
    end if;
  end loop;
end $$;

create trigger a_guard before insert or update on public.work_orders
  for each row execute function app.guard_work_orders();
create trigger a_guard before insert or update on public.work_order_finance
  for each row execute function app.guard_finance();
create trigger a_guard before insert or update on public.ledger
  for each row execute function app.guard_ledger();
create trigger a_guard before insert or update on public.work_order_costs
  for each row execute function app.guard_softdelete('dono');
create trigger a_guard before insert or update on public.catalog_costs
  for each row execute function app.guard_softdelete('dono');
create trigger a_guard before insert or update on public.clients
  for each row execute function app.guard_softdelete('dono', 'recepcao');
create trigger a_guard before insert or update on public.appointments
  for each row execute function app.guard_softdelete('dono', 'recepcao');
create trigger a_guard before insert or update on public.catalog_parts
  for each row execute function app.guard_softdelete('dono');
create trigger a_guard before insert or update on public.catalog_services
  for each row execute function app.guard_softdelete('dono');
create trigger a_guard before insert or update on public.catalog_prices
  for each row execute function app.guard_softdelete('dono');
create trigger a_guard before insert or update on public.technicians
  for each row execute function app.guard_softdelete('dono');
-- settings: sem exclusão (só service).
create trigger a_guard before insert or update on public.settings
  for each row execute function app.guard_softdelete();

-- ============================================================================
-- 5. RLS
-- ============================================================================
alter table public.workshops enable row level security;
alter table public.memberships enable row level security;
alter table public.member_pins enable row level security;   -- sem policy, de propósito
alter table public.devices enable row level security;
alter table public.money_ops enable row level security;     -- sem policy: só service
alter table public.audit_events enable row level security;

create policy workshops_sel on public.workshops for select to authenticated
  using (app.role_in(id) is not null);
-- DECISÃO: o app do Dono grava last_export_at (exportação diária); só essa coluna tem grant de update.
create policy workshops_upd on public.workshops for update to authenticated
  using (app.role_in(id) = 'dono') with check (app.role_in(id) = 'dono');

create policy memberships_sel on public.memberships for select to authenticated
  using (user_id = auth.uid() or app.role_in(workshop_id) = 'dono');
create policy devices_sel on public.devices for select to authenticated
  using (app.role_in(workshop_id) = 'dono');
create policy audit_events_sel on public.audit_events for select to authenticated
  using (app.role_in(workshop_id) = 'dono');

do $$
declare
  rec record;
begin
  for rec in select * from (values
    -- tabela, select, insert, update, extra no with check do insert
    ('work_orders',        '{dono,recepcao,mecanico}', '{dono,recepcao}', '{dono,recepcao,mecanico}', ''),
    ('work_order_finance', '{dono,recepcao}',          '{dono,recepcao}', '{dono,recepcao}',          ''),
    ('work_order_costs',   '{dono}',                   '{dono}',          '{dono}',                   ''),
    ('catalog_costs',      '{dono}',                   '{dono}',          '{dono}',                   ''),
    ('ledger',             '{dono,recepcao}',          '{dono,recepcao}', '{dono,recepcao}',          ' and os_id is null'),
    ('clients',            '{dono,recepcao,mecanico}', '{dono,recepcao,mecanico}', '{dono,recepcao}', ''),
    ('appointments',       '{dono,recepcao,mecanico}', '{dono,recepcao,mecanico}', '{dono,recepcao,mecanico}', ''),
    ('catalog_parts',      '{dono,recepcao,mecanico}', '{dono,recepcao}', '{dono,recepcao}',          ''),
    ('catalog_services',   '{dono,recepcao,mecanico}', '{dono,recepcao}', '{dono,recepcao}',          ''),
    ('catalog_prices',     '{dono,recepcao}',          '{dono,recepcao}', '{dono,recepcao}',          ''),
    ('technicians',        '{dono,recepcao,mecanico}', '{dono,recepcao}', '{dono,recepcao}',          ''),
    ('settings',           '{dono,recepcao,mecanico}', '{dono}',          '{dono}',                   ''),
    -- audit_log: só o Dono lê; escrita só por service/trigger (sem policy de escrita)
    ('audit_log',          '{dono}',                   null,              null,                       '')
  ) as v(t, sel, ins, upd, extra)
  loop
    execute format('create policy %I on public.%I for select to authenticated using (app.role_in(workshop_id) = any (%L::text[]))',
      rec.t || '_sel', rec.t, rec.sel);
    if rec.ins is not null then
      execute format('create policy %I on public.%I for insert to authenticated with check (app.role_in(workshop_id) = any (%L::text[])%s)',
        rec.t || '_ins', rec.t, rec.ins, rec.extra);
      execute format('create policy %I on public.%I for update to authenticated using (app.role_in(workshop_id) = any (%L::text[])) with check (app.role_in(workshop_id) = any (%L::text[]))',
        rec.t || '_upd', rec.t, rec.upd, rec.upd);
    end if;
  end loop;
end $$;

-- ============================================================================
-- 6. RPC: sync_push (security invoker: RLS e triggers valem)
-- ============================================================================
-- groups: [{ key, rows: [{ table, id, version, data, deleted?, os_id? }] }]
--   version = última versão conhecida da linha (0 = nova).
-- retorno: [{ key, status:'ok', rows:[{table,id,version}] }
--          | { key, status:'conflict', rows:[{table,id,version,data,deleted_at,updated_at,os_id}] }
--          | { key, status:'denied', code, message }]
create function public.sync_push(ws uuid, groups jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  tbls constant text[] := array['work_orders', 'work_order_finance', 'work_order_costs', 'ledger', 'clients',
    'catalog_parts', 'catalog_services', 'catalog_prices', 'catalog_costs', 'technicians',
    'appointments', 'audit_log', 'settings'];
  result jsonb := '[]';
  g jsonb;
  r jsonb;
  t text;
  rid text;
  base bigint;
  del boolean;
  rdata jsonb;
  ros text;
  v bigint;
  cv bigint;
  ok_rows jsonb;
  cur_rows jsonb;
  cj jsonb;
  ist text;
begin
  if app.role_in(ws) is null then
    raise exception 'sem_acesso' using errcode = '42501';
  end if;
  if jsonb_typeof(groups) is distinct from 'array' then
    raise exception 'groups_invalido' using errcode = '22023';
  end if;
  -- Importação em andamento (ou nunca feita): o sync não escreve; a importação apaga/regrava a oficina.
  select w.import_state into ist from public.workshops w where w.id = ws;
  if ist is distinct from 'concluido' then
    for g in select value from jsonb_array_elements(groups) loop
      result := result || jsonb_build_object('key', g -> 'key', 'status', 'denied',
        'code', 'importacao_pendente', 'message', 'importacao_pendente');
    end loop;
    return result;
  end if;

  for g in select value from jsonb_array_elements(groups) loop
    begin
      ok_rows := '[]';
      for r in select value from jsonb_array_elements(coalesce(g -> 'rows', '[]')) loop
        t := r ->> 'table';
        if t is null or t <> all (tbls) then
          raise exception 'tabela_invalida' using errcode = '22023';
        end if;
        rid := r ->> 'id';
        if rid is null or jsonb_typeof(r -> 'data') is distinct from 'object' then
          raise exception 'linha_invalida' using errcode = '22023';
        end if;
        rdata := (r -> 'data') - '{workshop_id,version,updated_at}'::text[];
        base := coalesce((r ->> 'version')::bigint, 0);
        del := coalesce((r ->> 'deleted')::boolean, false);
        ros := r ->> 'os_id';
        v := null;

        if base = 0 then
          begin
            if t = 'ledger' then
              insert into public.ledger (workshop_id, id, data, deleted_at, os_id)
              values (ws, rid, rdata, case when del then clock_timestamp() end, ros)
              returning version into v;
            else
              execute format('insert into public.%I (workshop_id, id, data, deleted_at) values ($1, $2, $3, case when $4 then clock_timestamp() end) returning version', t)
                into v using ws, rid, rdata, del;
            end if;
          exception when unique_violation then
            raise exception 'conflict' using errcode = 'SY409';
          end;
        else
          if t = 'ledger' then
            update public.ledger
               set data = rdata,
                   deleted_at = case when del then coalesce(deleted_at, clock_timestamp()) end
             where workshop_id = ws and id = rid and version = base
            returning version into v;
          else
            execute format('update public.%I set data = $3, deleted_at = case when $4 then coalesce(deleted_at, clock_timestamp()) end where workshop_id = $1 and id = $2 and version = $5 returning version', t)
              into v using ws, rid, rdata, del, base;
          end if;
          if v is null then
            cv := null;
            execute format('select version from public.%I where workshop_id = $1 and id = $2', t) into cv using ws, rid;
            if cv is null then
              -- inexistente ou invisível ao papel: conflict sem linhas faria o cliente repetir para sempre
              raise exception 'nao_encontrado' using errcode = 'SY404';
            end if;
            if cv <> base then
              raise exception 'conflict' using errcode = 'SY409';
            end if;
            -- linha existe na versão esperada mas o update não afetou: RLS recusou
            raise exception 'update_negado' using errcode = '42501';
          end if;
        end if;
        ok_rows := ok_rows || jsonb_build_object('table', t, 'id', rid, 'version', v);
      end loop;
      result := result || jsonb_build_object('key', g -> 'key', 'status', 'ok', 'rows', ok_rows);
    exception
      when sqlstate 'SY409' then
        cur_rows := '[]';
        for r in select value from jsonb_array_elements(coalesce(g -> 'rows', '[]')) loop
          t := r ->> 'table';
          continue when t is null or t <> all (tbls);
          cj := null;
          execute format('select jsonb_build_object(''table'', %L::text, ''id'', x.id, ''version'', x.version, ''data'', x.data, ''deleted_at'', x.deleted_at, ''updated_at'', x.updated_at, ''os_id'', to_jsonb(x) -> ''os_id'') from public.%I x where x.workshop_id = $1 and x.id = $2', t, t)
            into cj using ws, r ->> 'id';
          if cj is not null then
            cur_rows := cur_rows || cj;
          end if;
        end loop;
        if jsonb_array_length(cur_rows) = 0 then
          result := result || jsonb_build_object('key', g -> 'key', 'status', 'denied',
            'code', 'nao_encontrado', 'message', 'nao_encontrado');
        else
          result := result || jsonb_build_object('key', g -> 'key', 'status', 'conflict', 'rows', cur_rows);
        end if;
      when sqlstate 'SY404' then
        result := result || jsonb_build_object('key', g -> 'key', 'status', 'denied',
          'code', 'nao_encontrado', 'message', 'nao_encontrado');
      when others then
        result := result || jsonb_build_object('key', g -> 'key', 'status', 'denied', 'code', sqlstate, 'message', sqlerrm);
    end;
  end loop;
  return result;
end $$;

-- ============================================================================
-- 7. RPC: apply_money_op (só service role; transação única, idempotente)
-- ============================================================================
-- p_expected: [{table,id,version}] (0 = não deve existir)
-- p_writes:   [{table,id,data,deleted?,os_id?}]  (todo write precisa de uma entrada em p_expected;
--             version 0 = insert puro, version > 0 = update da linha na versão esperada)
-- p_audit:    [{id,data}] gravados em audit_log (ignorados se o id já existe)
-- retorno: {status:'ok', rows:[{table,id,version}]} | {status:'conflict', rows:[{table,id,version,data,deleted_at,os_id}]}
-- Conflito não grava money_ops: a Edge devolve 409 e o cliente repete depois do pull.
create function public.apply_money_op(
  p_op_id uuid, p_ws uuid, p_user uuid, p_device uuid, p_kind text,
  p_expected jsonb, p_writes jsonb, p_audit jsonb default '[]'
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
  select m.workshop_id, m.user_id, m.kind, m.result into prev from public.money_ops m where m.op_id = p_op_id;
  if found then
    -- op_id repetido só devolve o resultado para a MESMA oficina, usuário e tipo.
    if prev.workshop_id is distinct from p_ws or prev.user_id is distinct from p_user or prev.kind is distinct from p_kind then
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

  res := jsonb_build_object('status', 'ok', 'rows', out_rows);
  insert into public.money_ops (op_id, workshop_id, user_id, kind, result)
  values (p_op_id, p_ws, p_user, p_kind, res);
  return res;
end $$;

-- ============================================================================
-- 8. RPC: importação (só Dono; security definer)
-- ============================================================================
-- Oficina "em uso": alguma linha de coleção com version > 1 ou gravada por outro usuário que não o Dono que
-- importa. Importar/apagar nesse caso destruiria edições sem auditoria. Só as RPCs de importação chamam (sem
-- grant para authenticated).
create function app.workshop_in_use(ws uuid, uid uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare t text; used boolean;
begin
  foreach t in array array['work_orders', 'work_order_finance', 'work_order_costs', 'ledger', 'clients',
    'catalog_parts', 'catalog_services', 'catalog_prices', 'catalog_costs', 'technicians',
    'appointments', 'audit_log', 'settings'] loop
    execute format('select exists (select 1 from public.%I where workshop_id = $1 and (version > 1 or (updated_by is not null and updated_by is distinct from $2)))', t)
      into used using ws, uid;
    if used then return true; end if;
  end loop;
  return false;
end $$;

-- rows: [{ table, id, data, os_id? }]  (id repetido no lote: vale o último)
create function public.import_rows(ws uuid, rows jsonb) returns jsonb
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

-- Totais para conferência (valores em centavos). p_commit = true marca a importação como concluída
-- (também sobre zero linhas: oficina nova sem dados legados fecha assim e libera o sync_push).
-- retorno: {state, counts:{tabela:n}, ledgerSignedCents, osTotalCents, paidEntries, advancesCents}
create function public.import_finish(ws uuid, p_commit boolean default false) returns jsonb
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

-- "Apagar e reenviar" (seção 7): só com a importação em andamento e a oficina ainda sem uso.
-- Grava um audit_events resumido (quem, quando, contagem por tabela) antes de apagar.
create function public.import_reset(ws uuid) returns void
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

-- ============================================================================
-- 9. Realtime
-- ============================================================================
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['work_orders', 'work_order_finance', 'work_order_costs', 'ledger', 'clients',
      'catalog_parts', 'catalog_services', 'catalog_prices', 'catalog_costs', 'technicians',
      'appointments', 'audit_log', 'settings']
    loop
      execute format('alter publication supabase_realtime add table public.%I', t);
    end loop;
  end if;
end $$;

-- ============================================================================
-- 10. Storage
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 3145728, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg'];

create policy f_sel on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and app.role_in(app.ws_of_path(name)) is not null);
create policy f_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and app.role_in(app.ws_of_path(name)) is not null
    and name ~ '^[0-9a-f-]{36}/[A-Za-z0-9-]{1,64}/[A-Za-z0-9-]{1,64}(\.t)?\.jpg$');
-- sem policy de update nem delete: nunca sobrescreve, nunca apaga.

-- ============================================================================
-- 11. Grants explícitos
-- ============================================================================
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;

revoke all on schema app from public, anon;
grant usage on schema app to authenticated, service_role;
revoke all on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;
revoke execute on function app.workshop_in_use(uuid, uuid) from authenticated, service_role;

grant select on public.workshops, public.memberships, public.audit_events, public.audit_log to authenticated;
grant update (last_export_at) on public.workshops to authenticated;
-- devices: sem secret_hash para o front
grant select (id, workshop_id, name, kind, idle_lock_minutes, authorized_by, authorized_at, revoked_at) on public.devices to authenticated;
-- member_pins e money_ops: nada para authenticated.
grant select, insert, update on
  public.work_orders, public.work_order_finance, public.work_order_costs, public.ledger, public.clients,
  public.catalog_parts, public.catalog_services, public.catalog_prices, public.catalog_costs,
  public.technicians, public.appointments, public.settings
  to authenticated;

grant execute on function public.sync_push(uuid, jsonb) to authenticated, service_role;
grant execute on function public.import_rows(uuid, jsonb) to authenticated, service_role;
grant execute on function public.import_finish(uuid, boolean) to authenticated, service_role;
grant execute on function public.import_reset(uuid) to authenticated, service_role;
revoke execute on function public.apply_money_op(uuid, uuid, uuid, uuid, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_money_op(uuid, uuid, uuid, uuid, text, jsonb, jsonb, jsonb) to service_role;

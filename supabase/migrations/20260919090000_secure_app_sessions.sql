create extension if not exists pgcrypto with schema extensions;

alter table public.companies
  add column if not exists password_hash text,
  add column if not exists partial_password_hash text;

update public.companies
set password_hash = extensions.crypt(password, extensions.gen_salt('bf'))
where password is not null and password <> '' and password_hash is null;

update public.companies
set partial_password_hash = extensions.crypt(partial_password, extensions.gen_salt('bf'))
where partial_password is not null and partial_password <> '' and partial_password_hash is null;

create table if not exists public.app_sessions (
  token_hash text primary key,
  company_id text references public.companies(id) on delete cascade,
  access_level text not null check (access_level in ('full','partial','admin')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists public.app_admins (
  username text primary key,
  password_hash text not null,
  must_rotate boolean not null default true,
  updated_at timestamptz not null default now()
);
create table if not exists public.company_registration_tokens (
  company_id text primary key references public.companies(id) on delete cascade,
  token_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create or replace function public.app_token_hash(p_token text)
returns text
language sql
immutable
security definer
set search_path = public, extensions
as $$
  select encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex');
$$;

create or replace function public.app_session_context(p_session_token text)
returns table(company_id text, access_level text)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select s.company_id, s.access_level
  from public.app_sessions s
  where s.token_hash = public.app_token_hash(p_session_token)
    and s.expires_at > now()
  limit 1;
$$;

create or replace function public.app_session_can_access(p_session_token text, p_company_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_company_id text;
  v_access text;
begin
  select company_id, access_level into v_company_id, v_access
  from public.app_session_context(p_session_token);

  if v_access is null then return false; end if;
  if v_access = 'admin' then return true; end if;
  if p_company_id = v_company_id then return true; end if;

  return exists (
    with recursive tree as (
      select c.id from public.companies c where c.id = v_company_id
      union all
      select c.id from public.companies c join tree t on c.parent_id = t.id
    )
    select 1 from tree where id = p_company_id
  );
end;
$$;

create or replace function public.list_login_companies()
returns table(id text, name text, doc_nit text, parent_id text, is_active boolean)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.doc_nit, c.parent_id, (c.username is not null and c.username <> '')
  from public.companies c
  order by c.name;
$$;

create or replace function public.secure_login(p_username text, p_password text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  comp public.companies%rowtype;
  v_full boolean := false;
  v_partial boolean := false;
  v_token text;
  v_access text;
begin
  select * into comp from public.companies
  where username = p_username
  limit 1;

  if comp.id is null then
    return json_build_object('success',false,'message','Credenciales incorrectas');
  end if;
  v_full := (
    (comp.password_hash is not null and extensions.crypt(p_password, comp.password_hash) = comp.password_hash)
    or (comp.password is not null and comp.password = p_password)
  );
  v_partial := (
    (comp.partial_password_hash is not null and extensions.crypt(p_password, comp.partial_password_hash) = comp.partial_password_hash)
    or (comp.partial_password is not null and comp.partial_password = p_password)
  );

  if not v_full and not v_partial then
    return json_build_object('success',false,'message','Credenciales incorrectas');
  end if;

  v_access := case when v_full then 'full' else 'partial' end;

  if v_full and (comp.password_hash is null or comp.password = p_password) then
    update public.companies set password_hash = extensions.crypt(p_password, extensions.gen_salt('bf'))
    where id = comp.id;
  end if;
  if v_partial and (comp.partial_password_hash is null or comp.partial_password = p_password) then
    update public.companies set partial_password_hash = extensions.crypt(p_password, extensions.gen_salt('bf'))
    where id = comp.id;
  end if;

  delete from public.app_sessions where expires_at <= now();
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.app_sessions(token_hash, company_id, access_level, expires_at)
  values (public.app_token_hash(v_token), comp.id, v_access, now() + interval '7 days');

  return json_build_object(
    'success', true,
    'accessLevel', v_access,
    'sessionToken', v_token,
    'company', json_build_object(
      'id', comp.id, 'name', comp.name, 'doc', comp.doc_nit,
      'parentId', comp.parent_id, 'username', comp.username,
      'address', comp.address, 'phone', comp.phone
    )
  );
end;
$$;
create or replace function public.secure_admin_login(p_username text, p_password text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  adm public.app_admins%rowtype;
  v_token text;
begin
  select * into adm from public.app_admins where username = p_username limit 1;
  if adm.username is null
     or extensions.crypt(p_password, adm.password_hash) <> adm.password_hash then
    return json_build_object('success',false,'message','Credenciales incorrectas');
  end if;

  delete from public.app_sessions where expires_at <= now();
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.app_sessions(token_hash, company_id, access_level, expires_at)
  values (public.app_token_hash(v_token), null, 'admin', now() + interval '7 days');

  return json_build_object(
    'success',true,
    'accessLevel','admin',
    'sessionToken',v_token,
    'mustRotate',adm.must_rotate
  );
end;
$$;

create or replace function public.session_companies(p_session_token text)
returns table(
  id text, name text, doc_nit text, parent_id text,
  username text, address text, phone text, is_active boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.doc_nit, c.parent_id, c.username, c.address, c.phone,
         (c.username is not null and c.username <> '')
  from public.companies c
  where public.app_session_can_access(p_session_token, c.id)
  order by c.name;
$$;

create or replace function public.sync_read(
  p_session_token text,
  p_company_id text,
  p_storage_key text
)
returns table(data jsonb, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_session_can_access(p_session_token, p_company_id) then
    raise exception 'Sesión inválida o sin acceso a la entidad';
  end if;

  update public.app_sessions
  set last_seen_at = now()
  where token_hash = public.app_token_hash(p_session_token);

  return query
  select s.data, s.updated_at
  from public.app_data_sync s
  where s.company_id = p_company_id and s.storage_key = p_storage_key
  limit 1;
end;
$$;

create or replace function public.sync_read_many(
  p_session_token text,
  p_company_id text,
  p_storage_keys text[]
)
returns table(storage_key text, data jsonb, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_session_can_access(p_session_token, p_company_id) then
    raise exception 'Sesión inválida o sin acceso a la entidad';
  end if;

  return query
  select s.storage_key, s.data, s.updated_at
  from public.app_data_sync s
  where s.company_id = p_company_id
    and s.storage_key = any(p_storage_keys);
end;
$$;

create or replace function public.sync_write(
  p_session_token text,
  p_company_id text,
  p_storage_key text,
  p_data jsonb
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  if not public.app_session_can_access(p_session_token, p_company_id) then
    raise exception 'Sesión inválida o sin acceso a la entidad';
  end if;

  insert into public.app_data_sync(company_id, storage_key, data, updated_at)
  values (p_company_id, p_storage_key, coalesce(p_data, '[]'::jsonb), v_now)
  on conflict (company_id, storage_key)
  do update set data = excluded.data, updated_at = excluded.updated_at;

  update public.app_sessions
  set last_seen_at = v_now
  where token_hash = public.app_token_hash(p_session_token);

  return v_now;
end;
$$;

create or replace function public.session_update_company(
  p_session_token text,
  p_company_id text,
  p_patch jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_access text;
begin
  select access_level into v_access from public.app_session_context(p_session_token);
  if v_access is null or v_access = 'partial' then
    raise exception 'Sesión sin permisos de modificación';
  end if;
  if v_access <> 'admin' and not public.app_session_can_access(p_session_token, p_company_id) then
    raise exception 'Sin acceso a la entidad';
  end if;

  update public.companies
  set
    name = case when p_patch ? 'name' then nullif(p_patch->>'name','') else name end,
    doc_nit = case when p_patch ? 'doc_nit' then nullif(p_patch->>'doc_nit','') else doc_nit end,
    address = case when p_patch ? 'address' then coalesce(p_patch->>'address','') else address end,
    phone = case when p_patch ? 'phone' then coalesce(p_patch->>'phone','') else phone end,
    username = case when p_patch ? 'username' then nullif(p_patch->>'username','') else username end,
    password_hash = case when coalesce(p_patch->>'password','') <> '' then extensions.crypt(p_patch->>'password', extensions.gen_salt('bf')) else password_hash end,
    partial_password_hash = case when coalesce(p_patch->>'partial_password','') <> '' then extensions.crypt(p_patch->>'partial_password', extensions.gen_salt('bf')) else partial_password_hash end,
    password = case when coalesce(p_patch->>'password','') <> '' then null else password end,
    partial_password = case when coalesce(p_patch->>'partial_password','') <> '' then null else partial_password end,
    updated_at = now()
  where id = p_company_id;

  return found;
end;
$$;
create or replace function public.session_create_company(
  p_session_token text,
  p_company_id text,
  p_parent_id text,
  p_name text,
  p_doc_nit text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_access text;
  v_company text;
begin
  select company_id, access_level into v_company, v_access
  from public.app_session_context(p_session_token);

  if v_access is null or v_access = 'partial' then
    raise exception 'Sesión sin permisos de creación';
  end if;

  if v_access <> 'admin' then
    if p_parent_id is null or not public.app_session_can_access(p_session_token, p_parent_id) then
      raise exception 'La nueva entidad debe depender de una entidad autorizada';
    end if;
  end if;

  insert into public.companies(id, parent_id, name, doc_nit, address, phone)
  values (p_company_id, p_parent_id, p_name, p_doc_nit, '', '');

  return true;
end;
$$;

create or replace function public.session_delete_company(
  p_session_token text,
  p_company_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_access text;
  v_company text;
begin
  select company_id, access_level into v_company, v_access
  from public.app_session_context(p_session_token);

  if v_access is null or v_access = 'partial' then
    raise exception 'Sesión sin permisos de eliminación';
  end if;

  if v_access <> 'admin' then
    if p_company_id = v_company or not public.app_session_can_access(p_session_token, p_company_id) then
      raise exception 'No se puede eliminar esta entidad';
    end if;
  end if;

  delete from public.companies where id = p_company_id;
  return found;
end;
$$;
create or replace function public.issue_registration_token(
  p_session_token text,
  p_company_id text
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_access text;
  v_token text;
begin
  select access_level into v_access from public.app_session_context(p_session_token);
  if v_access <> 'admin' then
    raise exception 'Solo el Administrador General puede emitir códigos de activación';
  end if;

  if not exists(select 1 from public.companies where id = p_company_id) then
    raise exception 'Entidad no encontrada';
  end if;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.company_registration_tokens(company_id, token_hash, created_at, expires_at, used_at)
  values (p_company_id, public.app_token_hash(v_token), now(), now() + interval '30 days', null)
  on conflict (company_id)
  do update set token_hash = excluded.token_hash, created_at = excluded.created_at,
                expires_at = excluded.expires_at, used_at = null;

  return v_token;
end;
$$;

create or replace function public.admin_change_password(
  p_session_token text,
  p_new_password text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_access text;
begin
  select access_level into v_access from public.app_session_context(p_session_token);
  if v_access <> 'admin' then raise exception 'Sesión administrativa inválida'; end if;
  if length(coalesce(p_new_password,'')) < 12 then
    raise exception 'La nueva clave debe tener al menos 12 caracteres';
  end if;

  update public.app_admins
  set password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      must_rotate = false,
      updated_at = now();
  return found;
end;
$$;
create or replace function public.register_company_structure(
  p_doc_nit text,
  p_registration_token text,
  p_companies jsonb
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_root_id text;
  v_root jsonb;
  v_item jsonb;
  v_id text;
  v_parent text;
begin
  select t.company_id into v_root_id
  from public.company_registration_tokens t
  join public.companies c on c.id = t.company_id
  where t.token_hash = public.app_token_hash(p_registration_token)
    and t.used_at is null
    and t.expires_at > now()
    and c.doc_nit = p_doc_nit
  limit 1;

  if v_root_id is null then
    return json_build_object('success',false,'message','Código de activación inválido o vencido');
  end if;

  select item into v_root
  from jsonb_array_elements(p_companies) item
  where item->>'id' = v_root_id
  limit 1;

  if v_root is null then
    return json_build_object('success',false,'message','La estructura no contiene la entidad raíz autorizada');
  end if;

  update public.companies
  set name = coalesce(nullif(v_root->>'name',''), name),
      address = coalesce(v_root->>'address',''),
      phone = coalesce(v_root->>'phone',''),
      username = nullif(v_root->>'username',''),
      password_hash = case when coalesce(v_root->>'password','') <> '' then extensions.crypt(v_root->>'password', extensions.gen_salt('bf')) else password_hash end,
      partial_password_hash = case when coalesce(v_root->>'partialPassword','') <> '' then extensions.crypt(v_root->>'partialPassword', extensions.gen_salt('bf')) else partial_password_hash end,
      password = null,
      partial_password = null,
      updated_at = now()
  where id = v_root_id;
  for v_item in select value from jsonb_array_elements(p_companies)
  loop
    v_id := v_item->>'id';
    if v_id = v_root_id then continue; end if;
    v_parent := nullif(v_item->>'parentId','');

    if v_parent is null or not (
      v_parent = v_root_id
      or exists(select 1 from jsonb_array_elements(p_companies) p where p->>'id' = v_parent)
    ) then
      return json_build_object('success',false,'message','Jerarquía de subentidades inválida');
    end if;

    if exists(select 1 from public.companies where id = v_id) then
      if not exists (
        with recursive tree as (
          select c.id from public.companies c where c.id = v_root_id
          union all select c.id from public.companies c join tree t on c.parent_id=t.id
        )
        select 1 from tree where id=v_id
      ) then
        return json_build_object('success',false,'message','ID de entidad ya pertenece a otra estructura');
      end if;
    end if;

    insert into public.companies(
      id,parent_id,name,doc_nit,address,phone,username,
      password_hash,partial_password_hash,password,partial_password
    ) values (
      v_id, v_parent, coalesce(nullif(v_item->>'name',''),'Sin nombre'),
      nullif(v_item->>'doc',''), coalesce(v_item->>'address',''), coalesce(v_item->>'phone',''),
      nullif(v_item->>'username',''),
      case when coalesce(v_item->>'password','')<>'' then extensions.crypt(v_item->>'password',extensions.gen_salt('bf')) end,
      case when coalesce(v_item->>'partialPassword','')<>'' then extensions.crypt(v_item->>'partialPassword',extensions.gen_salt('bf')) end,
      null, null
    )
    on conflict (id) do update set
      parent_id=excluded.parent_id, name=excluded.name, doc_nit=excluded.doc_nit,
      address=excluded.address, phone=excluded.phone, username=excluded.username,
      password_hash=coalesce(excluded.password_hash,public.companies.password_hash),
      partial_password_hash=coalesce(excluded.partial_password_hash,public.companies.partial_password_hash),
      password=null, partial_password=null, updated_at=now();
  end loop;

  update public.company_registration_tokens
  set used_at=now()
  where company_id=v_root_id;

  return json_build_object('success',true,'message','Registro completado');
end;
$$;
create or replace function public.session_logout(p_session_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.app_sessions
  where token_hash = public.app_token_hash(p_session_token);
  return true;
end;
$$;

alter table public.app_sessions enable row level security;
alter table public.app_admins enable row level security;
alter table public.company_registration_tokens enable row level security;

revoke all on public.app_sessions from anon, authenticated;
revoke all on public.app_admins from anon, authenticated;
revoke all on public.company_registration_tokens from anon, authenticated;

revoke execute on function public.app_token_hash(text) from public;
revoke execute on function public.app_session_context(text) from public;
revoke execute on function public.app_session_can_access(text,text) from public;

grant execute on function public.list_login_companies() to anon, authenticated;
grant execute on function public.secure_login(text,text) to anon, authenticated;
grant execute on function public.secure_admin_login(text,text) to anon, authenticated;
grant execute on function public.session_companies(text) to anon, authenticated;
grant execute on function public.sync_read(text,text,text) to anon, authenticated;
grant execute on function public.sync_read_many(text,text,text[]) to anon, authenticated;
grant execute on function public.sync_write(text,text,text,jsonb) to anon, authenticated;
grant execute on function public.session_update_company(text,text,jsonb) to anon, authenticated;
grant execute on function public.session_create_company(text,text,text,text,text) to anon, authenticated;
grant execute on function public.session_delete_company(text,text) to anon, authenticated;
grant execute on function public.issue_registration_token(text,text) to anon, authenticated;
grant execute on function public.admin_change_password(text,text) to anon, authenticated;
grant execute on function public.register_company_structure(text,text,jsonb) to anon, authenticated;
grant execute on function public.session_logout(text) to anon, authenticated;

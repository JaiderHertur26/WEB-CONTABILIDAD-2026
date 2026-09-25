alter table public.app_sessions
  add column if not exists session_purpose text not null default 'login';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_sessions_session_purpose_check'
      and conrelid = 'public.app_sessions'::regclass
  ) then
    alter table public.app_sessions
      add constraint app_sessions_session_purpose_check
      check (session_purpose in ('login', 'destructive'));
  end if;
end
$$;

create or replace function public.secure_destructive_login(
  p_username text,
  p_password text
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  comp public.companies%rowtype;
  v_full boolean := false;
  v_token text;
begin
  select *
    into comp
  from public.companies
  where username = p_username
  limit 1;

  if comp.id is null then
    return json_build_object('success', false, 'message', 'Credenciales incorrectas');
  end if;

  v_full := (
    (comp.password_hash is not null and extensions.crypt(p_password, comp.password_hash) = comp.password_hash)
    or (comp.password is not null and comp.password = p_password)
  );

  if not v_full then
    return json_build_object(
      'success', false,
      'message', 'Se requiere la contraseña de Acceso Total'
    );
  end if;

  if comp.password_hash is null or comp.password = p_password then
    update public.companies
    set password_hash = extensions.crypt(p_password, extensions.gen_salt('bf'))
    where id = comp.id;
  end if;

  delete from public.app_sessions where expires_at <= now();

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.app_sessions(
    token_hash,
    company_id,
    access_level,
    session_purpose,
    expires_at
  )
  values (
    public.app_token_hash(v_token),
    comp.id,
    'full',
    'destructive',
    now() + interval '5 minutes'
  );

  return json_build_object(
    'success', true,
    'accessLevel', 'full',
    'sessionPurpose', 'destructive',
    'sessionToken', v_token,
    'company', json_build_object(
      'id', comp.id,
      'name', comp.name,
      'doc', comp.doc_nit,
      'parentId', comp.parent_id,
      'username', comp.username,
      'address', comp.address,
      'phone', comp.phone
    )
  );
end;
$$;

create or replace function public.secure_admin_destructive_login(
  p_username text,
  p_password text
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  adm public.app_admins%rowtype;
  v_token text;
begin
  select *
    into adm
  from public.app_admins
  where username = p_username
  limit 1;

  if adm.username is null
     or extensions.crypt(p_password, adm.password_hash) <> adm.password_hash then
    return json_build_object('success', false, 'message', 'Credenciales incorrectas');
  end if;

  delete from public.app_sessions where expires_at <= now();

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.app_sessions(
    token_hash,
    company_id,
    access_level,
    session_purpose,
    expires_at
  )
  values (
    public.app_token_hash(v_token),
    null,
    'admin',
    'destructive',
    now() + interval '5 minutes'
  );

  return json_build_object(
    'success', true,
    'accessLevel', 'admin',
    'sessionPurpose', 'destructive',
    'sessionToken', v_token,
    'mustRotate', adm.must_rotate
  );
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
  v_access text;
  v_purpose text;
  v_existing jsonb;
  v_has_deletion boolean := false;
begin
  if not public.app_session_can_access(p_session_token, p_company_id) then
    raise exception 'Sesión inválida o sin acceso a la entidad';
  end if;

  select s.access_level, s.session_purpose
    into v_access, v_purpose
  from public.app_sessions s
  where s.token_hash = public.app_token_hash(p_session_token)
    and s.expires_at > now()
  limit 1;

  select a.data
    into v_existing
  from public.app_data_sync a
  where a.company_id = p_company_id
    and a.storage_key = p_storage_key
  limit 1;

  if jsonb_typeof(v_existing) = 'array'
     and jsonb_typeof(coalesce(p_data, '[]'::jsonb)) = 'array' then

    if jsonb_array_length(coalesce(p_data, '[]'::jsonb)) < jsonb_array_length(v_existing) then
      v_has_deletion := true;
    end if;

    if not v_has_deletion and exists (
      select 1
      from jsonb_array_elements(v_existing) old_item
      where jsonb_typeof(old_item) = 'object'
        and old_item ? 'id'
        and nullif(old_item->>'id', '') is not null
        and not exists (
          select 1
          from jsonb_array_elements(coalesce(p_data, '[]'::jsonb)) new_item
          where jsonb_typeof(new_item) = 'object'
            and new_item ? 'id'
            and new_item->>'id' = old_item->>'id'
        )
    ) then
      v_has_deletion := true;
    end if;
  end if;

  if v_has_deletion and (
    v_access not in ('full', 'admin')
    or v_purpose is distinct from 'destructive'
  ) then
    raise exception 'Eliminación bloqueada: se requiere revalidación con Acceso Total';
  end if;

  insert into public.app_data_sync(company_id, storage_key, data, updated_at)
  values (p_company_id, p_storage_key, coalesce(p_data, '[]'::jsonb), v_now)
  on conflict (company_id, storage_key)
  do update
  set data = excluded.data,
      updated_at = excluded.updated_at;

  update public.app_sessions
  set last_seen_at = v_now
  where token_hash = public.app_token_hash(p_session_token);

  return v_now;
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
  v_purpose text;
begin
  select s.company_id, s.access_level, s.session_purpose
    into v_company, v_access, v_purpose
  from public.app_sessions s
  where s.token_hash = public.app_token_hash(p_session_token)
    and s.expires_at > now()
  limit 1;

  if v_access is null or v_access = 'partial' then
    raise exception 'Sesión sin permisos de eliminación';
  end if;

  if v_purpose is distinct from 'destructive' then
    raise exception 'Eliminación bloqueada: se requiere revalidación de credenciales';
  end if;

  if v_access <> 'admin' then
    if p_company_id = v_company
       or not public.app_session_can_access(p_session_token, p_company_id) then
      raise exception 'No se puede eliminar esta entidad';
    end if;
  end if;

  delete from public.companies
  where id = p_company_id;

  return found;
end;
$$;

revoke execute on function public.secure_destructive_login(text, text) from public;
revoke execute on function public.secure_admin_destructive_login(text, text) from public;

grant execute on function public.secure_destructive_login(text, text) to anon, authenticated;
grant execute on function public.secure_admin_destructive_login(text, text) to anon, authenticated;

comment on function public.secure_destructive_login(text, text) is
  'Emite una sesión temporal de 5 minutos exclusivamente para eliminaciones, solo con Acceso Total.';

comment on function public.secure_admin_destructive_login(text, text) is
  'Emite una sesión administrativa temporal de 5 minutos exclusivamente para eliminaciones.';

comment on function public.sync_write(text, text, text, jsonb) is
  'Sincroniza datos HERTUR y exige una sesión destructiva temporal cuando detecta eliminación de registros.';

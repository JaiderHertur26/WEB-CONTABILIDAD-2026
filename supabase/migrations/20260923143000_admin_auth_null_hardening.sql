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
  select access_level
    into v_access
  from public.app_session_context(p_session_token);

  if v_access is distinct from 'admin' then
    raise exception 'Solo el Administrador General puede emitir códigos de activación';
  end if;

  if not exists (
    select 1
    from public.companies
    where id = p_company_id
  ) then
    raise exception 'Entidad no encontrada';
  end if;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.company_registration_tokens(
    company_id, token_hash, created_at, expires_at, used_at
  )
  values (
    p_company_id,
    public.app_token_hash(v_token),
    now(),
    now() + interval '30 days',
    null
  )
  on conflict (company_id)
  do update set
    token_hash = excluded.token_hash,
    created_at = excluded.created_at,
    expires_at = excluded.expires_at,
    used_at = null;

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
  select access_level
    into v_access
  from public.app_session_context(p_session_token);

  if v_access is distinct from 'admin' then
    raise exception 'Sesión administrativa inválida';
  end if;

  if length(coalesce(p_new_password, '')) < 12 then
    raise exception 'La nueva clave debe tener al menos 12 caracteres';
  end if;

  update public.app_admins
  set
    password_hash = extensions.crypt(
      p_new_password,
      extensions.gen_salt('bf')
    ),
    must_rotate = false,
    updated_at = now();

  return found;
end;
$$;

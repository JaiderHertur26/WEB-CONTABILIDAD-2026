begin;

do $$
begin
  if exists (
    select 1 from public.companies
    where password is not null and password <> '' and password_hash is null
  ) then
    raise exception 'No se puede cerrar seguridad: existen claves globales sin hash';
  end if;

  if exists (
    select 1 from public.companies
    where partial_password is not null and partial_password <> '' and partial_password_hash is null
  ) then
    raise exception 'No se puede cerrar seguridad: existen claves parciales sin hash';
  end if;

  if not exists (select 1 from public.app_admins where password_hash is not null) then
    raise exception 'No se puede cerrar seguridad: falta credencial administrativa protegida';
  end if;
end
$$;

update public.companies
set password = null
where password_hash is not null;

update public.companies
set partial_password = null
where partial_password_hash is not null;

alter table public.companies enable row level security;
alter table public.app_data_sync enable row level security;
alter table public.app_sessions enable row level security;
alter table public.app_admins enable row level security;
alter table public.company_registration_tokens enable row level security;

revoke all on table public.companies from public, anon, authenticated;
revoke all on table public.app_data_sync from public, anon, authenticated;
revoke all on table public.app_sessions from public, anon, authenticated;
revoke all on table public.app_admins from public, anon, authenticated;
revoke all on table public.company_registration_tokens from public, anon, authenticated;

revoke execute on function public.list_login_companies() from public;
revoke execute on function public.secure_login(text,text) from public;
revoke execute on function public.secure_admin_login(text,text) from public;
revoke execute on function public.session_companies(text) from public;
revoke execute on function public.sync_read(text,text,text) from public;
revoke execute on function public.sync_read_many(text,text,text[]) from public;
revoke execute on function public.sync_write(text,text,text,jsonb) from public;
revoke execute on function public.session_update_company(text,text,jsonb) from public;
revoke execute on function public.session_create_company(text,text,text,text,text) from public;
revoke execute on function public.session_delete_company(text,text) from public;
revoke execute on function public.issue_registration_token(text,text) from public;
revoke execute on function public.admin_change_password(text,text) from public;
revoke execute on function public.register_company_structure(text,text,jsonb) from public;
revoke execute on function public.session_logout(text) from public;

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

commit;

create or replace function public.session_info(p_session_token text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company_id text;
  v_access_level text;
begin
  select company_id, access_level
    into v_company_id, v_access_level
  from public.app_session_context(p_session_token);

  if v_access_level is null then
    return json_build_object(
      'success', false,
      'message', 'Sesión inválida o expirada'
    );
  end if;

  return json_build_object(
    'success', true,
    'companyId', v_company_id,
    'accessLevel', v_access_level
  );
end;
$$;

revoke execute on function public.session_info(text) from public;
grant execute on function public.session_info(text) to anon, authenticated;

comment on function public.session_info(text) is
  'Devuelve el alcance y nivel de acceso autoritativos de una sesión HERTUR vigente.';

create or replace function public.admin_company_data_summary(p_session_token text)
returns table(
  company_id text,
  storage_keys bigint,
  record_count bigint,
  has_content boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_access text;
begin
  select access_level into v_access
  from public.app_session_context(p_session_token);

  if v_access is distinct from 'admin' then
    raise exception 'Solo el Administrador General puede consultar este resumen';
  end if;

  return query
  select
    c.id,
    count(s.storage_key)::bigint as storage_keys,
    coalesce(sum(
      case
        when s.data is null or s.data = 'null'::jsonb then 0
        when jsonb_typeof(s.data) = 'array' then jsonb_array_length(s.data)
        when jsonb_typeof(s.data) = 'object' then case when s.data = '{}'::jsonb then 0 else 1 end
        else 1
      end
    ), 0)::bigint as record_count,
    coalesce(bool_or(
      s.data is not null
      and s.data <> 'null'::jsonb
      and s.data <> '[]'::jsonb
      and s.data <> '{}'::jsonb
    ), false) as has_content
  from public.companies c
  left join public.app_data_sync s on s.company_id = c.id
  group by c.id;
end;
$$;
create or replace function public.admin_import_company_structure(
  p_session_token text,
  p_company_id text,
  p_parent_id text,
  p_name text,
  p_doc_nit text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_access text;
  v_existing_doc text;
  v_has_content boolean := false;
begin
  select access_level into v_access
  from public.app_session_context(p_session_token);

  if v_access is distinct from 'admin' then
    raise exception 'Solo el Administrador General puede importar estructura';
  end if;
  if nullif(trim(p_company_id), '') is null or nullif(trim(p_name), '') is null then
    raise exception 'ID y nombre son obligatorios';
  end if;

  if p_parent_id = p_company_id then
    raise exception 'Una empresa no puede depender de sí misma';
  end if;

  if p_parent_id is not null
     and not exists(select 1 from public.companies where id = p_parent_id) then
    raise exception 'La entidad superior aún no existe: %', p_parent_id;
  end if;

  select doc_nit into v_existing_doc
  from public.companies
  where id = p_company_id;

  if found then
    if coalesce(v_existing_doc, '') <> coalesce(p_doc_nit, '') then
      raise exception 'Conflicto de identidad: el ID existe con otro NIT';
    end if;
    select exists(
      select 1
      from public.app_data_sync s
      where s.company_id = p_company_id
        and s.data is not null
        and s.data <> 'null'::jsonb
        and s.data <> '[]'::jsonb
        and s.data <> '{}'::jsonb
    ) into v_has_content;

    if v_has_content then
      return json_build_object(
        'status', 'protected_existing_data',
        'companyId', p_company_id,
        'hasContent', true,
        'created', false,
        'updated', false
      );
    end if;

    update public.companies
    set name = p_name,
        doc_nit = p_doc_nit,
        parent_id = p_parent_id,
        updated_at = now()
    where id = p_company_id;
    return json_build_object(
      'status', 'updated_empty',
      'companyId', p_company_id,
      'hasContent', false,
      'created', false,
      'updated', true
    );
  end if;

  insert into public.companies(id, parent_id, name, doc_nit, address, phone)
  values (p_company_id, p_parent_id, p_name, p_doc_nit, '', '');

  return json_build_object(
    'status', 'created',
    'companyId', p_company_id,
    'hasContent', false,
    'created', true,
    'updated', false
  );
end;
$$;

revoke execute on function public.admin_company_data_summary(text) from public;
revoke execute on function public.admin_import_company_structure(text,text,text,text,text) from public;
grant execute on function public.admin_company_data_summary(text) to anon, authenticated;
grant execute on function public.admin_import_company_structure(text,text,text,text,text) to anon, authenticated;

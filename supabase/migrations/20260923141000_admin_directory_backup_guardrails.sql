create or replace function public.admin_company_content_summary(p_session_token text)
returns table(
  company_id text,
  dataset_count bigint,
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
    count(s.storage_key) filter (
      where case
        when s.data is null or s.data = 'null'::jsonb then false
        when jsonb_typeof(s.data) = 'array' then jsonb_array_length(s.data) > 0
        when jsonb_typeof(s.data) = 'object' then s.data <> '{}'::jsonb
        else true
      end
    )::bigint as dataset_count,
    coalesce(sum(
      case
        when s.data is null or s.data = 'null'::jsonb then 0
        when jsonb_typeof(s.data) = 'array' then jsonb_array_length(s.data)
        when jsonb_typeof(s.data) = 'object' then case when s.data = '{}'::jsonb then 0 else 1 end
        else 1
      end
    ), 0)::bigint as record_count,
    coalesce(bool_or(
      case
        when s.data is null or s.data = 'null'::jsonb then false
        when jsonb_typeof(s.data) = 'array' then jsonb_array_length(s.data) > 0
        when jsonb_typeof(s.data) = 'object' then s.data <> '{}'::jsonb
        else true
      end
    ), false) as has_content
  from public.companies c
  left join public.app_data_sync s on s.company_id = c.id
  group by c.id
  order by c.id;
end;
$$;
create or replace function public.admin_restore_company_directory(
  p_session_token text,
  p_companies jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_access text;
  v_item jsonb;
  v_id text;
  v_name text;
  v_doc text;
  v_parent text;
  v_address text;
  v_phone text;
  v_existing_doc text;
  v_has_content boolean;
  v_created_ids text[] := array[]::text[];
  v_created jsonb := '[]'::jsonb;
  v_updated jsonb := '[]'::jsonb;
  v_protected jsonb := '[]'::jsonb;
begin
  select access_level into v_access
  from public.app_session_context(p_session_token);

  if v_access is distinct from 'admin' then
    raise exception 'Solo el Administrador General puede restaurar el directorio';
  end if;
  if jsonb_typeof(p_companies) <> 'array' then
    raise exception 'El directorio importado debe ser una lista de empresas';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_companies) item
    where coalesce(item->>'id','') = ''
       or coalesce(item->>'name','') = ''
       or coalesce(item->>'doc','') = ''
  ) then
    raise exception 'El directorio contiene empresas sin ID, nombre o NIT';
  end if;

  if (
    select count(*) from jsonb_array_elements(p_companies)
  ) <> (
    select count(distinct item->>'id') from jsonb_array_elements(p_companies) item
  ) then
    raise exception 'El directorio contiene IDs duplicados';
  end if;

  if exists (
    with recursive edges as (
      select item->>'id' as id, nullif(item->>'parentId','') as parent_id
      from jsonb_array_elements(p_companies) item
    ),
    walk as (
      select id, parent_id, array[id]::text[] as path, false as cycle
      from edges
      union all
      select w.id, e.parent_id, w.path || e.id, e.id = any(w.path)
      from walk w
      join edges e on e.id = w.parent_id
      where w.parent_id is not null and not w.cycle
    )
    select 1 from walk where cycle
  ) then
    raise exception 'El directorio contiene una jerarquía circular';
  end if;

  for v_item in select value from jsonb_array_elements(p_companies)
  loop
    v_id := v_item->>'id';
    v_doc := v_item->>'doc';

    select doc_nit into v_existing_doc
    from public.companies
    where id = v_id;

    if found and coalesce(v_existing_doc,'') <> coalesce(v_doc,'') then
      raise exception 'Conflicto de identidad para la empresa %: el NIT no coincide', v_id;
    end if;
  end loop;
  -- Primera pasada: crear solamente las empresas que no existen.
  -- Se crean sin credenciales y sin datos contables.
  for v_item in select value from jsonb_array_elements(p_companies)
  loop
    v_id := v_item->>'id';
    v_name := v_item->>'name';
    v_doc := v_item->>'doc';
    v_address := coalesce(v_item->>'address','');
    v_phone := coalesce(v_item->>'phone','');

    if not exists(select 1 from public.companies where id = v_id) then
      insert into public.companies(id, parent_id, name, doc_nit, address, phone)
      values (v_id, null, v_name, v_doc, v_address, v_phone);

      v_created_ids := array_append(v_created_ids, v_id);
      v_created := v_created || jsonb_build_array(
        jsonb_build_object('id', v_id, 'name', v_name)
      );
    end if;
  end loop;

  -- Segunda pasada: restaurar jerarquía y datos básicos.
  for v_item in select value from jsonb_array_elements(p_companies)
  loop
    v_id := v_item->>'id';
    v_name := v_item->>'name';
    v_doc := v_item->>'doc';
    v_parent := nullif(v_item->>'parentId','');
    v_address := coalesce(v_item->>'address','');
    v_phone := coalesce(v_item->>'phone','');
    if v_parent = v_id then
      raise exception 'Jerarquía inválida: una empresa no puede depender de sí misma';
    end if;

    if v_parent is not null and not exists(select 1 from public.companies where id = v_parent) then
      raise exception 'Jerarquía inválida: no existe la entidad padre %', v_parent;
    end if;

    if v_id = any(v_created_ids) then
      update public.companies
      set parent_id = v_parent,
          name = v_name,
          doc_nit = v_doc,
          address = v_address,
          phone = v_phone,
          username = null,
          password = null,
          partial_password = null,
          password_hash = null,
          partial_password_hash = null,
          updated_at = now()
      where id = v_id;
      continue;
    end if;

    select exists(
      select 1
      from public.app_data_sync s
      where s.company_id = v_id
        and case
          when s.data is null or s.data = 'null'::jsonb then false
          when jsonb_typeof(s.data) = 'array' then jsonb_array_length(s.data) > 0
          when jsonb_typeof(s.data) = 'object' then s.data <> '{}'::jsonb
          else true
        end
    ) into v_has_content;
    if v_has_content then
      v_protected := v_protected || jsonb_build_array(
        jsonb_build_object('id', v_id, 'name', v_name)
      );
      continue;
    end if;

    update public.companies
    set parent_id = v_parent,
        name = v_name,
        doc_nit = v_doc,
        address = v_address,
        phone = v_phone,
        updated_at = now()
    where id = v_id;

    v_updated := v_updated || jsonb_build_array(
      jsonb_build_object('id', v_id, 'name', v_name)
    );
  end loop;

  -- La importación nunca toca app_data_sync, contraseñas ni empresas ausentes del respaldo.
  return jsonb_build_object(
    'success', true,
    'created', v_created,
    'updated', v_updated,
    'protected', v_protected
  );
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

  if v_access is distinct from 'admin' then
    if p_company_id = v_company
       or not public.app_session_can_access(p_session_token, p_company_id) then
      raise exception 'No se puede eliminar esta entidad';
    end if;
  end if;

  if exists(select 1 from public.companies where parent_id = p_company_id) then
    raise exception 'No se puede eliminar una empresa que tiene subempresas vinculadas';
  end if;
  if exists(
    select 1
    from public.app_data_sync s
    where s.company_id = p_company_id
      and case
        when s.data is null or s.data = 'null'::jsonb then false
        when jsonb_typeof(s.data) = 'array' then jsonb_array_length(s.data) > 0
        when jsonb_typeof(s.data) = 'object' then s.data <> '{}'::jsonb
        else true
      end
  ) then
    raise exception 'No se puede eliminar una empresa que contiene información registrada';
  end if;

  delete from public.companies where id = p_company_id;
  return found;
end;
$$;

revoke execute on function public.admin_company_content_summary(text) from public;
revoke execute on function public.admin_restore_company_directory(text,jsonb) from public;
grant execute on function public.admin_company_content_summary(text) to anon, authenticated;
grant execute on function public.admin_restore_company_directory(text,jsonb) to anon, authenticated;

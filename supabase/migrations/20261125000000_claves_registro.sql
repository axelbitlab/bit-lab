-- =====================================================================
-- Bitlab Terminal · Migración · Generador y Gestión de Claves de Registro
-- Permite a los administradores generar claves con formato BTL-XXXX-XXXX-XXXX
-- para dar de alta nuevos equipos en la organización.
-- =====================================================================

-- 1. Asegurar compatibilidad de columnas en la tabla claves_registro
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='claves_registro' and column_name='nombre') then
    alter table public.claves_registro add column if not exists nombre text;
    update public.claves_registro set nombre = descripcion where nombre is null and descripcion is not null;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='claves_registro' and column_name='descripcion') then
    alter table public.claves_registro add column if not exists descripcion text default 'Instalador';
    update public.claves_registro set descripcion = nombre where descripcion is null and nombre is not null;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='claves_registro' and column_name='max_usos') then
    alter table public.claves_registro add column if not exists max_usos int;
    update public.claves_registro set max_usos = usos_maximos where max_usos is null and usos_maximos is not null;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='claves_registro' and column_name='usos_maximos') then
    alter table public.claves_registro add column if not exists usos_maximos int;
    update public.claves_registro set usos_maximos = max_usos where usos_maximos is null and max_usos is not null;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='claves_registro' and column_name='usos_actuales') then
    alter table public.claves_registro add column if not exists usos_actuales int default 0;
    update public.claves_registro set usos_actuales = usos where usos_actuales is null and usos is not null;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='claves_registro' and column_name='usos') then
    alter table public.claves_registro add column if not exists usos int default 0;
    update public.claves_registro set usos = usos_actuales where usos is null and usos_actuales is not null;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='claves_registro' and column_name='expira_en') then
    alter table public.claves_registro add column if not exists expira_en timestamptz;
    update public.claves_registro set expira_en = vence where expira_en is null and vence is not null;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='claves_registro' and column_name='vence') then
    alter table public.claves_registro add column if not exists vence timestamptz;
    update public.claves_registro set vence = expira_en where vence is null and expira_en is not null;
  end if;
end $$;

-- 2. Función estándar crear_clave_registro (admite p_organizacion opcional y genera BTL-XXXX-XXXX-XXXX)
create or replace function public.crear_clave_registro(
  p_organizacion uuid default null,
  p_descripcion text default 'Instalador',
  p_usos_maximos int default null,
  p_dias_vigencia int default 30
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_org_id uuid := coalesce(p_organizacion, public.mi_organizacion(), (select id from public.organizaciones limit 1));
  v_raw1 text := upper(substr(encode(extensions.gen_random_bytes(3), 'hex'), 1, 4));
  v_raw2 text := upper(substr(encode(extensions.gen_random_bytes(3), 'hex'), 1, 4));
  v_raw3 text := upper(substr(encode(extensions.gen_random_bytes(3), 'hex'), 1, 4));
  v_clave text := 'BTL-' || v_raw1 || '-' || v_raw2 || '-' || v_raw3;
  v_hash text := encode(extensions.digest(v_clave, 'sha256'), 'hex');
  v_vence timestamptz := case when p_dias_vigencia is null or p_dias_vigencia <= 0 then null else now() + make_interval(days => p_dias_vigencia) end;
  v_nombre text := coalesce(btrim(p_descripcion), 'Instalador');
begin
  if auth.uid() is not null and not public.es_administrador() then
    raise exception 'Solo un administrador puede crear claves de registro' using errcode = '42501';
  end if;

  if v_org_id is null then
    select id into v_org_id from public.organizaciones limit 1;
  end if;

  insert into public.claves_registro (
    organizacion_id, descripcion, nombre, clave_hash, usos, usos_actuales,
    usos_maximos, max_usos, vence, expira_en, activa
  )
  values (
    v_org_id, v_nombre, v_nombre, v_hash, 0, 0,
    p_usos_maximos, p_usos_maximos, v_vence, v_vence, true
  );

  return v_clave; -- Devuelve la clave en texto plano para copiarla inmediatamente
end $$;

-- 3. Función RPC admin_generar_clave_registro (devuelve jsonb estructurado)
create or replace function public.admin_generar_clave_registro(
  p_nombre text,
  p_max_usos int default null,
  p_dias_validez int default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_clave text;
  v_expira timestamptz;
begin
  v_clave := public.crear_clave_registro(
    p_organizacion  => null,
    p_descripcion   => p_nombre,
    p_usos_maximos  => p_max_usos,
    p_dias_vigencia => p_dias_validez
  );

  v_expira := case when p_dias_validez is null or p_dias_validez <= 0 then null else now() + make_interval(days => p_dias_validez) end;

  return jsonb_build_object(
    'clave', v_clave,
    'nombre', btrim(p_nombre),
    'max_usos', p_max_usos,
    'expira_en', v_expira,
    'creado', now()
  );
end $$;

-- 4. Función RPC admin_listar_claves_registro
create or replace function public.admin_listar_claves_registro()
returns table(
  id uuid,
  nombre text,
  max_usos int,
  usos_actuales int,
  expira_en timestamptz,
  activa boolean,
  creado timestamptz
)
language sql stable security definer set search_path = '' as $$
  select 
    c.id,
    coalesce(c.nombre, c.descripcion, 'Instalador') as nombre,
    coalesce(c.max_usos, c.usos_maximos) as max_usos,
    coalesce(c.usos_actuales, c.usos, 0) as usos_actuales,
    coalesce(c.expira_en, c.vence) as expira_en,
    coalesce(c.activa, true) as activa,
    c.creado
  from public.claves_registro c
  where (public.es_administrador() or auth.uid() is not null)
    and (c.organizacion_id = public.mi_organizacion() or c.organizacion_id is not null)
  order by c.creado desc;
$$;

-- 5. Función RPC admin_revocar_clave_registro
create or replace function public.admin_revocar_clave_registro(p_clave_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_administrador() then
    raise exception 'Solo administradores pueden revocar claves' using errcode = '42501';
  end if;

  update public.claves_registro
     set activa = false
   where id = p_clave_id
     and (organizacion_id = public.mi_organizacion() or organizacion_id is not null);

  if not found then
    raise exception 'Clave no encontrada';
  end if;
end $$;

-- 6. Permisos de ejecución
grant execute on function public.crear_clave_registro(uuid, text, int, int) to authenticated;
grant execute on function public.crear_clave_registro(uuid, text, int, int) to anon;
grant execute on function public.admin_generar_clave_registro(text, int, int) to authenticated;
grant execute on function public.admin_listar_claves_registro() to authenticated;
grant execute on function public.admin_revocar_clave_registro(uuid) to authenticated;

-- 7. Permisos de tabla y políticas RLS para claves_registro
grant select, insert, update on public.claves_registro to authenticated;
grant select, insert, update on public.claves_registro to anon;

drop policy if exists btl_clave_ver on public.claves_registro;
create policy btl_clave_ver on public.claves_registro for select using (true);

drop policy if exists btl_clave_insert on public.claves_registro;
create policy btl_clave_insert on public.claves_registro for insert with check (true);

drop policy if exists btl_clave_update on public.claves_registro;
create policy btl_clave_update on public.claves_registro for update using (true);

-- 8. Eliminación definitiva de claves de registro por administrador
create or replace function public.admin_eliminar_clave_definitiva(p_clave_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_administrador() then
    raise exception 'Solo administradores pueden eliminar claves de la base de datos' using errcode = '42501';
  end if;

  delete from public.claves_registro
   where id = p_clave_id
     and (organizacion_id = public.mi_organizacion() or organizacion_id is not null);

  if not found then
    delete from public.claves_registro where id = p_clave_id;
  end if;
end $$;

grant execute on function public.admin_eliminar_clave_definitiva(uuid) to authenticated;
grant execute on function public.admin_eliminar_clave_definitiva(uuid) to anon;

grant delete on public.claves_registro to authenticated;
grant delete on public.claves_registro to anon;
drop policy if exists btl_clave_delete on public.claves_registro;
create policy btl_clave_delete on public.claves_registro for delete using (true);

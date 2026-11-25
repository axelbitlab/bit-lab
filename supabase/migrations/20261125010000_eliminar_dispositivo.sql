-- =====================================================================
-- Bitlab Terminal · Migración · Eliminación Completa de Dispositivos
-- Permite a los administradores borrar definitivamente un equipo
-- y todas sus dependencias (historial, credenciales, sesiones) de la base de datos.
-- =====================================================================

create or replace function public.admin_eliminar_dispositivo_completo(p_dispositivo_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_disp record;
  v_ejec_ids bigint[];
begin
  if not public.es_administrador() then
    raise exception 'Solo un administrador puede eliminar dispositivos de la base de datos' using errcode = '42501';
  end if;

  select * into v_disp from public.dispositivos where id = p_dispositivo_id;
  if v_disp.id is null then
    raise exception 'El dispositivo no existe o ya fue eliminado';
  end if;

  -- 1. Obtener IDs de ejecuciones asociadas a este equipo
  select coalesce(array_agg(id), '{}') into v_ejec_ids
    from public.ejecuciones_comandos
   where dispositivo_id = p_dispositivo_id;

  -- 2. Eliminar salidas y fragmentos de ejecuciones
  if array_length(v_ejec_ids, 1) > 0 then
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name='salidas_comandos') then
      delete from public.salidas_comandos where ejecucion_id = any(v_ejec_ids);
    end if;
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name='fragmentos_salida') then
      delete from public.fragmentos_salida where ejecucion_id = any(v_ejec_ids);
    end if;
  end if;

  -- 3. Eliminar tablas accesorias vinculadas
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='auditoria_comandos') then
    delete from public.auditoria_comandos where dispositivo_id = p_dispositivo_id;
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='bloqueos_comandos') then
    delete from public.bloqueos_comandos where dispositivo_id = p_dispositivo_id;
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='comandos_programados') then
    delete from public.comandos_programados where dispositivo_id = p_dispositivo_id;
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='sesiones_terminal') then
    delete from public.sesiones_terminal where dispositivo_id = p_dispositivo_id;
  end if;

  -- 4. Eliminar ejecuciones del dispositivo
  delete from public.ejecuciones_comandos where dispositivo_id = p_dispositivo_id;

  -- 5. Eliminar credenciales criptográficas del dispositivo
  delete from public.credenciales_dispositivos where dispositivo_id = p_dispositivo_id;

  -- 6. Eliminar el dispositivo por completo de la tabla principal
  delete from public.dispositivos where id = p_dispositivo_id;

  return jsonb_build_object(
    'ok', true,
    'id', p_dispositivo_id,
    'nombre', v_disp.nombre,
    'mensaje', 'Dispositivo eliminado por completo de la base de datos'
  );
end $$;

grant execute on function public.admin_eliminar_dispositivo_completo(uuid) to authenticated;

-- Permisos de eliminación directa (respaldo del panel si el RPC de arriba
-- fallara por algo). IMPORTANTE: usaba "using (true)", es decir CUALQUIER
-- usuario autenticado podía borrar CUALQUIER equipo de CUALQUIER
-- organización con un simple delete por REST. Se corrige para exigir
-- exactamente lo mismo que ya exige la función: ser administrador y que
-- el equipo sea de tu propia organización.
grant delete on public.dispositivos to authenticated;
drop policy if exists btl_disp_delete on public.dispositivos;
create policy btl_disp_delete on public.dispositivos for delete to authenticated
  using (public.es_administrador() and public.puede_ver_organizacion(organizacion_id));

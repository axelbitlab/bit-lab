-- =====================================================================
-- Migración: Soporte de apodo / alias para dispositivos
-- Permite asignar un nombre de identificación / apodo sin perder el hostname original.
-- =====================================================================

-- 1. Agregar columna apodo si no existe
alter table public.dispositivos
  add column if not exists apodo text;

-- 2. Asegurar que los usuarios autenticados puedan actualizar el apodo y nombre de sus dispositivos
grant update (apodo, nombre) on public.dispositivos to authenticated;

-- 3. Crear política de actualización si no existe
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
      and tablename = 'dispositivos' 
      and policyname = 'btl_disp_mod'
  ) then
    create policy btl_disp_mod on public.dispositivos
      for update to authenticated
      using (public.puede_ver_organizacion(organizacion_id))
      with check (public.puede_ver_organizacion(organizacion_id));
  end if;
end $$;

-- 4. Notificar recarga del esquema
notify pgrst, 'reload schema';


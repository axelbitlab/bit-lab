-- =====================================================================
-- Migración: Gestión completa de categorías de comandos (CRUD abierto)
-- Permite listar, crear, editar y eliminar categorías de comandos con color e icono.
-- =====================================================================

-- 1. Asegurar columnas descripcion, color, icono, orden en categorias_comandos
alter table public.categorias_comandos
  add column if not exists descripcion text,
  add column if not exists color text default '#06b6d4',
  add column if not exists icono text default 'tag',
  add column if not exists orden int not null default 0;

-- 2. Conceder permisos de lectura y escritura a authenticated
grant select, insert, update, delete on public.categorias_comandos to authenticated;

-- 3. Políticas RLS para categorias_comandos (lectura pública y CRUD para autenticados)
drop policy if exists btl_cat_ver on public.categorias_comandos;
create policy btl_cat_ver on public.categorias_comandos
  for select to authenticated using (true);

drop policy if exists btl_cat_mod on public.categorias_comandos;
create policy btl_cat_mod on public.categorias_comandos
  for all to authenticated using (true) with check (true);

-- 4. Semilla de categorías base con colores e iconos idénticos al diseño
insert into public.categorias_comandos (nombre, descripcion, color, icono, orden)
values
  ('Diagnóstico',    'Comandos de diagnóstico y estado general',  '#00f59b', 'activity', 10),
  ('Red',            'Conectividad y diagnóstico de red',         '#06b6d4', 'wifi',     20),
  ('Servicios',      'Gestión de servicios y colas de impresión', '#3b82f6', 'cpu',      30),
  ('Mantenimiento',  'Limpieza, temporales y mantenimiento',      '#8b5cf6', 'wrench',   40),
  ('Seguridad',      'Auditoría y verificación de seguridad',     '#10b981', 'lock',     50),
  ('Disco',          'Gestión y análisis de almacenamiento',      '#f59e0b', 'hdd',      60)
on conflict (nombre) do update set
  color = excluded.color,
  icono = excluded.icono,
  orden = excluded.orden;

-- 5. Notificar recarga del esquema
notify pgrst, 'reload schema';


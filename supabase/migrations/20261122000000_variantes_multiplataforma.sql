-- =====================================================================
-- Bitlab Terminal · BTL-200: Comandos multiplataforma con variantes
-- Agrega columna variantes JSONB a la tabla comandos.
-- Permite tener un script distinto por SO en un solo registro.
--
-- Formato de variantes:
--   {
--     "windows": "...",   -- PowerShell / cmd
--     "macos":   "...",   -- bash / zsh
--     "linux":   "..."    -- bash
--   }
--
-- Al ejecutar, el backend/frontend selecciona la clave que corresponde
-- al dispositivo.sistema. Si no hay variante para ese SO, se usa script.
-- =====================================================================

alter table public.comandos
  add column if not exists variantes jsonb default null;

comment on column public.comandos.variantes is
  'Scripts alternativos por SO. Claves: windows, macos, linux. '
  'Si existe la clave para el SO del dispositivo, se usa en lugar de script.';

-- Índice para búsqueda (opcional, útil si se filtran por SO en el futuro)
create index if not exists idx_comandos_variantes
  on public.comandos using gin (variantes)
  where variantes is not null;

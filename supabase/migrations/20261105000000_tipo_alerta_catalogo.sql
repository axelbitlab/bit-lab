-- ========================================================================
-- Bitlab Terminal · Migración 20261105000000
-- Agrega tipo_alerta a comandos y funciones de CRUD del catálogo
-- ========================================================================

-- ▓▓▓▓▓  1. Columna tipo_alerta en comandos  ▓▓▓▓▓
ALTER TABLE public.comandos
  ADD COLUMN IF NOT EXISTS tipo_alerta text DEFAULT NULL;

COMMENT ON COLUMN public.comandos.tipo_alerta IS
  'Tipo de alerta al que responde este comando (disco, cpu, memoria, red, impresora, proceso, etc.)';

-- Índice para filtrar por tipo_alerta rápidamente
CREATE INDEX IF NOT EXISTS comandos_tipo_alerta_idx
  ON public.comandos (tipo_alerta)
  WHERE tipo_alerta IS NOT NULL;

-- ▓▓▓▓▓  2. Columna actualizado en comandos (si no existe)  ▓▓▓▓▓
ALTER TABLE public.comandos
  ADD COLUMN IF NOT EXISTS actualizado timestamptz DEFAULT now();

-- ▓▓▓▓▓  3. Categorías semilla  ▓▓▓▓▓
INSERT INTO public.categorias_comandos (nombre, descripcion, color, icono, orden)
VALUES
  ('Diagnóstico',    'Comandos de diagnóstico general',          '#6366f1', 'activity', 10),
  ('Disco',          'Gestión y análisis de discos',              '#f59e0b', 'hdd',      20),
  ('Red',            'Conectividad y diagnóstico de red',         '#06b6d4', 'wifi',     30),
  ('Procesos',       'Gestión de procesos y servicios',           '#8b5cf6', 'cpu',      40),
  ('Impresoras',     'Gestión de impresoras y colas',             '#10b981', 'print',    50),
  ('Sistema',        'Información y configuración del sistema',   '#3b82f6', 'shield',   60),
  ('Mantenimiento',  'Limpieza, actualizaciones y mantenimiento', '#ef4444', 'wrench',   70)
ON CONFLICT DO NOTHING;

-- ▓▓▓▓▓  4. Función crear_comando  ▓▓▓▓▓
CREATE OR REPLACE FUNCTION public.crear_comando(
  p_nombre         text,
  p_descripcion    text        DEFAULT NULL,
  p_categoria_id   bigint      DEFAULT NULL,
  p_sistema        text        DEFAULT 'todos',
  p_script         text        DEFAULT '',
  p_interprete     text        DEFAULT 'automatico',
  p_destructivo    boolean     DEFAULT false,
  p_requiere_admin boolean     DEFAULT false,
  p_timeout_seg    int         DEFAULT 30,
  p_tipo_alerta    text        DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol text;
  v_id  bigint;
BEGIN
  SELECT rol INTO v_rol FROM public.perfiles WHERE id = auth.uid();
  IF v_rol IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Solo los administradores pueden crear comandos';
  END IF;

  INSERT INTO public.comandos
    (nombre, descripcion, categoria_id, sistema, script, interprete,
     destructivo, requiere_admin, timeout_seg, tipo_alerta, activo, creado_por)
  VALUES
    (p_nombre, p_descripcion, p_categoria_id, p_sistema, p_script, p_interprete,
     p_destructivo, p_requiere_admin, p_timeout_seg, p_tipo_alerta, true, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_comando TO authenticated;

-- ▓▓▓▓▓  5. Función actualizar_comando  ▓▓▓▓▓
CREATE OR REPLACE FUNCTION public.actualizar_comando(
  p_id             bigint,
  p_nombre         text,
  p_descripcion    text        DEFAULT NULL,
  p_categoria_id   bigint      DEFAULT NULL,
  p_sistema        text        DEFAULT 'todos',
  p_script         text        DEFAULT '',
  p_interprete     text        DEFAULT 'automatico',
  p_destructivo    boolean     DEFAULT false,
  p_requiere_admin boolean     DEFAULT false,
  p_timeout_seg    int         DEFAULT 30,
  p_tipo_alerta    text        DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol text;
BEGIN
  SELECT rol INTO v_rol FROM public.perfiles WHERE id = auth.uid();
  IF v_rol IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Solo los administradores pueden editar comandos';
  END IF;

  UPDATE public.comandos SET
    nombre         = p_nombre,
    descripcion    = p_descripcion,
    categoria_id   = p_categoria_id,
    sistema        = p_sistema,
    script         = p_script,
    interprete     = p_interprete,
    destructivo    = p_destructivo,
    requiere_admin = p_requiere_admin,
    timeout_seg    = p_timeout_seg,
    tipo_alerta    = p_tipo_alerta,
    actualizado    = now()
  WHERE id = p_id AND activo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Comando % no encontrado o inactivo', p_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.actualizar_comando TO authenticated;

-- ▓▓▓▓▓  6. Función eliminar_comando (lógica)  ▓▓▓▓▓
CREATE OR REPLACE FUNCTION public.eliminar_comando(p_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol text;
BEGIN
  SELECT rol INTO v_rol FROM public.perfiles WHERE id = auth.uid();
  IF v_rol IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Solo los administradores pueden eliminar comandos';
  END IF;

  UPDATE public.comandos SET activo = false, actualizado = now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Comando % no encontrado', p_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.eliminar_comando TO authenticated;

-- ▓▓▓▓▓  7. Función duplicar_comando  ▓▓▓▓▓
CREATE OR REPLACE FUNCTION public.duplicar_comando(p_id bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol text;
  v_nuevo bigint;
BEGIN
  SELECT rol INTO v_rol FROM public.perfiles WHERE id = auth.uid();
  IF v_rol IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Solo los administradores pueden duplicar comandos';
  END IF;

  INSERT INTO public.comandos
    (nombre, descripcion, categoria_id, sistema, script, interprete,
     destructivo, requiere_admin, timeout_seg, tipo_alerta, activo, creado_por)
  SELECT
    nombre || ' (copia)', descripcion, categoria_id, sistema, script, interprete,
    destructivo, requiere_admin, timeout_seg, tipo_alerta, true, auth.uid()
  FROM public.comandos
  WHERE id = p_id AND activo = true
  RETURNING id INTO v_nuevo;

  IF v_nuevo IS NULL THEN
    RAISE EXCEPTION 'Comando % no encontrado o inactivo', p_id;
  END IF;

  RETURN v_nuevo;
END;
$$;

GRANT EXECUTE ON FUNCTION public.duplicar_comando TO authenticated;

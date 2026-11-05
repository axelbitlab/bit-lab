-- ============================================================================
-- Bitlab Terminal · Migración 20261105030000
-- Corrige las funciones RPC del catálogo de comandos:
--   · Tabla correcta: perfiles_usuarios (no perfiles)
--   · Columna correcta: usuario_id (no id)
--   · Abre CRUD a cualquier usuario autenticado (no solo admin)
-- ============================================================================

-- Asegura la columna tipo_alerta (idempotente)
ALTER TABLE public.comandos
  ADD COLUMN IF NOT EXISTS tipo_alerta text DEFAULT NULL;

ALTER TABLE public.comandos
  ADD COLUMN IF NOT EXISTS actualizado timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS comandos_tipo_alerta_idx
  ON public.comandos (tipo_alerta)
  WHERE tipo_alerta IS NOT NULL;

-- Semilla de categorías (idempotente)
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

-- ▓▓▓▓▓  crear_comando (sin check de rol)  ▓▓▓▓▓
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
  v_id  bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debe iniciar sesión para crear comandos';
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

-- ▓▓▓▓▓  actualizar_comando (sin check de rol)  ▓▓▓▓▓
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debe iniciar sesión para editar comandos';
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

-- ▓▓▓▓▓  eliminar_comando (lógico, sin check de rol)  ▓▓▓▓▓
CREATE OR REPLACE FUNCTION public.eliminar_comando(p_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debe iniciar sesión para eliminar comandos';
  END IF;

  UPDATE public.comandos SET activo = false, actualizado = now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Comando % no encontrado', p_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.eliminar_comando TO authenticated;

-- ▓▓▓▓▓  duplicar_comando (sin check de rol)  ▓▓▓▓▓
CREATE OR REPLACE FUNCTION public.duplicar_comando(p_id bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nuevo bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debe iniciar sesión para duplicar comandos';
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

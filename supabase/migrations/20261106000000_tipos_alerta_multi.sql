-- ============================================================================
-- Bitlab Terminal · Migración 20261106000000
-- Clasificación multi-categoría de comandos: tipo_alerta (texto) pasa a
-- tipos_alerta (text[]) para que un mismo comando sirva a varias alertas.
-- Mantiene compatibilidad con la columna tipo_alerta (sincronizada vía
-- trigger) para que las versiones viejas del panel sigan leyendo bien.
-- ============================================================================

-- ▓▓▓▓▓  1. Columna tipos_alerta (array)  ▓▓▓▓▓
ALTER TABLE public.comandos
  ADD COLUMN IF NOT EXISTS tipos_alerta text[] DEFAULT '{}';

-- Backfill: migrar lo que venga en tipo_alerta al array.
UPDATE public.comandos
   SET tipos_alerta = ARRAY[tipo_alerta]
 WHERE tipo_alerta IS NOT NULL
   AND (tipos_alerta IS NULL OR cardinality(tipos_alerta) = 0);

-- Normalizar: nunca null, siempre array.
UPDATE public.comandos SET tipos_alerta = '{}' WHERE tipos_alerta IS NULL;
ALTER TABLE public.comandos ALTER COLUMN tipos_alerta SET DEFAULT '{}';
ALTER TABLE public.comandos ALTER COLUMN tipos_alerta SET NOT NULL;

-- Índice GIN para filtrar por cualquier elemento del array rápidamente.
CREATE INDEX IF NOT EXISTS comandos_tipos_alerta_idx
  ON public.comandos USING GIN (tipos_alerta);

COMMENT ON COLUMN public.comandos.tipos_alerta IS
  'Tipos de alerta a los que responde el comando. Un comando puede servir a varias alertas a la vez (ej: procesos que consumen CPU: {cpu, proceso}).';

-- ▓▓▓▓▓  2. Mantener tipo_alerta como campo legacy sincronizado  ▓▓▓▓▓
-- El trigger asegura que tipo_alerta siempre refleje el primer elemento
-- del array, para que clientes viejos que lean sólo esa columna sigan
-- funcionando sin cambios.
CREATE OR REPLACE FUNCTION public._comandos_sync_tipo_alerta()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tipos_alerta IS NOT NULL AND cardinality(NEW.tipos_alerta) > 0 THEN
    NEW.tipo_alerta := NEW.tipos_alerta[1];
  ELSE
    NEW.tipo_alerta := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comandos_sync_tipo_alerta ON public.comandos;
CREATE TRIGGER comandos_sync_tipo_alerta
BEFORE INSERT OR UPDATE OF tipos_alerta ON public.comandos
FOR EACH ROW EXECUTE FUNCTION public._comandos_sync_tipo_alerta();

-- Sincronizar inmediatamente lo existente.
UPDATE public.comandos SET tipos_alerta = tipos_alerta;

-- ▓▓▓▓▓  3. Funciones RPC actualizadas con tipos_alerta  ▓▓▓▓▓
-- crear_comando
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
  p_tipo_alerta    text        DEFAULT NULL,   -- compat
  p_tipos_alerta   text[]      DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id    bigint;
  v_tipos text[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debe iniciar sesión para crear comandos';
  END IF;

  -- Resolver el array final: prefiere p_tipos_alerta, cae a [p_tipo_alerta]
  v_tipos := COALESCE(p_tipos_alerta,
                      CASE WHEN p_tipo_alerta IS NOT NULL
                           THEN ARRAY[p_tipo_alerta] ELSE '{}'::text[] END);

  INSERT INTO public.comandos
    (nombre, descripcion, categoria_id, sistema, script, interprete,
     destructivo, requiere_admin, timeout_seg, tipos_alerta, activo, creado_por)
  VALUES
    (p_nombre, p_descripcion, p_categoria_id, p_sistema, p_script, p_interprete,
     p_destructivo, p_requiere_admin, p_timeout_seg, v_tipos, true, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_comando TO authenticated;

-- actualizar_comando
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
  p_tipo_alerta    text        DEFAULT NULL,   -- compat
  p_tipos_alerta   text[]      DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipos text[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debe iniciar sesión para editar comandos';
  END IF;

  v_tipos := COALESCE(p_tipos_alerta,
                      CASE WHEN p_tipo_alerta IS NOT NULL
                           THEN ARRAY[p_tipo_alerta] ELSE '{}'::text[] END);

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
    tipos_alerta   = v_tipos,
    actualizado    = now()
  WHERE id = p_id AND activo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Comando % no encontrado o inactivo', p_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.actualizar_comando TO authenticated;

-- duplicar_comando (se mantiene igual, arrastra tipos_alerta vía SELECT)
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
     destructivo, requiere_admin, timeout_seg, tipos_alerta, activo, creado_por)
  SELECT
    nombre || ' (copia)', descripcion, categoria_id, sistema, script, interprete,
    destructivo, requiere_admin, timeout_seg, tipos_alerta, true, auth.uid()
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

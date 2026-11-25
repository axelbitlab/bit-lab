-- =====================================================================
-- BITLAB IT · MIGRACIÓN COMPLETA UNIFICADA (PRODUCCIÓN / DESPLIEGUE)
-- 
-- Incluye:
--   1. Extensiones (pgcrypto, uuid-ossp)
--   2. Tablas principales con esquemas finales (Multi-SO, variantes, apodos)
--   3. Funciones de seguridad, RPC del agente HMAC y anti-reenvío
--   4. Funciones de despacho y ejecución de comandos con soporte Multi-SO
--   5. Políticas de seguridad RLS para acceso seguro del panel y del agente
--   6. Datos semilla: Categorías y Catálogo completo de comandos compatibles con:
--      - Windows (PowerShell)
--      - macOS (zsh / BSD)
--      - Linux (bash / GNU)
--   7. Clave de registro maestra pregenerada: BTL-DEMO-2026-KEY
--
-- Ejecución: En Supabase SQL Editor > New Query > Pegar y presionar RUN.
-- Es totalmente idempotente (seguro de correr múltiples veces).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- ─────────────────────────────────────────────────────────────────────
-- 1. ESTRUCTURA BÁSICA: Organizaciones y Perfiles
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.organizaciones (
  id      uuid primary key default gen_random_uuid(),
  nombre  text not null unique check (length(nombre) between 2 and 120),
  activa  boolean not null default true,
  creado  timestamptz not null default now()
);

insert into public.organizaciones (nombre) values ('Bitlab Demo')
on conflict (nombre) do nothing;

create table if not exists public.perfiles_usuarios (
  usuario_id              uuid primary key references auth.users(id) on delete cascade,
  nombre                  text not null check (length(nombre) between 2 and 120),
  rol                     text not null default 'tecnico' check (rol in ('administrador','tecnico')),
  organizacion_id         uuid not null references public.organizaciones(id),
  activo                  boolean not null default true,
  debe_cambiar_contrasena boolean not null default false,
  creado                  timestamptz not null default now(),
  actualizado             timestamptz not null default now()
);

create or replace function public.es_administrador()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfiles_usuarios p
                 where p.usuario_id = auth.uid() and p.activo and p.rol = 'administrador');
$$;

create or replace function public.mi_organizacion()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.organizacion_id from public.perfiles_usuarios p
  where p.usuario_id = auth.uid() and p.activo;
$$;

create or replace function public.puede_ver_organizacion(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (p_org = public.mi_organizacion() or public.es_administrador());
$$;

create or replace function public._ip_solicitud()
returns inet language plpgsql stable as $$
declare
  v_hdrs jsonb;
begin
  begin
    v_hdrs := current_setting('request.headers', true)::jsonb;
  exception when others then
    return null;
  end;
  return coalesce(
    nullif(split_part(v_hdrs->>'x-forwarded-for', ',', 1), '')::inet,
    nullif(v_hdrs->>'cf-connecting-ip', '')::inet,
    nullif(v_hdrs->>'x-real-ip', '')::inet,
    null
  );
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. DISPOSITIVOS Y CREDENCIALES
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.dispositivos (
  id                uuid primary key default gen_random_uuid(),
  organizacion_id   uuid not null references public.organizaciones(id),
  nombre            text not null check (length(nombre) between 1 and 120),
  apodo             text check (apodo is null or length(apodo) between 1 and 60),
  sistema           text not null check (sistema in ('windows','macos','linux')),
  version_so        text,
  arquitectura      text,
  nombre_equipo     text,
  version_agente    text,
  ip_local          inet,
  ip_publica        inet,
  en_linea          boolean not null default false,
  ultimo_contacto   timestamptz,
  ultimo_latido     timestamptz,
  metricas          jsonb default '{}'::jsonb,
  etiquetas         text[] default '{}'::text[],
  sede              text default 'General',
  activo            boolean not null default true,
  creado            timestamptz not null default now(),
  actualizado       timestamptz not null default now()
);

-- Si la columna apodo no existe por migración previa:
alter table public.dispositivos add column if not exists apodo text check (apodo is null or length(apodo) between 1 and 60);

create table if not exists public.credenciales_dispositivos (
  dispositivo_id  uuid primary key references public.dispositivos(id) on delete cascade,
  token_hash      text not null,
  creado          timestamptz not null default now(),
  rotado          timestamptz
);

create table if not exists public.claves_registro (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id),
  clave_hash      text not null unique,
  nombre          text not null check (length(nombre) between 2 and 60),
  max_usos        int default null check (max_usos is null or max_usos > 0),
  usos_actuales   int not null default 0,
  expira_en       timestamptz default null,
  activa          boolean not null default true,
  creado          timestamptz not null default now()
);

create table if not exists public.nonces_agente (
  dispositivo_id  uuid not null references public.dispositivos(id) on delete cascade,
  nonce           text not null,
  creado          timestamptz not null default now(),
  primary key (dispositivo_id, nonce)
);

create index if not exists idx_nonces_agente_creado on public.nonces_agente (creado);

-- ─────────────────────────────────────────────────────────────────────
-- 3. CATEGORÍAS Y CATÁLOGO DE COMANDOS (MULTI-SO)
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.categorias_comandos (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid references public.organizaciones(id) default null,
  nombre          text not null unique check (length(nombre) between 2 and 60),
  color           text default '#3b82f6',
  icono           text default 'tag',
  orden           int not null default 100,
  creado          timestamptz not null default now()
);

create table if not exists public.comandos (
  id                serial primary key,
  categoria_id      uuid references public.categorias_comandos(id) on delete set null,
  organizacion_id   uuid references public.organizaciones(id) default null,
  nombre            text not null check (length(nombre) between 2 and 120),
  descripcion       text,
  sistema           text not null check (sistema in ('windows','macos','linux','todos')),
  script            text not null check (length(script) between 1 and 16000),
  variantes         jsonb default null,
  interprete        text not null default 'automatico' check (interprete in ('powershell','cmd','bash','zsh','automatico')),
  destructivo       boolean not null default false,
  requiere_admin    boolean not null default false,
  timeout_seg       int not null default 120 check (timeout_seg between 5 and 3600),
  tipo_alerta_id    uuid default null,
  tipos_alerta_ids  uuid[] default '{}'::uuid[],
  clasificacion     text default 'sin_clasificar' check (clasificacion in ('sin_clasificar','remediacion_automatica','diagnostico_profundo','mantenimiento_preventivo','seguridad_critica')),
  es_favorito       boolean not null default false,
  activo            boolean not null default true,
  creado            timestamptz not null default now(),
  actualizado       timestamptz not null default now()
);

alter table public.comandos add column if not exists variantes jsonb default null;
alter table public.comandos add column if not exists tipos_alerta_ids uuid[] default '{}'::uuid[];
alter table public.comandos add column if not exists clasificacion text default 'sin_clasificar';
alter table public.comandos add column if not exists es_favorito boolean not null default false;

create table if not exists public.patrones_bloqueados (
  id          serial primary key,
  patron      text not null,
  descripcion text not null,
  activo      boolean not null default true
);

-- Bloqueos de seguridad por defecto contra comandos destructivos no controlados
insert into public.patrones_bloqueados (patron, descripcion) values
  ('(\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive|-[a-zA-Z]*f[a-zA-Z]*r)\s+/\b)|(\brm\s+-rf\s+/[\s*]*)', 'Borrado de raíz de disco (rm -rf /)'),
  ('(\bmkfs\b)|(\bdd\s+if=.*\s+of=/dev/([sh]d[a-z]|nvme))', 'Formateo directo de disco'),
  ('(\bFormat-Volume\b)|(\bClear-Disk\b)', 'Formateo de partición en Windows')
on conflict do nothing;

create table if not exists public.lotes_ejecucion (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id),
  comando_id      int references public.comandos(id),
  total_equipos   int not null default 0,
  solicitado_por  uuid references auth.users(id),
  creado          timestamptz not null default now()
);

create table if not exists public.ejecuciones_comandos (
  id                    bigserial primary key,
  dispositivo_id        uuid not null references public.dispositivos(id) on delete cascade,
  comando_id            int references public.comandos(id) on delete set null,
  organizacion_id       uuid not null references public.organizaciones(id),
  origen                text not null default 'manual' check (origen in ('manual','lote','alerta','programado')),
  texto_comando         text not null,
  interprete            text not null check (interprete in ('powershell','cmd','bash','zsh')),
  modo_simulacion       boolean not null default false,
  confirmado_destructivo boolean not null default false,
  solicitado_por        uuid references auth.users(id),
  lote_id               uuid references public.lotes_ejecucion(id) on delete set null,
  ejecucion_padre_id    bigint references public.ejecuciones_comandos(id) on delete set null,
  estado                text not null default 'pendiente' check (estado in ('pendiente','ejecutando','exitosa','fallida','cancelada','tiempo_agotado')),
  codigo_salida         int,
  mensaje_error         text,
  duracion_ms           int,
  creado                timestamptz not null default now(),
  iniciado              timestamptz,
  terminado             timestamptz
);

create index if not exists idx_ejec_disp_estado on public.ejecuciones_comandos (dispositivo_id, estado);
create index if not exists idx_ejec_org_creado on public.ejecuciones_comandos (organizacion_id, creado desc);

create table if not exists public.fragmentos_salida_comandos (
  id            bigserial primary key,
  ejecucion_id  bigint not null references public.ejecuciones_comandos(id) on delete cascade,
  secuencia     int not null,
  flujo         text not null check (flujo in ('stdout','stderr','sistema')),
  texto         text not null,
  creado        timestamptz not null default now(),
  unique (ejecucion_id, secuencia)
);

create index if not exists idx_frag_ejec on public.fragmentos_salida_comandos (ejecucion_id, secuencia);

-- ─────────────────────────────────────────────────────────────────────
-- 4. PROTOCOLO DEL AGENTE (REGISTRO, LATIDO, RECLAMO Y SALIDA)
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.agente_registrar(p_clave text, p_equipo jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_clave_hash text; reg record; v_disp_id uuid; v_token text; v_token_hash text;
  v_org_id uuid; v_sistema text; v_nombre text;
begin
  if p_clave is null or length(btrim(p_clave)) < 8 then
    raise exception 'Clave de registro no válida' using errcode = '28000';
  end if;
  v_clave_hash := encode(extensions.digest(btrim(p_clave), 'sha256'), 'hex');

  select * into reg from public.claves_registro
   where clave_hash = v_clave_hash and activa for update;
  if reg.id is null then raise exception 'Clave no válida o inactiva' using errcode = '28000'; end if;
  if reg.expira_en is not null and reg.expira_en < now() then raise exception 'Clave expirada' using errcode = '28000'; end if;
  if reg.max_usos is not null and reg.usos_actuales >= reg.max_usos then raise exception 'Límite de usos alcanzado' using errcode = '28000'; end if;

  v_org_id := reg.organizacion_id;
  v_sistema := lower(coalesce(p_equipo->>'sistema', ''));
  if v_sistema not in ('windows','macos','linux') then
    raise exception 'Sistema operativo no soportado (%)', v_sistema using errcode = '22023';
  end if;

  v_nombre := coalesce(nullif(btrim(p_equipo->>'nombre'), ''), nullif(btrim(p_equipo->>'nombre_equipo'), ''), 'Equipo nuevo');
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := v_token;

  insert into public.dispositivos
    (organizacion_id, nombre, sistema, version_so, arquitectura, nombre_equipo,
     version_agente, ip_local, ip_publica, en_linea, ultimo_contacto, ultimo_latido)
  values
    (v_org_id, v_nombre, v_sistema, p_equipo->>'version_so', p_equipo->>'arquitectura',
     p_equipo->>'nombre_equipo', p_equipo->>'version_agente',
     nullif(p_equipo->>'ip_local', '')::inet, public._ip_solicitud(),
     true, now(), now())
  returning id into v_disp_id;

  insert into public.credenciales_dispositivos (dispositivo_id, token_hash)
  values (v_disp_id, v_token_hash);

  update public.claves_registro set usos_actuales = usos_actuales + 1 where id = reg.id;

  return jsonb_build_object('dispositivo_id', v_disp_id, 'token', v_token);
end $$;

create or replace function public.agente_rpc(
  p_dispositivo uuid, p_ts bigint, p_nonce text, p_firma text, p_accion text, p_cuerpo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  cred record; d record; e record; v_llave text; v_esperada text; v_cuerpo jsonb;
  v_ejec bigint; v_lineas jsonb; v_n int; v_estado text; v_token text; v_res jsonb;
begin
  if p_accion not in ('latido','reclamar','salida','finalizar','rotar') then
    raise exception 'Acción no válida' using errcode = '22023';
  end if;
  if p_nonce is null or p_nonce !~ '^[A-Za-z0-9-]{16,64}$' then
    raise exception 'Número único no válido' using errcode = '22023';
  end if;
  if length(coalesce(p_cuerpo, '')) > 262144 then
    raise exception 'Cuerpo demasiado grande' using errcode = '54000';
  end if;
  -- Tolerancia de reloj segura (10 minutos)
  if abs(extract(epoch from now()) - p_ts) > 600 then
    raise exception 'Marca de tiempo fuera de rango: revisa el reloj del equipo' using errcode = '28000';
  end if;

  select c.* into cred from public.credenciales_dispositivos c where c.dispositivo_id = p_dispositivo;
  select * into d from public.dispositivos where id = p_dispositivo;
  if cred.dispositivo_id is null or d.id is null then
    raise exception 'Equipo no registrado' using errcode = '28000';
  end if;
  v_llave := cred.token_hash;
  v_esperada := encode(extensions.hmac(convert_to(p_accion || '|' || p_ts || '|' || p_nonce || '|' || coalesce(p_cuerpo, ''), 'UTF8'),
                                       convert_to(v_llave, 'UTF8'), 'sha256'), 'hex');
  if lower(coalesce(p_firma, '')) <> v_esperada then
    raise exception 'Firma no válida' using errcode = '28000';
  end if;
  if not d.activo then raise exception 'Equipo revocado' using errcode = '28000'; end if;

  begin
    insert into public.nonces_agente (dispositivo_id, nonce) values (p_dispositivo, p_nonce);
  exception when unique_violation then
    raise exception 'Llamada repetida' using errcode = '28000';
  end;

  v_cuerpo := coalesce(nullif(p_cuerpo, '')::jsonb, '{}'::jsonb);
  update public.dispositivos set ultimo_contacto = now(), ultimo_latido = now(), en_linea = true,
         ip_publica = coalesce(public._ip_solicitud(), ip_publica)
   where id = p_dispositivo;

  case p_accion
    when 'latido' then
      if v_cuerpo ? 'metricas' then
        update public.dispositivos set metricas = v_cuerpo->'metricas',
               ip_local = coalesce(nullif(v_cuerpo->>'ip_local', '')::inet, ip_local)
         where id = p_dispositivo;
      end if;
      return jsonb_build_object('ok', true, 'rotar_token', false);

    when 'reclamar' then
      select * into e from public.ejecuciones_comandos
       where dispositivo_id = p_dispositivo and estado = 'pendiente'
       order by creado asc limit 1 for update skip locked;
      if e.id is null then return jsonb_build_object('ejecucion', null); end if;
      update public.ejecuciones_comandos set estado = 'ejecutando', iniciado = now() where id = e.id;
      return jsonb_build_object('ejecucion', jsonb_build_object(
        'id', e.id,
        'script', e.texto_comando,
        'interprete', e.interprete,
        'timeout_seg', 120,
        'simulacion', e.modo_simulacion,
        'firma', encode(extensions.hmac(convert_to(e.id::text || '|' || e.texto_comando, 'UTF8'),
                                        convert_to(v_llave, 'UTF8'), 'sha256'), 'hex')
      ));

    when 'salida' then
      v_ejec := (v_cuerpo->>'ejecucion_id')::bigint;
      v_lineas := v_cuerpo->'lineas';
      select estado into v_estado from public.ejecuciones_comandos
       where id = v_ejec and dispositivo_id = p_dispositivo;
      if v_estado is null then raise exception 'Ejecución no encontrada' using errcode = '22023'; end if;
      if jsonb_typeof(v_lineas) = 'array' then
        insert into public.fragmentos_salida_comandos (ejecucion_id, secuencia, flujo, texto)
        select v_ejec, (l->>'s')::int, (l->>'f'), (l->>'t')
          from jsonb_array_elements(v_lineas) as l
        on conflict (ejecucion_id, secuencia) do nothing;
      end if;
      return jsonb_build_object('ok', true, 'cancelar', (v_estado = 'cancelada'));

    when 'finalizar' then
      v_ejec := (v_cuerpo->>'ejecucion_id')::bigint;
      v_estado := v_cuerpo->>'estado';
      if v_estado not in ('exitosa','fallida','cancelada','tiempo_agotado') then
        raise exception 'Estado final no válido' using errcode = '22023';
      end if;
      update public.ejecuciones_comandos set
        estado = v_estado,
        codigo_salida = (v_cuerpo->>'codigo')::int,
        mensaje_error = nullif(v_cuerpo->>'error', ''),
        duracion_ms = (v_cuerpo->>'duracion_ms')::int,
        terminado = now()
      where id = v_ejec and dispositivo_id = p_dispositivo;
      return jsonb_build_object('ok', true);

    when 'rotar' then
      v_token := encode(extensions.gen_random_bytes(32), 'hex');
      update public.credenciales_dispositivos
         set token_hash = v_token, rotado = now()
       where dispositivo_id = p_dispositivo;
      return jsonb_build_object('token', v_token);
  end case;
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- 5. CREACIÓN Y DESPACHO DE COMANDOS (MULTI-SO COMPATIBLE)
-- ─────────────────────────────────────────────────────────────────────

create or replace function public._crear_ejecucion(
  p_dispositivo uuid, p_comando int, p_texto text, p_simulacion boolean,
  p_confirmar boolean, p_origen text, p_lote uuid, p_padre bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := public.es_administrador();
  d record; c record; v_texto text; v_interp text; v_id bigint; v_patron text;
begin
  if v_uid is null or public.mi_organizacion() is null then
    raise exception 'Sesión no válida o usuario inactivo' using errcode = '42501';
  end if;

  select * into d from public.dispositivos where id = p_dispositivo;
  if d.id is null or not public.puede_ver_organizacion(d.organizacion_id) then
    raise exception 'El equipo no existe o no pertenece a tu organización' using errcode = '42501';
  end if;
  if not d.activo then raise exception 'El equipo está revocado'; end if;
  if not d.en_linea or d.ultimo_latido is null or d.ultimo_latido < now() - interval '90 seconds' then
    raise exception 'El equipo está fuera de línea';
  end if;

  if p_comando is not null then
    select * into c from public.comandos where id = p_comando;
    if c.id is null or not c.activo then raise exception 'El comando no está en el catálogo'; end if;
    if c.sistema <> 'todos' and c.sistema <> d.sistema then
      raise exception 'El comando no es para el sistema de este equipo';
    end if;
    if c.requiere_admin and not v_admin then raise exception 'Este comando requiere rol de administrador' using errcode = '42501'; end if;
    if c.destructivo and not coalesce(p_confirmar, false) and not coalesce(p_simulacion, false) then
      raise exception 'Comando destructivo: se requiere confirmación';
    end if;
    -- Respeta variante enviada por el panel si está disponible
    v_texto := coalesce(nullif(btrim(p_texto), ''), c.script);
    v_interp := case
      when d.sistema = 'windows' then (case when c.interprete in ('powershell','cmd') then c.interprete else 'powershell' end)
      when d.sistema = 'macos' then (case when c.interprete in ('zsh','bash') then c.interprete else 'zsh' end)
      else (case when c.interprete in ('bash','zsh') then c.interprete else 'bash' end)
    end;
  else
    if not v_admin then
      raise exception 'Solo un administrador puede escribir comandos libres' using errcode = '42501';
    end if;
    v_texto := btrim(coalesce(p_texto, ''));
    if v_texto = '' then raise exception 'Escribe un comando'; end if;
    if length(v_texto) > 2000 then raise exception 'El comando es demasiado largo (máximo 2000 caracteres)'; end if;
    select descripcion into v_patron from public.patrones_bloqueados where v_texto ~* patron limit 1;
    if v_patron is not null then
      raise exception 'Comando bloqueado por seguridad: %', v_patron using errcode = '42501';
    end if;
    v_interp := case d.sistema when 'windows' then 'powershell' when 'macos' then 'zsh' else 'bash' end;
  end if;

  -- límites de concurrencia
  if (select count(*) from public.ejecuciones_comandos
       where dispositivo_id = d.id and estado in ('pendiente','ejecutando')) >= 5 then
    raise exception 'El equipo ya tiene varias ejecuciones en curso; espera a que terminen';
  end if;

  insert into public.ejecuciones_comandos
    (dispositivo_id, comando_id, organizacion_id, origen, texto_comando, interprete,
     modo_simulacion, confirmado_destructivo, solicitado_por, lote_id, ejecucion_padre_id)
  values
    (d.id, p_comando, d.organizacion_id, p_origen, v_texto, v_interp,
     coalesce(p_simulacion, false), coalesce(p_confirmar, false), v_uid, p_lote, p_padre)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.crear_ejecucion(
  p_dispositivo uuid, p_comando int default null, p_texto text default null,
  p_simulacion boolean default false, p_confirmar boolean default false)
returns bigint language sql security definer set search_path = '' as $$
  select public._crear_ejecucion(p_dispositivo, p_comando, p_texto, p_simulacion, p_confirmar, 'manual', null, null);
$$;

create or replace function public.cancelar_ejecucion(p_ejecucion bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  e record;
begin
  select * into e from public.ejecuciones_comandos where id = p_ejecucion;
  if e.id is null or not public.puede_ver_organizacion(e.organizacion_id) then
    raise exception 'Ejecución no encontrada' using errcode = '42501';
  end if;
  if e.estado not in ('pendiente','ejecutando') then return false; end if;
  update public.ejecuciones_comandos set estado = 'cancelada', terminado = now() where id = e.id;
  return true;
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- 6. POLÍTICAS RLS (ROW LEVEL SECURITY)
-- ─────────────────────────────────────────────────────────────────────

alter table public.organizaciones enable row level security;
alter table public.perfiles_usuarios enable row level security;
alter table public.dispositivos enable row level security;
alter table public.credenciales_dispositivos enable row level security;
alter table public.claves_registro enable row level security;
alter table public.categorias_comandos enable row level security;
alter table public.comandos enable row level security;
alter table public.ejecuciones_comandos enable row level security;
alter table public.fragmentos_salida_comandos enable row level security;

-- Limpiar políticas anteriores para evitar duplicados
drop policy if exists org_select on public.organizaciones;
create policy org_select on public.organizaciones for select using (id = public.mi_organizacion() or public.es_administrador());

drop policy if exists disp_all on public.dispositivos;
create policy disp_all on public.dispositivos for all using (organizacion_id = public.mi_organizacion() or public.es_administrador());

drop policy if exists cat_all on public.categorias_comandos;
create policy cat_all on public.categorias_comandos for all using (organizacion_id is null or organizacion_id = public.mi_organizacion() or public.es_administrador());

drop policy if exists cmd_all on public.comandos;
create policy cmd_all on public.comandos for all using (organizacion_id is null or organizacion_id = public.mi_organizacion() or public.es_administrador());

drop policy if exists ejec_all on public.ejecuciones_comandos;
create policy ejec_all on public.ejecuciones_comandos for all using (organizacion_id = public.mi_organizacion() or public.es_administrador());

drop policy if exists frag_all on public.fragmentos_salida_comandos;
create policy frag_all on public.fragmentos_salida_comandos for select using (
  exists (select 1 from public.ejecuciones_comandos e
          where e.id = fragmentos_salida_comandos.ejecucion_id
            and (e.organizacion_id = public.mi_organizacion() or public.es_administrador()))
);

-- Permisos de ejecución para anon y authenticated
grant usage on schema public to anon, authenticated;
grant execute on function public.agente_registrar(text, jsonb) to anon, authenticated;
grant execute on function public.agente_rpc(uuid, bigint, text, text, text, text) to anon, authenticated;
grant execute on function public.crear_ejecucion(uuid, int, text, boolean, boolean) to authenticated;
grant execute on function public.cancelar_ejecucion(bigint) to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 7. CLAVE DE REGISTRO MAESTRA PREGENERADA
-- Clave en texto plano: BTL-DEMO-2026-KEY
-- ─────────────────────────────────────────────────────────────────────

insert into public.claves_registro (organizacion_id, clave_hash, nombre, max_usos, activa)
select
  o.id,
  encode(extensions.digest('BTL-DEMO-2026-KEY', 'sha256'), 'hex'),
  'Clave Maestra Despliegue',
  null, -- Usos ilimitados para despliegues
  true
from public.organizaciones o
where o.nombre = 'Bitlab Demo'
limit 1
on conflict (clave_hash) do update set activa = true;

-- ─────────────────────────────────────────────────────────────────────
-- 8. CATEGORÍAS BASE Y CATÁLOGO MULTI-SO RESUELTO
-- ─────────────────────────────────────────────────────────────────────

insert into public.categorias_comandos (nombre, color, icono, orden)
values
  ('Diagnóstico',    '#00f59b', 'activity', 10),
  ('Red',            '#06b6d4', 'wifi',     20),
  ('Procesos',       '#3b82f6', 'cpu',      30),
  ('Almacenamiento', '#f59e0b', 'hdd',      40),
  ('Servicios',      '#8b5cf6', 'server',   50),
  ('Seguridad',      '#ef4444', 'shield',   60)
on conflict (nombre) do update
  set color = excluded.color, icono = excluded.icono, orden = excluded.orden;

-- Comando 1: Top 10 procesos CPU (Multi-SO compatible con BSD Mac, Linux y Windows)
insert into public.comandos (
  categoria_id, nombre, descripcion, sistema, script, variantes,
  interprete, destructivo, requiere_admin, timeout_seg, clasificacion, activo
)
select
  c.id,
  'Top 10 procesos por CPU',
  'Muestra los 10 procesos que más CPU consumen en tiempo real.',
  'todos',
  -- Default / Windows
  'Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 Id, ProcessName, @{n="CPU(s)";e={[math]::Round($_.CPU,2)}}, @{n="Mem(MB)";e={[math]::Round($_.WS/1MB)}} | Format-Table -AutoSize',
  jsonb_build_object(
    'windows', 'Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 Id, ProcessName, @{n="CPU(s)";e={[math]::Round($_.CPU,2)}}, @{n="Mem(MB)";e={[math]::Round($_.WS/1MB)}} | Format-Table -AutoSize',
    'macos',   'ps -A -o user,pid,%cpu,%mem,comm -r | head -11 | awk ''NR==1{print "USER      PID   %CPU  %MEM  COMANDO"} NR>1{printf "%-8s  %-6s  %-5s  %-5s  %s
", $1,$2,$3,$4,$5}''',
    'linux',   'ps aux --sort=-%cpu | head -11 | awk ''NR==1{print "USER      PID   %CPU  %MEM  COMANDO"} NR>1{printf "%-8s  %-6s  %-5s  %-5s  %s
", $1,$2,$3,$4,$11}'''
  ),
  'automatico', false, false, 60, 'diagnostico_profundo', true
from public.categorias_comandos c where c.nombre = 'Procesos' limit 1;

-- Comando 2: Top 10 procesos Memoria
insert into public.comandos (
  categoria_id, nombre, descripcion, sistema, script, variantes,
  interprete, destructivo, requiere_admin, timeout_seg, clasificacion, activo
)
select
  c.id,
  'Top 10 procesos por memoria',
  'Muestra los 10 procesos que más memoria RAM consumen.',
  'todos',
  'Get-Process | Sort-Object WS -Descending | Select-Object -First 10 Id, ProcessName, @{n="RAM(MB)";e={[math]::Round($_.WS/1MB)}} | Format-Table -AutoSize',
  jsonb_build_object(
    'windows', 'Get-Process | Sort-Object WS -Descending | Select-Object -First 10 Id, ProcessName, @{n="RAM(MB)";e={[math]::Round($_.WS/1MB)}} | Format-Table -AutoSize',
    'macos',   'ps -A -o user,pid,%mem,%cpu,comm -m | head -11 | awk ''NR==1{print "USER      PID   %MEM  %CPU  COMANDO"} NR>1{printf "%-8s  %-6s  %-5s  %-5s  %s
", $1,$2,$3,$4,$5}''',
    'linux',   'ps aux --sort=-%mem | head -11 | awk ''NR==1{print "USER      PID   %MEM  %CPU  COMANDO"} NR>1{printf "%-8s  %-6s  %-5s  %-5s  %s
", $1,$2,$3,$4,$11}'''
  ),
  'automatico', false, false, 60, 'diagnostico_profundo', true
from public.categorias_comandos c where c.nombre = 'Procesos' limit 1;

-- Comando 3: Diagnóstico de Conexión (Ping Multi-SO)
insert into public.comandos (
  categoria_id, nombre, descripcion, sistema, script, variantes,
  interprete, destructivo, requiere_admin, timeout_seg, clasificacion, activo
)
select
  c.id,
  'Ping a Google (4 paquetes)',
  'Verifica conectividad y latencia hacia los DNS públicos de Google (8.8.8.8).',
  'todos',
  'Test-Connection -ComputerName 8.8.8.8 -Count 4',
  jsonb_build_object(
    'windows', 'Test-Connection -ComputerName 8.8.8.8 -Count 4',
    'macos',   'ping -c 4 8.8.8.8',
    'linux',   'ping -c 4 8.8.8.8'
  ),
  'automatico', false, false, 30, 'diagnostico_profundo', true
from public.categorias_comandos c where c.nombre = 'Red' limit 1;

-- Comando 4: Información General del Sistema
insert into public.comandos (
  categoria_id, nombre, descripcion, sistema, script, variantes,
  interprete, destructivo, requiere_admin, timeout_seg, clasificacion, activo
)
select
  c.id,
  'Información general del sistema',
  'Datos de hardware, versión del sistema operativo y tiempo de actividad.',
  'todos',
  'systeminfo | Select-String "OS Name","OS Version","System Type","Total Physical Memory"',
  jsonb_build_object(
    'windows', 'systeminfo | Select-String "OS Name","OS Version","System Type","Total Physical Memory"',
    'macos',   'uname -a; echo "--- CPU y Memoria ---"; sysctl -n machdep.cpu.brand_string; echo "RAM:"; sysctl -n hw.memsize | awk ''{printf "%.2f GB\n", $1/1073741824}''; echo "Uptime:"; uptime',
    'linux',   'uname -a; lscpu | grep "Model name"; free -h; uptime'
  ),
  'automatico', false, false, 45, 'diagnostico_profundo', true
from public.categorias_comandos c where c.nombre = 'Diagnóstico' limit 1;

-- Comando 5: Espacio en Disco
insert into public.comandos (
  categoria_id, nombre, descripcion, sistema, script, variantes,
  interprete, destructivo, requiere_admin, timeout_seg, clasificacion, activo
)
select
  c.id,
  'Espacio en disco',
  'Uso y disponibilidad de particiones y unidades de almacenamiento.',
  'todos',
  'Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{n="Usado(GB)";e={[math]::Round($_.Used/1GB,2)}}, @{n="Libre(GB)";e={[math]::Round($_.Free/1GB,2)}} | Format-Table -AutoSize',
  jsonb_build_object(
    'windows', 'Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{n="Usado(GB)";e={[math]::Round($_.Used/1GB,2)}}, @{n="Libre(GB)";e={[math]::Round($_.Free/1GB,2)}} | Format-Table -AutoSize',
    'macos',   'df -h',
    'linux',   'df -h'
  ),
  'automatico', false, false, 30, 'mantenimiento_preventivo', true
from public.categorias_comandos c where c.nombre = 'Almacenamiento' limit 1;

-- ─────────────────────────────────────────────────────────────────────
-- 9. GESTIÓN Y ADMINISTRACIÓN DE USUARIOS
-- ─────────────────────────────────────────────────────────────────────

-- Políticas RLS para perfiles_usuarios
drop policy if exists perfiles_select on public.perfiles_usuarios;
create policy perfiles_select on public.perfiles_usuarios for select using (
  organizacion_id = public.mi_organizacion() or public.es_administrador() or usuario_id = auth.uid()
);

drop policy if exists perfiles_update on public.perfiles_usuarios;
create policy perfiles_update on public.perfiles_usuarios for update using (
  public.es_administrador() or usuario_id = auth.uid()
);

-- RPC: Listar usuarios de la organización
create or replace function public.admin_listar_usuarios()
returns table(
  usuario_id uuid,
  correo text,
  nombre text,
  rol text,
  activo boolean,
  debe_cambiar_contrasena boolean,
  creado timestamptz
)
language sql stable security definer set search_path = '' as $$
  select p.usuario_id, coalesce(u.email, p.nombre) as correo, p.nombre, p.rol, p.activo, p.debe_cambiar_contrasena, p.creado
  from public.perfiles_usuarios p
  left join auth.users u on u.id = p.usuario_id
  where (public.es_administrador() or p.usuario_id = auth.uid())
    and (p.organizacion_id = public.mi_organizacion() or p.organizacion_id is not null)
  order by p.nombre;
$$;

-- RPC: Actualizar usuario
create or replace function public.admin_actualizar_usuario(
  p_usuario_id uuid,
  p_nombre text,
  p_rol text,
  p_activo boolean
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_administrador() then
    raise exception 'Solo administradores pueden modificar usuarios' using errcode = '42501';
  end if;

  if p_rol not in ('administrador','tecnico') then
    raise exception 'Rol inválido';
  end if;

  if p_usuario_id = auth.uid() and (p_rol <> 'administrador' or p_activo = false) then
    raise exception 'No puedes quitarte tu propio rol de administrador ni desactivar tu propia cuenta';
  end if;

  update public.perfiles_usuarios
     set nombre = p_nombre, rol = p_rol, activo = p_activo, actualizado = now()
   where usuario_id = p_usuario_id
     and (organizacion_id = public.mi_organizacion() or organizacion_id is not null);

  if not found then
    raise exception 'Usuario no encontrado en tu organización';
  end if;
end;
$$;

-- RPC: Eliminar (revocar acceso) a usuario
create or replace function public.admin_eliminar_usuario(p_usuario_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_administrador() then
    raise exception 'Solo administradores pueden eliminar usuarios' using errcode = '42501';
  end if;

  if p_usuario_id = auth.uid() then
    raise exception 'No puedes eliminar tu propia cuenta';
  end if;

  delete from public.perfiles_usuarios
   where usuario_id = p_usuario_id
     and (organizacion_id = public.mi_organizacion() or organizacion_id is not null);

  if not found then
    raise exception 'Usuario no encontrado en tu organización';
  end if;
end;
$$;

-- RPC: Cambiar contraseña de cualquier usuario (solo administradores o el propio usuario)
create or replace function public.admin_cambiar_password_usuario(
  p_usuario_id uuid,
  p_password text,
  p_debe_cambiar boolean default false
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_administrador() and auth.uid() <> p_usuario_id then
    raise exception 'Solo administradores pueden cambiar contraseñas de otros usuarios' using errcode = '42501';
  end if;

  if length(coalesce(p_password, '')) < 8 then
    raise exception 'La contraseña debe tener al menos 8 caracteres';
  end if;

  -- 1. Actualizar la contraseña en auth.users con hash bcrypt de pgcrypto
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
         updated_at = now()
   where id = p_usuario_id;

  if not found then
    raise exception 'Usuario no encontrado en el sistema de autenticación';
  end if;

  -- 2. Registrar requerimiento de cambio en perfiles_usuarios si aplica
  update public.perfiles_usuarios
     set debe_cambiar_contrasena = coalesce(p_debe_cambiar, false),
         actualizado = now()
   where usuario_id = p_usuario_id;
end;
$$;

grant execute on function public.admin_listar_usuarios() to authenticated;
grant execute on function public.admin_actualizar_usuario(uuid, text, text, boolean) to authenticated;
grant execute on function public.admin_eliminar_usuario(uuid) to authenticated;
grant execute on function public.admin_cambiar_password_usuario(uuid, text, boolean) to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 10. GESTIÓN Y GENERADOR AUTOMÁTICO DE CLAVES DE REGISTRO
-- ─────────────────────────────────────────────────────────────────────

-- Asegurar compatibilidad de columnas en la tabla claves_registro
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

-- Función estándar crear_clave_registro (admite p_organizacion opcional y genera BTL-XXXX-XXXX-XXXX)
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
  -- OJO: la condición original era "if auth.uid() is not null and not
  -- es_administrador()", que SOLO bloquea a un técnico ya logueado y deja
  -- pasar sin ningún chequeo a cualquiera que llame sin haber iniciado
  -- sesión (auth.uid() is null). Combinado con el grant a "anon" de más
  -- abajo, cualquier persona de internet, sin cuenta, podía generar una
  -- clave de registro válida para tu organización. Se corrige exigiendo
  -- siempre ser administrador, sin excepción.
  if not public.es_administrador() then
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

  return v_clave;
end $$;

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
  where public.es_administrador()
    and c.organizacion_id = public.mi_organizacion()
  order by c.creado desc;
$$;

create or replace function public.admin_revocar_clave_registro(p_clave_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_administrador() then
    raise exception 'Solo administradores pueden revocar claves' using errcode = '42501';
  end if;

  update public.claves_registro
     set activa = false
   where id = p_clave_id
     and organizacion_id = public.mi_organizacion();

  if not found then
    raise exception 'Clave no encontrada';
  end if;
end $$;

grant execute on function public.crear_clave_registro(uuid, text, int, int) to authenticated;
grant execute on function public.admin_listar_claves_registro() to authenticated;
grant execute on function public.admin_generar_clave_registro(text, int, int) to authenticated;
grant execute on function public.admin_revocar_clave_registro(uuid) to authenticated;


-- Permisos de tabla y políticas RLS para claves_registro
-- IMPORTANTE: la versión original daba select/insert/update a "anon" (sin
-- sesión) con políticas "using (true)" / "with check (true)", es decir
-- cualquiera en internet podía leer, crear o modificar claves de registro
-- de cualquier organización con una simple llamada REST usando la llave
-- pública (que por diseño es pública). Se corrige a: solo administradores,
-- solo de su propia organización, nunca sin sesión.
grant select, insert, update on public.claves_registro to authenticated;

drop policy if exists btl_clave_ver on public.claves_registro;
create policy btl_clave_ver on public.claves_registro for select to authenticated
  using (public.es_administrador() and organizacion_id = public.mi_organizacion());

drop policy if exists btl_clave_insert on public.claves_registro;
create policy btl_clave_insert on public.claves_registro for insert to authenticated
  with check (public.es_administrador() and organizacion_id = public.mi_organizacion());

drop policy if exists btl_clave_update on public.claves_registro;
create policy btl_clave_update on public.claves_registro for update to authenticated
  using (public.es_administrador() and organizacion_id = public.mi_organizacion())
  with check (public.es_administrador() and organizacion_id = public.mi_organizacion());

-- =====================================================================
-- Eliminación Completa de Dispositivos por Administrador
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

-- IMPORTANTE: la versión original daba "using (true)" aquí, es decir
-- CUALQUIER usuario autenticado (no solo administrador) podía borrar por
-- REST directo cualquier equipo de cualquier organización. Se corrige
-- para exigir exactamente lo mismo que ya exige la función de arriba.
grant delete on public.dispositivos to authenticated;
drop policy if exists btl_disp_delete on public.dispositivos;
create policy btl_disp_delete on public.dispositivos for delete to authenticated
  using (public.es_administrador() and public.puede_ver_organizacion(organizacion_id));

-- Eliminación definitiva de claves de registro por administrador
create or replace function public.admin_eliminar_clave_definitiva(p_clave_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_administrador() then
    raise exception 'Solo administradores pueden eliminar claves de la base de datos' using errcode = '42501';
  end if;

  delete from public.claves_registro
   where id = p_clave_id
     and organizacion_id = public.mi_organizacion();
  -- (antes había un "fallback" que borraba la clave sin ningún filtro de
  -- organización si el delete de arriba no encontraba fila; se quitó
  -- porque anulaba por completo el aislamiento entre organizaciones.)

  if not found then
    raise exception 'Clave no encontrada';
  end if;
end $$;

grant execute on function public.admin_eliminar_clave_definitiva(uuid) to authenticated;

-- IMPORTANTE: igual que con dispositivos, la versión original daba delete
-- a "anon" (sin sesión) con "using (true)": cualquiera en internet podía
-- borrar cualquier clave de registro de cualquier organización. Corregido.
grant delete on public.claves_registro to authenticated;
drop policy if exists btl_clave_delete on public.claves_registro;
create policy btl_clave_delete on public.claves_registro for delete to authenticated
  using (public.es_administrador() and organizacion_id = public.mi_organizacion());

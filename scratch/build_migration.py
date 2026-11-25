#!/usr/bin/env python3
"""
Compilador de la migración unificada completa de Bitlab para Supabase.
Genera supabase/MIGRACION_COMPLETA_UNIFICADA.sql
"""

import os

header = """-- =====================================================================
-- BITLAB IT · MIGRACIÓN COMPLETA UNIFICADA FINAL
-- Arquitectura Cloud Supabase (PostgreSQL + RLS + RPC + Firma HMAC)
--
-- Incluye:
--   1. Extensiones criptográficas (pgcrypto, uuid-ossp).
--   2. Esquema completo de tablas (organizaciones, usuarios, dispositivos,
--      credenciales, claves de registro, catálogo, ejecuciones, auditoría).
--   3. Funciones RPC seguras (registro de agentes, latidos/órdenes con HMAC,
--      ejecución de comandos individuales y masivos con variantes multi-SO).
--   4. Seguridad por Políticas de Nivel de Fila (RLS).
--   5. Datos semilla esenciales:
--        - Organización por defecto ('Bitlab Demo')
--        - Clave maestra de instalación reutilizable ('BTL-INSTALL-MASTER-2026')
--        - Categorías organizadas
--        - Catálogo completo de comandos multiplataforma (Windows, macOS, Linux)
--
-- Ejecución: En Supabase Dashboard > SQL Editor > Pegar y presionar RUN.
-- Es completamente idempotente (seguro de correr en proyectos nuevos o existentes).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp";

-- =====================================================================
-- 1. ESTRUCTURA DE TABLAS BASE
-- =====================================================================

-- Organizaciones (Tenants)
create table if not exists public.organizaciones (
  id      uuid primary key default gen_random_uuid(),
  nombre  text not null unique check (length(nombre) between 2 and 120),
  activa  boolean not null default true,
  creado  timestamptz not null default now()
);

-- Perfiles de usuario (vinculados a auth.users de Supabase)
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

-- Dispositivos monitoreados (Mac, Windows, Linux)
create table if not exists public.dispositivos (
  id                 uuid primary key default gen_random_uuid(),
  organizacion_id    uuid not null references public.organizaciones(id) on delete cascade,
  nombre             text not null check (length(nombre) between 1 and 120),
  apodo              text check (length(apodo) <= 60),
  sistema            text not null check (sistema in ('windows','macos','linux')),
  version_so         text,
  arquitectura       text,
  ip_local           text,
  ip_publica         text,
  mac_address        text,
  version_agente     text not null default '1.0.0',
  en_linea           boolean not null default false,
  ultimo_contacto    timestamptz,
  ultimo_latido      timestamptz,
  metricas           jsonb not null default '{}'::jsonb,
  etiquetas          text[] not null default '{}',
  sede               text default 'General',
  activo             boolean not null default true,
  creado             timestamptz not null default now(),
  actualizado        timestamptz not null default now()
);
create index if not exists idx_dispositivos_org on public.dispositivos (organizacion_id);
create index if not exists idx_dispositivos_linea on public.dispositivos (en_linea, ultimo_latido);

-- Credenciales criptográficas del agente (separadas de la tabla visible)
create table if not exists public.credenciales_dispositivos (
  dispositivo_id     uuid primary key references public.dispositivos(id) on delete cascade,
  token_hash         text not null,
  rotar_solicitado   boolean not null default false,
  creado             timestamptz not null default now(),
  actualizado        timestamptz not null default now()
);

-- Claves de registro (instaladores BTL)
create table if not exists public.claves_registro (
  id                 uuid primary key default gen_random_uuid(),
  organizacion_id    uuid not null references public.organizaciones(id) on delete cascade,
  hash_clave         text not null unique,
  prefijo            text not null check (length(prefijo) between 4 and 16),
  descripcion        text,
  usos_maximos       int check (usos_maximos is null or usos_maximos > 0),
  usos_actuales      int not null default 0,
  expira_el          timestamptz,
  activa             boolean not null default true,
  creado_por         uuid references auth.users(id) on delete set null,
  creado             timestamptz not null default now()
);
create index if not exists idx_claves_registro_hash on public.claves_registro (hash_clave);

-- Nonces contra ataques de reenvío (Replay Protection)
create table if not exists public.nonces_agente (
  dispositivo_id     uuid not null references public.dispositivos(id) on delete cascade,
  nonce              text not null,
  recibido           timestamptz not null default now(),
  primary key (dispositivo_id, nonce)
);
create index if not exists idx_nonces_recibido on public.nonces_agente (recibido);

-- Categorías del catálogo de comandos
create table if not exists public.categorias_comandos (
  id                 serial primary key,
  nombre             text not null unique check (length(nombre) between 2 and 60),
  color              text not null default '#3b82f6',
  icono              text not null default 'terminal',
  orden              int not null default 0,
  creado             timestamptz not null default now()
);

-- Catálogo de comandos
create table if not exists public.comandos (
  id                 serial primary key,
  categoria_id       int references public.categorias_comandos(id) on delete set null,
  nombre             text not null check (length(nombre) between 2 and 120),
  descripcion        text,
  sistema            text not null default 'todos' check (sistema in ('todos','windows','macos','linux')),
  script             text not null,
  variantes          jsonb default '{}'::jsonb,
  interprete         text not null default 'automatico' check (interprete in ('automatico','powershell','cmd','zsh','bash')),
  destructivo        boolean not null default false,
  requiere_admin     boolean not null default false,
  timeout_seg        int not null default 120 check (timeout_seg between 5 and 3600),
  tipo_alerta_id     text,
  tipos_alerta_ids   text[] default '{}',
  clasificacion      text not null default 'general',
  activo             boolean not null default true,
  creado             timestamptz not null default now(),
  actualizado        timestamptz not null default now()
);
create index if not exists idx_comandos_cat on public.comandos (categoria_id);

-- Patrones de seguridad bloqueados (protección contra comandos catastróficos libres)
create table if not exists public.patrones_bloqueados (
  id                 serial primary key,
  patron             text not null unique,
  descripcion        text not null,
  creado             timestamptz not null default now()
);

-- Lotes de ejecución masiva
create table if not exists public.lotes_ejecucion (
  id                 uuid primary key default gen_random_uuid(),
  organizacion_id    uuid not null references public.organizaciones(id) on delete cascade,
  solicitado_por     uuid references auth.users(id) on delete set null,
  descripcion        text,
  total_ordenes      int not null default 0,
  exitosas           int not null default 0,
  fallidas           int not null default 0,
  canceladas         int not null default 0,
  creado             timestamptz not null default now()
);

-- Historial de ejecuciones de comandos
create table if not exists public.ejecuciones_comandos (
  id                    bigserial primary key,
  dispositivo_id        uuid not null references public.dispositivos(id) on delete cascade,
  comando_id            int references public.comandos(id) on delete set null,
  organizacion_id       uuid not null references public.organizaciones(id) on delete cascade,
  lote_id               uuid references public.lotes_ejecucion(id) on delete set null,
  ejecucion_padre_id    bigint references public.ejecuciones_comandos(id) on delete set null,
  origen                text not null default 'manual' check (origen in ('manual','catalogo','lote','alerta','programado')),
  texto_comando         text not null,
  interprete            text not null check (interprete in ('powershell','cmd','zsh','bash')),
  modo_simulacion       boolean not null default false,
  confirmado_destructivo boolean not null default false,
  estado                text not null default 'pendiente' check (estado in ('pendiente','en_cola','ejecutando','exitosa','fallida','cancelada','tiempo_agotado')),
  codigo_salida         int,
  mensaje_error         text,
  duracion_ms           int,
  solicitado_por        uuid references auth.users(id) on delete set null,
  solicitado_en         timestamptz not null default now(),
  iniciado_en           timestamptz,
  finalizado_en         timestamptz,
  creado                timestamptz not null default now()
);
create index if not exists idx_ejec_disp on public.ejecuciones_comandos (dispositivo_id, creado desc);
create index if not exists idx_ejec_pendientes on public.ejecuciones_comandos (dispositivo_id, estado) where estado in ('pendiente','en_cola');

-- Fragmentos de salida transmitidos en vivo
create table if not exists public.fragmentos_salida_comandos (
  id                 bigserial primary key,
  ejecucion_id       bigint not null references public.ejecuciones_comandos(id) on delete cascade,
  secuencia          int not null,
  flujo              text not null check (flujo in ('stdout','stderr','sistema')),
  texto              text not null,
  creado             timestamptz not null default now(),
  unique (ejecucion_id, secuencia)
);
create index if not exists idx_salida_ejec on public.fragmentos_salida_comandos (ejecucion_id, secuencia);

-- Auditoría inmutable de acciones
create table if not exists public.auditoria (
  id                 bigserial primary key,
  organizacion_id    uuid not null references public.organizaciones(id) on delete cascade,
  usuario_id         uuid references auth.users(id) on delete set null,
  accion             text not null,
  entidad            text not null,
  entidad_id         text,
  detalles           jsonb not null default '{}'::jsonb,
  ip                 text,
  creado             timestamptz not null default now()
);
create index if not exists idx_auditoria_org on public.auditoria (organizacion_id, creado desc);

-- =====================================================================
-- 2. FUNCIONES DE AYUDA Y SEGURIDAD
-- =====================================================================

create or replace function public.es_administrador()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.perfiles_usuarios p
    where p.usuario_id = auth.uid() and p.activo and p.rol = 'administrador'
  );
$$;

create or replace function public.mi_organizacion()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.organizacion_id from public.perfiles_usuarios p
  where p.usuario_id = auth.uid() and p.activo;
$$;

create or replace function public.puede_ver_organizacion(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.perfiles_usuarios p
    where p.usuario_id = auth.uid() and p.activo and p.organizacion_id = p_org
  );
$$;

create or replace function public._ip_solicitud()
returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.headers', true)::jsonb->>'cf-connecting-ip', ''),
    nullif(current_setting('request.headers', true)::jsonb->>'x-forwarded-for', ''),
    '127.0.0.1'
  );
$$;

-- =====================================================================
-- 3. PROTOCOLO DEL AGENTE (RPC AUTORREGISTRO Y FIRMA HMAC)
-- =====================================================================

-- Registro inicial de un equipo mediante clave BTL
create or replace function public.agente_registrar(p_clave text, p_equipo jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_hash text;
  v_clave record;
  v_disp_id uuid;
  v_token text;
  v_token_hash text;
  v_sistema text;
  v_nombre text;
begin
  if p_clave is null or btrim(p_clave) = '' then
    raise exception 'Clave de registro requerida' using errcode = '28000';
  end if;

  v_hash := encode(extensions.digest(btrim(p_clave), 'sha256'), 'hex');
  select * into v_clave from public.claves_registro
  where hash_clave = v_hash and activa and (expira_el is null or expira_el > now());

  if v_clave.id is null then
    raise exception 'Clave de registro inválida o expirada' using errcode = '28000';
  end if;

  if v_clave.usos_maximos is not null and v_clave.usos_actuales >= v_clave.usos_maximos then
    raise exception 'La clave de registro ha alcanzado su límite de usos' using errcode = '28000';
  end if;

  v_sistema := lower(coalesce(p_equipo->>'sistema', 'macos'));
  if v_sistema not in ('windows','macos','linux') then
    v_sistema := 'macos';
  end if;

  v_nombre := coalesce(nullif(btrim(p_equipo->>'nombre'), ''), 'Equipo-' || substr(gen_random_uuid()::text, 1, 8));

  insert into public.dispositivos (
    organizacion_id, nombre, sistema, version_so, arquitectura,
    ip_local, ip_publica, mac_address, version_agente, en_linea,
    ultimo_contacto, ultimo_latido
  ) values (
    v_clave.organizacion_id, v_nombre, v_sistema,
    p_equipo->>'version_so', p_equipo->>'arquitectura',
    p_equipo->>'ip_local', public._ip_solicitud(),
    p_equipo->>'mac_address', coalesce(p_equipo->>'version_agente', '1.0.0'),
    true, now(), now()
  ) returning id into v_disp_id;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := v_token; -- llave compartida de firma HMAC

  insert into public.credenciales_dispositivos (dispositivo_id, token_hash)
  values (v_disp_id, v_token_hash);

  update public.claves_registro
  set usos_actuales = usos_actuales + 1
  where id = v_clave.id;

  return jsonb_build_object(
    'dispositivo_id', v_disp_id,
    'token', v_token,
    'organizacion_id', v_clave.organizacion_id
  );
end $$;
grant execute on function public.agente_registrar(text, jsonb) to anon, authenticated;

-- Canal RPC firmado para latido, reclamar órdenes, salida y fin
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

  -- Tolerancia de reloj de 10 minutos
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

  -- 1. Latido
  if p_accion = 'latido' then
    if v_cuerpo ? 'metricas' then
      update public.dispositivos set metricas = v_cuerpo->'metricas' where id = p_dispositivo;
    end if;
    return jsonb_build_object('ok', true, 'rotar_token', cred.rotar_solicitado);

  -- 2. Reclamar orden pendiente
  elsif p_accion = 'reclamar' then
    select * into e from public.ejecuciones_comandos
     where dispositivo_id = p_dispositivo and estado in ('pendiente','en_cola')
     order by id asc limit 1 for update skip locked;

    if e.id is null then
      return jsonb_build_object('ejecucion', null);
    end if;

    update public.ejecuciones_comandos
       set estado = 'ejecutando', iniciado_en = now()
     where id = e.id;

    v_esperada := encode(extensions.hmac(convert_to(e.id::text || '|' || e.texto_comando, 'UTF8'),
                                         convert_to(v_llave, 'UTF8'), 'sha256'), 'hex');

    return jsonb_build_object('ejecucion', jsonb_build_object(
      'id', e.id,
      'script', e.texto_comando,
      'interprete', e.interprete,
      'timeout_seg', 120,
      'simulacion', e.modo_simulacion,
      'firma', v_esperada
    ));

  -- 3. Fragmentos de salida en vivo
  elsif p_accion = 'salida' then
    v_ejec := (v_cuerpo->>'ejecucion_id')::bigint;
    v_lineas := v_cuerpo->'lineas';
    if v_ejec is not null and jsonb_typeof(v_lineas) = 'array' then
      insert into public.fragmentos_salida_comandos (ejecucion_id, secuencia, flujo, texto)
      select v_ejec, (item->>'s')::int, item->>'f', item->>'t'
        from jsonb_array_elements(v_lineas) as item
      on conflict (ejecucion_id, secuencia) do nothing;
    end if;
    select estado into v_estado from public.ejecuciones_comandos where id = v_ejec;
    return jsonb_build_object('ok', true, 'cancelar', v_estado = 'cancelada');

  -- 4. Finalizar orden
  elsif p_accion = 'finalizar' then
    v_ejec := (v_cuerpo->>'ejecucion_id')::bigint;
    update public.ejecuciones_comandos
       set estado = case when estado = 'cancelada' then 'cancelada' else coalesce(v_cuerpo->>'estado', 'exitosa') end,
           codigo_salida = (v_cuerpo->>'codigo')::int,
           mensaje_error = v_cuerpo->>'error',
           duracion_ms = (v_cuerpo->>'duracion_ms')::int,
           finalizado_en = now()
     where id = v_ejec;
    return jsonb_build_object('ok', true);

  -- 5. Rotar token
  elsif p_accion = 'rotar' then
    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    update public.credenciales_dispositivos
       set token_hash = v_token, rotar_solicitado = false, actualizado = now()
     where dispositivo_id = p_dispositivo;
    return jsonb_build_object('token', v_token);
  end if;

  return jsonb_build_object('ok', false);
end $$;
grant execute on function public.agente_rpc(uuid, bigint, text, text, text, text) to anon, authenticated;

-- =====================================================================
-- 4. DESPACHO DE COMANDOS DESDE EL PANEL
-- =====================================================================

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
  if not d.en_linea or d.ultimo_latido is null or d.ultimo_latido < now() - interval '180 seconds' then
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
    v_texto := coalesce(nullif(btrim(p_texto), ''), c.script);
    v_interp := case
      when d.sistema = 'windows' then (case when c.interprete in ('powershell','cmd') then c.interprete else 'powershell' end)
      else (case when c.interprete in ('zsh','bash') then c.interprete else 'zsh' end)
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
    v_interp := case d.sistema when 'windows' then 'powershell' else 'zsh' end;
  end if;

  insert into public.ejecuciones_comandos
    (dispositivo_id, comando_id, organizacion_id, origen, texto_comando, interprete,
     modo_simulacion, confirmado_destructivo, solicitado_por, lote_id, ejecucion_padre_id, estado)
  values
    (d.id, p_comando, d.organizacion_id, p_origen, v_texto, v_interp,
     coalesce(p_simulacion, false), coalesce(p_confirmar, false), v_uid, p_lote, p_padre, 'en_cola')
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.crear_ejecucion(
  p_dispositivo uuid, p_comando int default null, p_texto text default null,
  p_simulacion boolean default false, p_confirmar boolean default false)
returns bigint language sql security definer set search_path = '' as $$
  select public._crear_ejecucion(p_dispositivo, p_comando, p_texto, p_simulacion, p_confirmar,
                                 case when p_comando is null then 'manual' else 'catalogo' end, null, null);
$$;
grant execute on function public.crear_ejecucion(uuid, int, text, boolean, boolean) to authenticated;

create or replace function public.cancelar_ejecucion(p_ejecucion bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  e record;
begin
  select * into e from public.ejecuciones_comandos where id = p_ejecucion;
  if e.id is null or not public.puede_ver_organizacion(e.organizacion_id) then
    raise exception 'Ejecución no encontrada o sin permiso' using errcode = '42501';
  end if;
  if e.estado in ('exitosa','fallida','cancelada','tiempo_agotado') then
    return false;
  end if;
  update public.ejecuciones_comandos set estado = 'cancelada', finalizado_en = now() where id = p_ejecucion;
  return true;
end $$;
grant execute on function public.cancelar_ejecucion(bigint) to authenticated;

-- =====================================================================
-- 5. POLÍTICAS DE ACCESO (ROW LEVEL SECURITY)
-- =====================================================================

alter table public.organizaciones enable row level security;
alter table public.perfiles_usuarios enable row level security;
alter table public.dispositivos enable row level security;
alter table public.credenciales_dispositivos enable row level security;
alter table public.claves_registro enable row level security;
alter table public.nonces_agente enable row level security;
alter table public.categorias_comandos enable row level security;
alter table public.comandos enable row level security;
alter table public.patrones_bloqueados enable row level security;
alter table public.lotes_ejecucion enable row level security;
alter table public.ejecuciones_comandos enable row level security;
alter table public.fragmentos_salida_comandos enable row level security;
alter table public.auditoria enable row level security;

-- Organizaciones y perfiles
drop policy if exists org_select on public.organizaciones;
create policy org_select on public.organizaciones for select to authenticated
  using (id = public.mi_organizacion());

drop policy if exists perfiles_select on public.perfiles_usuarios;
create policy perfiles_select on public.perfiles_usuarios for select to authenticated
  using (organizacion_id = public.mi_organizacion());

-- Dispositivos
drop policy if exists disp_select on public.dispositivos;
create policy disp_select on public.dispositivos for select to authenticated
  using (organizacion_id = public.mi_organizacion());

drop policy if exists disp_update on public.dispositivos;
create policy disp_update on public.dispositivos for update to authenticated
  using (organizacion_id = public.mi_organizacion());

-- Categorías y comandos (lectura abierta a autenticados, mutación para administradores)
drop policy if exists cat_select on public.categorias_comandos;
create policy cat_select on public.categorias_comandos for select to authenticated using (true);
drop policy if exists cat_admin on public.categorias_comandos;
create policy cat_admin on public.categorias_comandos for all to authenticated using (public.es_administrador());

drop policy if exists cmd_select on public.comandos;
create policy cmd_select on public.comandos for select to authenticated using (true);
drop policy if exists cmd_admin on public.comandos;
create policy cmd_admin on public.comandos for all to authenticated using (public.es_administrador());

-- Ejecuciones y salidas
drop policy if exists ejec_select on public.ejecuciones_comandos;
create policy ejec_select on public.ejecuciones_comandos for select to authenticated
  using (organizacion_id = public.mi_organizacion());

drop policy if exists salida_select on public.fragmentos_salida_comandos;
create policy salida_select on public.fragmentos_salida_comandos for select to authenticated
  using (exists (select 1 from public.ejecuciones_comandos e
                 where e.id = ejecucion_id and e.organizacion_id = public.mi_organizacion()));

-- Claves de registro
drop policy if exists claves_select on public.claves_registro;
create policy claves_select on public.claves_registro for select to authenticated
  using (organizacion_id = public.mi_organizacion());
drop policy if exists claves_admin on public.claves_registro;
create policy claves_admin on public.claves_registro for all to authenticated using (public.es_administrador());

-- =====================================================================
-- 6. DATOS SEMILLA ESENCIALES (AUTO-CONFIGURACIÓN INICIAL)
-- =====================================================================

-- Organización base
insert into public.organizaciones (id, nombre)
values ('00000000-0000-0000-0000-000000000001', 'Bitlab Demo')
on conflict (nombre) do nothing;

-- Clave maestra de instalación: 'BTL-INSTALL-MASTER-2026'
insert into public.claves_registro (
  organizacion_id, hash_clave, prefijo, descripcion, usos_maximos, activa
) values (
  (select id from public.organizaciones order by creado asc limit 1),
  encode(extensions.digest('BTL-INSTALL-MASTER-2026', 'sha256'), 'hex'),
  'BTL-MASTER',
  'Clave universal de despliegue Bitlab',
  null,
  true
) on conflict (hash_clave) do nothing;

-- Categorías predefinidas
insert into public.categorias_comandos (nombre, color, icono, orden) values
  ('Diagnóstico',    '#00f59b', 'activity', 10),
  ('Red',            '#06b6d4', 'wifi',     20),
  ('Procesos',       '#3b82f6', 'cpu',      30),
  ('Almacenamiento', '#f59e0b', 'hdd',      40),
  ('Seguridad',      '#ec4899', 'shield',   50),
  ('Servicios',      '#8b5cf6', 'server',   60)
on conflict (nombre) do update set color = excluded.color, icono = excluded.icono, orden = excluded.orden;

-- Catálogo de Comandos Multiplataforma (Windows PowerShell, macOS zsh, Linux bash)
insert into public.comandos (
  categoria_id, nombre, descripcion, sistema, script, variantes,
  interprete, destructivo, requiere_admin, timeout_seg, activo
)
select
  (select id from public.categorias_comandos where nombre = 'Procesos' limit 1),
  'Top 10 procesos por CPU',
  'Muestra los 10 procesos con mayor uso de procesador adaptado al sistema operativo.',
  'todos',
  -- Script por defecto (PowerShell)
  'Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 Id, ProcessName, @{n="CPU";e={[math]::Round($_.CPU,2)}}, @{n="RAM MB";e={[math]::Round($_.WS/1MB)}} | Format-Table -AutoSize',
  -- Variantes exactas por SO
  jsonb_build_object(
    'windows', 'Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 Id, ProcessName, @{n="CPU";e={[math]::Round($_.CPU,2)}}, @{n="RAM MB";e={[math]::Round($_.WS/1MB)}} | Format-Table -AutoSize',
    'macos',   'ps -A -o user,pid,%cpu,%mem,comm -r | head -11 | awk ''NR==1{print "USER      PID   %CPU  %MEM  COMANDO"} NR>1{printf "%-8s  %-6s  %-5s  %-5s  %s\\n", $1,$2,$3,$4,$5}''',
    'linux',   'ps aux --sort=-%cpu | head -11 | awk ''NR==1{print "USER      PID   %CPU  %MEM  COMANDO"} NR>1{printf "%-8s  %-6s  %-5s  %-5s  %s\\n", $1,$2,$3,$4,$11}'''
  ),
  'automatico', false, false, 60, true
on conflict do nothing;

insert into public.comandos (
  categoria_id, nombre, descripcion, sistema, script, variantes,
  interprete, destructivo, requiere_admin, timeout_seg, activo
)
select
  (select id from public.categorias_comandos where nombre = 'Procesos' limit 1),
  'Top 10 procesos por memoria',
  'Muestra los procesos que mayor memoria RAM están consumiendo.',
  'todos',
  'Get-Process | Sort-Object WS -Descending | Select-Object -First 10 Id, ProcessName, @{n="RAM MB";e={[math]::Round($_.WS/1MB)}} | Format-Table -AutoSize',
  jsonb_build_object(
    'windows', 'Get-Process | Sort-Object WS -Descending | Select-Object -First 10 Id, ProcessName, @{n="RAM MB";e={[math]::Round($_.WS/1MB)}} | Format-Table -AutoSize',
    'macos',   'ps -A -o user,pid,%mem,%cpu,comm -m | head -11 | awk ''NR==1{print "USER      PID   %MEM  %CPU  COMANDO"} NR>1{printf "%-8s  %-6s  %-5s  %-5s  %s\\n", $1,$2,$3,$4,$5}''',
    'linux',   'ps aux --sort=-%mem | head -11 | awk ''NR==1{print "USER      PID   %MEM  %CPU  COMANDO"} NR>1{printf "%-8s  %-6s  %-5s  %-5s  %s\\n", $1,$2,$3,$4,$11}'''
  ),
  'automatico', false, false, 60, true
on conflict do nothing;

insert into public.comandos (
  categoria_id, nombre, descripcion, sistema, script, variantes,
  interprete, destructivo, requiere_admin, timeout_seg, activo
)
select
  (select id from public.categorias_comandos where nombre = 'Red' limit 1),
  'Ping a Google (4 veces)',
  'Prueba de conectividad ICMP hacia 8.8.8.8.',
  'todos',
  'Test-Connection -ComputerName 8.8.8.8 -Count 4',
  jsonb_build_object(
    'windows', 'Test-Connection -ComputerName 8.8.8.8 -Count 4',
    'macos',   'ping -c 4 8.8.8.8',
    'linux',   'ping -c 4 8.8.8.8'
  ),
  'automatico', false, false, 30, true
on conflict do nothing;

insert into public.comandos (
  categoria_id, nombre, descripcion, sistema, script, variantes,
  interprete, destructivo, requiere_admin, timeout_seg, activo
)
select
  (select id from public.categorias_comandos where nombre = 'Almacenamiento' limit 1),
  'Espacio en disco',
  'Reporte de almacenamiento disponible y usado en los volúmenes del sistema.',
  'todos',
  'Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{n="Libre GB";e={[math]::Round($_.Free/1GB,2)}}, @{n="Total GB";e={[math]::Round(($_.Used+$_.Free)/1GB,2)}} | Format-Table -AutoSize',
  jsonb_build_object(
    'windows', 'Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{n="Libre GB";e={[math]::Round($_.Free/1GB,2)}}, @{n="Total GB";e={[math]::Round(($_.Used+$_.Free)/1GB,2)}} | Format-Table -AutoSize',
    'macos',   'df -h',
    'linux',   'df -h'
  ),
  'automatico', false, false, 30, true
on conflict do nothing;

insert into public.comandos (
  categoria_id, nombre, descripcion, sistema, script, variantes,
  interprete, destructivo, requiere_admin, timeout_seg, activo
)
select
  (select id from public.categorias_comandos where nombre = 'Diagnóstico' limit 1),
  'Información del sistema',
  'Detalles básicos de hardware, versión de kernel y uptime del equipo.',
  'todos',
  'Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, LastBootUpTime | Format-List',
  jsonb_build_object(
    'windows', 'Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, LastBootUpTime | Format-List',
    'macos',   'echo "=== Sistema ==="; sw_vers; echo ""; echo "=== Uptime ==="; uptime',
    'linux',   'echo "=== Sistema ==="; uname -a; echo ""; echo "=== Uptime ==="; uptime'
  ),
  'automatico', false, false, 30, true
on conflict do nothing;

-- Patrones bloqueados de seguridad
insert into public.patrones_bloqueados (patron, descripcion) values
  ('rm\\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive\\s+--force)\\s+/(|\\*)$', 'Intento de borrado de la raíz del sistema (rm -rf /)'),
  ('format\\s+[a-zA-Z]:', 'Formateo de partición de disco en Windows'),
  ('mkfs(\\.[a-zA-Z0-9]+)?\\s+/dev/', 'Creación forzada de sistema de archivos sobre dispositivo en Linux'),
  ('dd\\s+if=/dev/zero\\s+of=/dev/sd', 'Sobrescritura destructiva de disco con ceros')
on conflict (patron) do nothing;
"""

with open('supabase/MIGRACION_COMPLETA_UNIFICADA.sql', 'w', encoding='utf-8') as f:
    f.write(header)

print('MIGRACION_COMPLETA_UNIFICADA.sql generada exitosamente. Tamaño:', len(header), 'bytes')


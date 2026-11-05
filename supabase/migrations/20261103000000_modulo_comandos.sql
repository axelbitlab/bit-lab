-- =====================================================================
-- Bitlab Terminal · Migración 002 · Módulo de comandos remotos
-- Épica 3 (BTL-32 a BTL-39) · Entregable E4 (E4.1, E4.2, E4.3)
--
-- Sobre la migración 001 agrega:
--   · organizaciones, perfiles y roles (administrador / técnico)
--   · claves de registro para el autorregistro de equipos
--   · credenciales de equipo separadas de la tabla visible (token solo como hash)
--   · protocolo del agente con firma HMAC, marca de tiempo y número único
--   · ejecuciones de catálogo y manuales, lotes, cancelación y reintento
--   · tipos de alerta ligados al catálogo, comandos programados
--   · auditoría inmutable llenada por triggers
--   · RLS por organización en todas las tablas e índices del panel
--   · mantenimiento automático con pg_cron
--
-- Correr completo en: Supabase > SQL Editor > New query > Run
-- Es seguro correrla más de una vez.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- =====================================================================
-- 1. Organizaciones y perfiles de usuario
-- =====================================================================
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
  debe_cambiar_contrasena boolean not null default true,
  creado                  timestamptz not null default now(),
  actualizado             timestamptz not null default now()
);

-- Ayudantes de seguridad (se usan en RLS y en las funciones)
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
  select public.es_administrador() or (p_org is not null and p_org = public.mi_organizacion());
$$;

create or replace function public._ip_solicitud()
returns text language sql stable set search_path = '' as $$
  select nullif(trim(split_part(coalesce(
           (nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for'), ''), ',', 1)), '');
$$;

-- =====================================================================
-- 2. Dispositivos: datos del equipo y credenciales aparte
-- =====================================================================
alter table public.dispositivos
  add column if not exists organizacion_id  uuid references public.organizaciones(id),
  add column if not exists ip_local         text,
  add column if not exists ip_publica       text,
  add column if not exists usuario_so       text,
  add column if not exists version_so       text,
  add column if not exists arquitectura     text,
  add column if not exists version_agente   text,
  add column if not exists interpretes      jsonb not null default '[]'::jsonb,
  add column if not exists metricas         jsonb,
  add column if not exists ultimo_latido    timestamptz,
  add column if not exists en_linea         boolean not null default false,
  add column if not exists activo           boolean not null default true;

update public.dispositivos
   set organizacion_id = (select id from public.organizaciones where nombre = 'Bitlab Demo')
 where organizacion_id is null;
alter table public.dispositivos alter column organizacion_id set not null;

-- El nombre del equipo es único dentro de su organización, no en todo el sistema
alter table public.dispositivos drop constraint if exists dispositivos_nombre_key;
do $$ begin
  alter table public.dispositivos add constraint dispositivos_org_nombre_key unique (organizacion_id, nombre);
exception when duplicate_object or duplicate_table then null; end $$;

-- Las credenciales viven en una tabla que nadie puede leer desde fuera.
-- Así el hash nunca viaja por el panel ni por Realtime.
create table if not exists public.credenciales_dispositivos (
  dispositivo_id      uuid primary key references public.dispositivos(id) on delete cascade,
  token_hash          text not null,        -- sha256 del token; también es la llave de la firma HMAC
  rotacion_solicitada boolean not null default false,
  actualizado         timestamptz not null default now()
);

do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'dispositivos' and column_name = 'token_hash') then
    insert into public.credenciales_dispositivos (dispositivo_id, token_hash)
    select id, token_hash from public.dispositivos
    on conflict (dispositivo_id) do nothing;
    alter table public.dispositivos drop column token_hash;
  end if;
end $$;

-- Números únicos ya usados por cada agente (evitan que una llamada se repita)
create table if not exists public.nonces_agente (
  dispositivo_id uuid not null references public.dispositivos(id) on delete cascade,
  nonce          text not null,
  recibido       timestamptz not null default now(),
  primary key (dispositivo_id, nonce)
);

-- =====================================================================
-- 3. Claves de registro (van dentro del instalador)
-- =====================================================================
create table if not exists public.claves_registro (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references public.organizaciones(id),
  descripcion      text not null default 'Instalador',
  clave_hash       text not null unique,
  usos             int  not null default 0,
  usos_maximos     int  check (usos_maximos is null or usos_maximos > 0),
  vence            timestamptz,
  activa           boolean not null default true,
  creado_por       uuid default auth.uid(),
  creado           timestamptz not null default now()
);

-- =====================================================================
-- 4. Catálogo: columnas nuevas
-- =====================================================================
alter table public.categorias_comandos
  add column if not exists orden int not null default 0;

alter table public.comandos
  add column if not exists descripcion     text,
  add column if not exists requiere_admin  boolean not null default false,
  add column if not exists interprete      text,
  add column if not exists actualizado     timestamptz not null default now();

update public.comandos set interprete = case sistema when 'windows' then 'powershell' else 'zsh' end
 where interprete is null;
alter table public.comandos alter column interprete set not null;
create or replace function public._comando_defaults()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.interprete := coalesce(new.interprete, case new.sistema when 'windows' then 'powershell' else 'zsh' end);
  new.actualizado := now();
  return new;
end $$;
drop trigger if exists comandos_defaults on public.comandos;
create trigger comandos_defaults before insert or update on public.comandos
  for each row execute function public._comando_defaults();

do $$ begin
  alter table public.comandos add constraint comandos_interprete_check
    check (interprete in ('powershell','cmd','zsh','bash'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.comandos add constraint comandos_timeout_check check (timeout_seg between 5 and 3600);
exception when duplicate_object then null; end $$;

-- Patrones que nunca se aceptan en un comando escrito a mano
create table if not exists public.patrones_bloqueados (
  id          smallint generated always as identity primary key,
  patron      text not null unique,    -- expresión regular, sin distinguir mayúsculas
  descripcion text not null
);

insert into public.patrones_bloqueados (patron, descripcion) values
  ('\mformat(\.com)?\s+[a-z]:',                            'Formatear una unidad'),
  ('\mdiskpart\M',                                         'Particionar discos'),
  ('\mmkfs(\.\w+)?\M',                                     'Crear sistema de archivos'),
  ('\mdd\s+if=',                                           'Escritura directa a disco'),
  ('rm\s+-[a-z]*r[a-z]*f?[a-z]*\s+(/|~|\$home)(\s|$)',     'Borrado recursivo de raíz o carpeta personal'),
  ('remove-item[^;|]*-recurse[^;|]*[a-z]:\\\s*($|[;|])',   'Borrado recursivo de una unidad'),
  ('(remove-item|rd|rmdir|ri)\s+(-\w+\s+)*["'']?[a-z]:\\?["'']?(\s|$)', 'Borrar la raíz de una unidad'),
  ('\mdel\s+(/[a-z]\s+)*[a-z]:\\\*?',                      'Borrado masivo de una unidad'),
  ('\mcipher\s+/w',                                        'Borrado seguro de espacio libre'),
  ('\mbcdedit\M',                                          'Configuración de arranque'),
  ('vssadmin\s+delete',                                    'Borrar copias de seguridad'),
  ('\mreg(\.exe)?\s+delete\s+hk',                          'Borrar claves del registro'),
  ('set-executionpolicy',                                  'Cambiar la política de ejecución'),
  ('(iwr|invoke-webrequest|curl|wget)[^|]*\|\s*(iex|invoke-expression|sh|bash|zsh)\M', 'Descargar y ejecutar código'),
  (':\(\)\s*\{',                                           'Bomba de procesos'),
  ('\mnet\s+user\s+\S+\s+\S+',                             'Cambiar contraseñas de cuentas'),
  ('\mcsrutil\M',                                          'Desactivar protección del sistema (macOS)')
on conflict (patron) do nothing;

-- =====================================================================
-- 5. Ejecuciones: catálogo y manuales, lotes, cancelación
-- =====================================================================
create table if not exists public.lotes_ejecuciones (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid references public.organizaciones(id),
  nombre           text not null,
  comando_id       int references public.comandos(id),
  total            int not null default 0,
  creado_por       uuid default auth.uid(),
  creado           timestamptz not null default now()
);

alter table public.ejecuciones_comandos
  add column if not exists organizacion_id         uuid references public.organizaciones(id),
  add column if not exists origen                  text not null default 'catalogo',
  add column if not exists texto_comando           text,
  add column if not exists interprete              text,
  add column if not exists argumentos              jsonb,
  add column if not exists lote_id                 uuid references public.lotes_ejecuciones(id),
  add column if not exists ejecucion_padre_id      bigint references public.ejecuciones_comandos(id),
  add column if not exists cancelacion_solicitada  boolean not null default false,
  add column if not exists confirmado_destructivo  boolean not null default false,
  add column if not exists mensaje_error           text,
  add column if not exists duracion_ms             int,
  add column if not exists lineas_recibidas        int not null default 0;

alter table public.ejecuciones_comandos alter column comando_id drop not null;

update public.ejecuciones_comandos e
   set organizacion_id = d.organizacion_id
  from public.dispositivos d where d.id = e.dispositivo_id and e.organizacion_id is null;
update public.ejecuciones_comandos e
   set texto_comando = c.script, interprete = c.interprete
  from public.comandos c where c.id = e.comando_id and e.texto_comando is null;
update public.ejecuciones_comandos set interprete = 'powershell' where interprete is null;
update public.ejecuciones_comandos set texto_comando = '' where texto_comando is null;
alter table public.ejecuciones_comandos alter column organizacion_id set not null;
alter table public.ejecuciones_comandos alter column texto_comando set not null;

do $$ begin
  alter table public.ejecuciones_comandos add constraint ejecuciones_origen_check
    check (origen in ('catalogo','manual','programado','reintento'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.ejecuciones_comandos add constraint ejecuciones_texto_check
    check (length(texto_comando) <= 8000);
exception when duplicate_object then null; end $$;

-- =====================================================================
-- 6. Alertas ligadas al catálogo y comandos programados
-- =====================================================================
create table if not exists public.tipos_alerta (
  codigo      text primary key,
  nombre      text not null,
  severidad   text not null check (severidad in ('baja','media','alta')),
  condicion   text not null
);

create table if not exists public.alertas_comandos (
  tipo_alerta text not null references public.tipos_alerta(codigo) on delete cascade,
  comando_id  int  not null references public.comandos(id) on delete cascade,
  orden       int  not null default 0,
  primary key (tipo_alerta, comando_id)
);

create table if not exists public.comandos_programados (
  id               bigint generated always as identity primary key,
  organizacion_id  uuid not null references public.organizaciones(id),
  comando_id       int  not null references public.comandos(id),
  dispositivo_id   uuid not null references public.dispositivos(id) on delete cascade,
  expresion_cron   text not null check (expresion_cron ~ '^\S+\s+\S+\s+\S+\s+\S+\s+\S+$'),
  activo           boolean not null default true,
  ultima_ejecucion timestamptz,
  proxima_ejecucion timestamptz,
  creado_por       uuid default auth.uid(),
  creado           timestamptz not null default now()
);

-- =====================================================================
-- 7. Auditoría inmutable
-- =====================================================================
create table if not exists public.auditoria_comandos (
  id              bigint generated always as identity primary key,
  usuario_id      uuid,
  organizacion_id uuid,
  accion          text not null,
  entidad         text not null,
  entidad_id      text,
  antes           jsonb,
  despues         jsonb,
  ip              text,
  creado          timestamptz not null default now()
);

create or replace function public._auditar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_antes jsonb; v_despues jsonb; v_id text; v_org uuid; v_accion text;
begin
  if tg_op = 'DELETE' then v_antes := to_jsonb(old); v_id := v_antes ->> tg_argv[0];
  elsif tg_op = 'INSERT' then v_despues := to_jsonb(new); v_id := v_despues ->> tg_argv[0];
  else v_antes := to_jsonb(old); v_despues := to_jsonb(new); v_id := v_despues ->> tg_argv[0];
  end if;
  -- nunca guardar secretos ni salidas largas en la auditoría
  v_antes   := v_antes   - 'token_hash' - 'clave_hash';
  v_despues := v_despues - 'token_hash' - 'clave_hash';
  v_org := coalesce((v_despues ->> 'organizacion_id')::uuid, (v_antes ->> 'organizacion_id')::uuid);
  v_accion := case tg_op when 'INSERT' then 'crear' when 'DELETE' then 'eliminar' else 'actualizar' end;
  if tg_table_name = 'ejecuciones_comandos' and tg_op = 'UPDATE' then
    v_accion := case
      when new.cancelacion_solicitada and not old.cancelacion_solicitada then 'cancelar'
      else 'estado:' || new.estado end;
  elsif tg_table_name = 'ejecuciones_comandos' and tg_op = 'INSERT' then
    v_accion := 'ejecutar:' || new.origen;
  end if;
  insert into public.auditoria_comandos (usuario_id, organizacion_id, accion, entidad, entidad_id, antes, despues, ip)
  values (auth.uid(), v_org, v_accion, tg_table_name, v_id, v_antes, v_despues, public._ip_solicitud());
  return coalesce(new, old);
end $$;

create or replace function public._auditoria_inmutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'La auditoría no se puede modificar ni borrar';
end $$;

drop trigger if exists auditoria_inmutable on public.auditoria_comandos;
create trigger auditoria_inmutable before update or delete on public.auditoria_comandos
  for each row execute function public._auditoria_inmutable();

drop trigger if exists auditar_comandos on public.comandos;
create trigger auditar_comandos after insert or update or delete on public.comandos
  for each row execute function public._auditar('id');

drop trigger if exists auditar_perfiles on public.perfiles_usuarios;
create trigger auditar_perfiles after insert or update or delete on public.perfiles_usuarios
  for each row execute function public._auditar('usuario_id');

drop trigger if exists auditar_claves on public.claves_registro;
create trigger auditar_claves after insert or update or delete on public.claves_registro
  for each row execute function public._auditar('id');

drop trigger if exists auditar_ejecuciones_ins on public.ejecuciones_comandos;
create trigger auditar_ejecuciones_ins after insert on public.ejecuciones_comandos
  for each row execute function public._auditar('id');
drop trigger if exists auditar_ejecuciones_upd on public.ejecuciones_comandos;
create trigger auditar_ejecuciones_upd after update on public.ejecuciones_comandos
  for each row when (old.estado is distinct from new.estado
                     or old.cancelacion_solicitada is distinct from new.cancelacion_solicitada)
  execute function public._auditar('id');

-- En dispositivos solo se audita lo importante, no cada latido
drop trigger if exists auditar_dispositivos_ins on public.dispositivos;
create trigger auditar_dispositivos_ins after insert or delete on public.dispositivos
  for each row execute function public._auditar('id');
drop trigger if exists auditar_dispositivos_upd on public.dispositivos;
create trigger auditar_dispositivos_upd after update on public.dispositivos
  for each row when (old.activo is distinct from new.activo
                     or old.nombre is distinct from new.nombre
                     or old.organizacion_id is distinct from new.organizacion_id)
  execute function public._auditar('id');

-- =====================================================================
-- 8. Índices para las consultas del panel y del agente
-- =====================================================================
create index if not exists dispositivos_org_idx        on public.dispositivos (organizacion_id, en_linea);
create index if not exists ejecuciones_org_fecha_idx   on public.ejecuciones_comandos (organizacion_id, creado desc);
create index if not exists ejecuciones_disp_fecha_idx  on public.ejecuciones_comandos (dispositivo_id, creado desc);
create index if not exists ejecuciones_activas_idx     on public.ejecuciones_comandos (estado) where estado in ('pendiente','ejecutando');
create index if not exists ejecuciones_lote_idx        on public.ejecuciones_comandos (lote_id) where lote_id is not null;
create index if not exists auditoria_fecha_idx         on public.auditoria_comandos (creado desc);
create index if not exists auditoria_entidad_idx       on public.auditoria_comandos (entidad, entidad_id);
create index if not exists alertas_comandos_idx        on public.alertas_comandos (tipo_alerta, orden);
create index if not exists nonces_fecha_idx            on public.nonces_agente (recibido);
create index if not exists perfiles_org_idx            on public.perfiles_usuarios (organizacion_id);

-- =====================================================================
-- 9. Funciones del panel (las usa el técnico o el administrador)
-- =====================================================================
create or replace function public.mi_perfil()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('usuario_id', p.usuario_id, 'nombre', p.nombre, 'rol', p.rol,
                            'organizacion_id', p.organizacion_id, 'organizacion', o.nombre,
                            'debe_cambiar_contrasena', p.debe_cambiar_contrasena)
  from public.perfiles_usuarios p join public.organizaciones o on o.id = p.organizacion_id
  where p.usuario_id = auth.uid() and p.activo;
$$;

create or replace function public.marcar_contrasena_cambiada()
returns void language sql security definer set search_path = '' as $$
  update public.perfiles_usuarios set debe_cambiar_contrasena = false, actualizado = now()
  where usuario_id = auth.uid();
$$;

-- Núcleo común para crear una ejecución con todas las validaciones
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
    if c.sistema <> d.sistema then raise exception 'El comando no es para el sistema de este equipo'; end if;
    if c.requiere_admin and not v_admin then raise exception 'Este comando requiere rol de administrador' using errcode = '42501'; end if;
    if c.destructivo and not coalesce(p_confirmar, false) and not coalesce(p_simulacion, false) then
      raise exception 'Comando destructivo: se requiere confirmación';
    end if;
    v_texto := c.script; v_interp := c.interprete;
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

  -- límites contra abuso
  if (select count(*) from public.ejecuciones_comandos
       where dispositivo_id = d.id and estado in ('pendiente','ejecutando')) >= 3 then
    raise exception 'El equipo ya tiene 3 ejecuciones en curso; espera a que terminen';
  end if;
  if (select count(*) from public.ejecuciones_comandos
       where solicitado_por = v_uid and estado in ('pendiente','ejecutando')) >= 20 then
    raise exception 'Tienes demasiadas ejecuciones en curso';
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
  select public._crear_ejecucion(p_dispositivo, p_comando, p_texto, p_simulacion, p_confirmar,
                                 case when p_comando is null then 'manual' else 'catalogo' end, null, null);
$$;

create or replace function public.crear_lote(
  p_dispositivos uuid[], p_comando int, p_simulacion boolean default false, p_confirmar boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_lote uuid; v_disp uuid; v_ok int := 0; v_err jsonb := '[]'::jsonb; v_nombre text;
begin
  if p_comando is null then raise exception 'Los lotes solo admiten comandos del catálogo'; end if;
  if coalesce(array_length(p_dispositivos, 1), 0) = 0 then raise exception 'Selecciona al menos un equipo'; end if;
  if array_length(p_dispositivos, 1) > 50 then raise exception 'Máximo 50 equipos por lote'; end if;
  select nombre into v_nombre from public.comandos where id = p_comando;
  insert into public.lotes_ejecuciones (organizacion_id, nombre, comando_id, total)
  values (public.mi_organizacion(), coalesce(v_nombre, 'Lote'), p_comando, array_length(p_dispositivos, 1))
  returning id into v_lote;
  foreach v_disp in array p_dispositivos loop
    begin
      perform public._crear_ejecucion(v_disp, p_comando, null, p_simulacion, p_confirmar, 'catalogo', v_lote, null);
      v_ok := v_ok + 1;
    exception when others then
      v_err := v_err || jsonb_build_object('dispositivo_id', v_disp, 'error', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('lote_id', v_lote, 'creadas', v_ok, 'errores', v_err);
end $$;

create or replace function public.cancelar_ejecucion(p_ejecucion bigint)
returns text language plpgsql security definer set search_path = '' as $$
declare e record;
begin
  select * into e from public.ejecuciones_comandos where id = p_ejecucion;
  if e.id is null or not public.puede_ver_organizacion(e.organizacion_id) then
    raise exception 'Ejecución no encontrada' using errcode = '42501';
  end if;
  if e.estado = 'pendiente' then
    update public.ejecuciones_comandos
       set estado = 'cancelada', cancelacion_solicitada = true, terminado = now(),
           mensaje_error = 'Cancelada antes de iniciar'
     where id = e.id;
    return 'cancelada';
  elsif e.estado = 'ejecutando' then
    update public.ejecuciones_comandos set cancelacion_solicitada = true where id = e.id;
    return 'cancelacion_solicitada';
  end if;
  return 'sin_cambio';
end $$;

create or replace function public.reintentar_ejecucion(p_ejecucion bigint, p_confirmar boolean default false)
returns bigint language plpgsql security definer set search_path = '' as $$
declare e record;
begin
  select * into e from public.ejecuciones_comandos where id = p_ejecucion;
  if e.id is null or not public.puede_ver_organizacion(e.organizacion_id) then
    raise exception 'Ejecución no encontrada' using errcode = '42501';
  end if;
  if e.estado in ('pendiente','ejecutando') then raise exception 'La ejecución sigue en curso'; end if;
  return public._crear_ejecucion(e.dispositivo_id, e.comando_id,
           case when e.comando_id is null then e.texto_comando end,
           e.modo_simulacion, p_confirmar or e.confirmado_destructivo, 'reintento', null, e.id);
end $$;

-- Administración (solo administrador)
create or replace function public.crear_clave_registro(
  p_organizacion uuid, p_descripcion text default 'Instalador',
  p_usos_maximos int default null, p_dias_vigencia int default 30)
returns text language plpgsql security definer set search_path = '' as $$
declare v_clave text := 'BTL-' || encode(extensions.gen_random_bytes(18), 'hex');
begin
  if auth.uid() is not null and not public.es_administrador() then
    raise exception 'Solo un administrador puede crear claves de registro' using errcode = '42501';
  end if;
  insert into public.claves_registro (organizacion_id, descripcion, clave_hash, usos_maximos, vence)
  values (p_organizacion, p_descripcion, encode(extensions.digest(v_clave, 'sha256'), 'hex'), p_usos_maximos,
          case when p_dias_vigencia is null then null else now() + make_interval(days => p_dias_vigencia) end);
  return v_clave;   -- se muestra una sola vez; en la base solo queda el hash
end $$;

create or replace function public.revocar_dispositivo(p_dispositivo uuid, p_activo boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_administrador() then raise exception 'Solo administrador' using errcode = '42501'; end if;
  update public.dispositivos set activo = p_activo, en_linea = (en_linea and p_activo) where id = p_dispositivo;
  update public.ejecuciones_comandos set estado = 'cancelada', terminado = now(), mensaje_error = 'Equipo revocado'
   where dispositivo_id = p_dispositivo and estado = 'pendiente' and not p_activo;
end $$;

create or replace function public.rotar_token_dispositivo(p_dispositivo uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_administrador() then raise exception 'Solo administrador' using errcode = '42501'; end if;
  update public.credenciales_dispositivos set rotacion_solicitada = true, actualizado = now()
   where dispositivo_id = p_dispositivo;
end $$;

-- =====================================================================
-- 10. Protocolo del agente
--   agente_registrar: alta automática con la clave del instalador
--   agente_rpc:       única puerta para el resto; cada llamada lleva
--                     dispositivo, marca de tiempo, número único y firma
--                     HMAC-SHA256(llave = sha256 del token,
--                                 mensaje = accion|ts|nonce|cuerpo)
-- =====================================================================
drop function if exists public.agente_reclamar(text);
drop function if exists public.agente_salida(text, bigint, jsonb);
drop function if exists public.agente_finalizar(text, bigint, int, text);
drop function if exists public.registrar_dispositivo(text, text);
drop function if exists public._dispositivo_por_token(text);

create or replace function public.agente_registrar(p_clave text, p_equipo jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  k record; v_nombre text; v_sistema text; v_disp uuid; v_token text; v_nuevo boolean := false;
begin
  select * into k from public.claves_registro
   where clave_hash = encode(extensions.digest(coalesce(p_clave, ''), 'sha256'), 'hex')
   for update;
  if k.id is null or not k.activa or (k.vence is not null and k.vence < now())
     or (k.usos_maximos is not null and k.usos >= k.usos_maximos) then
    raise exception 'Clave de registro inválida o vencida' using errcode = '28000';
  end if;

  v_nombre  := left(btrim(coalesce(p_equipo ->> 'nombre', '')), 80);
  v_sistema := lower(coalesce(p_equipo ->> 'sistema', ''));
  if v_nombre !~ '^[A-Za-z0-9][A-Za-z0-9._ -]{0,79}$' then raise exception 'Nombre de equipo no válido'; end if;
  if v_sistema not in ('windows','macos') then raise exception 'Sistema operativo no soportado'; end if;

  select id into v_disp from public.dispositivos where organizacion_id = k.organizacion_id and nombre = v_nombre;
  if v_disp is null then
    insert into public.dispositivos (nombre, sistema, organizacion_id)
    values (v_nombre, v_sistema, k.organizacion_id) returning id into v_disp;
    v_nuevo := true;
  end if;

  update public.dispositivos set
    sistema        = v_sistema,
    activo         = true,
    ip_local       = left(p_equipo ->> 'ip_local', 64),
    ip_publica     = public._ip_solicitud(),
    usuario_so     = left(p_equipo ->> 'usuario_so', 120),
    version_so     = left(p_equipo ->> 'version_so', 120),
    arquitectura   = left(p_equipo ->> 'arquitectura', 40),
    version_agente = left(p_equipo ->> 'version_agente', 40),
    interpretes    = coalesce(p_equipo -> 'interpretes', '[]'::jsonb),
    ultimo_latido  = now(),
    ultimo_contacto = now(),
    en_linea       = true
  where id = v_disp;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');   -- 256 bits
  insert into public.credenciales_dispositivos (dispositivo_id, token_hash)
  values (v_disp, encode(extensions.digest(v_token, 'sha256'), 'hex'))
  on conflict (dispositivo_id) do update set token_hash = excluded.token_hash,
                                             rotacion_solicitada = false, actualizado = now();

  update public.claves_registro set usos = usos + 1 where id = k.id;

  insert into public.auditoria_comandos (organizacion_id, accion, entidad, entidad_id, despues, ip)
  values (k.organizacion_id, case when v_nuevo then 'registro' else 'reregistro' end, 'dispositivos', v_disp::text,
          jsonb_build_object('nombre', v_nombre, 'sistema', v_sistema, 'clave', k.descripcion), public._ip_solicitud());

  return jsonb_build_object('dispositivo_id', v_disp, 'token', v_token,
                            'intervalo_latido', 30, 'intervalo_sondeo', 2);
end $$;

create or replace function public.agente_rpc(
  p_dispositivo uuid, p_ts bigint, p_nonce text, p_firma text, p_accion text, p_cuerpo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  cred record; d record; e record; v_llave text; v_esperada text; v_cuerpo jsonb;
  v_ejec bigint; v_lineas jsonb; v_n int; v_estado text; v_token text; v_res jsonb;
begin
  -- 1. Validaciones de forma
  if p_accion not in ('latido','reclamar','salida','finalizar','rotar') then
    raise exception 'Acción no válida' using errcode = '22023';
  end if;
  if p_nonce is null or p_nonce !~ '^[A-Za-z0-9-]{16,64}$' then
    raise exception 'Número único no válido' using errcode = '22023';
  end if;
  if length(coalesce(p_cuerpo, '')) > 262144 then
    raise exception 'Cuerpo demasiado grande' using errcode = '54000';
  end if;
  if abs(extract(epoch from now()) - p_ts) > 300 then
    raise exception 'Marca de tiempo fuera de rango: revisa el reloj del equipo' using errcode = '28000';
  end if;

  -- 2. Firma
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

  -- 3. Anti-reenvío
  begin
    insert into public.nonces_agente (dispositivo_id, nonce) values (p_dispositivo, p_nonce);
  exception when unique_violation then
    raise exception 'Llamada repetida' using errcode = '28000';
  end;

  v_cuerpo := coalesce(nullif(p_cuerpo, '')::jsonb, '{}'::jsonb);
  update public.dispositivos set ultimo_contacto = now(), ultimo_latido = now(), en_linea = true,
         ip_publica = coalesce(public._ip_solicitud(), ip_publica)
   where id = p_dispositivo;

  -- 4. Acciones
  if p_accion = 'latido' then
    update public.dispositivos set
      ip_local       = coalesce(left(v_cuerpo ->> 'ip_local', 64), ip_local),
      usuario_so     = coalesce(left(v_cuerpo ->> 'usuario_so', 120), usuario_so),
      version_so     = coalesce(left(v_cuerpo ->> 'version_so', 120), version_so),
      arquitectura   = coalesce(left(v_cuerpo ->> 'arquitectura', 40), arquitectura),
      version_agente = coalesce(left(v_cuerpo ->> 'version_agente', 40), version_agente),
      interpretes    = coalesce(v_cuerpo -> 'interpretes', interpretes),
      metricas       = coalesce(v_cuerpo -> 'metricas', metricas)
    where id = p_dispositivo;
    return jsonb_build_object('ok', true, 'rotar_token', cred.rotacion_solicitada,
                              'intervalo_latido', 30, 'intervalo_sondeo', 2);

  elsif p_accion = 'reclamar' then
    select x.* into e from public.ejecuciones_comandos x
     where x.dispositivo_id = p_dispositivo and x.estado = 'pendiente' and not x.cancelacion_solicitada
     order by x.creado limit 1 for update skip locked;
    if e.id is null then return jsonb_build_object('ejecucion', null); end if;
    update public.ejecuciones_comandos set estado = 'ejecutando', iniciado = now() where id = e.id;
    return jsonb_build_object('ejecucion', jsonb_build_object(
      'id', e.id, 'script', e.texto_comando, 'interprete', e.interprete,
      'simulacion', e.modo_simulacion,
      'timeout_seg', coalesce((select c.timeout_seg from public.comandos c where c.id = e.comando_id), 120),
      -- el servidor también firma: el agente comprueba que la orden viene de quien conoce su llave
      'firma', encode(extensions.hmac(convert_to(e.id || '|' || e.texto_comando, 'UTF8'),
                                      convert_to(v_llave, 'UTF8'), 'sha256'), 'hex')));

  elsif p_accion = 'salida' then
    v_ejec := (v_cuerpo ->> 'ejecucion_id')::bigint;
    v_lineas := coalesce(v_cuerpo -> 'lineas', '[]'::jsonb);
    select x.* into e from public.ejecuciones_comandos x where x.id = v_ejec and x.dispositivo_id = p_dispositivo;
    if e.id is null or e.estado <> 'ejecutando' then raise exception 'Ejecución no válida'; end if;
    if jsonb_typeof(v_lineas) <> 'array' or jsonb_array_length(v_lineas) > 500 then
      raise exception 'Máximo 500 líneas por envío';
    end if;
    if e.lineas_recibidas < 20000 then
      insert into public.fragmentos_salida_comandos (ejecucion_id, secuencia, flujo, texto)
      select v_ejec, (l ->> 's')::int,
             case when l ->> 'f' in ('stdout','stderr','sistema') then l ->> 'f' else 'stdout' end,
             left(coalesce(l ->> 't', ''), 4000)
        from jsonb_array_elements(v_lineas) l
      on conflict (ejecucion_id, secuencia) do nothing;
      get diagnostics v_n = row_count;
      update public.ejecuciones_comandos set lineas_recibidas = lineas_recibidas + v_n where id = v_ejec;
    end if;
    return jsonb_build_object('ok', true, 'cancelar', e.cancelacion_solicitada,
                              'truncada', e.lineas_recibidas >= 20000);

  elsif p_accion = 'finalizar' then
    v_ejec := (v_cuerpo ->> 'ejecucion_id')::bigint;
    v_estado := v_cuerpo ->> 'estado';
    if v_estado not in ('exitosa','fallida','tiempo_agotado','cancelada') then v_estado := 'fallida'; end if;
    update public.ejecuciones_comandos set
      estado        = v_estado,
      codigo_salida = (v_cuerpo ->> 'codigo')::int,
      duracion_ms   = (v_cuerpo ->> 'duracion_ms')::int,
      mensaje_error = left(v_cuerpo ->> 'error', 1000),
      terminado     = now()
    where id = v_ejec and dispositivo_id = p_dispositivo and estado = 'ejecutando';
    return jsonb_build_object('ok', found);

  elsif p_accion = 'rotar' then
    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    update public.credenciales_dispositivos
       set token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
           rotacion_solicitada = false, actualizado = now()
     where dispositivo_id = p_dispositivo;
    insert into public.auditoria_comandos (organizacion_id, accion, entidad, entidad_id)
    values (d.organizacion_id, 'rotar_token', 'dispositivos', p_dispositivo::text);
    return jsonb_build_object('token', v_token);
  end if;
  return null;
end $$;

-- =====================================================================
-- 11. Mantenimiento automático (pg_cron cada minuto)
-- =====================================================================
create or replace function public.mantenimiento_agentes()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_off int; v_tiempo int; v_huerf int; v_nonces int;
begin
  update public.dispositivos set en_linea = false
   where en_linea and (ultimo_latido is null or ultimo_latido < now() - interval '75 seconds');
  get diagnostics v_off = row_count;

  update public.ejecuciones_comandos e set estado = 'tiempo_agotado', terminado = now(),
         mensaje_error = 'El agente no informó el final a tiempo'
    from public.comandos c
   where e.estado = 'ejecutando' and c.id = e.comando_id
     and e.iniciado < now() - make_interval(secs => c.timeout_seg + 60);
  get diagnostics v_tiempo = row_count;
  update public.ejecuciones_comandos set estado = 'tiempo_agotado', terminado = now(),
         mensaje_error = 'El agente no informó el final a tiempo'
   where estado = 'ejecutando' and comando_id is null and iniciado < now() - interval '180 seconds';

  update public.ejecuciones_comandos set estado = 'fallida', terminado = now(),
         mensaje_error = 'El equipo no tomó la orden en 10 minutos'
   where estado = 'pendiente' and creado < now() - interval '10 minutes';
  get diagnostics v_huerf = row_count;

  delete from public.nonces_agente where recibido < now() - interval '15 minutes';
  get diagnostics v_nonces = row_count;

  return jsonb_build_object('fuera_de_linea', v_off, 'tiempo_agotado', v_tiempo,
                            'pendientes_vencidas', v_huerf, 'nonces_borrados', v_nonces);
end $$;

do $$ begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron no disponible: activa la extensión en Database > Extensions y vuelve a correr esta migración';
  end;
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('btl_mantenimiento_agentes', '* * * * *', 'select public.mantenimiento_agentes()');
  end if;
end $$;

-- =====================================================================
-- 12. Permisos y RLS por organización
-- =====================================================================
alter table public.organizaciones            enable row level security;
alter table public.perfiles_usuarios         enable row level security;
alter table public.credenciales_dispositivos enable row level security;
alter table public.nonces_agente             enable row level security;
alter table public.claves_registro           enable row level security;
alter table public.patrones_bloqueados       enable row level security;
alter table public.lotes_ejecuciones         enable row level security;
alter table public.tipos_alerta              enable row level security;
alter table public.alertas_comandos          enable row level security;
alter table public.comandos_programados      enable row level security;
alter table public.auditoria_comandos        enable row level security;

-- Se quitan los permisos amplios de la demo y se dan solo los necesarios
revoke all on all tables in schema public from anon;
revoke insert, update, delete on all tables in schema public from authenticated;
revoke all on public.credenciales_dispositivos, public.nonces_agente from authenticated;
grant select on public.organizaciones, public.perfiles_usuarios, public.dispositivos, public.categorias_comandos,
                public.comandos, public.ejecuciones_comandos, public.fragmentos_salida_comandos,
                public.lotes_ejecuciones, public.tipos_alerta, public.alertas_comandos,
                public.comandos_programados, public.auditoria_comandos, public.claves_registro,
                public.patrones_bloqueados
  to authenticated;
grant insert, update, delete on public.comandos, public.categorias_comandos, public.alertas_comandos,
                public.comandos_programados
  to authenticated;   -- RLS limita estas escrituras al administrador
revoke select on public.claves_registro from authenticated;
grant select (id, organizacion_id, descripcion, usos, usos_maximos, vence, activa, creado)
  on public.claves_registro to authenticated;

-- borrar políticas viejas de la migración 001
drop policy if exists panel_lee_dispositivos  on public.dispositivos;
drop policy if exists panel_lee_categorias    on public.categorias_comandos;
drop policy if exists panel_lee_catalogo      on public.comandos;
drop policy if exists panel_lee_ejecuciones   on public.ejecuciones_comandos;
drop policy if exists panel_crea_ejecuciones  on public.ejecuciones_comandos;
drop policy if exists panel_lee_salida        on public.fragmentos_salida_comandos;

do $$
declare t text;
begin
  -- quitar políticas previas de esta migración para poder re-correrla
  for t in select format('drop policy if exists %I on %I.%I', policyname, schemaname, tablename)
             from pg_policies where schemaname = 'public' and policyname like 'btl\_%'
  loop execute t; end loop;
end $$;

create policy btl_org_ver        on public.organizaciones       for select to authenticated using (public.puede_ver_organizacion(id));
create policy btl_perfil_ver     on public.perfiles_usuarios    for select to authenticated using (usuario_id = auth.uid() or public.es_administrador());
create policy btl_disp_ver       on public.dispositivos         for select to authenticated using (public.puede_ver_organizacion(organizacion_id));
create policy btl_cat_ver        on public.categorias_comandos  for select to authenticated using (true);
create policy btl_cat_admin      on public.categorias_comandos  for all    to authenticated using (public.es_administrador()) with check (public.es_administrador());
create policy btl_cmd_ver        on public.comandos             for select to authenticated using (activo or public.es_administrador());
create policy btl_cmd_admin      on public.comandos             for all    to authenticated using (public.es_administrador()) with check (public.es_administrador());
create policy btl_ejec_ver       on public.ejecuciones_comandos for select to authenticated using (public.puede_ver_organizacion(organizacion_id));
create policy btl_salida_ver     on public.fragmentos_salida_comandos for select to authenticated
  using (exists (select 1 from public.ejecuciones_comandos e where e.id = ejecucion_id));
create policy btl_lote_ver       on public.lotes_ejecuciones    for select to authenticated using (public.puede_ver_organizacion(organizacion_id));
create policy btl_alerta_ver     on public.tipos_alerta         for select to authenticated using (true);
create policy btl_alcmd_ver      on public.alertas_comandos     for select to authenticated using (true);
create policy btl_alcmd_admin    on public.alertas_comandos     for all    to authenticated using (public.es_administrador()) with check (public.es_administrador());
create policy btl_prog_ver       on public.comandos_programados for select to authenticated using (public.puede_ver_organizacion(organizacion_id));
create policy btl_prog_admin     on public.comandos_programados for all    to authenticated using (public.es_administrador()) with check (public.es_administrador());
create policy btl_audit_ver      on public.auditoria_comandos   for select to authenticated using (public.es_administrador());
create policy btl_clave_ver      on public.claves_registro      for select to authenticated using (public.es_administrador());
create policy btl_patron_ver     on public.patrones_bloqueados  for select to authenticated using (public.es_administrador());
-- credenciales_dispositivos y nonces_agente: RLS activo y sin políticas → nadie las lee desde fuera

-- Funciones: nadie por defecto, y luego solo quien las necesita
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function public.agente_registrar(text, jsonb)                              to anon, authenticated;
grant execute on function public.agente_rpc(uuid, bigint, text, text, text, text)           to anon, authenticated;
grant execute on function public.mi_perfil()                                                to authenticated;
grant execute on function public.marcar_contrasena_cambiada()                               to authenticated;
grant execute on function public.crear_ejecucion(uuid, int, text, boolean, boolean)         to authenticated;
grant execute on function public.crear_lote(uuid[], int, boolean, boolean)                  to authenticated;
grant execute on function public.cancelar_ejecucion(bigint)                                 to authenticated;
grant execute on function public.reintentar_ejecucion(bigint, boolean)                      to authenticated;
grant execute on function public.crear_clave_registro(uuid, text, int, int)                 to authenticated;
grant execute on function public.revocar_dispositivo(uuid, boolean)                         to authenticated;
grant execute on function public.rotar_token_dispositivo(uuid)                              to authenticated;
grant execute on function public.es_administrador(), public.mi_organizacion(),
                          public.puede_ver_organizacion(uuid)                               to authenticated;
alter default privileges in schema public revoke execute on functions from public;

-- =====================================================================
-- 13. Realtime: el panel se entera de equipos nuevos, estados y salida
-- =====================================================================
do $$ begin
  begin alter publication supabase_realtime add table public.dispositivos; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.ejecuciones_comandos; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.fragmentos_salida_comandos; exception when duplicate_object then null; end;
end $$;

-- =====================================================================
-- 14. Datos semilla (BTL-38): categorías, catálogo, tipos de alerta
-- =====================================================================
insert into public.categorias_comandos (nombre, orden) values
  ('Diagnóstico', 1), ('Procesos', 2), ('Red', 3), ('Servicios', 4), ('Mantenimiento', 5)
on conflict (nombre) do update set orden = excluded.orden;

insert into public.comandos (categoria_id, nombre, sistema, script, timeout_seg, destructivo, requiere_admin, descripcion)
select c.id, v.nombre, v.sistema, v.script, v.timeout, v.destr, v.adm, v.descr
from (values
  ('Diagnóstico','Uso de CPU y memoria','windows',
   '$os = Get-CimInstance Win32_OperatingSystem; $cpu = (Get-CimInstance Win32_Processor | Measure-Object LoadPercentage -Average).Average; "CPU: $cpu %"; "Memoria usada: " + [math]::Round((1 - $os.FreePhysicalMemory / $os.TotalVisibleMemorySize) * 100, 1) + " % de " + [math]::Round($os.TotalVisibleMemorySize / 1MB, 1) + " GB"',
   30, false, false, 'Porcentaje de uso del procesador y de la memoria'),
  ('Diagnóstico','Uso de CPU y memoria','macos',
   'top -l 2 -n 0 | grep -E "^(CPU usage|PhysMem)" | tail -2',
   30, false, false, 'Porcentaje de uso del procesador y de la memoria'),
  ('Diagnóstico','Tiempo encendido','macos', 'uptime', 15, false, false, 'Desde cuándo está encendido el equipo'),
  ('Diagnóstico','Información del sistema','windows',
   'Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, OSArchitecture, LastBootUpTime | Format-List | Out-String -Stream',
   30, false, false, 'Versión de Windows, arquitectura y último arranque'),
  ('Diagnóstico','Información del sistema','macos', 'sw_vers; uname -m', 15, false, false, 'Versión de macOS y arquitectura'),
  ('Procesos','Top 10 procesos por memoria','windows',
   'Get-Process | Sort-Object WS -Descending | Select-Object -First 10 Name, Id, @{n="RAM MB";e={[math]::Round($_.WS/1MB)}} | Format-Table -AutoSize | Out-String -Stream',
   30, false, false, 'Los programas que más memoria consumen'),
  ('Procesos','Top 10 procesos por memoria','macos', 'ps -amcwwxo pid,rss,comm | head -11', 15, false, false, 'Los programas que más memoria consumen'),
  ('Procesos','Procesos que no responden','windows',
   '$p = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and -not $_.Responding }; if ($p) { $p | Select-Object Name, Id | Format-Table -AutoSize | Out-String -Stream } else { "Todos los programas responden" }',
   30, false, false, 'Programas con ventana que dejaron de responder'),
  ('Red','Configuración IP','macos', 'ifconfig | grep -E "^[a-z]|inet "', 15, false, false, 'Interfaces de red y sus direcciones'),
  ('Red','Prueba de conexión a la plataforma','windows',
   'Test-NetConnection supabase.co -Port 443 | Select-Object ComputerName, RemoteAddress, TcpTestSucceeded | Format-List | Out-String -Stream',
   45, false, false, 'Comprueba la salida por HTTPS'),
  ('Red','Prueba de conexión a la plataforma','macos', 'curl -sS -o /dev/null -w "HTTPS %{http_code} en %{time_total} s\n" https://supabase.co', 30, false, false, 'Comprueba la salida por HTTPS'),
  ('Servicios','Estado de la cola de impresión','windows',
   'Get-Service Spooler | Select-Object Name, Status, StartType | Format-List | Out-String -Stream',
   15, false, false, 'Revisa si el servicio de impresión está funcionando'),
  ('Servicios','Reiniciar cola de impresión','windows',
   'Restart-Service Spooler -Force; Get-Service Spooler | Select-Object Name, Status | Format-List | Out-String -Stream',
   60, true, true, 'Reinicia el servicio de impresión; interrumpe impresiones en curso'),
  ('Mantenimiento','Tamaño de archivos temporales','windows',
   '$t = Get-ChildItem $env:windir\Temp -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum; "Temporales del sistema: " + [math]::Round($t.Sum/1MB, 1) + " MB en " + $t.Count + " archivos"',
   120, false, false, 'Cuánto ocupan los temporales del sistema'),
  ('Mantenimiento','Errores recientes del sistema','windows',
   'Get-WinEvent -FilterHashtable @{LogName="System"; Level=1,2; StartTime=(Get-Date).AddHours(-24)} -MaxEvents 15 -ErrorAction SilentlyContinue | Select-Object TimeCreated, ProviderName, Id | Format-Table -AutoSize | Out-String -Stream',
   60, false, false, 'Errores y eventos críticos de las últimas 24 horas'),
  ('Mantenimiento','Errores recientes del sistema','macos',
   'log show --last 30m --predicate "messageType == error" --style compact 2>/dev/null | tail -20',
   120, false, false, 'Errores del sistema de los últimos 30 minutos')
) as v(categoria, nombre, sistema, script, timeout, destr, adm, descr)
join public.categorias_comandos c on c.nombre = v.categoria
on conflict (nombre, sistema) do nothing;

update public.comandos set descripcion = coalesce(descripcion, case nombre
  when 'Nombre del equipo' then 'Nombre con el que el equipo aparece en la red'
  when 'Usuario actual' then 'Cuenta con la que corre el agente'
  when 'Tiempo encendido' then 'Desde cuándo está encendido el equipo'
  when 'Espacio en disco' then 'Espacio usado y libre en cada unidad'
  when 'Ping a Google (8 veces)' then 'Prueba de conectividad a internet'
  when 'Configuración IP' then 'Direcciones IP y adaptadores de red'
  when 'Traza de ruta a Google' then 'Ruta de red hacia internet'
  when 'Top 10 procesos por CPU' then 'Los programas que más procesador consumen'
  end);

insert into public.tipos_alerta (codigo, nombre, severidad, condicion) values
  ('TA-01','CPU alta sostenida','alta','CPU >= 90 % en 3 reportes seguidos'),
  ('TA-02','Memoria alta sostenida','alta','Memoria >= 90 % en 3 reportes seguidos'),
  ('TA-03','Disco casi lleno','media','Libre < 10 % o < 10 GB en la unidad del sistema'),
  ('TA-04','Proceso bloqueado','media','Un proceso no responde en 2 reportes seguidos'),
  ('TA-05','Proceso con consumo excesivo','media','Un proceso >= 50 % CPU o >= 25 % memoria en 2 reportes'),
  ('TA-06','Servicio crítico detenido','media','Un servicio de la lista crítica no está en ejecución'),
  ('TA-07','Sin reinicio prolongado','baja','Más de 14 días encendido'),
  ('TA-08','Errores del sistema','media','5 o más errores graves en la última hora'),
  ('TA-09','Actualizaciones pendientes','baja','Actualizaciones de seguridad pendientes por más de 7 días'),
  ('TA-10','Temporales excesivos','baja','Temporales del sistema > 5 GB'),
  ('TA-11','Agente sin reportar','alta','Sin latido en más de 75 segundos')
on conflict (codigo) do update set nombre = excluded.nombre, severidad = excluded.severidad, condicion = excluded.condicion;

insert into public.alertas_comandos (tipo_alerta, comando_id, orden)
select m.tipo, c.id, m.orden
from (values
  ('TA-01','Uso de CPU y memoria',1), ('TA-01','Top 10 procesos por CPU',2),
  ('TA-02','Uso de CPU y memoria',1), ('TA-02','Top 10 procesos por memoria',2),
  ('TA-03','Espacio en disco',1), ('TA-03','Tamaño de archivos temporales',2),
  ('TA-04','Procesos que no responden',1), ('TA-04','Top 10 procesos por CPU',2),
  ('TA-05','Top 10 procesos por CPU',1), ('TA-05','Top 10 procesos por memoria',2),
  ('TA-06','Estado de la cola de impresión',1), ('TA-06','Reiniciar cola de impresión',2),
  ('TA-07','Tiempo encendido',1), ('TA-07','Información del sistema',2),
  ('TA-08','Errores recientes del sistema',1),
  ('TA-09','Información del sistema',1),
  ('TA-10','Tamaño de archivos temporales',1), ('TA-10','Espacio en disco',2),
  ('TA-11','Prueba de conexión a la plataforma',1), ('TA-11','Ping a Google (8 veces)',2), ('TA-11','Configuración IP',3)
) as m(tipo, nombre, orden)
join public.comandos c on c.nombre = m.nombre
on conflict (tipo_alerta, comando_id) do update set orden = excluded.orden;

-- Fin de la migración 002

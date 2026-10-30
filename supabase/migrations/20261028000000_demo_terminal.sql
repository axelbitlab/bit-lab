-- =====================================================================
-- Bitlab Terminal · Migración 001 · Demo de consola remota en vivo
-- Tablas con los nombres del plan (Épica 3), para adaptarlas después
-- al Supabase real de Bitlab (ahí "dispositivos" se cambia por la
-- tabla de equipos que ya existe).
-- Correr completo en: Supabase > SQL Editor > New query > Run
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- tablas ----------
create table if not exists public.dispositivos (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null unique,
  sistema         text not null default 'windows' check (sistema in ('windows','macos')),
  token_hash      text not null,                 -- sha256 del token del agente, nunca el token
  ultimo_contacto timestamptz,
  creado          timestamptz not null default now()
);

create table if not exists public.categorias_comandos (
  id     smallint generated always as identity primary key,
  nombre text not null unique
);

create table if not exists public.comandos (
  id           int generated always as identity primary key,
  categoria_id smallint references public.categorias_comandos(id),
  nombre       text not null,
  sistema      text not null check (sistema in ('windows','macos')),
  script       text not null,
  destructivo  boolean not null default false,
  timeout_seg  int not null default 60,
  activo       boolean not null default true,
  unique (nombre, sistema)
);

create table if not exists public.ejecuciones_comandos (
  id              bigint generated always as identity primary key,
  dispositivo_id  uuid not null references public.dispositivos(id),
  comando_id      int  not null references public.comandos(id),
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente','ejecutando','exitosa','fallida','cancelada','tiempo_agotado')),
  modo_simulacion boolean not null default false,
  codigo_salida   int,
  solicitado_por  uuid default auth.uid() references auth.users(id),
  creado          timestamptz not null default now(),
  iniciado        timestamptz,
  terminado       timestamptz
);
create index if not exists ejecuciones_cola_idx
  on public.ejecuciones_comandos (dispositivo_id, estado, creado);

create table if not exists public.fragmentos_salida_comandos (
  id           bigint generated always as identity primary key,
  ejecucion_id bigint not null references public.ejecuciones_comandos(id) on delete cascade,
  secuencia    int  not null,
  flujo        text not null default 'stdout' check (flujo in ('stdout','stderr','sistema')),
  texto        text not null,
  creado       timestamptz not null default now(),
  unique (ejecucion_id, secuencia)               -- idempotencia: un reintento no duplica líneas
);

-- ---------- RLS (demo: cualquier usuario del panel; luego se filtra por organización) ----------
alter table public.dispositivos               enable row level security;
alter table public.categorias_comandos        enable row level security;
alter table public.comandos                   enable row level security;
alter table public.ejecuciones_comandos       enable row level security;
alter table public.fragmentos_salida_comandos enable row level security;

grant usage on schema public to anon, authenticated;
grant select (id, nombre, sistema, ultimo_contacto, creado) on public.dispositivos to authenticated; -- sin token_hash
grant select on public.categorias_comandos, public.comandos to authenticated;
grant select, insert on public.ejecuciones_comandos to authenticated;
grant select on public.fragmentos_salida_comandos to authenticated;

drop policy if exists panel_lee_dispositivos on public.dispositivos;
create policy panel_lee_dispositivos on public.dispositivos for select to authenticated using (true);

drop policy if exists panel_lee_categorias on public.categorias_comandos;
create policy panel_lee_categorias on public.categorias_comandos for select to authenticated using (true);

drop policy if exists panel_lee_catalogo on public.comandos;
create policy panel_lee_catalogo on public.comandos for select to authenticated using (activo);

drop policy if exists panel_lee_ejecuciones on public.ejecuciones_comandos;
create policy panel_lee_ejecuciones on public.ejecuciones_comandos for select to authenticated using (true);

drop policy if exists panel_crea_ejecuciones on public.ejecuciones_comandos;
create policy panel_crea_ejecuciones on public.ejecuciones_comandos for insert to authenticated
  with check (
    solicitado_por = auth.uid()
    and estado = 'pendiente'
    and exists (select 1 from public.comandos c where c.id = comando_id and c.activo)  -- solo catálogo
  );

drop policy if exists panel_lee_salida on public.fragmentos_salida_comandos;
create policy panel_lee_salida on public.fragmentos_salida_comandos for select to authenticated using (true);

-- ---------- funciones del agente (token por equipo; el agente nunca usa la service key) ----------
create or replace function public._dispositivo_por_token(p_token text)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.dispositivos
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

create or replace function public.agente_reclamar(p_token text)
returns table (ejecucion_id bigint, script text, simulacion boolean, timeout_seg int)
language plpgsql security definer set search_path = '' as $$
declare v_disp uuid; v_id bigint;
begin
  v_disp := public._dispositivo_por_token(p_token);
  if v_disp is null then raise exception 'token inválido' using errcode = '28000'; end if;

  update public.dispositivos set ultimo_contacto = now() where id = v_disp;

  select e.id into v_id
  from public.ejecuciones_comandos e
  where e.dispositivo_id = v_disp and e.estado = 'pendiente'
  order by e.creado
  limit 1
  for update skip locked;

  if v_id is null then return; end if;

  update public.ejecuciones_comandos set estado = 'ejecutando', iniciado = now() where id = v_id;

  return query
    select e.id, c.script, e.modo_simulacion, c.timeout_seg
    from public.ejecuciones_comandos e
    join public.comandos c on c.id = e.comando_id
    where e.id = v_id;
end;
$$;

create or replace function public.agente_salida(p_token text, p_ejecucion bigint, p_lineas jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_disp uuid;
begin
  v_disp := public._dispositivo_por_token(p_token);
  if v_disp is null then raise exception 'token inválido' using errcode = '28000'; end if;
  if not exists (select 1 from public.ejecuciones_comandos
                 where id = p_ejecucion and dispositivo_id = v_disp and estado = 'ejecutando') then
    raise exception 'ejecución no válida';
  end if;
  insert into public.fragmentos_salida_comandos (ejecucion_id, secuencia, flujo, texto)
  select p_ejecucion, (l->>'s')::int, coalesce(l->>'f', 'stdout'), left(coalesce(l->>'t', ''), 4000)
  from jsonb_array_elements(p_lineas) l
  on conflict (ejecucion_id, secuencia) do nothing;
end;
$$;

create or replace function public.agente_finalizar(p_token text, p_ejecucion bigint, p_codigo int, p_estado text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_disp uuid;
begin
  v_disp := public._dispositivo_por_token(p_token);
  if v_disp is null then raise exception 'token inválido' using errcode = '28000'; end if;
  update public.ejecuciones_comandos
     set estado = case when p_estado in ('exitosa','fallida','tiempo_agotado') then p_estado else 'fallida' end,
         codigo_salida = p_codigo,
         terminado = now()
   where id = p_ejecucion and dispositivo_id = v_disp and estado = 'ejecutando';
end;
$$;

-- Alta de equipos: solo desde el SQL Editor. Devuelve el token UNA vez.
create or replace function public.registrar_dispositivo(p_nombre text, p_sistema text default 'windows')
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  insert into public.dispositivos (nombre, sistema, token_hash)
  values (p_nombre, p_sistema, encode(extensions.digest(v_token, 'sha256'), 'hex'))
  on conflict (nombre) do update set token_hash = excluded.token_hash, sistema = excluded.sistema;  -- re-registrar = rotar token
  return v_token;
end;
$$;

revoke all on function public._dispositivo_por_token(text)            from public, anon, authenticated;
revoke all on function public.registrar_dispositivo(text, text)       from public, anon, authenticated;
revoke all on function public.agente_reclamar(text)                   from public;
revoke all on function public.agente_salida(text, bigint, jsonb)      from public;
revoke all on function public.agente_finalizar(text, bigint, int, text) from public;
grant execute on function public.agente_reclamar(text)                   to anon, authenticated;
grant execute on function public.agente_salida(text, bigint, jsonb)      to anon, authenticated;
grant execute on function public.agente_finalizar(text, bigint, int, text) to anon, authenticated;

-- ---------- Realtime: el panel escucha la salida y el estado ----------
do $$
begin
  begin alter publication supabase_realtime add table public.fragmentos_salida_comandos; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.ejecuciones_comandos;       exception when duplicate_object then null; end;
end $$;

-- ---------- catálogo inicial (catálogo cerrado, como dice el protocolo) ----------
insert into public.categorias_comandos (nombre) values ('Diagnóstico'), ('Red'), ('Procesos')
on conflict (nombre) do nothing;

insert into public.comandos (categoria_id, nombre, sistema, script, timeout_seg)
select c.id, v.nombre, v.sistema, v.script, v.timeout
from (values
  ('Diagnóstico', 'Nombre del equipo',      'windows', 'hostname', 15),
  ('Diagnóstico', 'Usuario actual',         'windows', 'whoami', 15),
  ('Diagnóstico', 'Tiempo encendido',       'windows', '"Encendido desde: " + (Get-CimInstance Win32_OperatingSystem).LastBootUpTime', 30),
  ('Diagnóstico', 'Espacio en disco',       'windows', 'Get-PSDrive -PSProvider FileSystem | Format-Table Name, @{n="Usado GB";e={[math]::Round($_.Used/1GB,1)}}, @{n="Libre GB";e={[math]::Round($_.Free/1GB,1)}} -AutoSize | Out-String -Stream', 30),
  ('Red',         'Ping a Google (8 veces)','windows', 'ping -n 8 8.8.8.8', 30),
  ('Red',         'Configuración IP',       'windows', 'ipconfig', 15),
  ('Red',         'Traza de ruta a Google', 'windows', 'tracert -d -h 12 8.8.8.8', 90),
  ('Procesos',    'Top 10 procesos por CPU','windows', 'Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 Name, Id, @{n="CPU s";e={[math]::Round($_.CPU,1)}}, @{n="RAM MB";e={[math]::Round($_.WS/1MB)}} | Format-Table -AutoSize | Out-String -Stream', 30),
  ('Diagnóstico', 'Nombre del equipo',      'macos',   'hostname', 15),
  ('Diagnóstico', 'Usuario actual',         'macos',   'whoami', 15),
  ('Diagnóstico', 'Espacio en disco',       'macos',   'df -h /', 15),
  ('Red',         'Ping a Google (8 veces)','macos',   'ping -c 8 8.8.8.8', 30),
  ('Procesos',    'Top 10 procesos por CPU','macos',   'ps -arcwwxo pid,pcpu,rss,comm | head -11', 15)
) as v(categoria, nombre, sistema, script, timeout)
join public.categorias_comandos c on c.nombre = v.categoria
on conflict (nombre, sistema) do nothing;

-- =====================================================================
-- Bitlab Terminal · Prueba de seguridad (BTL-37 · E4.2)
-- Demuestra con datos de prueba que:
--   · un técnico solo ve los equipos y ejecuciones de su organización
--   · un técnico no puede escribir comandos libres ni tocar otra organización
--   · nadie lee credenciales de equipos ni inserta ejecuciones directo
--   · el agente sin firma válida, con firma vieja o repetida es rechazado
--   · el flujo completo del agente funciona con la firma correcta
-- Correr en: Supabase > SQL Editor > New query > Run
-- Crea sus propios datos de prueba y los borra al final.
-- El resultado es una tabla con PASA / FALLA por cada caso.
-- =====================================================================

drop table if exists pg_temp.resultados_prueba;
create temp table resultados_prueba (n serial, caso text, esperado text, obtenido text, resultado text);

do $$
declare
  org_a uuid; org_b uuid;
  u_tec_a uuid := '00000000-0000-4000-a000-00000000000a';
  u_tec_b uuid := '00000000-0000-4000-a000-00000000000b';
  u_admin uuid := '00000000-0000-4000-a000-0000000000ad';
  d_a uuid; d_b uuid; cmd_win int; v_n int; v_txt text; v_ok boolean;
  v_clave text; v_reg jsonb; v_disp uuid; v_token text; v_llave text; v_res jsonb;
  v_ts bigint; v_nonce text; v_cuerpo text; v_firma text; v_ejec bigint;

begin
  -- ---------- limpieza previa y datos de prueba ----------
  delete from public.ejecuciones_comandos where dispositivo_id in
    (select id from public.dispositivos where nombre like 'PRUEBA-RLS-%');
  delete from public.dispositivos where nombre like 'PRUEBA-RLS-%';
  delete from public.perfiles_usuarios where usuario_id in (u_tec_a, u_tec_b, u_admin);
  delete from auth.users where id in (u_tec_a, u_tec_b, u_admin);
  delete from public.claves_registro where descripcion = 'PRUEBA-RLS';
  delete from public.organizaciones where nombre in ('PRUEBA Org A', 'PRUEBA Org B');

  insert into public.organizaciones (nombre) values ('PRUEBA Org A') returning id into org_a;
  insert into public.organizaciones (nombre) values ('PRUEBA Org B') returning id into org_b;
  insert into auth.users (id, email, aud, role) values
    (u_tec_a, 'prueba.tecnico.a@example.com', 'authenticated', 'authenticated'),
    (u_tec_b, 'prueba.tecnico.b@example.com', 'authenticated', 'authenticated'),
    (u_admin, 'prueba.admin@example.com',     'authenticated', 'authenticated');
  insert into public.perfiles_usuarios (usuario_id, nombre, rol, organizacion_id, debe_cambiar_contrasena) values
    (u_tec_a, 'Técnico A', 'tecnico', org_a, false),
    (u_tec_b, 'Técnico B', 'tecnico', org_b, false),
    (u_admin, 'Admin prueba', 'administrador', org_a, false);
  insert into public.dispositivos (nombre, sistema, organizacion_id, en_linea, ultimo_latido)
    values ('PRUEBA-RLS-A', 'windows', org_a, true, now()) returning id into d_a;
  insert into public.dispositivos (nombre, sistema, organizacion_id, en_linea, ultimo_latido)
    values ('PRUEBA-RLS-B', 'windows', org_b, true, now()) returning id into d_b;
  insert into public.credenciales_dispositivos (dispositivo_id, token_hash) values (d_a, 'x'), (d_b, 'y');
  select id into cmd_win from public.comandos where nombre = 'Nombre del equipo' and sistema = 'windows';

  -- ================= Técnico A =================
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_tec_a, 'role', 'authenticated')::text, true);

  select count(*) into v_n from public.dispositivos where nombre like 'PRUEBA-RLS-%';
  perform set_config('role', 'none', true);
  insert into resultados_prueba (caso, esperado, obtenido) values ('Técnico A ve solo equipos de su organización', '1', v_n::text);
  perform set_config('role', 'authenticated', true);

  select count(*) into v_n from public.dispositivos where id = d_b;
  perform set_config('role', 'none', true);
  insert into resultados_prueba (caso, esperado, obtenido) values ('Técnico A no ve el equipo de la organización B', '0', v_n::text);
  perform set_config('role', 'authenticated', true);

  begin
    v_ejec := public.crear_ejecucion(d_a, cmd_win);
    v_txt := 'permitido';
  exception when others then v_txt := 'bloqueado: ' || sqlerrm; end;
  perform set_config('role', 'none', true);
  insert into resultados_prueba (caso, esperado, obtenido) values ('Técnico A ejecuta comando del catálogo en su equipo', 'permitido', v_txt);
  perform set_config('role', 'authenticated', true);

  begin
    perform public.crear_ejecucion(d_b, cmd_win);
    v_txt := 'permitido';
  exception when others then v_txt := 'bloqueado'; end;
  perform set_config('role', 'none', true);
  insert into resultados_prueba (caso, esperado, obtenido) values ('Técnico A no puede ejecutar en equipo de la organización B', 'bloqueado', v_txt);
  perform set_config('role', 'authenticated', true);

  begin
    perform public.crear_ejecucion(d_a, null, 'whoami');
    v_txt := 'permitido';
  exception when others then v_txt := 'bloqueado'; end;
  perform set_config('role', 'none', true);
  insert into resultados_prueba (caso, esperado, obtenido) values ('Técnico no puede escribir comandos libres', 'bloqueado', v_txt);
  perform set_config('role', 'authenticated', true);

  begin
    insert into public.ejecuciones_comandos (dispositivo_id, comando_id, organizacion_id, texto_comando)
    values (d_a, cmd_win, org_a, 'hostname');
    v_txt := 'permitido';
  exception when others then v_txt := 'bloqueado'; end;
  perform set_config('role', 'none', true);
  insert into resultados_prueba (caso, esperado, obtenido) values ('Nadie inserta ejecuciones directo en la tabla', 'bloqueado', v_txt);
  perform set_config('role', 'authenticated', true);

  begin
    select count(*) into v_n from public.credenciales_dispositivos;
    v_txt := 'leyó ' || v_n;
  exception when others then v_txt := 'bloqueado'; end;
  perform set_config('role', 'none', true);
  insert into resultados_prueba (caso, esperado, obtenido) values ('Nadie lee las credenciales de los equipos', 'bloqueado', v_txt);
  perform set_config('role', 'authenticated', true);

  select count(*) into v_n from public.auditoria_comandos;
  perform set_config('role', 'none', true);
  insert into resultados_prueba (caso, esperado, obtenido) values ('Técnico no lee la auditoría', '0', v_n::text);

  -- ================= Técnico B =================
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_tec_b, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.ejecuciones_comandos where dispositivo_id = d_a;
  perform set_config('role', 'none', true);
  insert into resultados_prueba (caso, esperado, obtenido) values ('Técnico B no ve ejecuciones de la organización A', '0', v_n::text);

  -- ================= Administrador =================
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.dispositivos where nombre like 'PRUEBA-RLS-%';
  perform set_config('role', 'none', true);
  insert into resultados_prueba (caso, esperado, obtenido) values ('Administrador ve equipos de todas las organizaciones', '2', v_n::text);
  perform set_config('role', 'authenticated', true);

  begin
    perform public.crear_ejecucion(d_a, null, 'whoami');
    v_txt := 'permitido';
  exception when others then v_txt := 'bloqueado: ' || sqlerrm; end;
  perform set_config('role', 'none', true);
  insert into resultados_prueba (caso, esperado, obtenido) values ('Administrador sí puede escribir un comando libre', 'permitido', v_txt);
  perform set_config('role', 'authenticated', true);

  begin
    perform public.crear_ejecucion(d_a, null, 'format c: /q');
    v_txt := 'permitido';
  exception when others then v_txt := 'bloqueado'; end;
  perform set_config('role', 'none', true);
  insert into resultados_prueba (caso, esperado, obtenido) values ('Comando peligroso bloqueado aun para administrador', 'bloqueado', v_txt);

  -- ================= Anónimo =================
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin
    select count(*) into v_n from public.dispositivos;
    v_txt := 'leyó ' || v_n;
  exception when others then v_txt := 'bloqueado'; end;
  perform set_config('role', 'none', true);
  insert into resultados_prueba (caso, esperado, obtenido) values ('Sin sesión no se lee ningún equipo', 'bloqueado', v_txt);

  -- ================= Protocolo del agente =================
  v_clave := public.crear_clave_registro(org_a, 'PRUEBA-RLS', 2, 1);

  perform set_config('role', 'anon', true);
  begin
    v_reg := public.agente_registrar('BTL-clave-falsa', '{"nombre":"PRUEBA-RLS-AG","sistema":"windows"}');
    v_txt := 'permitido';
  exception when others then v_txt := 'bloqueado'; end;
  perform set_config('role', 'none', true);
  insert into resultados_prueba (caso, esperado, obtenido) values ('Registro con clave falsa', 'bloqueado', v_txt);

  perform set_config('role', 'anon', true);
  v_reg := public.agente_registrar(v_clave, '{"nombre":"PRUEBA-RLS-AG","sistema":"windows","version_agente":"prueba"}');
  perform set_config('role', 'none', true);
  v_disp := (v_reg ->> 'dispositivo_id')::uuid;
  v_token := v_reg ->> 'token';
  v_llave := encode(extensions.digest(v_token, 'sha256'), 'hex');
  insert into resultados_prueba (caso, esperado, obtenido)
    values ('Registro con clave válida entrega token de 256 bits', '64', length(v_token)::text);

  -- latido firmado
  v_ts := extract(epoch from now())::bigint; v_nonce := replace(gen_random_uuid()::text, '-', ''); v_cuerpo := '{"ip_local":"10.0.0.5"}';
  v_firma := encode(extensions.hmac(convert_to('latido|' || v_ts || '|' || v_nonce || '|' || v_cuerpo, 'UTF8'), convert_to(v_llave, 'UTF8'), 'sha256'), 'hex');
  perform set_config('role', 'anon', true);
  begin
    v_res := public.agente_rpc(v_disp, v_ts, v_nonce, v_firma, 'latido', v_cuerpo);
    v_txt := 'permitido';
  exception when others then v_txt := 'bloqueado: ' || sqlerrm; end;
  perform set_config('role', 'none', true);
  insert into resultados_prueba (caso, esperado, obtenido) values ('Latido con firma correcta', 'permitido', v_txt);

  -- la misma llamada repetida
  perform set_config('role', 'anon', true);
  begin
    v_res := public.agente_rpc(v_disp, v_ts, v_nonce, v_firma, 'latido', v_cuerpo);
    v_txt := 'permitido';
  exception when others then v_txt := 'bloqueado'; end;
  perform set_config('role', 'none', true);
  insert into resultados_prueba (caso, esperado, obtenido) values ('La misma llamada repetida (reenvío)', 'bloqueado', v_txt);

  -- firma alterada
  v_nonce := replace(gen_random_uuid()::text, '-', '');
  perform set_config('role', 'anon', true);
  begin
    v_res := public.agente_rpc(v_disp, v_ts, v_nonce, repeat('0', 64), 'latido', v_cuerpo);
    v_txt := 'permitido';
  exception when others then v_txt := 'bloqueado'; end;
  perform set_config('role', 'none', true);
  insert into resultados_prueba (caso, esperado, obtenido) values ('Llamada con firma falsa', 'bloqueado', v_txt);

  -- marca de tiempo vieja
  v_ts := extract(epoch from now())::bigint - 900; v_nonce := replace(gen_random_uuid()::text, '-', '');
  v_firma := encode(extensions.hmac(convert_to('latido|' || v_ts || '|' || v_nonce || '|' || v_cuerpo, 'UTF8'), convert_to(v_llave, 'UTF8'), 'sha256'), 'hex');
  perform set_config('role', 'anon', true);
  begin
    v_res := public.agente_rpc(v_disp, v_ts, v_nonce, v_firma, 'latido', v_cuerpo);
    v_txt := 'permitido';
  exception when others then v_txt := 'bloqueado'; end;
  perform set_config('role', 'none', true);
  insert into resultados_prueba (caso, esperado, obtenido) values ('Llamada firmada hace 15 minutos', 'bloqueado', v_txt);

  -- flujo completo: el administrador lanza, el agente reclama, envía salida y finaliza
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  v_ejec := public.crear_ejecucion(v_disp, cmd_win);
  perform set_config('role', 'none', true);

  v_ts := extract(epoch from now())::bigint; v_nonce := replace(gen_random_uuid()::text, '-', ''); v_cuerpo := '{}';
  v_firma := encode(extensions.hmac(convert_to('reclamar|' || v_ts || '|' || v_nonce || '|' || v_cuerpo, 'UTF8'), convert_to(v_llave, 'UTF8'), 'sha256'), 'hex');
  perform set_config('role', 'anon', true);
  v_res := public.agente_rpc(v_disp, v_ts, v_nonce, v_firma, 'reclamar', v_cuerpo);
  perform set_config('role', 'none', true);
  v_ok := (v_res -> 'ejecucion' ->> 'firma') = encode(extensions.hmac(convert_to((v_res -> 'ejecucion' ->> 'id') || '|' || (v_res -> 'ejecucion' ->> 'script'), 'UTF8'), convert_to(v_llave, 'UTF8'), 'sha256'), 'hex');
  insert into resultados_prueba (caso, esperado, obtenido)
    values ('El agente reclama la orden y verifica la firma del servidor', 'true', coalesce(v_ok, false)::text);

  v_ts := extract(epoch from now())::bigint; v_nonce := replace(gen_random_uuid()::text, '-', '');
  v_cuerpo := json_build_object('ejecucion_id', v_ejec, 'lineas', json_build_array(json_build_object('s', 1, 'f', 'stdout', 't', 'PRUEBA-RLS-AG')))::text;
  v_firma := encode(extensions.hmac(convert_to('salida|' || v_ts || '|' || v_nonce || '|' || v_cuerpo, 'UTF8'), convert_to(v_llave, 'UTF8'), 'sha256'), 'hex');
  perform set_config('role', 'anon', true);
  v_res := public.agente_rpc(v_disp, v_ts, v_nonce, v_firma, 'salida', v_cuerpo);
  perform set_config('role', 'none', true);

  v_ts := extract(epoch from now())::bigint; v_nonce := replace(gen_random_uuid()::text, '-', '');
  v_cuerpo := json_build_object('ejecucion_id', v_ejec, 'codigo', 0, 'estado', 'exitosa', 'duracion_ms', 120)::text;
  v_firma := encode(extensions.hmac(convert_to('finalizar|' || v_ts || '|' || v_nonce || '|' || v_cuerpo, 'UTF8'), convert_to(v_llave, 'UTF8'), 'sha256'), 'hex');
  perform set_config('role', 'anon', true);
  v_res := public.agente_rpc(v_disp, v_ts, v_nonce, v_firma, 'finalizar', v_cuerpo);
  perform set_config('role', 'none', true);
  select estado || ' / ' || lineas_recibidas || ' línea' into v_txt from public.ejecuciones_comandos where id = v_ejec;
  insert into resultados_prueba (caso, esperado, obtenido) values ('Flujo completo: ejecución terminada con su salida', 'exitosa / 1 línea', v_txt);

  select count(*) into v_n from public.auditoria_comandos where entidad_id = v_ejec::text and entidad = 'ejecuciones_comandos';
  insert into resultados_prueba (caso, esperado, obtenido) values ('La auditoría registró la ejecución (crear, ejecutando, exitosa)', '3', v_n::text);

  begin
    delete from public.auditoria_comandos where entidad_id = v_ejec::text;
    v_txt := 'permitido';
  exception when others then v_txt := 'bloqueado'; end;
  insert into resultados_prueba (caso, esperado, obtenido) values ('La auditoría no se puede borrar', 'bloqueado', v_txt);

  -- ---------- limpieza ----------
  delete from public.ejecuciones_comandos where dispositivo_id in
    (select id from public.dispositivos where nombre like 'PRUEBA-RLS-%');
  delete from public.dispositivos where nombre like 'PRUEBA-RLS-%';
  delete from public.perfiles_usuarios where usuario_id in (u_tec_a, u_tec_b, u_admin);
  delete from auth.users where id in (u_tec_a, u_tec_b, u_admin);
  delete from public.claves_registro where descripcion = 'PRUEBA-RLS';
  delete from public.lotes_ejecuciones where organizacion_id in (org_a, org_b);
  delete from public.organizaciones where id in (org_a, org_b);
end $$;

update resultados_prueba set resultado = case when obtenido = esperado then 'PASA' else 'FALLA' end;
select n as "#", caso as "Caso", esperado as "Esperado", obtenido as "Obtenido", resultado as "Resultado"
from resultados_prueba order by n;

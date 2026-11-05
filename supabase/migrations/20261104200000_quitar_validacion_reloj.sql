-- =====================================================================
-- 1. Eliminar completamente la validación de reloj en agente_rpc
--    Permite cualquier marca de tiempo sin importar desfase del equipo
-- =====================================================================

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

  -- >> VALIDACIÓN DE RELOJ REMOVIDA COMPLETAMENTE <<
  -- El servidor ya no rechaza solicitudes por desajuste de hora en el endpoint

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
    update public.credenciales_dispositivos set
      token_hash = encode(extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex'),
      rotacion_solicitada = false, rotado = now()
    where dispositivo_id = p_dispositivo;
    return jsonb_build_object('token', v_token);
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- =====================================================================
-- 2. Asegurar que todas las claves de registro estén activas y sin expiración
-- =====================================================================
update public.claves_registro
   set usos_maximos = null,
       vence = null,
       activa = true;


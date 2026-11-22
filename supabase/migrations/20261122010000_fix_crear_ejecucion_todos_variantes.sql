-- =====================================================================
-- Bitlab Terminal · Corrección de compatibilidad Multi-SO (BTL-200)
-- Permite que _crear_ejecucion acepte comandos con sistema='todos'
-- y respete p_texto cuando se envía la variante resuelta para el SO.
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
  if not d.en_linea or d.ultimo_latido is null or d.ultimo_latido < now() - interval '90 seconds' then
    raise exception 'El equipo está fuera de línea';
  end if;

  if p_comando is not null then
    select * into c from public.comandos where id = p_comando;
    if c.id is null or not c.activo then raise exception 'El comando no está en el catálogo'; end if;
    -- Permitir comandos diseñados para 'todos' los sistemas operativos o con variantes
    if c.sistema <> 'todos' and c.sistema <> d.sistema then
      raise exception 'El comando no es para el sistema de este equipo';
    end if;
    if c.requiere_admin and not v_admin then raise exception 'Este comando requiere rol de administrador' using errcode = '42501'; end if;
    if c.destructivo and not coalesce(p_confirmar, false) and not coalesce(p_simulacion, false) then
      raise exception 'Comando destructivo: se requiere confirmación';
    end if;
    -- Si el frontend resolvió y envió la variante para este SO en p_texto, usarla; si no, c.script
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

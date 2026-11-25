-- =====================================================================
-- Bitlab Terminal · Migración · Gestión y administración de usuarios
-- Nuevo módulo del panel: cualquier administrador puede ver, editar el
-- perfil (nombre / rol / activo) y eliminar el acceso de otros usuarios
-- de su misma organización. Nadie puede eliminarse ni desactivarse a
-- sí mismo, ni quitarse a sí mismo el rol de administrador (para no
-- dejar la organización sin ningún admin por accidente).
--
-- IMPORTANTE — límite real de lo que esto puede hacer:
-- "Eliminar" aquí borra la fila de perfiles_usuarios (o sea, le quita
-- el acceso al panel de inmediato: mi_perfil() deja de encontrarlo y
-- el panel lo trata como sin sesión válida). NO borra la cuenta de
-- Supabase Auth en sí (correo/contraseña) — eso solo se puede hacer,
-- de forma segura, desde el Dashboard de Supabase (Authentication >
-- Users) o con la API de administración, nunca desde el navegador del
-- cliente con la llave pública. Por la misma razón, este módulo no
-- crea usuarios nuevos desde el panel: un usuario nuevo se invita
-- desde el Dashboard de Supabase y luego aparece aquí para asignarle
-- rol y organización.
--
-- Correr en: Supabase > SQL Editor > New query > Run. Es seguro
-- correrla más de una vez (CREATE OR REPLACE).
-- =====================================================================

-- 1. Listar usuarios de mi organización (solo administradores) ---------
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
  select p.usuario_id, u.email, p.nombre, p.rol, p.activo, p.debe_cambiar_contrasena, p.creado
  from public.perfiles_usuarios p
  join auth.users u on u.id = p.usuario_id
  where public.es_administrador()
    and p.organizacion_id = public.mi_organizacion()
  order by p.nombre;
$$;

-- 2. Actualizar nombre / rol / activo de un usuario ---------------------
create or replace function public.admin_actualizar_usuario(
  p_usuario_id uuid,
  p_nombre text,
  p_rol text,
  p_activo boolean
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_administrador() then
    raise exception 'Solo administrador' using errcode = '42501';
  end if;

  if p_rol not in ('administrador','tecnico') then
    raise exception 'Rol inválido';
  end if;

  -- Nadie puede quitarse a sí mismo el rol de administrador ni
  -- desactivarse a sí mismo (evita quedarse sin acceso por accidente).
  if p_usuario_id = auth.uid() and (p_rol <> 'administrador' or p_activo = false) then
    raise exception 'No puedes quitarte tu propio rol de administrador ni desactivar tu propia cuenta';
  end if;

  update public.perfiles_usuarios
     set nombre = p_nombre, rol = p_rol, activo = p_activo, actualizado = now()
   where usuario_id = p_usuario_id
     and organizacion_id = public.mi_organizacion();

  if not found then
    raise exception 'Usuario no encontrado en tu organización';
  end if;
end;
$$;

-- 3. Eliminar (quitar acceso) a un usuario ------------------------------
create or replace function public.admin_eliminar_usuario(p_usuario_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_administrador() then
    raise exception 'Solo administrador' using errcode = '42501';
  end if;

  if p_usuario_id = auth.uid() then
    raise exception 'No puedes eliminar tu propia cuenta';
  end if;

  delete from public.perfiles_usuarios
   where usuario_id = p_usuario_id
     and organizacion_id = public.mi_organizacion();

  if not found then
    raise exception 'Usuario no encontrado en tu organización';
  end if;
end;
$$;

-- 4. Cambiar contraseña de cualquier usuario (solo administradores o propio) -
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

  -- Actualizar la contraseña en auth.users con hash bcrypt de pgcrypto
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
         updated_at = now()
   where id = p_usuario_id;

  if not found then
    raise exception 'Usuario no encontrado en el sistema de autenticación';
  end if;

  update public.perfiles_usuarios
     set debe_cambiar_contrasena = coalesce(p_debe_cambiar, false),
         actualizado = now()
   where usuario_id = p_usuario_id;
end;
$$;

grant execute on function public.admin_listar_usuarios()                                   to authenticated;
grant execute on function public.admin_actualizar_usuario(uuid, text, text, boolean)        to authenticated;
grant execute on function public.admin_eliminar_usuario(uuid)                               to authenticated;
grant execute on function public.admin_cambiar_password_usuario(uuid, text, boolean)        to authenticated;

/* =====================================================================
   USUARIOS · Administración de usuarios (solo administradores)
   El dock solo muestra esta sección si S.perfil.rol==='administrador'
   (ver navegacion.js). Aun así, todo lo que de verdad protege los datos
   vive en Supabase (admin_listar_usuarios / admin_actualizar_usuario /
   admin_eliminar_usuario exigen es_administrador() del lado del
   servidor), así que esta vista es solo la interfaz, no la seguridad.
   ===================================================================== */
const VistaUsuarios={
 titulo:'Usuarios',
 sub:()=>`${(S.usuarios||[]).length} usuario(s) en tu organización`,
 llena:false,
 _cargando:false,

 render(){
  return `<div class="cata-wrap">
   <div class="cata-toolbar">
    <div class="cata-buscar" style="flex:1"></div>
    <div class="cata-chips">
     <button class="btn sec" data-acc="usrRefrescar" style="border-radius:14px;padding:9px 14px">
      ${ico('retry',15)} Refrescar
     </button>
    </div>
   </div>
   <p style="font-size:12px;color:var(--tx2);line-height:1.6;margin:0 0 16px">
    Desde aquí puedes cambiar el rol o desactivar el acceso de cualquier usuario de tu
    organización. No puedes eliminar ni desactivar tu propia cuenta. Para dar de alta a
    alguien nuevo, invítalo primero desde el Dashboard de Supabase
    (Authentication → Users); en cuanto inicie sesión por primera vez aparece aquí.
   </p>
   <div class="cata-cards-grid" id="usr-lista">${ico('retry',22)}</div>
  </div>`;
 },

 montar(){ this._cargar(); },

 async _cargar(){
  if(this._cargando)return;
  this._cargando=true;
  try{
   let {data,error}=await sb.rpc('admin_listar_usuarios');
   if(error){
    // Fallback: consulta directa a la tabla perfiles_usuarios si la RPC aún no está creada en Supabase
    const {data: directos, error: dirErr} = await sb.from('perfiles_usuarios').select('usuario_id, nombre, rol, activo, debe_cambiar_contrasena, creado');
    if(!dirErr && directos && directos.length){
     data = directos.map(u=>({
      usuario_id: u.usuario_id,
      correo: (S.perfil && String(S.perfil.usuario_id)===String(u.usuario_id)) ? (S.correo||u.nombre) : u.nombre,
      nombre: u.nombre,
      rol: u.rol,
      activo: u.activo,
      debe_cambiar_contrasena: !!u.debe_cambiar_contrasena,
      creado: u.creado
     }));
    } else {
     throw error;
    }
   }
   S.usuarios=data||[];
  }catch(e){
   console.warn('admin_listar_usuarios:', e);
   if(S.perfil){
    S.usuarios=[{
     usuario_id: S.perfil.usuario_id || S.perfil.id,
     correo: S.correo || '—',
     nombre: S.perfil.nombre || 'Administrador',
     rol: S.perfil.rol || 'administrador',
     activo: true,
     debe_cambiar_contrasena: false,
     creado: new Date().toISOString()
    }];
   } else {
    S.usuarios=S.usuarios||[];
   }
   Toast.mostrar('Aviso de usuarios', 'aviso', 'Ejecuta la migración unificada en Supabase para sincronizar usuarios.');
  }
  this._cargando=false;
  this._renderLista();
 },

 _renderLista(){
  const cont=$('#usr-lista'); if(!cont)return;
  const lista=S.usuarios||[];
  cont.innerHTML=lista.length?lista.map(u=>this._fila(u)).join(''):
   `<div class="vacio" style="padding:48px 24px">${ico('users',28)}<br>No hay usuarios para mostrar.</div>`;
 },

 _fila(u){
  const esYo=S.perfil && String(S.perfil.usuario_id)===String(u.usuario_id);
  const admin=u.rol==='administrador';
  const c=admin?'#f59e0b':'#06b6d4';
  return `<article class="cata-card" style="--c:${c}">
   <div class="cata-card-head">
    <div class="cata-card-ico" style="--c:${c}">${ico(admin?'shield':'users',16)}</div>
    <div class="cata-card-info">
     <b>${esc(u.nombre)}${esYo?' <small style="opacity:.65">(tú)</small>':''}</b>
     <small style="color:${c}">${esc(u.correo)}</small>
    </div>
   </div>
   <div class="cata-card-tags">
    <span class="cata-tag" style="color:${c};border-color:${c}66">${admin?ico('shield',10):''} ${admin?'Administrador':'Técnico'}</span>
    <span class="cata-tag${u.activo?'':' dest'}">${u.activo?'Activo':'Inactivo'}</span>
    ${u.debe_cambiar_contrasena?`<span class="cata-tag">Debe cambiar contraseña</span>`:''}
   </div>
   <div class="cata-card-foot">
    <button class="cata-btn-ico" data-acc="usrEditar" data-id="${u.usuario_id}" title="Editar perfil y rol">${ico('edit',14)}</button>
    <button class="cata-btn-ico" data-acc="usrCambiarPass" data-id="${u.usuario_id}" title="Cambiar contraseña">${ico('lock',14)}</button>
    <button class="cata-btn-ico pel" data-acc="usrConfirmarEliminar" data-id="${u.usuario_id}"
     title="${esYo?'No puedes eliminar tu propia cuenta':'Eliminar'}" ${esYo?'disabled':''}>${ico('trash',14)}</button>
   </div>
  </article>`;
 }
};

Mod.registrarVista({id:'usuarios', nombre:'Usuarios', icono:'users', orden:60, definicion:VistaUsuarios});
window.VistaUsuarios = VistaUsuarios;

Acc.usrRefrescar=()=>VistaUsuarios._cargar();

Acc.usrEditar=el=>{
 const u=(S.usuarios||[]).find(x=>String(x.usuario_id)===String(el.dataset.id));
 if(!u)return;
 const esYo=S.perfil && String(S.perfil.usuario_id)===String(u.usuario_id);
 Modal.abrir({
  aria:'Editar usuario', ancho:420, titulo:'Editar usuario',
  html:`<div style="display:grid;gap:10px">
   <label style="font:600 11px var(--f-cuerpo);color:var(--tx2);text-transform:uppercase">Nombre</label>
   <input type="text" id="usr-ed-nombre" value="${esc(u.nombre)}" style="width:100%">
   <label style="font:600 11px var(--f-cuerpo);color:var(--tx2);text-transform:uppercase;margin-top:4px">Rol</label>
   <select id="usr-ed-rol" style="width:100%" ${esYo?'disabled':''}>
    <option value="tecnico" ${u.rol==='tecnico'?'selected':''}>Técnico</option>
    <option value="administrador" ${u.rol==='administrador'?'selected':''}>Administrador</option>
   </select>
   <label style="display:flex;align-items:center;gap:8px;margin-top:6px;font-size:13px">
    <input type="checkbox" id="usr-ed-activo" ${u.activo?'checked':''} ${esYo?'disabled':''}>
    <span>Cuenta activa (puede iniciar sesión en el panel)</span>
   </label>
   ${esYo?`<small style="color:var(--tx2)">No puedes cambiar tu propio rol ni desactivar tu propia cuenta.</small>`:''}
  </div>`,
  pie:`<button class="btn" data-acc="mCerrar">Cancelar</button>
   <button class="btn pri" data-acc="usrGuardar" data-id="${u.usuario_id}">${ico('check',14)} Guardar</button>`
 });
};

Acc.usrGuardar=async el=>{
 const id=el.dataset.id;
 const u=(S.usuarios||[]).find(x=>String(x.usuario_id)===String(id));
 if(!u)return;
 const nombre=$('#usr-ed-nombre')?.value?.trim();
 const rol=$('#usr-ed-rol')?.value||u.rol;
 const activo=$('#usr-ed-activo')?.checked ?? u.activo;
 if(!nombre){ Toast.mostrar('Escribe un nombre','aviso'); return; }
 try{
  const {error}=await sb.rpc('admin_actualizar_usuario',{p_usuario_id:id,p_nombre:nombre,p_rol:rol,p_activo:activo});
  if(error)throw error;
  Toast.mostrar('Usuario actualizado','ok',nombre);
  Modal.cerrar();
  await VistaUsuarios._cargar();
 }catch(e){
  Toast.mostrar('No se pudo actualizar','err',e.message);
 }
};

Acc.usrConfirmarEliminar=el=>{
 const u=(S.usuarios||[]).find(x=>String(x.usuario_id)===String(el.dataset.id));
 if(!u)return;
 Modal.abrir({
  aria:'Confirmar eliminación', ancho:420, titulo:'Eliminar usuario',
  html:`<p style="line-height:1.6">¿Quitarle el acceso al panel a <b>${esc(u.nombre)}</b> (${esc(u.correo)})?
   Deja de poder entrar al sistema de inmediato. Su cuenta de Supabase Auth (correo /
   contraseña) no se borra con esto — eso se hace aparte, desde el Dashboard de
   Supabase, si también quieres eliminarla del todo.</p>`,
  pie:`<button class="btn" data-acc="mCerrar">Cancelar</button>
   <button class="btn pel" data-acc="usrEliminarOk" data-id="${u.usuario_id}">${ico('trash',14)} Eliminar</button>`
 });
};

Acc.usrEliminarOk=async el=>{
 const id=el.dataset.id;
 try{
  const {error}=await sb.rpc('admin_eliminar_usuario',{p_usuario_id:id});
  if(error)throw error;
  Toast.mostrar('Usuario eliminado','ok');
  Modal.cerrar();
  await VistaUsuarios._cargar();
 }catch(e){
  Toast.mostrar('No se pudo eliminar','err',e.message);
 }
};

Acc.usrCambiarPass=el=>{
 const id=el.dataset.id;
 const u=(S.usuarios||[]).find(x=>String(x.usuario_id)===String(id));
 if(!u)return;
 const esYo=S.perfil && String(S.perfil.usuario_id)===String(u.usuario_id);
 Modal.abrir({
  aria:'Cambiar contraseña', ancho:440, titulo:`Cambiar contraseña · ${u.nombre}`,
  html:`<div style="display:grid;gap:12px">
   <p style="font-size:13px;color:var(--tx2);margin:0;line-height:1.5">
    Ingresa la nueva contraseña para <b>${esc(u.nombre)}</b> (${esc(u.correo)}).
    ${esYo?'Actualizarás la contraseña de tu propia sesión.':'El usuario podrá iniciar sesión con esta contraseña de inmediato.'}
   </p>
   <label class="lbl-f"><span>Nueva contraseña (mínimo 8 caracteres)</span>
    <input type="password" id="usr-pass-nueva" class="inp-f" required minlength="8" placeholder="••••••••" autocomplete="new-password">
   </label>
   <label class="lbl-f"><span>Confirmar nueva contraseña</span>
    <input type="password" id="usr-pass-conf" class="inp-f" required minlength="8" placeholder="••••••••" autocomplete="new-password">
   </label>
   <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--tx2);cursor:pointer">
    <input type="checkbox" id="usr-pass-debe" ${esYo?'disabled':''}>
    <span>Exigir que el usuario cambie su contraseña en su próximo inicio de sesión</span>
   </label>
   <div id="usr-pass-err" style="color:var(--pel);font-size:12px;display:none"></div>
  </div>`,
  pie:`<button class="btn" data-acc="mCerrar">Cancelar</button>
   <button class="btn pri" data-acc="usrGuardarPass" data-id="${u.usuario_id}">${ico('lock',14)} Actualizar contraseña</button>`
 });
 setTimeout(()=>$('#usr-pass-nueva')?.focus(),100);
};

Acc.usrGuardarPass=async el=>{
 const id=el.dataset.id;
 const p1=$('#usr-pass-nueva')?.value||'';
 const p2=$('#usr-pass-conf')?.value||'';
 const debe=$('#usr-pass-debe')?.checked||false;
 const errEl=$('#usr-pass-err');
 const mostrarErr=msg=>{
  if(errEl){ errEl.textContent=msg; errEl.style.display='block'; }
  else Toast.mostrar(msg,'aviso');
 };
 if(!p1 || p1.length < 8){
  mostrarErr('La contraseña debe tener al menos 8 caracteres');
  return;
 }
 if(p1 !== p2){
  mostrarErr('Las contraseñas no coinciden');
  return;
 }
 const btn = el;
 btn.disabled = true;
 try{
  const esYo=S.perfil && String(S.perfil.usuario_id)===String(id);
  let ok = false;
  // Si es mi propia cuenta, sb.auth.updateUser funciona directamente con la sesión activa
  if(esYo && sb.auth && sb.auth.updateUser){
   const {error: authErr} = await sb.auth.updateUser({ password: p1 });
   if(!authErr) ok = true;
  }
  if(!ok){
   const {error} = await sb.rpc('admin_cambiar_password_usuario', {
    p_usuario_id: id,
    p_password: p1,
    p_debe_cambiar: debe
   });
   if(error) throw error;
  }
  Toast.mostrar('Contraseña actualizada con éxito','ok');
  Modal.cerrar();
  await VistaUsuarios._cargar();
 }catch(e){
  btn.disabled = false;
  mostrarErr('Error al cambiar contraseña: ' + (e.message || e));
 }
};

/* =====================================================================
   CUENTA · Modal Mi cuenta (perfil + tema + contraseña + logout)
   ===================================================================== */
const Cuenta={
 abrir(){
  $('#mc-ico').innerHTML=ico('user',22);
  $('#mc-cerrar').innerHTML=ico('x',18);
  $('#mc-ic-oscuro').innerHTML=ico('moon',22);
  $('#mc-ic-claro').innerHTML=ico('sun',22);
  const nom=S.perfil?.nombre||S.correo||'—';
  $('#mc-sub').textContent=nom;
  $('#mc-correo').textContent=S.correo||'—';
  $('#mc-rol').textContent=S.perfil?.rol||'usuario';
  $('#mc-pass1').value=''; $('#mc-pass2').value='';
  $('#mc-pass-err').textContent=''; $('#mc-pass-ok').textContent='';
  Tema.aplicar(Tema.actual());
  $('#m-cuenta').hidden=false;
  setTimeout(()=>$('#mc-pass1').focus(),120);
 },
 cerrar(){ $('#m-cuenta').hidden=true },
 async cambiarPass(e){
  e.preventDefault();
  const p1=$('#mc-pass1').value, p2=$('#mc-pass2').value;
  const err=$('#mc-pass-err'), ok=$('#mc-pass-ok'), btn=$('#mc-pass-btn');
  err.textContent=''; ok.textContent='';
  if(p1.length<8){err.textContent='La contraseña debe tener al menos 8 caracteres.';return}
  if(p1!==p2){err.textContent='Las contraseñas no coinciden.';return}
  btn.disabled=true; btn.textContent='Actualizando…';
  try{
   const {error}=await sb.auth.updateUser({password:p1});
   if(error) throw error;
   ok.textContent='Contraseña actualizada correctamente.';
   $('#mc-pass1').value=''; $('#mc-pass2').value='';
   setTimeout(()=>ok.textContent='',4000);
  }catch(e){
   err.textContent='No se pudo actualizar: '+(e.message||'error desconocido');
  }finally{
   btn.disabled=false; btn.textContent='Actualizar contraseña';
  }
 }
};

Acc.cuenta=()=>Cuenta.abrir();
Acc.cuentaCerrar=()=>Cuenta.cerrar();
Acc.temaSet=(el)=>{ const t=el?.dataset?.tema||'oscuro'; Tema.aplicar(t) };

// Logout desde el modal
Acc.salir=()=>{
 Cuenta.cerrar();
 Modal.abrir({aria:'Cerrar sesión',ancho:420,titulo:'Cerrar sesión',
  html:`<p style="line-height:1.6">Se cerrará la sesión de <b>${esc(S.perfil?.nombre||S.correo||'')}</b>.
   Las ejecuciones en curso siguen su camino en el equipo.</p>`,
  pie:`<button class="btn" data-acc="mCerrar">Quedarme</button>
   <button class="btn pel" data-acc="salirYa">Cerrar sesión</button>`});
};
Acc.salirYa=()=>{Modal.cerrar();Acceso.salir()};

// Interceptar el submit del formulario de cambio de contraseña
document.addEventListener('submit',e=>{
 if(e.target&&e.target.id==='f-cambia-pass')Cuenta.cambiarPass(e);
});

// Iniciar tema en el arranque
Tema.iniciar();

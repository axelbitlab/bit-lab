/* =====================================================================
   DATOS · Acceso (login / logout)
   ===================================================================== */
const Acceso={
 async iniciar(){
  $('#lg-ico').innerHTML=ico('terminal',22);
  const {data}=await sb.auth.getSession();
  if(data.session)this.dentro(data.session); else this.fuera();
  sb.auth.onAuthStateChange((ev,ses)=>{ if(ev==='SIGNED_OUT')this.fuera() });
 },
 fuera(){
  $('#p-login').hidden=false; $('#app').hidden=true;
  $('#dock').hidden=true; $('#fab').hidden=true;
  setTimeout(()=>$('#lg-correo').focus(),80);
 },
 async dentro(ses){
  try{
   S.correo=ses.user.email;
   try{
    const {data:p,error:pe}=await sb.rpc('mi_perfil');
    if(!pe)S.perfil=Array.isArray(p)?p[0]:(p||null);
   }catch(_){}
   const n=S.perfil?.nombre||S.correo||'';
   const ini=n.split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase()||'U';
   $('#yo').textContent=ini;
   $('#yo').title=`${n} · ${S.perfil?.rol||'usuario'} — cerrar sesión`;
   $('#p-login').hidden=true; $('#app').hidden=false;
   $('#dock').hidden=false; $('#fab').hidden=false;
   await Datos.cargar();
   Dock.montar(); Fab.montar(); pintaNotif();
   Realtime.conectar();
   Nav.ir(leer('vista','monitoreo'));
  }catch(e){
   console.error('Error al entrar:',e);
   const err=$('#lg-err');
   if(err)err.textContent='Error al cargar el panel: '+e.message;
   if(e.message&&(/auth|jwt|token/i.test(e.message)))this.fuera();
  }
 },
 async salir(){
  Realtime.cortar();
  await sb.auth.signOut();
  S.perfil=null; S.dispActivo=null; S.ejActiva=null;
  if(typeof Term!=='undefined' && Term._inst){Term._inst.dispose();Term._inst=null}
  this.fuera();
 }
};

// Interceptar el submit del formulario de acceso
document.addEventListener('submit',async e=>{
 if(e.target?.id!=='f-login')return;
 e.preventDefault();
 const b=$('#lg-btn'), err=$('#lg-err');
 b.disabled=true; b.textContent='Verificando…'; err.textContent='';
 const {data,error}=await sb.auth.signInWithPassword({email:$('#lg-correo').value.trim(),password:$('#lg-pass').value});
 b.disabled=false; b.textContent='Entrar al panel';
 if(error){
  err.textContent=/invalid/i.test(error.message)?'Correo o contraseña incorrectos.':error.message;
  $('#lg-pass').select(); return;
 }
 $('#lg-pass').value='';
 Acceso.dentro(data.session);
},true);

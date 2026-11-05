/* =====================================================================
   Bitlab Terminal · Panel de la demo
   Tres pantallas: acceso, equipos disponibles y terminal remota en vivo.
   Los datos son reales: Supabase + agente de endpoint. Nada simulado.
   ===================================================================== */
(()=>{
'use strict';

/* ---------- utilidades ---------- */
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const guardar=(k,v)=>{try{localStorage.setItem('btl.'+k,JSON.stringify(v))}catch(e){}};
const leer=(k,d)=>{try{const v=localStorage.getItem('btl.'+k);return v==null?d:JSON.parse(v)}catch(e){return d}};
const hora=t=>new Date(t).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
const durTxt=ms=>ms==null?'—':ms<1000?ms+' ms':ms<60000?(ms/1000).toFixed(1)+' s':Math.floor(ms/60000)+' min '+Math.round(ms%60000/1000)+' s';
const relativo=t=>{
 if(!t)return 'sin contacto';
 const s=Math.max(0,(Date.now()-new Date(t))/1000);
 if(s<60)return 'hace '+Math.round(s)+' s';
 if(s<3600)return 'hace '+Math.round(s/60)+' min';
 if(s<86400)return 'hace '+Math.round(s/3600)+' h';
 return 'hace '+Math.round(s/86400)+' d';
};
const gb=n=>n==null?'—':n>=1024?(n/1024).toFixed(1)+' TB':Math.round(n)+' GB';
const Bus={m:{},on(e,f){(this.m[e]=this.m[e]||[]).push(f)},emit(e,d){(this.m[e]||[]).forEach(f=>f(d))}};

/* ---------- catálogos ---------- */
const SO={windows:{n:'Windows',c:'WIN',col:'var(--azul)',def:'powershell'},
          macos:{n:'macOS',c:'MAC',col:'var(--cian)',def:'zsh'}};
const INT={powershell:{n:'PowerShell',g:'PS>'},cmd:{n:'cmd',g:'C:\\>'},
           pwsh:{n:'PS 7',g:'PS>'},zsh:{n:'zsh',g:'%'},bash:{n:'Bash',g:'$'}};
const EST={en_cola:['En cola','var(--tx2)'],despachado:['Despachado','var(--tx2)'],ejecutando:['Ejecutando','var(--cian)'],
           exitoso:['Exitoso','var(--verde)'],fallido:['Fallido','var(--pel)'],
           cancelado:['Cancelado','var(--indigo)'],tiempo_agotado:['Tiempo agotado','var(--ambar)']};
const FIN=['exitoso','fallido','cancelado','tiempo_agotado'];
const VISTAS=[['equipos','Equipos','monitor'],['catalogo','Catálogo','list'],['terminal','Terminal','terminal']];

/* ---------- estado ---------- */
const S={
 vista:'equipos', perfil:null, correo:null,
 dispositivos:[], comandos:[], categorias:[],
 dispActivo:leer('disp',null),
 ejActiva:null,
 interprete:null,
 historialEntrada:[], hpos:-1,
 silenciado:leer('silencio',false),
 canalEq:null, canalSalida:null, canalEjec:null,
};

/* ---------- distintivos ---------- */
const soB=k=>{const s=SO[k]||SO.windows;return `<span class="os" style="--c:${s.col}">${s.c}</span>`};
const intB=k=>`<span class="int">${(INT[k]||{n:k}).n}</span>`;
const pill=e=>{const x=EST[e]||['—','var(--tx3)'];return `<span class="pill" style="--c:${x[1]}">${x[0]}</span>`};
const dev=id=>S.dispositivos.find(d=>d.id===id)||null;
const inter=d=>S.interprete||(d&&SO[d.sistema]?SO[d.sistema].def:'powershell');
const gpt=d=>{const i=inter(d);return (INT[i]||{g:'>'}).g};

/* =====================================================================
   Supabase
   ===================================================================== */
const alto=m=>{
 document.body.insertAdjacentHTML('afterbegin',
  '<div style="position:fixed;inset:0;z-index:999;display:grid;place-items:center;padding:28px;'+
  'background:#0a0a0f;color:#e8e8ee;font:14px system-ui;text-align:center;line-height:1.7">'+
  '<div style="max-width:430px">'+m+'</div></div>');
};
if(typeof BTL_CONFIG==='undefined'||!BTL_CONFIG.supabase_url||!BTL_CONFIG.supabase_key){
 alto('Falta <code>panel/config.js</code>.<br>Copia <code>config.example.js</code> como <code>config.js</code> '+
      'y pon la URL y la llave publicable del proyecto.');
 return;
}
if(!window.supabase?.createClient||!window.Terminal||!window.FitAddon){
 const f=[!window.supabase?.createClient&&'supabase-js',!window.Terminal&&'xterm',!window.FitAddon&&'xterm-addon-fit'].filter(Boolean);
 alto('No se pudieron cargar las librerías del panel ('+f.join(', ')+').<br><br>'+
      '<span style="color:#9a9aa8;font-size:13px">Revisa la conexión a internet. Si la red bloquea CDNs, '+
      'hay que servir las librerías desde el propio servidor.</span>');
 return;
}
const sb=window.supabase.createClient(BTL_CONFIG.supabase_url,BTL_CONFIG.supabase_key,
 {auth:{persistSession:true,autoRefreshToken:true}});

/* =====================================================================
   Acceso
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
   // mi_perfil puede no existir aún — no bloqueamos el acceso
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
   Nav.ir(leer('vista','equipos'));
  }catch(e){
   console.error('Error al entrar:',e);
   const err=$('#lg-err');
   if(err)err.textContent='Error al cargar el panel: '+e.message;
   // Forzar re-login solo si es error de autenticación
   if(e.message&&(/auth|jwt|token/i.test(e.message)))this.fuera();
  }
 },
 async salir(){
  Realtime.cortar();
  await sb.auth.signOut();
  S.perfil=null; S.dispActivo=null; S.ejActiva=null;
  if(Term._inst){Term._inst.dispose();Term._inst=null}
  this.fuera();
 }
};
$('#f-login').addEventListener('submit',async e=>{
 e.preventDefault();
 const b=$('#lg-btn'), err=$('#lg-err');
 b.disabled=true; b.textContent='Verificando…'; err.textContent='';
 const {data,error}=await sb.auth.signInWithPassword({email:$('#lg-correo').value.trim(),password:$('#lg-pass').value});
 b.disabled=false; b.textContent='Entrar';
 if(error){
  err.textContent=/invalid/i.test(error.message)?'Correo o contraseña incorrectos.':error.message;
  $('#lg-pass').select(); return;
 }
 $('#lg-pass').value='';
 Acceso.dentro(data.session);
});


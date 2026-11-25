/* =====================================================================
   NÚCLEO · Utilidades, estado global y registro de módulos
   ===================================================================== */


/* ---------- utilidades DOM y storage ---------- */
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

/* ---------- Bus de eventos (publicar/escuchar entre módulos) ---------- */
const Bus={m:{},on(e,f){(this.m[e]=this.m[e]||[]).push(f)},off(e,f){if(this.m[e])this.m[e]=this.m[e].filter(x=>x!==f)},emit(e,d){(this.m[e]||[]).forEach(f=>{try{f(d)}catch(err){console.error('[Bus '+e+']',err)}})}};

/* ---------- Registros de módulos: vistas, acciones, cambios, entradas ---------- */
const Vistas={};        // {id: {titulo, sub, render, montar, salir, llena?}}
const Acc={}, Chg={}, Inp={};

/* Mod: API para que cada carpeta registre su vista sin tocar el dock. */
const Mod={
 _vistas:[], // [{id, nombre, icono, orden}]
 registrarVista(cfg){
  if(!cfg||!cfg.id||!cfg.definicion)return;
  Vistas[cfg.id]=cfg.definicion;
  this._vistas=this._vistas.filter(v=>v.id!==cfg.id);
  this._vistas.push({id:cfg.id,nombre:cfg.nombre||cfg.id,icono:cfg.icono||'grid',orden:cfg.orden??100});
  this._vistas.sort((a,b)=>a.orden-b.orden);
  Bus.emit('vistas:registradas',this._vistas);
 },
 listaVistas(){ return this._vistas.slice() }
};

/* ---------- catálogos estáticos ---------- */
const SO={windows:{n:'Windows',c:'WIN',col:'var(--azul)',def:'powershell',ic:'monitor'},
          macos:{n:'macOS',c:'MAC',col:'var(--cian)',def:'zsh',ic:'apple'},
          linux:{n:'Linux',c:'LIN',col:'var(--lima)',def:'bash',ic:'terminal'}};
const INT={powershell:{n:'PowerShell',g:'PS>'},cmd:{n:'cmd',g:'C:\\>'},
           pwsh:{n:'PS 7',g:'PS>'},zsh:{n:'zsh',g:'%'},bash:{n:'Bash',g:'$'}};
const EST={en_cola:['En cola','var(--tx2)'],pendiente:['En cola','var(--tx2)'],despachado:['Despachado','var(--tx2)'],ejecutando:['Ejecutando','var(--cian)'],
           exitoso:['Exitoso','var(--verde)'],exitosa:['Exitoso','var(--verde)'],completado:['Exitoso','var(--verde)'],
           fallido:['Fallido','var(--pel)'],fallida:['Fallido','var(--pel)'],
           cancelado:['Cancelado','var(--indigo)'],cancelada:['Cancelado','var(--indigo)'],tiempo_agotado:['Tiempo agotado','var(--ambar)']};
const FIN=['exitoso','exitosa','completado','fallido','fallida','cancelado','cancelada','tiempo_agotado'];
const FIN_SALIDA=['exitoso','exitosa','completado','fallido','fallida','cancelado','cancelada','tiempo_agotado'];
const FIN_ERROR=['fallido','fallida','tiempo_agotado'];

// Tabla de estilos por tipo de alerta del sistema
const TA={
 cpu:{ic:'cpu',c:'var(--ambar)',n:'CPU'},
 memoria:{ic:'activity',c:'var(--indigo)',n:'Memoria'},
 disco:{ic:'hdd',c:'var(--cian)',n:'Disco'},
 proceso:{ic:'layers',c:'var(--lima)',n:'Procesos'},
 impresora:{ic:'print',c:'var(--pel)',n:'Impresoras'},
 red:{ic:'wifi',c:'var(--azul)',n:'Red'},
 sistema:{ic:'shield',c:'var(--tx2)',n:'Sistema'},
 mantenimiento:{ic:'wrench',c:'var(--verde)',n:'Mantenimiento'},
 seguridad:{ic:'lock',c:'var(--pel)',n:'Seguridad'},
};

/* ---------- estado global ---------- */
const S={
 vista:'monitoreo', perfil:null, correo:null,
 dispositivos:[], comandos:[], categorias:[], claves:[],
 dispActivo:leer('disp',null),
 ejActiva:null,
 interprete:null,
 historialEntrada:[], hpos:-1,
 silenciado:leer('silencio',false),
 canalEq:null, canalSalida:null, canalEjec:null,
 /* ── nuevos campos para selección y sesiones ── */
 sesiones:[], sesionActiva:null,
 arbolQ:'', panelDer:'catalogo', panelAbierto:false,
 ultimoDisp:null,
 tf:{q:''}, cf:{q:'',cat:null,so:null},
 fragmentos:[], detalleId:null,
};

/* ---------- distintivos visuales ---------- */
const soB=k=>{const s=SO[k]||SO.windows;return `<span class="os" style="--c:${s.col}">${s.c}</span>`};
const intB=k=>`<span class="int">${(INT[k]||{n:k}).n}</span>`;
const pill=(e,tipo)=>{
 if(tipo){
  const cls={ok:'var(--verde)',pel:'var(--pel)',warn:'var(--ambar)',info:'var(--cian)',off:'var(--tx3)'};
  return `<span class="pill" style="--c:${cls[tipo]||'var(--tx3)'}">${e}</span>`;
 }
 const x=EST[e]||['—','var(--tx3)'];return `<span class="pill" style="--c:${x[1]}">${x[0]}</span>`;
};
const dev=id=>id?S.dispositivos.find(d=>String(d.id).toLowerCase()===String(id).toLowerCase())||null:null;
const inter=d=>S.interprete||(d&&SO[d.sistema]?SO[d.sistema].def:'powershell');
const gpt=d=>{const i=inter(d);return (INT[i]||{g:'>'}).g};

/* Helper: lista de tipos de alerta de un comando.
   Soporta tanto la columna nueva tipos_alerta (array) como la
   antigua tipo_alerta (texto), para no romper nada en la transición. */
const alertasDe=c=>{
 if(!c)return [];
 if(Array.isArray(c.tipos_alerta))return c.tipos_alerta.filter(Boolean);
 if(c.tipos_alerta&&typeof c.tipos_alerta==='string')return [c.tipos_alerta];
 if(c.tipo_alerta)return [c.tipo_alerta];
 return [];
};

/* Exposición explícita para consumo entre scripts modulares */
window.$ = $; window.$$ = $$; window.esc = esc; window.guardar = guardar;
window.leer = leer; window.hora = hora; window.durTxt = durTxt; window.relativo = relativo;
window.gb = gb; window.Bus = Bus; window.S = S; window.Mod = Mod;
window.Vistas = Vistas; window.Acc = Acc; window.SO = SO; window.INT = INT;
window.EST = EST; window.TA = TA; window.FIN = FIN; window.FIN_SALIDA = FIN_SALIDA;
window.FIN_ERROR = FIN_ERROR; window.pill = pill; window.dev = dev;
window.inter = inter; window.gpt = gpt; window.alertasDe = alertasDe;


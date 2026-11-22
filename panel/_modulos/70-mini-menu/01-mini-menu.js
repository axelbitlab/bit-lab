/* =====================================================================
   MINI MENÚ CONTEXTUAL · Flotante por equipo seleccionado
   Se abre al hacer clic en una tarjeta de equipo (o al llamar
   MiniMenu.abrir desde otra vista). Muestra:
     1. Cabecera con el equipo y sus alertas activas
     2. Comandos recomendados (ordenados por relevancia de alerta)
     3. Atajos: abrir terminal, ver historial, limpiar selección
   Si eliminas esta carpeta, las tarjetas de equipo caen al
   comportamiento anterior (abrir terminal directo).
   ===================================================================== */
const MiniMenu={
 _el:null,
 _overlay:null,
 _eqId:null,
 _construido:false,
 _construir(){
  if(this._construido)return;
  this._construido=true;
  // Overlay invisible para cerrar al hacer clic afuera
  const ov=document.createElement('div');
  ov.id='mm-overlay';
  ov.className='mm-overlay';
  ov.hidden=true;
  ov.addEventListener('click',e=>{ if(e.target===ov)this.cerrar() });
  document.body.appendChild(ov);
  this._overlay=ov;
  // Panel del menú
  const el=document.createElement('div');
  el.id='mm-panel';
  el.className='vid mm-panel';
  el.hidden=true;
  // Interceptar clicks dentro del mini-menú para ejecutar data-acc sin depender de la propagación a document
  el.addEventListener('click',e=>{
   const btn=e.target.closest('[data-acc]');
   if(btn && Acc[btn.dataset.acc]){
    e.stopPropagation();
    Acc[btn.dataset.acc](btn,e);
   }
  });
  document.body.appendChild(el);
  this._el=el;
 },
 abrir(eqId,x,y){
  this._construir();
  const d=dev(eqId); if(!d)return;
  this._eqId=eqId;
  this._el.innerHTML=this._html(d);
  // Mostrar primero para medir
  this._overlay.hidden=false;
  this._el.hidden=false;
  // Posicionar junto al cursor o al elemento
  const anchoV=innerWidth, altoV=innerHeight;
  const r=this._el.getBoundingClientRect();
  const w=r.width||360, h=r.height||400;
  let px=x||80, py=y||80;
  if(px+w+16>anchoV) px=Math.max(16, anchoV-w-16);
  if(py+h+16>altoV) py=Math.max(16, altoV-h-16);
  this._el.style.left=px+'px';
  this._el.style.top=py+'px';
  this._el.classList.add('abierto');
 },
 cerrar(){
  if(!this._el)return;
  this._el.classList.remove('abierto');
  this._el.hidden=true;
  this._overlay.hidden=true;
  this._eqId=null;
 },
 _html(d){
  const alertas=Datos?._alertasActivas?.(d)||[];
  const rec=(Datos?.recomendados?.(d)||[]).slice(0,6);
  const on=d.en_linea;

  const alertasHtml=alertas.length?
   `<div class="mm-alertas">${alertas.map(a=>{const info=TA[a]||{};
    return `<span class="mm-alerta" style="--c:${info.c||'var(--txt-sec)'}">${ico(info.ic||'alert',11)} ${info.n||a}</span>`;
   }).join('')}</div>`:
   `<div class="mm-sin-alertas">${ico('check',12)} Sin alertas activas</div>`;

  // Rejilla 6 acciones como el boceto
  const a=(ic,c,t,s,acc,dis)=>`<button class="mm-acc${dis?' mm-dis':''}" data-acc="${acc}" data-eq="${d.id}" ${dis?'disabled':''}>
   <span class="cico" style="--c:${c}">${ico(ic,15)}</span><div><b>${t}</b><small>${s}</small></div></button>`;

  const ejDisp = (S.ejActiva && String(S.ejActiva.dispositivo_id) === String(d.id)) ? S.ejActiva : null;
  const ultimaEj = ejDisp ? ('Último: ' + durTxt(ejDisp.duracion_ms)) : 'Reintentar último';

  const rejilla=`<div class="mm-rejilla">
   ${a('terminal','var(--verde)','Abrir terminal','Sesión en vivo','miniTerminal',!on)}
   ${a('list','var(--azul)','Catálogo','Elegir comando','miniCatalogoEquipo',false)}
   ${a('zap','var(--cian)','Fragmentos','Comandos rápidos','miniFrag',!on)}
   ${a('retry','var(--lima)','Reintentar',ultimaEj,'miniReintentar',!on)}
   ${a('history','var(--indigo)','Ver historial','Ejecuciones del equipo','miniHistorial',false)}
   ${a('activity','var(--verde)','Diagnóstico','Info del sistema','miniDiag',!on)}
  </div>`;

  // Comandos recomendados (top 4)
  const cmdsHtml=rec.length?`<div class="mm-sec-titulo">${ico('zap',12)} Recomendados por alerta</div>
   <div class="mm-cmds">${rec.slice(0,4).map(c=>`<button class="mm-cmd" data-acc="miniLanzar" data-id="${c.id}" data-eq="${d.id}" ${!on?'disabled':''}>
    <span class="mm-ic">${ico('terminal',14)}</span>
    <span class="mm-tx"><b>${esc(c.nombre)}</b><small>${esc(c.descripcion||c.interprete||'auto')}</small></span>
    ${c.destructivo?`<span class="mm-dest">${ico('alert',10)}</span>`:''}</button>`).join('')}</div>`:'';

  const otrosSo=d.sistema==='windows'?'PowerShell':d.sistema==='macos'?'zsh / Bash':'Bash';

  return `
   <header class="mm-head">
    <div class="mm-nn" style="flex:1;min-width:0">
     <span class="dot ${on?'on':'off'}"></span>
     <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:6px">
       <b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.apodo || d.nombre)}</b>
       <button class="ib" data-acc="miniEditarApodo" data-eq="${d.id}" title="Cambiar apodo o identificación" style="padding:2px;opacity:.7">
        ${ico('edit',13)}
       </button>
      </div>
      <small style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
       ${d.apodo ? `<span style="opacity:.75">(${esc(d.nombre)}) · </span>`:''}${esc(d.sistema)} · ${esc(d.ip_local||'—')} · ${otrosSo}
      </small>
     </div>
    </div>
    <button class="ib mm-x" data-acc="miniCerrar" aria-label="Cerrar">${ico('x',16)}</button>
   </header>
   ${alertasHtml}
   ${rejilla}
   ${cmdsHtml}
   <div class="mm-foot">
    <button class="btn sm" data-acc="miniMasiva" data-eq="${d.id}">
     ${ico('layers',13)} Agregar a masiva
    </button>
    <button class="btn sm" data-acc="miniCerrar">${ico('x',12)} Cerrar</button>
   </div>
  `;
 }
};

Acc.miniCerrar=()=>MiniMenu.cerrar();
Acc.miniEditarApodo=el=>{
 const d=dev(el.dataset.eq); if(!d)return;
 const actual=d.apodo||d.nombre||'';
 Modal.abrir({
  aria:'Cambiar apodo', ancho:400, titulo:'Nombre / Apodo del equipo',
  html:`<p style="font-size:13px;color:var(--tx2);margin-bottom:12px">
   Asigna un apodo o nombre amigable para identificar fácilmente este equipo en el panel (el hostname original <b>${esc(d.nombre)}</b> se conserva).
  </p>
  <div style="display:grid;gap:6px">
   <label style="font:600 11px var(--f-cuerpo);color:var(--tx2);text-transform:uppercase">Apodo o etiqueta</label>
   <input type="text" id="inp-apodo-val" value="${esc(d.apodo||'')}" placeholder="Ej. PC de Dirección, Servidor UPQ, etc." style="width:100%">
  </div>`,
  pie:`<button class="btn" data-acc="mCerrar">Cancelar</button>
   <button class="btn pri" data-acc="miniGuardarApodo" data-eq="${d.id}">${ico('check',14)} Guardar</button>`
 });
 setTimeout(()=>{ const i=$('#inp-apodo-val'); if(i){ i.focus(); i.select(); } },100);
};

Acc.miniGuardarApodo=async el=>{
 const d=dev(el.dataset.eq); if(!d)return;
 const inp=$('#inp-apodo-val');
 const nuevo=inp?.value?.trim()||null;
 Modal.cerrar();
 try{
  // Guardar en Supabase (si existe la columna apodo)
  const {error}=await sb.from('dispositivos').update({apodo:nuevo}).eq('id',d.id);
  if(error){
   // Si la columna apodo aún no ha sido corrida en Supabase, guardamos localmente en localStorage
   let apodos=leer('apodos_equipos',{})||{};
   apodos[d.id]=nuevo;
   guardar('apodos_equipos',apodos);
  }
  d.apodo=nuevo;
  Toast.mostrar('Nombre actualizado','ok',nuevo||d.nombre);
  MiniMenu.cerrar();
  Bus.emit('equipos');
  if(typeof VistaMonitoreo!=='undefined') VistaMonitoreo.refrescar();
 }catch(e){
  let apodos=leer('apodos_equipos',{})||{};
  apodos[d.id]=nuevo;
  guardar('apodos_equipos',apodos);
  d.apodo=nuevo;
  Toast.mostrar('Nombre guardado','ok');
  MiniMenu.cerrar();
  Bus.emit('equipos');
  if(typeof VistaMonitoreo!=='undefined') VistaMonitoreo.refrescar();
 }
};
Acc.miniTerminal=el=>{
 const d=dev(el.dataset.eq); if(!d)return;
 if(!d.en_linea){Toast.mostrar(d.nombre+' está fuera de línea','aviso');return}
 S.dispActivo=d.id; guardar('disp',d.id); S.interprete=null; Sesion.abrir(d.id);
 if(typeof Sel!=='undefined') Sel.fijar([d.id]);
 MiniMenu.cerrar(); Nav.ir('terminal');
};
Acc.miniCatalogoEquipo=el=>{
 const d=dev(el.dataset.eq); if(!d)return;
 S.dispActivo=d.id; guardar('disp',d.id);
 if(typeof Sel!=='undefined') Sel.fijar([d.id]);
 if(typeof VistaCatalogo!=='undefined') VistaCatalogo._so=d.sistema;
 MiniMenu.cerrar(); Nav.ir('catalogo');
};
Acc.miniHistorial=el=>{
 const d=dev(el.dataset.eq); if(!d)return;
 if(typeof Sel!=='undefined') Sel.fijar([d.id]);
 if(typeof VistaHistorial!=='undefined'){
  VistaHistorial._filtro.equipo=d.id;
 }
 MiniMenu.cerrar(); Nav.ir('historial');
};
Acc.miniFrag=el=>{
 const d=dev(el.dataset.eq);
 if(d){ S.dispActivo=d.id; guardar('disp',d.id); Sesion.abrir(d.id); if(typeof Sel!=='undefined') Sel.fijar([d.id]); }
 MiniMenu.cerrar();
 if(typeof Acc.fFrag==='function') Acc.fFrag();
};
Acc.miniMasiva=el=>{
 const d=dev(el.dataset.eq); if(!d)return;
 if(typeof VistaMasiva!=='undefined'){
  if(!VistaMasiva._seleccion.includes(d.id)) VistaMasiva._seleccion.push(d.id);
 }
 MiniMenu.cerrar(); Nav.ir('masiva');
 Toast.mostrar(d.nombre+' agregado a masiva','ok');
};
Acc.miniReintentar=async el=>{
 const d=dev(el.dataset.eq); if(!d)return;
 if(!d.en_linea){Toast.mostrar(d.nombre+' está fuera de línea','aviso');return}
 S.dispActivo=d.id; guardar('disp',d.id); Sesion.abrir(d.id);
 MiniMenu.cerrar();
 Nav.ir('terminal');

 // 1. Si hay ejActiva para este equipo, usarla directamente
 if(S.ejActiva && (String(S.ejActiva.dispositivo_id)===String(d.id) || !S.ejActiva.dispositivo_id)){
  const ej=S.ejActiva;
  setTimeout(()=>Motor.lanzar(ej.texto_comando||null,ej.comando_id||null),150);
  return;
 }

 // 2. Si no, consultar la última ejecución de este equipo en Supabase
 try{
  const {data}=await sb.from('ejecuciones_comandos')
   .select('id,comando_id,texto_comando,dispositivo_id')
   .eq('dispositivo_id',d.id)
   .order('creado',{ascending:false})
   .limit(1)
   .maybeSingle();

  if(data && (data.texto_comando || data.comando_id)){
   setTimeout(()=>Motor.lanzar(data.texto_comando||null,data.comando_id||null),150);
  }else{
   Toast.mostrar('Sin comandos previos para reintentar','aviso');
  }
 }catch(err){
  Toast.mostrar('Sin comandos previos para reintentar','aviso');
 }
};
Acc.miniDiag=el=>{
 const d=dev(el.dataset.eq); if(!d||!d.en_linea){Toast.mostrar('Equipo fuera de línea','aviso');return}
 S.dispActivo=d.id; guardar('disp',d.id); Sesion.abrir(d.id);
 MiniMenu.cerrar(); Nav.ir('terminal');
 const diag=d.sistema==='windows'?'Get-ComputerInfo | Select-Object CsName,OsName,OsVersion,CsProcessors,CsTotalPhysicalMemory | Format-List'
  :d.sistema==='macos'?'system_profiler SPHardwareDataType SPSoftwareDataType 2>/dev/null | head -30'
  :'uname -a && uptime && free -h && df -h / && lscpu | head -10';
 setTimeout(()=>Motor.lanzar(diag),150);
 Toast.mostrar('Diagnóstico iniciado','ok',d.nombre);
};

// Cerrar con ESC
document.addEventListener('keydown',e=>{
 if(e.key==='Escape' && MiniMenu._el && !MiniMenu._el.hidden)MiniMenu.cerrar();
});

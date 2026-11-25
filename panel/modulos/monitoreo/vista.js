/* =====================================================================
   VISTA · Monitoreo  (reemplaza la vista "equipos")
   KPIs + tarjetas de equipos con métricas en vivo + alertas + selección
   ===================================================================== */

const VistaMonitoreo={
 titulo:'Monitoreo',
 sub:()=>`${S.dispositivos.filter(d=>d.en_linea).length}/${S.dispositivos.length} en línea`,
 llena:false,

 /* ── recopilar alertas de TODOS los dispositivos ── */
 _todasAlertas(){
  const lista=[];
  S.dispositivos.forEach(d=>{
   const aa=Datos._alertasActivas(d);
   aa.forEach(tipo=>{
    const info={cpu:['CPU alta','pel','cpu'],memoria:['Memoria alta','ambar','cpu'],
     disco:['Disco casi lleno','ambar','hardDrive'],proceso:['Proceso elevado','indigo','activity'],
     red:['Sin contacto reciente','tx3','wifiOff']};
    const [msg,col,ic]=info[tipo]||[tipo,'tx3','alert'];
    lista.push({dispositivo_id:d.id,tipo,mensaje:msg,color:`var(--${col})`,icono:ic,nombre:d.nombre});
   });
  });
  return lista;
 },

 render(){
  const dd=S.dispositivos, on=dd.filter(d=>d.en_linea), off=dd.filter(d=>!d.en_linea);
  const alertas=this._todasAlertas();

  /* ── KPIs ── */
  let k=`<div class="kpis">
   <div class="kpi"><div class="kpi-v">${dd.length}</div><div class="kpi-l">Equipos</div></div>
   <div class="kpi ok"><div class="kpi-v">${on.length}</div><div class="kpi-l">En línea</div></div>
   <div class="kpi pel"><div class="kpi-v">${off.length}</div><div class="kpi-l">Fuera de línea</div></div>
   <div class="kpi warn"><div class="kpi-v">${alertas.length}</div><div class="kpi-l">Alertas</div></div>
  </div>`;

  /* ── Alertas activas ── */
  let al='';
  if(alertas.length){
   al=`<div class="alerta-banda" id="alerta-banda-wrap" hidden>
    <div class="banda-h">${ico('alert',14)} <b>Alertas activas</b> <span class="badge">${alertas.length}</span></div>
    <div class="alerta-lista" id="alerta-lista">`;
   alertas.slice(0,8).forEach(a=>{
    al+=`<div class="alerta-fila" data-acc="selNodo" data-dev="${a.dispositivo_id}">
     <span class="al-ico" style="color:${a.color}">${ico(a.icono||'alert',14)}</span>
     <span class="al-txt"><b>${esc(a.nombre||'—')}</b> ${esc(a.mensaje)}</span>
    </div>`;
   });
   al+=`</div></div>`;
  }

  /* ── Barra de filtros ── */
  let filtros=`<div class="tools" id="mon-tools">
   <div class="bq"><input type="text" id="mon-q" placeholder="Buscar equipo..." data-inp="monQ" class="inp-bus" value="${esc(S.tf?.q||'')}">
    <span class="bq-ico">${ico('search',14)}</span></div>
   <select data-chg="monSo" class="sel-filt" id="mon-so"><option value="">Todo SO</option>
    <option value="windows">Windows</option><option value="macos">macOS</option><option value="linux">Linux</option></select>
   <select data-chg="monEstado" class="sel-filt" id="mon-estado"><option value="">Todos</option>
    <option value="online">En línea</option><option value="offline">Fuera de línea</option></select>
   <div class="tools-der">
    <button class="btn-ico" data-acc="selEnLinea" title="Seleccionar todos en línea">${ico('wifi',14)} En línea</button>
    <button class="btn-ico" data-acc="selLimpiar" title="Limpiar selección">${ico('x',14)}</button>
    <span class="sel-count" id="sel-count">${Sel.ids.size?Sel.ids.size+' sel.':''}</span>
   </div>
  </div>`;

  /* ── Tarjetas de equipos ── */
  let tarjetas=`<div class="eq-grid" id="eq-grid">${this._tarjetas(this._filtrar(dd))}</div>`;

  return k+al+filtros+tarjetas;
 },

 _filtrar(dd){
  let f=dd;
  const q=(S.tf?.q||'').toLowerCase();
  const so=$('#mon-so')?.value||'';
  const est=$('#mon-estado')?.value||'';
  if(q) f=f.filter(d=>(d.nombre||'').toLowerCase().includes(q)||(d.ip_local||'').includes(q));
  if(so) f=f.filter(d=>d.sistema===so);
  if(est==='online') f=f.filter(d=>d.en_linea);
  if(est==='offline') f=f.filter(d=>!d.en_linea);
  return f;
 },

 _tarjetas(dd){
  if(!dd.length) return '<div class="vacio">No hay equipos que coincidan</div>';
  return dd.map(d=>this._tarjeta(d)).join('');
 },

 _tarjeta(d){
  const sel=Sel.ids.has(d.id);
  const on=d.en_linea;
  const soInfo=SO[d.sistema]||SO.windows;
  const alertas=Datos._alertasActivas(d);
  const tieneAlerta=alertas.length>0;

  /* Métricas */
  const cpuVal=d.cpu!=null?Math.round(d.cpu):null;
  const ramVal=d.ram!=null?Math.round(d.ram):null;
  const discoVal=d.disco&&d.disco.pct!=null?Math.round(100-d.disco.pct):null; // pct es libre, queremos usado
  const discoLibre=d.disco?d.disco.libre:null;
  const discoTot=d.disco?d.disco.tot:null;

  const barra=(label,val,color)=>{
   if(val==null) return `<div class="met"><span class="met-l">${label}</span><span class="met-v">—</span></div>`;
   const cls=val>85?'crit':val>70?'warn':'';
   return `<div class="met">
    <span class="met-l">${label}</span>
    <div class="met-bar"><div class="met-fill ${cls}" style="width:${Math.min(val,100)}%;background:${color}"></div></div>
    <span class="met-v">${val}%</span>
   </div>`;
  };

  return `<div class="eq-card${sel?' sel':''}${!on?' off':''}" data-acc="eqClick" data-dev="${d.id}">
   <div class="eq-top">
    <div class="eq-estado"><span class="dot ${on?'on':'off'}"></span></div>
    <div class="eq-info">
     <div class="eq-nombre" title="Doble clic para renombrar o clic en el menú" data-acc="eqDblNombre" data-id="${d.id}">${esc(d.apodo || d.nombre || 'Sin nombre')}</div>
     <div class="eq-meta">${soB(d.sistema)} ${d.apodo ? `<span style="opacity:.6;font-size:11px">(${esc(d.nombre)})</span> ` : ''}<span class="eq-ip">${esc(d.ip_local||'')}</span></div>
    </div>
    <div class="eq-check" style="display:flex;align-items:center;gap:6px">
     <button class="btn-ico pel" data-acc="eqEliminarConfirmar" data-id="${d.id}" title="Eliminar equipo de la base de datos" style="width:24px;height:24px;border-radius:6px;opacity:.6;display:inline-flex;align-items:center;justify-content:center;background:rgba(255,77,109,.1);border:1px solid rgba(255,77,109,.2);color:var(--pel,#ff4d6d)" onclick="event.stopPropagation()">
      ${ico('trash',12)}
     </button>
     <input type="checkbox" ${sel?'checked':''} data-acc="selChk" data-id="${d.id}" onclick="event.stopPropagation()">
    </div>
   </div>
   ${tieneAlerta?`<div class="eq-alerta">${alertas.map(a=>`<span class="eq-al-tag">${ico(a==='cpu'?'cpu':a==='memoria'?'cpu':a==='disco'?'hardDrive':'alert',10)} ${a}</span>`).join('')}</div>`:''}
   <div class="eq-metricas">
    ${barra('CPU',cpuVal,'var(--cian)')}
    ${barra('RAM',ramVal,'var(--verde)')}
    ${barra('Disco',discoVal,'var(--ambar)')}
   </div>
   <div class="eq-pie">
    <span class="eq-lat">${ico('clock',11)} ${d.visto?relativo(d.visto):'sin contacto'}</span>
    <span class="eq-ints">${(d.ints||[]).map(i=>intB(i)).join(' ')}</span>
   </div>
  </div>`;
 },

 refrescar(){
  const grid=$('#eq-grid');
  if(grid) grid.innerHTML=this._tarjetas(this._filtrar(S.dispositivos));
  const cnt=$('#sel-count');
  if(cnt) cnt.textContent=Sel.ids.size?Sel.ids.size+' sel.':'';
  /* KPIs */
  const kpis=$$('.kpi-v');
  if(kpis.length>=4){
   const dd=S.dispositivos, on=dd.filter(d=>d.en_linea);
   const alertas=this._todasAlertas();
   kpis[0].textContent=dd.length;
   kpis[1].textContent=on.length;
   kpis[2].textContent=dd.length-on.length;
   kpis[3].textContent=alertas.length;
  }
 },

 montar(){
  Bus.on('equipos',this._onEquipos);
  Bus.on('sel',this._onSel);
  // Animación de alertas: mostrar banda 5s luego colapsar a campana
  const alertas=this._todasAlertas();
  if(alertas.length) this._animarAlertas(alertas);
 },

 _animarAlertas(alertas){
  const banda=$('#alerta-banda-wrap');
  if(!banda)return;
  banda.classList.add('visible');
  const btn=$('#btnNotif');
  if(btn){
   btn.setAttribute('data-badge',alertas.length);
   btn.classList.add('tiene-alertas');
  }
  // 4.2s después → succión hacia campana + vibración simultánea
  setTimeout(()=>{
   const btnR=$('#btnNotif');
   if(btnR){
    const br=btnR.getBoundingClientRect();
    const wr=banda.getBoundingClientRect();
    banda.style.setProperty('--dest-x',(br.left-wr.left+br.width/2-wr.width/2)+'px');
    banda.style.setProperty('--dest-y',(br.top-wr.top-wr.height+br.height/2)+'px');
    // Campana vibra MIENTRAS la banda vuela hacia ella
    btnR.classList.add('campana-absorbe');
    btnR.addEventListener('animationend',()=>btnR.classList.remove('campana-absorbe'),{once:true});
   }
   banda.classList.add('colapsando');
   // Al terminar animación de succión → rebote final de campana
   setTimeout(()=>{
    banda.hidden=true;
    banda.classList.remove('visible','colapsando');
    if(btnR){
     btnR.style.transition='transform .3s cubic-bezier(.34,1.56,.64,1)';
     btnR.style.transform='scale(1.35)';
     setTimeout(()=>{ btnR.style.transform='scale(1)';
      setTimeout(()=>btnR.style.transition='',320);
     },120);
    }
   },580);
  },4200);
 },
 salir(){
  Bus.off('equipos',this._onEquipos);
  Bus.off('sel',this._onSel);
 },
 _onEquipos(){VistaMonitoreo.refrescar();if(typeof pintaNotif==='function')pintaNotif();},
 _onSel(){VistaMonitoreo.refrescar()}
};

/* ── Acciones de Monitoreo ── */
Acc.eqClick=(el,e)=>{
 // Click en tarjeta → seleccionar + abrir mini menú
 const id=el.dataset.dev||el.closest('[data-dev]')?.dataset.dev;
 if(!id)return;
 const p={x:e.clientX,y:e.clientY};
 if(e.shiftKey||e.metaKey||e.ctrlKey) Sel.alternar(id,p);
 else{
  if(Sel.ids.size===1&&Sel.ids.has(id)){
   // Ya seleccionado → abrir mini menú
   if(typeof MiniMenu!=='undefined')MiniMenu.abrir(id,e.clientX,e.clientY);
   return;
  }
  Sel.fijar([id],p);
 }
};

Acc.eqDblNombre=(el,e)=>{
 e.stopPropagation();
 const id=el.dataset.id;
 const d=dev(id);
 if(!d)return;
 // Reemplazar con input inline
 const actual=d.nombre||'';
 el.innerHTML=`<input type="text" class="inp-rename" value="${esc(actual)}" data-id="${id}"
  style="background:rgba(255,255,255,.06);border:1px solid var(--verde);color:var(--tx);padding:2px 6px;border-radius:4px;font:inherit;width:100%;outline:none">`;
 const inp=el.querySelector('input');
 inp.focus(); inp.select();
 const guardarNombre=async()=>{
  const nuevo=inp.value.trim();
  if(!nuevo||nuevo===actual){el.textContent=actual;return}
  try{
   const {error}=await sb.from('dispositivos').update({nombre:nuevo}).eq('id',id);
   if(error)throw error;
   d.nombre=nuevo;
   Toast.mostrar('Nombre actualizado','ok');
   el.textContent=nuevo;
   Bus.emit('equipos');
  }catch(err){
   Toast.mostrar('Error al renombrar','err',err.message);
   el.textContent=actual;
  }
 };
 inp.addEventListener('blur',guardarNombre);
 inp.addEventListener('keydown',e=>{
  if(e.key==='Enter'){e.preventDefault();inp.blur()}
  if(e.key==='Escape'){inp.value=actual;inp.blur()}
 });
};

Acc.eqAbrirMini=(el,e)=>{
 const id=el.dataset.dev||el.dataset.id;
 if(id&&typeof MiniMenu!=='undefined')MiniMenu.abrir(id,e.clientX,e.clientY);
};

/* ── Eliminación completa de dispositivo por Administrador ── */
Acc.eqEliminarConfirmar=el=>{
 const id=el.dataset.id||el.dataset.dev||el.closest('[data-id]')?.dataset.id;
 const d=dev(id);
 if(!d)return;
 const nombreDisp=d.apodo||d.nombre||'Dispositivo';

 Modal.abrir({
  aria:'Eliminar dispositivo de la base de datos',
  ancho:460,
  titulo:'Eliminar equipo de la base de datos',
  html:`<div style="display:grid;gap:12px;font-size:13px;line-height:1.6">
   <div style="padding:12px;background:rgba(255,77,109,.1);border:1px solid rgba(255,77,109,.25);border-radius:10px;color:var(--pel,#ff4d6d);display:flex;align-items:flex-start;gap:10px">
    <span style="font-size:18px">${ico('alert',18)}</span>
    <div>
     <b>¡Acción permanente e irreversible!</b><br>
     Se eliminará el equipo <b>"${esc(nombreDisp)}"</b> (${esc(d.sistema)}, IP: ${esc(d.ip_local||'—')}) junto con todas sus credenciales, sesiones y su historial de ejecuciones de la base de datos Supabase.
    </div>
   </div>
   <p style="color:var(--tx2);margin:0">
    Si el agente en la máquina continúa en ejecución, no podrá autenticarse nuevamente a menos que se reinstale con una nueva clave BTL.
   </p>
  </div>`,
  pie:`<button class="btn" data-acc="mCerrar">Cancelar</button>
   <button class="btn pel" data-acc="dispEliminarDefinitivo" data-id="${d.id}" style="background:var(--pel,#ff4d6d);color:#fff">
    ${ico('trash',14)} Eliminar de la base de datos
   </button>`
 });
};

Acc.dispEliminarDefinitivo=async el=>{
 const id=el.dataset.id;
 const btn=el;
 btn.disabled=true;
 btn.innerHTML=`${ico('retry',14)} Eliminando…`;

 try{
  const res=await Datos.eliminarDispositivo(id);
  Modal.cerrar();
  Toast.mostrar(`Equipo "${res.nombre}" eliminado por completo de la base de datos`,'ok');
  Bus.emit('equipos');
  VistaMonitoreo.refrescar();
 }catch(e){
  btn.disabled=false;
  btn.innerHTML=`${ico('trash',14)} Eliminar de la base de datos`;
  Toast.mostrar('Error al eliminar equipo: '+(e.message||e),'err');
 }
};

/* ── Filtros ── */
Inp.monQ=(el)=>{S.tf=S.tf||{};S.tf.q=el.value;VistaMonitoreo.refrescar()};
Chg.monSo=()=>VistaMonitoreo.refrescar();
Chg.monEstado=()=>VistaMonitoreo.refrescar();

/* ── Registro ── */
Mod.registrarVista({
 id:'monitoreo', nombre:'Monitoreo', icono:'monitor', orden:10,
 definicion:VistaMonitoreo
});
window.VistaMonitoreo = VistaMonitoreo;

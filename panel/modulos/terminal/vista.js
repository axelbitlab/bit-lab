/* =====================================================================
   VISTA · Terminal  (3 columnas: árbol | terminal+tabs | panel lateral)
   ===================================================================== */

const VistaTerminal={
 titulo:'Terminal',
 sub:()=>{
  const a=Sesion.actual(),d=a?dev(a.dispId):null;
  if(!d) return 'Sin sesión';
  const nombreDisp = d.apodo ? `${d.apodo} (${d.nombre})` : d.nombre;
  if(S.ejActiva && !FIN.includes(S.ejActiva.estado)){
   return `Ejecutando comando en ${nombreDisp}...`;
  }
  return nombreDisp;
 },
 llena:true,
 _montado:false,

 render(){
  const dd=S.dispositivos;
  const ses=S.sesiones;
  const act=Sesion.actual();
  const dAct=act?dev(act.dispId):null;

  return `<div class="term-g">
   ${this._arbol(dd)}
   <div class="col central">
    ${this._tabs(ses,act)}
    ${this._barra(act,dAct)}
    <div class="tcuerpo" id="tcuerpo"></div>
    ${this._entrada(act,dAct)}
    ${this._guardar(act)}
   </div>
   ${this._panelDer()}
  </div>`;
 },

 _arbol(dd){
  const q=(S.arbolQ||'').toLowerCase();
  const porSo={windows:[],macos:[],linux:[]};
  dd.forEach(d=>{
   if(q && !(d.nombre||'').toLowerCase().includes(q)) return;
   const k=d.sistema||'linux';
   if(!porSo[k]) porSo[k]=[];
   porSo[k].push(d);
  });
  let h=`<div class="arbol">
   <div class="arbol-bus"><input type="text" placeholder="Buscar equipo..." data-inp="arbolQ" value="${esc(S.arbolQ||'')}" class="inp-bus"></div>`;
  Object.entries(porSo).forEach(([so,lista])=>{
   if(!lista.length) return;
   const info=SO[so]||{n:so,ic:'monitor'};
   h+=`<details class="arbol-grupo" open>
    <summary>${ico(info.ic,13)} ${info.n} <span class="badge">${lista.length}</span></summary>`;
   lista.forEach(d=>{
    const sel=Sel.ids.has(d.id);
    const activo=S.dispActivo===d.id;
    h+=`<div class="dv${sel?' sel':''}${activo?' act':''}" data-acc="tAbrirSesion" data-dev="${d.id}">
     <input type="checkbox" ${sel?'checked':''} data-acc="selChk" data-id="${d.id}" onclick="event.stopPropagation()">
     <span class="dot ${d.en_linea?'on':'off'}"></span>
     <span class="dv-n">${esc(d.nombre||'—')}</span>
     <span class="dv-int">${(d.ints||[]).length} int.</span>
    </div>`;
   });
   h+=`</details>`;
  });
  h+=`</div>`;
  return h;
 },

 _tabs(ses,act){
  if(!ses.length) return `<div class="tabs"><div class="tab vacio-tab">Selecciona un equipo para iniciar</div></div>`;
  let h=`<div class="tabs" id="ses-tabs">`;
  ses.forEach(s=>{
   const d=dev(s.dispId);
   if(!d) return;
   const activo=act&&s.id===act.id;
   h+=`<div class="tab${activo?' act':''}" data-acc="tCambiarSesion" data-sid="${s.id}">
    <span class="dot ${d&&d.en_linea?'on':'off'}"></span>
    <span>${esc(d?d.nombre:'—')}</span>
    <span class="tab-int">${intB(s.int)}</span>
    <button class="tab-x" data-acc="tCerrarSesion" data-sid="${s.id}">${ico('x',10)}</button>
   </div>`;
  });
  h+=`</div>`;
  return h;
 },

 _barra(act,d){
  if(!act) return `<div class="tbarra" id="t-barra"><span class="tbarra-vacio">Sin sesión activa</span></div>`;
  return `<div class="tbarra" id="t-barra">
   <span class="dot ${d&&d.en_linea?'on':'off'}"></span>
   <b>${esc(d?d.nombre:'—')}</b>
   <span class="tbarra-int">${intB(act.int)}</span>
   <span id="t-aviso">${this.estado()}</span>
   <span class="tbarra-der">
    <select data-chg="tInt" id="t-int" class="sel-filt">
     ${(d&&d.ints||['powershell']).map(i=>`<option value="${i}"${act.int===i?' selected':''}>${(INT[i]||{n:i}).n}</option>`).join('')}
    </select>
    <button class="btn-ico" data-acc="tLimpiar" title="Limpiar terminal">${ico('trash',14)}</button>
    <button class="btn-ico" data-acc="tCancelar" title="Cancelar ejecución" ${!S.ejActiva?'disabled':''}>${ico('x',14)}</button>
   </span>
  </div>`;
 },

 _entrada(act,d){
  if(!act) return '';
  const so = (d?.sistema||'').toLowerCase();
  const ph = so==='macos'||so==='darwin' ? 'Zsh / Bash (macOS) · escribe un comando…' :
             so==='windows' ? 'PowerShell (Windows) · escribe un comando…' :
             'Bash (Linux) · escribe un comando…';
  const val = act.cmdDraft || '';
  return `<div class="tentrada">
   <span class="tprompt">${esc(prompt(d,act.int))}</span>
   <input type="text" id="t-input" class="tinp" placeholder="${ph}" data-inp="tCmd"
    value="${esc(val)}" autocomplete="off" spellcheck="false">
   <button class="btn pri" data-acc="tEnviar">${ico('play',14)} Ejecutar</button>
  </div>`;
 },

 _guardar(act){
  if(!act) return '';
  return `<div class="tguardar" id="t-guardar" style="display:none">
   <span>${ico('save',13)} Guardar como comando</span>
   <button class="btn sec btn-sm" data-acc="tGuardarCmd">Guardar en catálogo</button>
  </div>`;
 },

 _panelDer(){
  const tab=S.panelDer||'catalogo';
  return `<div class="col lateral" id="panel-der">
   <div class="ptabs">
    <button class="ptab${tab==='catalogo'?' act':''}" data-acc="tPanelTab" data-v="catalogo">Catálogo</button>
    <button class="ptab${tab==='historial'?' act':''}" data-acc="tPanelTab" data-v="historial">Historial</button>
    <button class="ptab${tab==='detalles'?' act':''}" data-acc="tPanelTab" data-v="detalles">Detalles</button>
   </div>
   <div class="pcuerpo" id="pcuerpo">${this._panelContenido(tab)}</div>
  </div>`;
 },

 _panelContenido(tab){
  if(tab==='catalogo') return this._panelCatalogo();
  if(tab==='historial') return this._panelHistorial();
  if(tab==='detalles') return this._panelDetalles();
  return '';
 },

 _panelCatalogo(){
  const q=(S.cf&&S.cf.q||'').toLowerCase();
  const dAct=dev(S.dispActivo);
  const soAct=(dAct?.sistema||'').toLowerCase();

  // Agrupar variantes multi-SO automáticamente si la función existe
  const rawCmds=S.comandos||[];
  let cmds = (typeof autoAgruparComandos==='function') ? autoAgruparComandos(rawCmds) : [...rawCmds];

  if(dAct){
   cmds = cmds.filter(function(c){
    if(typeof esMultiPlataforma==='function' && esMultiPlataforma(c)) return true;
    const cs = (c.sistema||c.so||'todos').toLowerCase();
    const ci = (c.interprete||'').toLowerCase();
    // Descartar comandos con intérpretes incompatibles con el SO activo
    if((soAct==='macos'||soAct==='darwin') && (ci==='powershell'||cs==='windows')) return false;
    if(soAct==='linux' && (ci==='powershell'||cs==='windows')) return false;
    if(soAct==='windows' && (ci==='zsh'||cs==='macos')) return false;
    return cs==='todos'||cs===soAct;
   });
  }

  if(q) cmds=cmds.filter(function(c){return (c.nombre||'').toLowerCase().includes(q)||(c.descripcion||'').toLowerCase().includes(q)});

  const catMap={};
  cmds.forEach(function(c){
   const catId=c.categoria_id||'__sin__';
   if(!catMap[catId]) catMap[catId]=[];
   catMap[catId].push(c);
  });

  let h='<div class="pfiltros"><input type="text" placeholder="Buscar comando..." data-inp="cfQ" class="inp-bus inp-sm" value="'+esc(S.cf&&S.cf.q||'')+'">'
   +(dAct?'<small style="color:var(--tx3);font-size:11px;margin-top:4px;display:block">Filtrado por '+soB(dAct.sistema)+'</small>':'')
   +'</div>';

  if(!cmds.length){
   h+='<div class="vacio">'+ico('grid',18)+'<span>Sin comandos'+(dAct?' para '+soB(dAct.sistema):'')+'</span></div>';
   return h;
  }

  Object.keys(catMap).forEach(function(catId){
   const lista=catMap[catId];
   const ca=catId==='__sin__'?null:catById(catId);
   const catNom=ca&&ca.nombre||'Sin categoría';
   const catColor=ca&&(ca.color||ca.col)||'var(--azul)';
   const catIcon=ca&&(ca.icono||ca.ic)||'tag';
   h+='<div class="pcat-sec">'
    +'<div class="pcat-cab" style="--c:'+catColor+'">'+ico(catIcon,12)+' <span>'+esc(catNom)+'</span>'
    +'<span class="badge">'+lista.length+'</span></div>';
   lista.slice(0,10).forEach(function(c){
    const ok=dAct?compat(c,dAct):true;
    h+='<div class="pcard'+(ok?'':' dim')+'" data-acc="tSelCmd" data-cmd="'+c.id+'" title="'+esc(c.descripcion||c.nombre)+'">'
     +'<div class="pcard-h">'
     +'<span class="cico sm" style="--c:'+catColor+'">'+ico(catIcon,12)+'</span>'
     +'<div class="pcard-inf"><b>'+esc(c.nombre||'—')+'</b>'
     +'<small class="pcard-meta">'+intB(c.interprete)+(c.requiere_admin?' '+flagAdm:'')+(c.es_destructivo||c.destructivo?' '+flagDes:'')+'</small>'
     +'</div>'
     +'<button class="btn-ico pcard-play" data-acc="tCmd2" data-id="'+c.id+'" title="Ejecutar ahora" onclick="event.stopPropagation()">'+ico('play',12)+'</button>'
     +'</div>'
     +(c.descripcion?'<div class="pcard-desc">'+esc((c.descripcion||'').slice(0,70))+'</div>':'')
     +'</div>';
   });
   h+='</div>';
  });
  return h;
 },

 /* ── Panel Historial: carga desde Supabase ── */
 _histCargado:false,
 _histDatos:[],

 _panelHistorial(){
  // Cabecera con botón refrescar y ver en vista completa
  let h='<div class="pfiltros" style="display:flex;align-items:center;gap:8px">'
   +'<span style="flex:1;font-size:12px;color:var(--tx2)">'+ico('clock',13)+' Últimas ejecuciones</span>'
   +'<button class="btn-ico" data-acc="tHistVerGlobal" title="Ver en sección Historial completo">'+ico('expand',13)+'</button>'
   +'<button class="btn-ico" data-acc="tHistRefrescar" title="Actualizar historial">'+ico('retry',13)+'</button>'
   +'</div>'
   +'<div id="p-hist-lista">';

  // Usar datos ya cargados si existen, o mostrar spinner y arrancar carga
  const datos=S.historialPanel||[];
  if(!datos.length && !this._histCargado){
   h+='<div class="vacio" id="p-hist-cargando">'+ico('clock',18)+'<span>Cargando historial...</span></div>';
   // Arrancar carga asíncrona
   setTimeout(()=>VistaTerminal._cargarHistorialPanel(),0);
  } else if(!datos.length){
   h+='<div class="vacio">'+ico('clock',18)+'<span>Historial vacío</span></div>';
  } else {
   datos.forEach(function(ej){
    const d=dev(ej.dispositivo_id);
    const cls={exitoso:'ok',fallido:'pel',cancelado:'off',tiempo_agotado:'warn'}[ej.estado]||'info';
    const nombre=ej.texto_comando||(S.comandos.find(x=>x.id===ej.comando_id)||{}).nombre||'(comando)';
    h+='<div class="pcard" data-acc="tHistVer" data-id="'+ej.id+'" style="cursor:pointer">'
     +'<div class="pcard-h"><span class="dot '+cls+'"></span>'
     +'<div class="pcard-inf">'
     +'<b>'+esc(nombre.slice(0,45))+'</b>'
     +'<small>'+pill(ej.estado,cls)+' '+(ej.duracion_ms?durTxt(ej.duracion_ms):'')
     +(d?' · '+esc(d.nombre):'')
     +'</small>'
     +'</div>'
     +'<div style="display:flex;gap:4px">'
     +'<button class="btn-ico" data-acc="tHistReplay" data-id="'+ej.id+'" title="Re-ejecutar">'+ico('retry',12)+'</button>'
     +'<button class="btn-ico" data-acc="tHistVer" data-id="'+ej.id+'" title="Ver salida">'+ico('expand',12)+'</button>'
     +'</div>'
     +'</div></div>';
   });
  }
  h+='</div>';
  return h;
 },

 async _cargarHistorialPanel(){
  try{
   const dispActivo=S.dispActivo;
   let q=sb.from('ejecuciones_comandos')
    .select('id,dispositivo_id,comando_id,estado,texto_comando,duracion_ms,creado,codigo_salida')
    .order('creado',{ascending:false})
    .limit(50);
   // Filtrar por equipo activo si hay uno seleccionado
   if(dispActivo) q=q.eq('dispositivo_id',dispActivo);
   const {data,error}=await q;
   if(error) throw error;
   this._histCargado=true;
   S.historialPanel=data||[];
   // Re-renderizar solo el panel si sigue en la pestaña historial
   if(S.panelDer==='historial'){
    const pc=$('#pcuerpo');
    if(pc) pc.innerHTML=VistaTerminal._panelHistorial();
   }
  }catch(e){
   this._histCargado=true;
   const el=$('#p-hist-cargando');
   if(el) el.innerHTML=ico('info',18)+'<span>Error al cargar historial</span>';
  }
 },

 _panelDetalles(){
  const act=Sesion.actual();
  if(!act) return '<div class="vacio">'+ico('info',18)+'<span>Sin sesión activa</span></div>';
  const d=dev(act.dispId);
  if(!d) return '<div class="vacio">Equipo no encontrado</div>';
  const discoUsado=d.disco&&d.disco.pct!=null?Math.round(100-d.disco.pct):null;
  return '<div class="kv-lista">'
   +'<div class="kv"><span class="kv-k">Equipo</span><span class="kv-v">'+esc(d.nombre||'—')+'</span></div>'
   +'<div class="kv"><span class="kv-k">Estado</span><span class="kv-v">'+pill(d.en_linea?'En línea':'Fuera de línea',d.en_linea?'ok':'off')+'</span></div>'
   +'<div class="kv"><span class="kv-k">SO</span><span class="kv-v">'+soB(d.sistema)+'</span></div>'
   +'<div class="kv"><span class="kv-k">IP</span><span class="kv-v">'+esc(d.ip_local||'—')+'</span></div>'
   +'<div class="kv"><span class="kv-k">Intérprete</span><span class="kv-v">'+intB(act.int)+'</span></div>'
   +'<div class="kv"><span class="kv-k">CPU</span><span class="kv-v">'+(d.cpu!=null?d.cpu+'%':'—')+'</span></div>'
   +'<div class="kv"><span class="kv-k">RAM</span><span class="kv-v">'+(d.ram!=null?d.ram+'%':'—')+'</span></div>'
   +'<div class="kv"><span class="kv-k">Disco</span><span class="kv-v">'+(discoUsado!=null?discoUsado+'%':'—')+'</span></div>'
   +'<div class="kv"><span class="kv-k">Intérpretes</span><span class="kv-v">'+(d.ints||[]).map(intB).join(' ')+'</span></div>'
   +'<div class="kv"><span class="kv-k">Último reporte</span><span class="kv-v">'+(d.visto?relativo(d.visto):'—')+'</span></div>'
   +'<div style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,.08)"><button class="btn sm pel" data-acc="eqEliminarConfirmar" data-id="'+d.id+'" style="width:100%;justify-content:center;gap:6px">'+ico('trash',13)+' Eliminar de la base de datos</button></div>'
   +'</div>';
 },

 estado(){
  if(!S.ejActiva) return '';
  const e=S.ejActiva;
  const cls={en_cola:'warn',despachado:'info',ejecutando:'info',exitoso:'ok',fallido:'pel',tiempo_agotado:'warn',cancelado:'off'};
  return pill(e.estado||'—', cls[e.estado]||'info');
 },

  _pollTimer:null,
  _secuenciaVista:0,
  _procesarFrag(f){
   if(!f)return;
   const seq=f.secuencia||0;
   if(seq>0&&seq<=this._secuenciaVista)return;
   if(seq>0)this._secuenciaVista=seq;
   let txt=f.texto||f.contenido||'';
   if(!txt)return;
   txt=txt.replace(/\r?\n/g,'\r\n');
   if(!txt.endsWith('\r\n')) txt+='\r\n';
   const act=Sesion.actual();
   if(act){
    act.lineas=act.lineas||[];
    const tipo = (f.flujo==='error_estandar'||f.flujo==='stderr')?'e':(f.flujo==='sistema'?'s':'o');
    act.lineas.push({f:tipo,t:txt.trimEnd()});
    if(act.lineas.length>1000) act.lineas.shift();
   }
   if(f.flujo==='error_estandar'||f.flujo==='stderr')Term.escr('\x1b[31m'+txt+'\x1b[0m');
   else if(f.flujo==='sistema')Term.escr('\x1b[90m'+txt+'\x1b[0m');
   else Term.escr(txt);
  },
  _finalizarEjecucion(ej){
   const fin=['exitoso','fallido','tiempo_agotado','cancelado'];
   if(this._pollTimer){clearInterval(this._pollTimer);this._pollTimer=null}
   S.ejActiva=Object.assign({},S.ejActiva,ej);
   const a=$('#t-aviso'); if(a)a.innerHTML=VistaTerminal.estado();
   const btn=$('[data-acc=tCancelar]'); if(btn)btn.disabled=true;
   const inp=$('#t-input'); if(inp)inp.disabled=false;
   if(fin.includes(ej.estado)){
    const col=ej.estado==='exitoso'?'\x1b[32m':'\x1b[31m';
    const msg = '\r\n'+col+'['+ej.estado.toUpperCase()+'] código: '+(ej.codigo_salida!=null?ej.codigo_salida:'—')+'\x1b[0m\r\n';
    Term.escr(msg);
    const act=Sesion.actual();
    if(act){
     act.lineas=act.lineas||[];
     act.lineas.push({f:'s',t:'['+ej.estado.toUpperCase()+'] código: '+(ej.codigo_salida!=null?ej.codigo_salida:'—')});
     if(act.lineas.length>1000) act.lineas.shift();
    }
    // Agregar al historial local Y resetear cache del panel
    S.historialLocal=S.historialLocal||[];
    S.historialLocal.unshift(ej);
    if(S.historialLocal.length>50)S.historialLocal.pop();
    // Forzar recarga del historial del panel en la próxima apertura
    S.historialPanel=null;
    this._histCargado=false;
    // Si el panel lateral está en historial, refrescarlo
    if(S.panelDer==='historial'){
     const pc=$('#pcuerpo');
     if(pc) pc.innerHTML=VistaTerminal._panelHistorial();
    }
    const g=$('#t-guardar'); if(g)g.style.display='flex';
   }
  },
  hist(){
   if(!S.ejActiva)return;
   const ejId=S.ejActiva.id;
   const self=this;
   self._secuenciaVista=0;
   if(self._pollTimer){clearInterval(self._pollTimer);self._pollTimer=null}

   // 1. Cargar fragmentos previos
   if(typeof Datos!=='undefined'&&Datos.salida){
    Datos.salida(ejId,0).then(function(fragmentos){
     if(fragmentos&&fragmentos.length){
      fragmentos.forEach(f=>self._procesarFrag(f));
     }
    }).catch(function(){});
   }

   // 2. Suscribirse a Realtime de Supabase
   if(typeof Realtime!=='undefined'&&Realtime.seguir){
    Realtime.seguir(ejId,
     function(frag){self._procesarFrag(frag)},
     function(ej){self._finalizarEjecucion(ej)}
    );
   }

   // 3. Polling activo de respaldo (cada 750 ms) para asegurar salida en vivo 100%
   self._pollTimer=setInterval(async function(){
    if(!S.ejActiva||S.ejActiva.id!==ejId||FIN.includes(S.ejActiva.estado)){
     if(self._pollTimer){clearInterval(self._pollTimer);self._pollTimer=null}
     return;
    }
    try{
     const frags=await Datos.salida(ejId,self._secuenciaVista);
     if(frags&&frags.length){
      frags.forEach(f=>self._procesarFrag(f));
     }
     const datos=await Datos.ejecucion(ejId);
     if(datos&&datos.estado){
      S.ejActiva=Object.assign({},S.ejActiva,datos);
      const a=$('#t-aviso'); if(a)a.innerHTML=VistaTerminal.estado();
      if(FIN.includes(datos.estado)){
       const ultimos=await Datos.salida(ejId,self._secuenciaVista);
       if(ultimos&&ultimos.length)ultimos.forEach(f=>self._procesarFrag(f));
       self._finalizarEjecucion(datos);
      }
     }
    }catch(_){}
   },750);
  },

 montar(){
  this._montado=true;
  const act=Sesion.actual();
  const self=this;
  setTimeout(function(){
   const cuerpo=$('#tcuerpo');
   if(cuerpo&&typeof Term!=='undefined'){
    Term.mont(cuerpo);
    if(act){
     const d=dev(act.dispId);
     Term.bienvenida(d);
     (act.lineas||[]).forEach(function(l){
      if(l.f==='s') Term.escr('\x1b[90m'+l.t+'\x1b[0m\r\n');
      else if(l.f==='e') Term.escr('\x1b[31m'+l.t+'\x1b[0m\r\n');
      else if(l.f==='i') Term.escr('\x1b[36m'+(l.p||'>')+' '+l.t+'\x1b[0m\r\n');
      else Term.escr(l.t+'\r\n');
     });
     if(S.ejActiva&&!FIN.includes(S.ejActiva.estado)){
      self.hist();
     }
    } else {
     Term.escr('\x1b[90mSelecciona un equipo en el panel izquierdo\x1b[0m\r\n');
    }
   }
   const inp=$('#t-input');
   if(inp) inp.focus();
  },60);
  this._onEquipos=function(){VistaTerminal._refrescarArbol()};
  this._onSel=function(){VistaTerminal._refrescarArbol()};
  this._onCmds=function(){VistaTerminal._refrescarPanel()};
  Bus.on('equipos',this._onEquipos);
  Bus.on('sel',this._onSel);
  Bus.on('comandos:cargados',this._onCmds);
 },

 salir(){
  this._montado=false;
  if(this._pollTimer){clearInterval(this._pollTimer);this._pollTimer=null}
  if(this._onEquipos) Bus.off('equipos',this._onEquipos);
  if(this._onSel) Bus.off('sel',this._onSel);
  if(this._onCmds) Bus.off('comandos:cargados',this._onCmds);
 },

 _refrescarArbol(){
  const arbol=$('.arbol');
  if(!arbol) return;
  const parent=arbol.parentElement;
  if(parent){
   const nuevo=document.createElement('div');
   nuevo.innerHTML=VistaTerminal._arbol(S.dispositivos);
   const nuevoArbol=nuevo.querySelector('.arbol');
   if(nuevoArbol) parent.replaceChild(nuevoArbol, arbol);
  }
 },

 _refrescarPanel(){
  const p=$('#pcuerpo');
  if(p) p.innerHTML=VistaTerminal._panelContenido(S.panelDer||'catalogo');
 }
};

VistaTerminal.activarEquipoYSesion=function(dispId, sid=null){
 const antSes = Sesion.actual();
 const inpViejo = $('#t-input');
 if(antSes && inpViejo){
  antSes.cmdDraft = inpViejo.value;
 }
 S._cmdPendiente = null;

 let s = sid ? S.sesiones.find(x=>x.id===sid) : null;
 if(!s){
  s = Sesion.abrir(dispId);
 } else {
  S.sesionActiva = s.id;
  S.dispActivo = s.dispId;
  guardar('disp', s.dispId);
 }
 if(!s) return;
 const d = dev(s.dispId);
 if(!d) return;

 S.dispActivo = d.id;
 guardar('disp', d.id);
 S.interprete = s.int || (d.sistema && SO[d.sistema] ? SO[d.sistema].def : 'powershell');

 if(typeof Sel!=='undefined') Sel.fijar([d.id]);
 S.historialPanel = null;
 VistaTerminal._histCargado = false;

 // 1. Refrescar árbol (marca el equipo como activo en la lista)
 VistaTerminal._refrescarArbol();

 // 2. Refrescar pestañas de sesiones
 const tabs = $('#ses-tabs');
 if(tabs) tabs.outerHTML = VistaTerminal._tabs(S.sesiones, s);

 // 3. Refrescar barra superior (#t-barra) con nombre de equipo e intérprete
 const barra = $('#t-barra');
 if(barra) barra.outerHTML = VistaTerminal._barra(s, d);

 // 4. Refrescar barra disparadora de comando (.tentrada) con nuevo prompt y placeholder por SO
 const central = $('.col.central');
 const guardEl = $('#t-guardar');
 const entHTML = VistaTerminal._entrada(s, d);
 const ent = $('.tentrada');
 if(ent){
  ent.outerHTML = entHTML;
 } else if(central){
  if(guardEl) guardEl.insertAdjacentHTML('beforebegin', entHTML);
  else central.insertAdjacentHTML('beforeend', entHTML);
 }

 // 5. Refrescar panel lateral (Catálogo filtrado para este SO en particular)
 VistaTerminal._refrescarPanel();

 // 6. Remontar xterm y restaurar historial de esta sesión
 const cuerpo = $('#tcuerpo');
 if(cuerpo && typeof Term!=='undefined'){
  Term.mont(cuerpo);
  if(!s.lineas || !s.lineas.length){
   Term.bienvenida(d);
  } else {
   Term.limpiar();
   (s.lineas||[]).forEach(function(l){
    if(l.f==='s') Term.escr('\x1b[90m'+l.t+'\x1b[0m\r\n');
    else if(l.f==='e') Term.escr('\x1b[31m'+l.t+'\x1b[0m\r\n');
    else if(l.f==='i') Term.escr('\x1b[36m'+(l.p||'>')+' '+l.t+'\x1b[0m\r\n');
    else Term.escr(l.t+'\r\n');
   });
  }
 }

 // 7. Actualizar subtítulo y foco
 if(typeof Nav!=='undefined' && Nav.sub) Nav.sub();
 const inp = $('#t-input');
 if(inp){
  inp.focus();
 }
};

/* ── Acciones de Terminal ── */
Acc.tAbrirSesion=function(el){
 const dispId=el.dataset.dev;
 if(!dispId) return;
 const d=dev(dispId);
 if(!d) return;
 if(!d.en_linea){
  Toast.mostrar(d.nombre+' está fuera de línea','aviso');
  return;
 }
 if(S.vista==='terminal'){
  VistaTerminal.activarEquipoYSesion(dispId);
  return;
 }
 Sesion.abrir(dispId);
 Nav.ir('terminal');
};

Acc.tCambiarSesion=function(el){
 const sid=el.dataset.sid;
 const s=S.sesiones.find(function(x){return x.id===sid});
 if(!s) return;
 if(S.vista==='terminal'){
  VistaTerminal.activarEquipoYSesion(s.dispId, s.id);
  return;
 }
 S.sesionActiva=sid;
 S.dispActivo=s.dispId;
 guardar('disp',s.dispId);
 if(typeof Sel!=='undefined') Sel.fijar([s.dispId]);
 Nav.ir('terminal');
};

Acc.tCerrarSesion=function(el){
 el.closest&&el.closest('.tab')&&el.closest('.tab').classList.add('closing');
 const sid=el.dataset.sid;
 Sesion.cerrar(sid);
 Nav.ir('terminal');
};

Acc.tPanelTab=function(el){
 S.panelDer=el.dataset.v;
 $$('.ptab').forEach(function(t){t.classList.toggle('act',t.dataset.v===S.panelDer)});
 // Si es historial y no hay datos cargados, arranca la carga
 if(S.panelDer==='historial' && !VistaTerminal._histCargado){
  S.historialPanel=null;
 }
 VistaTerminal._refrescarPanel();
};

Acc.tSelCmd=function(el){
 const cmdId=el.dataset.cmd;
 const d=dev(S.dispActivo);
 let cmd=cmdById(cmdId);
 if(!cmd && typeof autoAgruparComandos==='function'){
  const agrupados=autoAgruparComandos(S.comandos||[]);
  cmd=agrupados.find(x=>String(x.id)===String(cmdId));
 }
 if(!cmd) return;
 let texto=cmd.script||cmd.texto_comando||cmd.texto||'';
 if(d && typeof resolverScript==='function'){
  const res=resolverScript(cmd,d);
  if(res) texto=res;
 }
 const inp=$('#t-input');
 if(inp){
  inp.value=texto;
  inp.focus();
  inp.setSelectionRange(texto.length,texto.length);
 }
 S._cmdPendiente=texto;
 if(typeof Toast!=='undefined') Toast.mostrar('Comando cargado: '+cmd.nombre,'info');
};

Acc.tGuardarCmd=function(){
 const inp=$('#t-input');
 if(!inp||!inp.value.trim()) return;
 if(typeof VistaCatalogo!=='undefined'&&VistaCatalogo.abrirForm){
  VistaCatalogo.abrirForm(null);
  setTimeout(function(){
   const sc=document.querySelector('#modal [name=script]');
   if(sc) sc.value=inp.value.trim();
   const nm=document.querySelector('#modal [name=nombre]');
   if(nm) nm.focus();
  },100);
 } else {
  navigator.clipboard.writeText(inp.value.trim())
   .then(function(){Toast.mostrar('Comando copiado','ok')})
   .catch(function(){Toast.mostrar('Copia manual necesaria','aviso')});
 }
};

if(!Acc.cataNew){
 Acc.cataNew=function(){
  if(typeof VistaCatalogo!=='undefined'&&VistaCatalogo.abrirForm){
   VistaCatalogo.abrirForm(null);
  }
 };
}

Acc.tHistVerGlobal=function(){
 if(S.dispActivo && typeof VistaHistorial!=='undefined'){
  VistaHistorial._filtro.equipo=S.dispActivo;
 }
 if(typeof Nav!=='undefined') Nav.ir('historial');
};

Acc.tReplay=function(el){
 const ejId=el.dataset.ej;
 const ej=(S.historialLocal||[]).find(function(x){return String(x.id)===String(ejId)});
 if(!ej) return;
 if(typeof Motor!=='undefined') Motor.lanzar(ej.texto_comando||null,ej.comando_id||null);
};

/* Historial en el panel lateral: ver salida */
Acc.tHistVer=async function(el){
 const id=parseInt(el.dataset.id||el.closest('[data-id]')?.dataset.id);
 if(!id) return;
 if(typeof VistaHistorial!=='undefined'&&VistaHistorial.verSalida){
  VistaHistorial.verSalida(id);
  return;
 }
 try{
  const frags=await Datos.salida(id,0);
  const ej=await Datos.ejecucion(id);
  const d=dev(ej?.dispositivo_id);
  const txt=frags&&frags.length?frags.map(f=>{
   if(f.flujo==='error_estandar'||f.flujo==='stderr')return `<div class="ln e">${esc(f.texto||f.contenido||'')}</div>`;
   if(f.flujo==='sistema')return `<div class="ln s">${esc(f.texto||f.contenido||'')}</div>`;
   return `<div class="ln o">${esc(f.texto||f.contenido||'')}</div>`;
  }).join(''):'<div class="ln s">Sin salida registrada.</div>';
  Modal.abrir({aria:'Salida de ejecución',lado:true,ancho:640,
   titulo:'Salida · '+(d?.nombre||'Equipo'),
   html:`<div class="kv" style="margin-bottom:12px">
    <dt>Estado</dt><dd>${pill(ej?.estado||'—')}</dd>
    <dt>Duración</dt><dd>${durTxt(ej?.duracion_ms)}</dd>
    <dt>Código</dt><dd>${ej?.codigo_salida!=null?ej.codigo_salida:'—'}</dd>
    ${ej?.mensaje_error?`<dt>Error</dt><dd style="color:var(--pel)">${esc(ej.mensaje_error)}</dd>`:''}
   </div>
   <div class="tcuerpo" style="max-height:50vh;border-radius:14px">${txt}</div>`,
   pie:`<button class="btn" data-acc="mCerrar">Cerrar</button>`
  });
 }catch(e){
  Toast.mostrar('Error al cargar salida','err',e.message);
 }
};

/* Historial en el panel lateral: re-ejecutar */
Acc.tHistReplay=async function(el){
 const id=parseInt(el.dataset.id);
 if(!id) return;
 try{
  const ej=await Datos.ejecucion(id);
  if(!ej) return;
  const d=dev(ej.dispositivo_id);
  if(!d){Toast.mostrar('Equipo no encontrado','aviso');return}
  if(!d.en_linea){Toast.mostrar(d.nombre+' está fuera de línea','aviso');return}
  // Cambiar al equipo correcto si no es el activo
  if(S.dispActivo!==d.id){
   S.dispActivo=d.id; guardar('disp',d.id);
   Sesion.abrir(d.id);
   if(typeof Sel!=='undefined') Sel.fijar([d.id]);
  }
  if(typeof Motor!=='undefined') Motor.lanzar(ej.texto_comando||null,ej.comando_id||null);
 }catch(e){
  Toast.mostrar('Error al re-ejecutar','err',e.message);
 }
};

/* Historial en el panel lateral: refrescar */
Acc.tHistRefrescar=function(){
 S.historialPanel=null;
 VistaTerminal._histCargado=false;
 const pc=$('#pcuerpo');
 if(pc) pc.innerHTML=VistaTerminal._panelHistorial();
};

Chg.tInt=function(el){
 const act=Sesion.actual();
 if(act){
  act.int=el.value;
  S.interprete=el.value;
  const d=dev(act.dispId);
  const promptEl=$('.tprompt');
  if(promptEl&&d) promptEl.textContent=prompt(d,act.int);
  const tbarraInt=$('.tbarra-int');
  if(tbarraInt) tbarraInt.innerHTML=intB(act.int);
  const tabsInt=$(`#ses-tabs [data-sid="${act.id}"] .tab-int`);
  if(tabsInt) tabsInt.innerHTML=intB(act.int);
 }
};

Inp.arbolQ=function(el){
 S.arbolQ=el.value;
 VistaTerminal._refrescarArbol();
};

Inp.cfQ=function(el){
 S.cf=S.cf||{q:'',cat:null,so:null};
 S.cf.q=el.value;
 VistaTerminal._refrescarPanel();
};

Inp.tCmd=function(el,e){
 if(e&&e.key==='Enter'){
  e.preventDefault();
  const txt=el.value.trim();
  if(!txt) return;
  const act=Sesion.actual();
  if(act){
   act.lineas=act.lineas||[];
   act.lineas.push({f:'i',p:prompt(dev(act.dispId),act.int),t:txt});
  }
  el.disabled=true;
  if(typeof Motor!=='undefined'&&Motor.lanzar){
   Motor.lanzar(txt).catch(function(){el.disabled=false});
  }
 }
};

/* ── Registro ── */
Mod.registrarVista({
 id:'terminal', nombre:'Terminal', icono:'terminal', orden:30,
 definicion:VistaTerminal
});
window.VistaTerminal = VistaTerminal;

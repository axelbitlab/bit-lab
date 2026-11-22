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
    <button class="btn-ico" data-acc="tLimpiar" title="Limpiar">${ico('trash',14)}</button>
    <button class="btn-ico" data-acc="tCancelar" title="Cancelar" ${!S.ejActiva?'disabled':''}>${ico('x',14)}</button>
   </span>
  </div>`;
 },

 _entrada(act,d){
  if(!act) return '';
  return `<div class="tentrada">
   <span class="tprompt">${esc(prompt(d,act.int))}</span>
   <input type="text" id="t-input" class="tinp" placeholder="Escribe un comando..." data-inp="tCmd"
    autocomplete="off" spellcheck="false">
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
    <button class="ptab${tab==='catalogo'?' act':''}" data-acc="tPanelTab" data-v="catalogo">${ico('grid',13)} Catálogo</button>
    <button class="ptab${tab==='historial'?' act':''}" data-acc="tPanelTab" data-v="historial">${ico('clock',13)} Historial</button>
    <button class="ptab${tab==='detalles'?' act':''}" data-acc="tPanelTab" data-v="detalles">${ico('info',13)} Detalles</button>
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
  let cmds=S.comandos||[];
  if(q) cmds=cmds.filter(function(c){return (c.nombre||'').toLowerCase().includes(q)||(c.descripcion||'').toLowerCase().includes(q)});

  const dAct=dev(S.dispActivo);
  if(dAct) cmds=cmds.filter(function(c){return c.sistema===dAct.sistema||c.sistema==='todos'});

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

 _panelHistorial(){
  const ejecs=(S.historialLocal||[]).slice(0,15);
  let h='<div class="pfiltros"><span class="pfilt-label">'+ico('clock',13)+' Últimas ejecuciones</span></div>';
  if(!ejecs.length){
   h+='<div class="vacio">'+ico('clock',18)+'<span>Historial vacío</span></div>';
   return h;
  }
  ejecs.forEach(function(ej){
   const cls={exitoso:'ok',fallido:'pel',cancelado:'off'}[ej.estado]||'info';
   h+='<div class="pcard" data-acc="tReplay" data-ej="'+ej.id+'">'
    +'<div class="pcard-h"><span class="dot '+cls+'"></span>'
    +'<div class="pcard-inf"><b>'+esc((ej.texto_comando||'').slice(0,40)||'(comando)')+'</b>'
    +'<small>'+pill(ej.estado,cls)+' '+(ej.duracion_ms?durTxt(ej.duracion_ms):'')+'</small>'
    +'</div>'
    +'<button class="btn-ico" data-acc="tReplay" data-ej="'+ej.id+'" onclick="event.stopPropagation()">'+ico('retry',12)+'</button>'
    +'</div></div>';
  });
  return h;
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
    Term.escr('\r\n'+col+'['+ej.estado.toUpperCase()+'] código: '+(ej.codigo_salida!=null?ej.codigo_salida:'—')+'\x1b[0m\r\n');
    S.historialLocal=S.historialLocal||[];
    S.historialLocal.unshift(ej);
    if(S.historialLocal.length>50)S.historialLocal.pop();
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
  if(arbol) arbol.outerHTML=VistaTerminal._arbol(S.dispositivos);
 },

 _refrescarPanel(){
  const p=$('#pcuerpo');
  if(p) p.innerHTML=VistaTerminal._panelContenido(S.panelDer||'catalogo');
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
 const s=Sesion.abrir(dispId);
 if(!s) return;
 S.dispActivo=dispId;
 guardar('disp',dispId);
 Nav.ir('terminal');
};

Acc.tCambiarSesion=function(el){
 const sid=el.dataset.sid;
 const s=S.sesiones.find(function(x){return x.id===sid});
 if(!s) return;
 S.sesionActiva=sid;
 S.dispActivo=s.dispId; guardar('disp',s.dispId);
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
 VistaTerminal._refrescarPanel();
};

Acc.tSelCmd=function(el){
 const cmdId=el.dataset.cmd;
 const cmd=cmdById(cmdId);
 if(!cmd) return;
 const texto=cmd.script||cmd.texto_comando||cmd.texto||'';
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

Acc.tReplay=function(el){
 const ejId=el.dataset.ej;
 const ej=(S.historialLocal||[]).find(function(x){return String(x.id)===String(ejId)});
 if(!ej) return;
 if(typeof Motor!=='undefined') Motor.lanzar(ej.texto_comando||null,ej.comando_id||null);
};

Chg.tInt=function(el){
 const act=Sesion.actual();
 if(act) act.int=el.value;
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

/* =====================================================================
   CATÁLOGO · Vista principal con filtros + tabla + CRUD
   ===================================================================== */
const VistaCatalogo={
 titulo:'Catálogo',
 sub:()=>`${S.comandos.length} comandos`,
 llena:false,
 _q:'',_so:'',_cat:'',_ta:'',
 render(){
  const admin=esAdmin();
  const cats=S.categorias;
  const labSO = this._so ? (SISTEMA_OPTS.find(o=>o[0]===this._so)?.[1]||'SO') : 'Sistema: todos';
  const catNom = this._cat ? (cats.find(c=>c.id==this._cat)?.nombre||'Categoría') : 'Categoría: todas';
  const labTA = this._ta ? (TA[this._ta]?.n||TIPO_ALERTA_OPTS.find(o=>o[0]===this._ta)?.[1]||'Alerta') : 'Alerta: todas';
  const chevron = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex:none"><path d="M6 9l6 6 6-6"/></svg>`;

  // Barra de píldoras de categorías horizontales (según diseño de la captura)
  const pillCategorias = `<div class="cata-pill-bar">
   <button class="cata-pill${!this._cat?' act':''}" data-acc="cataPillCat" data-id="" style="--c:var(--verde)">
    <span class="cata-pill-dot"></span> Todas
   </button>
   ${cats.map(cat=>`<button class="cata-pill${this._cat==cat.id?' act':''}" data-acc="cataPillCat" data-id="${cat.id}" style="--c:${esc(cat.color||'var(--verde)')}">
    <span class="cata-pill-dot"></span> ${esc(cat.nombre)}
   </button>`).join('')}
  </div>`;

  return `<div class="cata-wrap">
   <div class="cata-toolbar">
    <div class="cata-buscar">
     <span class="cata-buscar-ic">${ico('search',16)}</span>
     <input data-inp="cataQ" placeholder="Buscar por nombre, descripción o texto del comando…" value="${esc(this._q)}">
     ${this._q?`<button class="cata-clear" data-acc="cataLimpiarBuscar" title="Limpiar">${ico('x',14)}</button>`:''}
    </div>
    <div class="cata-chips">
     <div class="chip-wrap" id="chip-so-wrap">
      <button class="chip${this._so?' chip-on':''}" data-acc="chipTog" data-chip="so">
       <span>${esc(labSO)}</span>${chevron}
      </button>
      <div class="chip-pop" id="chip-so-pop" hidden>
       <button class="chip-opt${!this._so?' act':''}" data-acc="chipSet" data-chip="so" data-val="">Todos los sistemas</button>
       ${SISTEMA_OPTS.map(([v,l])=>`<button class="chip-opt${this._so===v?' act':''}" data-acc="chipSet" data-chip="so" data-val="${v}">${l}</button>`).join('')}
      </div>
     </div>
     <div class="chip-wrap" id="chip-ta-wrap">
      <button class="chip${this._ta?' chip-on':''}" data-acc="chipTog" data-chip="ta">
       <span>${esc(labTA)}</span>${chevron}
      </button>
      <div class="chip-pop" id="chip-ta-pop" hidden>
       <button class="chip-opt${!this._ta?' act':''}" data-acc="chipSet" data-chip="ta" data-val="">Todas las alertas</button>
       ${TIPO_ALERTA_OPTS.map(([v,l])=>{
        const t=TA[v]||{};
        return `<button class="chip-opt${this._ta===v?' act':''}" data-acc="chipSet" data-chip="ta" data-val="${v}"><span class="chip-dot" style="background:${t.c||'var(--tx3)'}"></span>${l}</button>`;
       }).join('')}
      </div>
     </div>
     ${(this._q||this._so||this._cat||this._ta)?`<button class="chip chip-reset" data-acc="cataLimpiarFiltros" title="Limpiar todos los filtros">${ico('x',12)} Limpiar</button>`:''}
     <button class="btn sec" data-acc="cataGestionarCategorias" style="border-radius:14px;padding:9px 14px">
      ${ico('layers',15)} Categorías
     </button>
     <button class="btn pri cata-new-btn" data-acc="cataNew" style="border-radius:14px">
      ${ico('plus',18)} Nuevo comando
     </button>
    </div>
   </div>
   ${pillCategorias}
   <div class="cata-cards-grid" id="cata-lista"></div>
  </div>`;
 },
 montar(){
  this._q='';
  if(!this._so) this._so='';
  this._cat=''; this._ta='';
  this._renderLista();
  Bus.on('comandos',()=>this._renderLista());
  Bus.on('comandos:cargados',()=>this._renderLista());
 },
 _stats(){
  const c=S.comandos;
  const win=c.filter(x=>x.sistema==='windows').length;
  const mac=c.filter(x=>x.sistema==='macos').length;
  const multi=c.filter(x=>x.sistema==='todos').length;
  const dest=c.filter(x=>x.destructivo).length;
  return `<div class="stats" style="margin-bottom:16px">
   <div class="stat cr"><b>${c.length}</b><small>Total</small></div>
   <div class="stat cr" style="--c:var(--azul)"><b>${win}</b><small>Windows</small></div>
   <div class="stat cr" style="--c:var(--cian)"><b>${mac}</b><small>macOS</small></div>
   <div class="stat cr" style="--c:var(--indigo)"><b>${multi}</b><small>Multi-SO</small></div>
   <div class="stat cr" style="--c:var(--pel)"><b>${dest}</b><small>Destructivos</small></div>
  </div>`;
 },
 _renderLista(){
  const el=$('#cata-lista'); if(!el)return;
  const lista=this._filtrar();
  el.innerHTML=lista.length?lista.map(c=>this._fila(c,esAdmin())).join('')
   :`<div class="vacio" style="padding:48px 24px">${ico('search',28)}<br>Sin resultados</div>`;
 },
 _filtrar(){
  const q=this._q.toLowerCase(), so=this._so, cat=this._cat, ta=this._ta;
  return S.comandos.filter(c=>{
   if(q&&!c.nombre.toLowerCase().includes(q)&&!(c.descripcion||'').toLowerCase().includes(q))return false;
   if(so){
   const cs=(c.sistema||'').toLowerCase();
   const esMult=typeof esMultiPlataforma==='function'&&esMultiPlataforma(c);
   if(!esMult&&cs!==so&&cs!=='todos')return false;
  }
   if(cat&&c.categoria_id!=cat)return false;
   if(ta){
    const lista=alertasDe(c);
    if(!lista.includes(ta))return false;
   }
   return true;
  });
 },
 _fila(c,admin){
  const cat=S.categorias.find(x=>x.id===c.categoria_id);
  const catNom=cat?.nombre||'Sin categoría';
  const catColor=cat?.color||'#7000ff';
  const catIcon=cat?.icono||'activity';
  const taList=alertasDe(c);
  const taBadges = taList.length ?
   taList.map(t=>{
    const info=TA[t]||{};
    return `<span class="cata-tag" style="color:${info.c||'var(--tx2)'};border-color:${(info.c||'var(--tx3)')}44">${ico(info.ic||'tag',10)} ${info.n||t}</span>`;
   }).join(' ') : '';
  // BTL-200: badge multi-SO si tiene variantes
  const multi=typeof esMultiPlataforma==='function'&&esMultiPlataforma(c);
  const soTag=multi?`<span class="cata-tag multi" title="Tiene script específico por SO: Windows, macOS y/o Linux">⚡ Multi-SO</span>`
   :c.sistema==='windows'?`<span class="cata-tag win">Windows</span>`
   :c.sistema==='macos'?`<span class="cata-tag mac">macOS</span>`
   :c.sistema==='linux'?`<span class="cata-tag lin">Linux</span>`
   :`<span class="cata-tag">Todos</span>`;
  const intTag=`<span class="cata-tag">${esc(c.interprete||'auto')}</span>`;
  const flags=[
   c.destructivo?`<span class="cata-tag dest">${ico('alert',10)} Destructivo</span>`:'',
   c.requiere_admin?`<span class="cata-tag adm">${ico('shield',10)} Admin</span>`:'',
  ].filter(Boolean).join('');

  return `<article class="cata-card" style="--c:${esc(catColor)}">
   <div class="cata-card-head">
    <div class="cata-card-ico" style="--c:${esc(catColor)}">${ico(catIcon,16)}</div>
    <div class="cata-card-info">
     <b>${esc(c.nombre)}</b>
     <small style="color:${esc(catColor)}">${esc(catNom)}</small>
    </div>
   </div>
   <div class="cata-card-desc">${esc(c.descripcion||'Sin descripción disponible.')}</div>
   <div class="cata-card-tags">
    ${soTag}${intTag}${flags}
    <span class="cata-tag">${c.timeout_seg||60} s</span>
    ${taBadges}
   </div>
   <div class="cata-card-code" title="${esc(c.script||'')}"><code>${esc((typeof esMultiPlataforma==='function'&&esMultiPlataforma(c)&&S.dispActivo)?(resolverScript(c,dev(S.dispActivo))||c.script||''):c.script||'')}</code></div>
   <div class="cata-card-foot">
    <button class="cata-btn-run" data-acc="cataEjecutar" data-id="${c.id}" title="Ejecutar de inmediato">
     ${ico('play',13)} Ejecutar
    </button>
    <button class="cata-btn-ico" data-acc="cataEditar" data-id="${c.id}" title="Editar">
     ${ico('edit',14)}
    </button>
    <button class="cata-btn-ico" data-acc="cataDuplicar" data-id="${c.id}" title="Duplicar">
     ${ico('copy',14)}
    </button>
    <button class="cata-btn-ico pel" data-acc="cataEliminar" data-id="${c.id}" title="Eliminar">
     ${ico('trash',14)}
    </button>
   </div>
  </article>`;
 },
 abrirForm(id=null){
  const c=id?S.comandos.find(x=>x.id===id):null;
  Modal.abrir({
   aria:c?'Editar comando':'Nuevo comando',
   ancho:680,titulo:c?'Editar comando':'Nuevo comando',
   html:`<div class="form-cata">${this._htmlForm(c)}</div>`,
   pie:`<button class="btn" data-acc="mCerrar">Cancelar</button>
    <button class="btn ok" data-acc="cataGuardar" data-id="${id||''}">${c?'Guardar cambios':'Crear comando'}</button>`
  });
 },
 _htmlForm(c){
  const cats=S.categorias;
  const v=(f,fb='')=>c?esc(c[f]??fb):fb;
  const sel=(f,opts,fb='')=>opts.map(([val,lab])=>`<option value="${val}"${(c?c[f]:fb)===val?' selected':''}>${lab}</option>`).join('');
  const taAct=alertasDe(c);
  return `
   <div class="form-row-2">
    <label class="lbl-f">Nombre *
     <input class="inp-f" name="nombre" placeholder="Nombre del comando" value="${v('nombre')}" required>
    </label>
    <label class="lbl-f">Sistema operativo
     <select class="inp-f" name="sistema"><option value="">—</option>${sel('sistema',SISTEMA_OPTS,'todos')}</select>
    </label>
   </div>
   <label class="lbl-f">Descripción
    <input class="inp-f" name="descripcion" placeholder="Descripción breve" value="${v('descripcion')}">
   </label>
   <div class="form-row-2">
    <label class="lbl-f">Categoría
     <select class="inp-f" name="categoria_id">
      <option value="">Sin categoría</option>
      ${cats.map(cat=>`<option value="${cat.id}"${c?.categoria_id==cat.id?' selected':''}>${esc(cat.nombre)}</option>`).join('')}
     </select>
    </label>
    <label class="lbl-f">Tipos de alerta (uno o varios)
     <div class="ta-multi" id="ta-multi">
      ${TIPO_ALERTA_OPTS.map(([v2,l])=>{
       const info=TA[v2]||{};
       const on=taAct.includes(v2);
       return `<label class="ta-chip${on?' act':''}" style="--c:${info.c||'var(--tx2)'}">
        <input type="checkbox" name="tipos_alerta" value="${v2}"${on?' checked':''}>
        <span class="ta-chip-i">${ico(info.ic||'tag',12)}</span>
        <span>${l}</span>
       </label>`;
      }).join('')}
     </div>
     <small style="color:var(--tx3);font-size:11px;font-weight:500">Marca una o varias. Un comando puede servir para varias alertas (ejemplo: CPU y procesos).</small>
    </label>
   </div>
   <label class="lbl-f">Script / Comando *
    <textarea class="inp-f mono" name="script" rows="5" placeholder="Escribe el comando o script aquí…">${v('script')}</textarea>
   </label>
   <div class="form-row-2">
    <label class="lbl-f">Intérprete
     <select class="inp-f" name="interprete">${sel('interprete',INTERPRETE_OPTS,'powershell')}</select>
    </label>
    <label class="lbl-f">Timeout (segundos)
     <input class="inp-f" name="timeout_seg" type="number" min="5" max="3600" value="${v('timeout_seg','60')}">
    </label>
   </div>
   <div style="display:flex;gap:12px;flex-wrap:wrap">
    <label class="lbl-chk" style="flex:1;min-width:200px">
     <input type="checkbox" name="destructivo" ${c?.destructivo?'checked':''}>
     <span><b>Comando destructivo</b><small>Requiere confirmación antes de ejecutar</small></span>
    </label>
    <label class="lbl-chk" style="flex:1;min-width:200px">
     <input type="checkbox" name="requiere_admin" ${c?.requiere_admin?'checked':''}>
     <span><b>Requiere administrador</b><small>Eleva privilegios al ejecutar</small></span>
    </label>
   </div>`;
 },
 async guardar(id=null){
  const mo=$('#modal');
  const taSel=$$('[name=tipos_alerta]:checked',mo).map(el=>el.value);
  const campos={
   nombre:mo.querySelector('[name=nombre]')?.value?.trim()||'',
   descripcion:mo.querySelector('[name=descripcion]')?.value?.trim()||'',
   sistema:mo.querySelector('[name=sistema]')?.value||'todos',
   categoria_id:mo.querySelector('[name=categoria_id]')?.value||null,
   tipos_alerta:taSel,
   script:mo.querySelector('[name=script]')?.value?.trim()||'',
   interprete:mo.querySelector('[name=interprete]')?.value||'powershell',
   timeout_seg:parseInt(mo.querySelector('[name=timeout_seg]')?.value)||60,
   destructivo:mo.querySelector('[name=destructivo]')?.checked||false,
   requiere_admin:mo.querySelector('[name=requiere_admin]')?.checked||false,
  };
  if(!campos.nombre||!campos.script){
   Toast.mostrar('Nombre y script son obligatorios','aviso'); return;
  }
  const btn=mo.querySelector('[data-acc=cataGuardar]');
  if(btn){btn.disabled=true;btn.textContent='Guardando…'}
  try{
   if(id){ await Datos.actualizarComando(parseInt(id),campos); Toast.mostrar('Comando actualizado','ok') }
   else { await Datos.crearComando(campos); Toast.mostrar('Comando creado','ok') }
   Modal.cerrar();
   Bus.emit('comandos');
   this._renderLista();
  }catch(e){ Toast.mostrar('Error al guardar','err',e.message); if(btn){btn.disabled=false;btn.textContent=id?'Guardar cambios':'Crear comando'} }
 },
 confirmarEliminar(id){
  const c=S.comandos.find(x=>x.id===id);
  Modal.abrir({aria:'Eliminar comando',ancho:420,titulo:'Eliminar comando',
   html:`<p style="line-height:1.6">¿Eliminar el comando <b>${esc(c?.nombre||'')}</b>?<br>
    <small style="color:var(--tx3)">Se desactiva; el historial de ejecuciones se conserva.</small></p>`,
   pie:`<button class="btn" data-acc="mCerrar">Cancelar</button>
    <button class="btn pel" data-acc="cataEliminarOk" data-id="${id}">Eliminar</button>`});
 },
 async eliminar(id){
  try{
   await Datos.eliminarComando(parseInt(id));
   Toast.mostrar('Comando eliminado','ok');
   Modal.cerrar();
   this._renderLista();
  }catch(e){ Toast.mostrar('Error al eliminar','err',e.message) }
 },
 async duplicar(id){
  try{
   await Datos.duplicarComando(parseInt(id));
   Toast.mostrar('Comando duplicado','ok');
   this._renderLista();
  }catch(e){ Toast.mostrar('Error al duplicar','err',e.message) }
 }
};

Inp.cataQ=el=>{VistaCatalogo._q=el.value;VistaCatalogo._renderLista()};
Inp.cataSO=el=>{VistaCatalogo._so=el.value;VistaCatalogo._renderLista()};
Inp.cataCat=el=>{VistaCatalogo._cat=el.value;VistaCatalogo._renderLista()};
Inp.cataTA=el=>{VistaCatalogo._ta=el.value;VistaCatalogo._renderLista()};

Acc.cataPillCat=el=>{
 const id=el.dataset.id;
 VistaCatalogo._cat=id;
 $$('.cata-pill').forEach(b=>b.classList.toggle('act',b.dataset.id===id));
 VistaCatalogo._renderLista();
};

Acc.cataGestionarCategorias=()=>{
 const cats=S.categorias||[];
 const colores=['#7000ff','#0040ff','#9b00ff','#5500cc','#0025cc','#c0215a','#ef4444','#f59e0b','#7c3aed','#1d4ed8'];
 const listaHtml=cats.length?cats.map(c=>`<div class="item-c" style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(255,255,255,.04);border-radius:12px">
  <span style="width:14px;height:14px;border-radius:50%;background:${esc(c.color||'#7000ff')}"></span>
  <b style="flex:1">${esc(c.nombre)}</b>
  <small style="color:var(--tx3);font-family:var(--f-mono)">${esc(c.icono||'activity')}</small>
  <button class="ib pel" data-acc="cataEliminarCategoria" data-id="${c.id}" title="Eliminar">${ico('trash',14)}</button>
 </div>`).join(''):'<div class="vacio">No hay categorías registradas.</div>';

 Modal.abrir({
  aria:'Gestión de categorías',ancho:480,titulo:'Categorías de comandos',
  html:`<div style="display:grid;gap:14px">
   <div style="display:grid;gap:8px;max-height:220px;overflow-y:auto">
    ${listaHtml}
   </div>
   <div style="padding:14px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);display:grid;gap:10px">
    <b style="font-size:13px;color:var(--tx)">Nueva categoría</b>
    <input type="text" id="cat-nuevo-nom" placeholder="Nombre de la categoría (ej. Red, Seguridad)" style="width:100%">
    <div>
     <small style="display:block;margin-bottom:6px;color:var(--tx3);font-weight:600">Color identificador:</small>
     <div class="color-picker-row" id="cat-color-picker">
      ${colores.map((col,idx)=>`<button class="color-dot${idx===0?' act':''}" data-acc="cataPickColor" data-col="${col}" style="background:${col}"></button>`).join('')}
     </div>
     <input type="hidden" id="cat-nuevo-col" value="${colores[0]}">
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:4px">
     <button class="btn pri sm" data-acc="cataGuardarCategoria">${ico('plus',14)} Crear categoría</button>
    </div>
   </div>
  </div>`,
  pie:`<button class="btn" data-acc="mCerrar">Cerrar</button>`
 });
};

Acc.cataPickColor=el=>{
 const col=el.dataset.col;
 $('#cat-nuevo-col').value=col;
 $$('.color-dot').forEach(d=>d.classList.toggle('act',d===el));
};

Acc.cataGuardarCategoria=async()=>{
 const nom=$('#cat-nuevo-nom')?.value?.trim();
 const col=$('#cat-nuevo-col')?.value||'#7000ff';
 if(!nom){ Toast.mostrar('Escribe un nombre de categoría','aviso'); return; }
 try{
  const {data,error}=await sb.from('categorias_comandos').insert({nombre:nom,color:col,icono:'activity',orden:99}).select().single();
  if(error){
   // Guardar local si la tabla aún no tiene permisos o migración corrida
   const nueva={id:Date.now(),nombre:nom,color:col,icono:'activity',orden:99};
   S.categorias.push(nueva);
   guardar('categorias_locales',S.categorias);
  }else if(data){
   S.categorias.push(data);
  }
  Toast.mostrar('Categoría creada','ok',nom);
  Modal.cerrar();
  Nav.ir('catalogo');
 }catch(e){
  const nueva={id:Date.now(),nombre:nom,color:col,icono:'activity',orden:99};
  S.categorias.push(nueva);
  guardar('categorias_locales',S.categorias);
  Toast.mostrar('Categoría creada','ok',nom);
  Modal.cerrar();
  Nav.ir('catalogo');
 }
};

Acc.cataEliminarCategoria=async el=>{
 const id=el.dataset.id;
 try{
  await sb.from('categorias_comandos').delete().eq('id',id);
 }catch(e){}
 S.categorias=S.categorias.filter(c=>String(c.id)!==String(id));
 guardar('categorias_locales',S.categorias);
 Toast.mostrar('Categoría eliminada','ok');
 Modal.cerrar();
 Nav.ir('catalogo');
};
Acc.cataEditar=el=>VistaCatalogo.abrirForm(parseInt(el.dataset.id));
Acc.cataDuplicar=el=>VistaCatalogo.duplicar(parseInt(el.dataset.id));
Acc.cataEliminar=el=>VistaCatalogo.confirmarEliminar(parseInt(el.dataset.id));
Acc.cataEliminarOk=el=>VistaCatalogo.eliminar(parseInt(el.dataset.id));
Acc.cataGuardar=el=>VistaCatalogo.guardar(el.dataset.id||null);

/* ---------- Chips de filtro: dropdowns custom ---------- */
Acc.chipTog=(el)=>{
 const chip=el.dataset.chip;
 const pop=$('#chip-'+chip+'-pop');
 if(!pop)return;
 $$('.chip-pop').forEach(p=>{ if(p!==pop)p.hidden=true });
 $$('.chip-wrap').forEach(w=>w.classList.remove('open'));
 pop.hidden=!pop.hidden;
 if(!pop.hidden)$('#chip-'+chip+'-wrap').classList.add('open');
};
Acc.chipSet=(el)=>{
 const chip=el.dataset.chip, val=el.dataset.val;
 const V=VistaCatalogo;
 if(chip==='so')V._so=val;
 else if(chip==='cat')V._cat=val;
 else if(chip==='ta')V._ta=val;
 $$('.chip-pop').forEach(p=>p.hidden=true);
 Nav.ir('catalogo');
};
Acc.cataLimpiarBuscar=()=>{
 VistaCatalogo._q='';
 Nav.ir('catalogo');
};
Acc.cataLimpiarFiltros=()=>{
 const V=VistaCatalogo;
 V._q=''; V._so=''; V._cat=''; V._ta='';
 Nav.ir('catalogo');
};

// Interactividad del chip de tipos_alerta en el formulario
document.addEventListener('change',e=>{
 if(e.target?.name==='tipos_alerta'){
  const lab=e.target.closest('.ta-chip');
  if(lab)lab.classList.toggle('act',e.target.checked);
 }
});

// Cerrar popovers al hacer clic afuera
document.addEventListener('click',e=>{
 if(e.target.closest('.chip-wrap'))return;
 $$('.chip-pop').forEach(p=>p.hidden=true);
 $$('.chip-wrap').forEach(w=>w.classList.remove('open'));
},true);

Acc.cataEjecutar=el=>{
 const id=parseInt(el.dataset.id);
 const c=S.comandos.find(x=>x.id===id); if(!c)return;
 const dAct=dev(S.dispActivo);
 const online=S.dispositivos.filter(d=>d.en_linea&&compat(c,d));

 if(dAct&&dAct.en_linea&&compat(c,dAct)){
  const textoResuelto=(typeof esMultiPlataforma==='function'&&esMultiPlataforma(c))
   ?resolverScript(c,dAct):null;
  if(c.destructivo){
   Modal.abrir({aria:'Confirmar ejecución',ancho:420,titulo:'Acción destructiva',
    html:`<p style="line-height:1.6">El comando <b>${esc(c.nombre)}</b> está marcado como <b style="color:var(--pel)">destructivo</b>.<br>¿Ejecutar en <b>${esc(dAct.nombre)}</b>?</p>`,
    pie:`<button class="btn" data-acc="mCerrar">Cancelar</button>
     <button class="btn pel" data-acc="tConfirmar" data-id="${c.id}" data-txt="${esc(textoResuelto||c.script||'')}">Ejecutar de todas formas</button>`});
  }else{
   Sesion.abrir(dAct.id);
   Nav.ir('terminal');
   setTimeout(()=>{if(textoResuelto) Motor.lanzar(textoResuelto,null); else Motor.lanzar(null,c.id)},120);
  }
  return;
 }

 if(!online.length){
  Toast.mostrar('No hay equipos en línea compatibles ('+(c.sistema||'todos')+')','aviso');
  return;
 }

 Modal.abrir({
  aria:'Elegir equipo',ancho:440,titulo:'Ejecutar '+c.nombre,
  html:`<p style="font-size:12.5px;color:var(--txt-sec);margin-bottom:12px">Selecciona el equipo para ejecutar este comando:</p>
  <div class="lista-c" style="max-height:260px;overflow-y:auto;display:grid;gap:6px">
   ${online.map(d=>`<button class="btn sec" style="justify-content:flex-start;padding:10px 12px;gap:10px;text-align:left;width:100%" data-acc="cataLanzarEn" data-cid="${c.id}" data-did="${d.id}">
     <span class="dot on"></span>
     <div style="flex:1"><b>${esc(d.nombre)}</b><br><small style="color:var(--txt-sec)">${soB(d.sistema)} · ${esc(d.ip_local||'—')}</small></div>
     ${ico('play',14)}
   </button>`).join('')}
  </div>`,
  pie:`<button class="btn" data-acc="mCerrar">Cancelar</button>`
 });
};

Acc.cataLanzarEn=el=>{
 const cid=parseInt(el.dataset.cid);
 const did=el.dataset.did;
 const c=S.comandos.find(x=>x.id===cid);
 const d=dev(did);
 if(!c||!d)return;
 Modal.cerrar();
 S.dispActivo=d.id; guardar('disp',d.id);
 Sesion.abrir(d.id);
 Nav.ir('terminal');
 // Resolver variante Multi-SO si aplica
 const textoResuelto=(typeof esMultiPlataforma==='function'&&esMultiPlataforma(c))
  ?resolverScript(c,d):null;
 setTimeout(()=>{
  if(c.destructivo){
   Modal.abrir({aria:'Confirmar ejecución',ancho:420,titulo:'Acción destructiva',
    html:`<p style="line-height:1.6">El comando <b>${esc(c.nombre)}</b> está marcado como <b style="color:var(--pel)">destructivo</b>.<br>¿Continuar en <b>${esc(d.nombre)}</b>?</p>`,
    pie:`<button class="btn" data-acc="mCerrar">Cancelar</button>
     <button class="btn pel" data-acc="tConfirmar" data-id="${c.id}" data-txt="${esc(textoResuelto||'')}">Ejecutar de todas formas</button>`});
  }else{
   if(textoResuelto) Motor.lanzar(textoResuelto,null);
   else Motor.lanzar(null,c.id);
  }
 },120);
};

// Registrar la vista en el sistema de módulos.
Mod.registrarVista({
 id:'catalogo', nombre:'Catálogo', icono:'list', orden:20,
 definicion:VistaCatalogo
});

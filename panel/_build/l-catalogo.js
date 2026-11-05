
/* =====================================================================
   Catálogo de comandos — CRUD completo
   ===================================================================== */
const TIPO_ALERTA_OPTS=[
 ['','Sin categoría de alerta'],
 ['cpu','CPU'],
 ['memoria','Memoria'],
 ['disco','Disco'],
 ['proceso','Procesos'],
 ['impresora','Impresoras'],
 ['red','Red'],
 ['sistema','Sistema'],
];

const SISTEMA_OPTS=[
 ['todos','Todos (multi-SO)'],
 ['windows','Windows'],
 ['macos','macOS'],
 ['linux','Linux'],
];

const INTERPRETE_OPTS=[
 ['powershell','PowerShell'],
 ['bash','Bash'],
 ['cmd','CMD'],
 ['zsh','Zsh'],
 ['automatico','Automático'],
];

const TA={
 cpu:{ic:'cpu',c:'var(--ambar)'},
 memoria:{ic:'activity',c:'var(--indigo)'},
 disco:{ic:'hdd',c:'var(--cian)'},
 proceso:{ic:'layers',c:'var(--lima)'},
 impresora:{ic:'print',c:'var(--pel)'},
 red:{ic:'wifi',c:'var(--azul)'},
 sistema:{ic:'shield',c:'var(--gris,#aaa)'},
};

const esAdmin=()=>S.perfil?.rol==='admin';

Vistas.catalogo={
 titulo:'Catálogo',
 sub:()=>`${S.comandos.length} comandos`,
 llena:false,
 _q:'',_so:'',_cat:'',_ta:'',
 render(){
  const admin=esAdmin();
  const cats=S.categorias;
  return `<div class="cata-wrap">
   <!-- toolbar -->
   <div class="toolbar" style="display:flex;gap:9px;flex-wrap:wrap;align-items:center;margin-bottom:16px">
    <div style="position:relative;flex:1;min-width:160px">
     <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--tx3)">${ico('search',15)}</span>
     <input class="inp" data-inp="cataQ" placeholder="Buscar comando…" value="${esc(this._q)}" style="padding-left:32px;width:100%;box-sizing:border-box">
    </div>
    <select class="sel-inline" data-inp="cataSO" style="min-width:120px">
     <option value="">SO: todos</option>
     ${SISTEMA_OPTS.map(([v,l])=>`<option value="${v}"${this._so===v?' selected':''}>${l}</option>`).join('')}
    </select>
    <select class="sel-inline" data-inp="cataCat" style="min-width:140px">
     <option value="">Categoría: todas</option>
     ${cats.map(c=>`<option value="${c.id}"${this._cat==c.id?' selected':''}>${esc(c.nombre)}</option>`).join('')}
    </select>
    <select class="sel-inline" data-inp="cataTA" style="min-width:140px">
     <option value="">Alerta: todas</option>
     ${TIPO_ALERTA_OPTS.filter(x=>x[0]).map(([v,l])=>`<option value="${v}"${this._ta===v?' selected':''}>${l}</option>`).join('')}
    </select>
    ${admin?`<button class="btn" data-acc="cataNew" style="flex:none;white-space:nowrap">${ico('plus',16)} Nuevo comando</button>`:''}
   </div>
   <!-- stats -->
   ${this._stats()}
   <!-- tabla -->
   <div class="tarj" style="overflow:hidden;padding:0">
    <div class="cata-thead">
     <span>Nombre</span><span>Sistema</span><span>Categoría</span><span>Alerta</span><span>Flags</span><span></span>
    </div>
    <div class="cata-tabla" id="cata-lista"></div>
   </div>
  </div>`;
 },
 montar(){
  this._q=''; this._so=''; this._cat=''; this._ta='';
  this._renderLista();
  Bus.on('comandos',()=>this._renderLista());
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
   if(so&&c.sistema!==so)return false;
   if(cat&&c.categoria_id!=cat)return false;
   if(ta&&c.tipo_alerta!==ta)return false;
   return true;
  });
 },
 _fila(c,admin){
  const catNom=S.categorias.find(x=>x.id===c.categoria_id)?.nombre||'—';
  const taBadge=c.tipo_alerta&&TA[c.tipo_alerta]
   ?`<span class="flag" style="color:${TA[c.tipo_alerta].c};border-color:${TA[c.tipo_alerta].c}44;background:${TA[c.tipo_alerta].c}11">${ico(TA[c.tipo_alerta].ic,12)} ${c.tipo_alerta}</span>`
   :'<span style="color:var(--tx3);font-size:11px">—</span>';
  const soB=c.sistema==='windows'?'<span class="flag" style="color:var(--azul)">Win</span>'
   :c.sistema==='macos'?'<span class="flag" style="color:var(--cian)">macOS</span>'
   :c.sistema==='linux'?'<span class="flag" style="color:var(--lima)">Linux</span>'
   :'<span class="flag">Multi</span>';
  const flags=[
   c.destructivo?`<span class="flag pel">${ico('alert',11)} Destructivo</span>`:'',
   c.requiere_admin?`<span class="flag" style="color:var(--ambar)">${ico('shield',11)} Admin</span>`:'',
  ].filter(Boolean).join('');
  const acciones=admin?`<div class="cata-actos">
   <button class="btn-ic" title="Editar" data-acc="cataEditar" data-id="${c.id}">${ico('edit',15)}</button>
   <button class="btn-ic" title="Duplicar" data-acc="cataDuplicar" data-id="${c.id}">${ico('copy',15)}</button>
   <button class="btn-ic" title="Eliminar" data-acc="cataEliminar" data-id="${c.id}" style="color:var(--pel)">${ico('trash',15)}</button>
  </div>`:'';
  return `<div class="cata-fila">
   <div class="cata-nombre"><b class="cata-nm">${esc(c.nombre)}</b>
    <small>${esc(c.descripcion||'')}</small></div>
   <div>${soB}</div>
   <div style="font-size:12px;color:var(--tx2)">${esc(catNom)}</div>
   <div>${taBadge}</div>
   <div class="cata-flags">${flags||'<span style="color:var(--tx3);font-size:11px">—</span>'}</div>
   ${acciones}
  </div>`;
 },
 abrirForm(id=null){
  const c=id?S.comandos.find(x=>x.id===id):null;
  Modal.abrir({
   aria:c?'Editar comando':'Nuevo comando',
   ancho:640,titulo:c?'Editar comando':'Nuevo comando',
   html:`<div class="form-cata">${this._htmlForm(c)}</div>`,
   pie:`<button class="btn" data-acc="mCerrar">Cancelar</button>
    <button class="btn ok" data-acc="cataGuardar" data-id="${id||''}">${c?'Guardar cambios':'Crear comando'}</button>`
  });
 },
 _htmlForm(c){
  const cats=S.categorias;
  const v=(f,fb='')=>c?esc(c[f]??fb):fb;
  const sel=(f,opts,fb='')=>opts.map(([val,lab])=>`<option value="${val}"${(c?c[f]:fb)===val?' selected':''}>${lab}</option>`).join('');
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
    <label class="lbl-f">Tipo de alerta
     <select class="inp-f" name="tipo_alerta">${TIPO_ALERTA_OPTS.map(([v2,l])=>`<option value="${v2}"${c?.tipo_alerta===v2?' selected':''}>${l}</option>`).join('')}</select>
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
  const campos={
   nombre:mo.querySelector('[name=nombre]')?.value?.trim()||'',
   descripcion:mo.querySelector('[name=descripcion]')?.value?.trim()||'',
   sistema:mo.querySelector('[name=sistema]')?.value||'todos',
   categoria_id:mo.querySelector('[name=categoria_id]')?.value||null,
   tipo_alerta:mo.querySelector('[name=tipo_alerta]')?.value||null,
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

Inp.cataQ=el=>{Vistas.catalogo._q=el.value;Vistas.catalogo._renderLista()};
Inp.cataSO=el=>{Vistas.catalogo._so=el.value;Vistas.catalogo._renderLista()};
Inp.cataCat=el=>{Vistas.catalogo._cat=el.value;Vistas.catalogo._renderLista()};
Inp.cataTA=el=>{Vistas.catalogo._ta=el.value;Vistas.catalogo._renderLista()};

Acc.cataNew=()=>Vistas.catalogo.abrirForm(null);
Acc.cataEditar=el=>Vistas.catalogo.abrirForm(parseInt(el.dataset.id));
Acc.cataDuplicar=el=>Vistas.catalogo.duplicar(parseInt(el.dataset.id));
Acc.cataEliminar=el=>Vistas.catalogo.confirmarEliminar(parseInt(el.dataset.id));
Acc.cataEliminarOk=el=>Vistas.catalogo.eliminar(parseInt(el.dataset.id));
Acc.cataGuardar=el=>Vistas.catalogo.guardar(el.dataset.id||null);

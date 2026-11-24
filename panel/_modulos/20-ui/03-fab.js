/* =====================================================================
   UI · Menú flotante global superior izquierdo (FAB)
   ===================================================================== */
const Fab={
 el:null,p:null,abierto:false,drag:null,movio:false,
 montar(){
  this.el=$('#fab'); this.p=$('#fabPanel');
  if(this._listo)return; this._listo=true;
  this.el.hidden=true;
  return;
  const pos=leer('fab',null);
  if(pos){this.el.style.left=pos.x+'px';this.el.style.top=pos.y+'px'}
  else{this.el.style.left='16px';this.el.style.top='calc(14px + env(safe-area-inset-top,0px))'}
  this.el.addEventListener('pointerdown',e=>{
   const r=this.el.getBoundingClientRect();
   this.drag={sx:e.clientX,sy:e.clientY,ox:r.left,oy:r.top,mov:false};
   this.el.setPointerCapture(e.pointerId);
  });
  this.el.addEventListener('pointermove',e=>{
   const d=this.drag; if(!d)return;
   const dx=e.clientX-d.sx, dy=e.clientY-d.sy;
   if(!d.mov&&Math.hypot(dx,dy)>6){d.mov=true;this.cerrar()}
   if(d.mov){
    this.el.style.left=Math.max(8,Math.min(innerWidth-60,d.ox+dx))+'px';
    this.el.style.top=Math.max(8,Math.min(innerHeight-60,d.oy+dy))+'px';
   }
  });
  const fin=()=>{
   const d=this.drag; this.drag=null;
   if(d&&d.mov){this.movio=true;setTimeout(()=>this.movio=false,80);
    const r=this.el.getBoundingClientRect();guardar('fab',{x:Math.round(r.left),y:Math.round(r.top)})}
  };
  this.el.addEventListener('pointerup',fin);
  this.el.addEventListener('pointercancel',fin);
 },
 html(){
  const on=S.dispositivos.filter(d=>d.en_linea), d=dev(S.dispActivo);
  const it=(icn,c,t,s,a,dis)=>`<button class="it" data-acc="${a}" ${dis?'disabled style="opacity:.4"':''}>
   <span class="cico" style="--c:${c}">${ico(icn,17)}</span><span><b>${t}</b><small>${esc(s)}</small></span></button>`;
  return `<div class="eyebrow" style="padding:6px 10px 4px">Acceso rápido</div>
   ${it('terminal','var(--verde)','Terminal',d?d.nombre:'Elige un equipo','fTerminal',!d)}
   ${it('monitor','var(--azul)','Equipos',`${on.length} en línea de ${S.dispositivos.length}`,'fEquipos')}
   ${it('list','var(--indigo)','Catálogo',`${S.comandos.length} comandos`,'fCatalogo')}
   ${it('activity','var(--cian)','Estado de agentes','Latidos y versiones','fAgentes')}
   ${it('retry','var(--lima)','Actualizar ahora','Vuelve a leer los equipos','fRefrescar')}
   <div class="recientes"><div class="eyebrow" style="margin-bottom:4px">Equipos en línea</div>
   ${on.slice(0,4).map(x=>`<div class="r"><span class="dot on"></span><span>${esc(x.nombre)}</span>${soB(x.sistema)}</div>`).join('')
     ||'<div class="mut3" style="font-size:11.5px;padding:2px 4px">Ninguno en línea</div>'}</div>`;
 },
 abrir(){
  this.abierto=true; this.el.classList.add('abierto');
  this.el.setAttribute('aria-expanded','true');
  this.p.innerHTML=this.html(); this.p.hidden=false;
  const r=this.el.getBoundingClientRect(), w=Math.min(322,innerWidth-24), h=this.p.offsetHeight;
  const x=Math.max(12,Math.min(r.left,innerWidth-w-12));
  const abajo=r.bottom+10+h<innerHeight;
  this.p.style.left=x+'px';
  this.p.style.top=(abajo?r.bottom+10:Math.max(12,r.top-10-h))+'px';
  this.p.style.setProperty('--ox',(r.left-x+26)+'px');
  this.p.style.setProperty('--oy',abajo?'0px':h+'px');
 },
 cerrar(){
  if(!this.abierto)return;
  this.abierto=false; this.el.classList.remove('abierto');
  this.el.setAttribute('aria-expanded','false'); this.p.hidden=true;
 }
};
Acc.fab=()=>{ if(Fab.movio)return; Fab.abierto?Fab.cerrar():Fab.abrir() };
Acc.fTerminal=()=>{Fab.cerrar();Nav.ir('terminal')};
Acc.fEquipos=()=>{Fab.cerrar();Nav.ir('monitoreo')};
Acc.fCatalogo=()=>{Fab.cerrar();Nav.ir('catalogo')};
Acc.fHistorial=()=>{Fab.cerrar();Nav.ir('historial')};
Acc.fMasiva=()=>{Fab.cerrar();Nav.ir('masiva')};
Acc.fFrag=()=>{
 Fab.cerrar();
 const lista=()=>(S.fragmentos||[]).map(f=>`<div class="item-c" style="cursor:default">
  <span class="cico" style="--c:var(--cian);width:32px;height:32px;border-radius:11px">${ico('zap',15)}</span>
  <div style="flex:1;min-width:0"><b>${esc(f.nombre||f.n||'')}</b><small class="mono">${esc(f.texto||f.txt||'')}</small></div>
  <button class="ib" data-acc="fgCopiar" data-id="${f.id}" aria-label="Copiar">${ico('copy',14)}</button>
  <button class="ib" style="color:var(--verde)" data-acc="fgEjecutar" data-id="${f.id}" aria-label="Ejecutar">${ico('play',14)}</button>
 </div>`).join('');
 Modal.abrir({aria:'Fragmentos',lado:true,ancho:460,titulo:'Fragmentos',
  html:`<p style="font-size:12.5px;color:var(--txt-sec)">Se ejecutan en la terminal activa o en el último equipo usado.</p>
  <div class="lista-c" id="fg-l" style="max-height:none">${lista()||'<div class="vacio">Sin fragmentos guardados.</div>'}</div>
  <div style="padding:12px;display:grid;gap:8px">
   <span style="font:600 11px var(--f-body);text-transform:uppercase;letter-spacing:.6px;color:var(--txt-sec)">Nuevo fragmento</span>
   <input type="text" id="fg-n" placeholder="Nombre" autocomplete="off">
   <input type="text" id="fg-t" placeholder="Comando" autocomplete="off" style="font-family:var(--f-mono)">
   <button class="btn pri sm" data-acc="fgGuardar">${ico('plus',13)} Guardar fragmento</button>
  </div>`});
};
Acc.fgGuardar=()=>{
 const n=$('#fg-n')?.value.trim(),t=$('#fg-t')?.value.trim();
 if(!n||!t){Toast.mostrar('Completa nombre y comando','aviso');return}
 if(!S.fragmentos)S.fragmentos=[];
 S.fragmentos.push({id:uid('f'),nombre:n,texto:t,so:'todos'});
 guardar('fragmentos',S.fragmentos);
 Modal.cerrar();Acc.fFrag();Toast.mostrar('Fragmento guardado','ok',n);
};
Acc.fgCopiar=el=>{
 const f=(S.fragmentos||[]).find(x=>x.id===el.dataset.id);if(!f)return;
 try{navigator.clipboard.writeText(f.texto||f.txt||'').then(()=>Toast.mostrar('Copiado','ok')).catch(()=>Toast.mostrar('No se pudo copiar','aviso'))}catch(e){Toast.mostrar('No se pudo copiar','aviso')}
};
Acc.fgEjecutar=el=>{
 const f=(S.fragmentos||[]).find(x=>x.id===el.dataset.id);if(!f)return;
 const d=dev(S.dispActivo);if(!d||!d.en_linea){Toast.mostrar('Selecciona un equipo en línea','aviso');return}
 Modal.cerrar();Nav.ir('terminal');
 setTimeout(()=>Motor.lanzar(f.texto||f.txt||null),200);
};
Acc.fAgentes=()=>{
 Fab.cerrar();
 const on=S.dispositivos.filter(d=>d.en_linea).length;
 Modal.abrir({aria:'Estado de agentes',lado:true,ancho:460,titulo:'Estado de agentes',
  html:`<div class="stats" style="grid-template-columns:1fr 1fr">
   <div class="stat cr" style="--c:var(--verde)"><b>${on}</b><small>En línea</small></div>
   <div class="stat cr" style="--c:var(--pel)"><b>${S.dispositivos.length-on}</b><small>Fuera de línea</small></div></div>
   <div class="lista-c" style="max-height:none">${S.dispositivos.map(d=>
    `<div class="item-c" style="cursor:default"><span class="dot ${d.en_linea?'on':'off'}"></span>
     <div style="flex:1;min-width:0"><b>${esc(d.nombre)}</b>
      <small>v${esc(d.version_agente||'—')} · ${d.en_linea?'latido '+relativo(d.visto):'sin latido '+relativo(d.visto)}</small></div>
     ${soB(d.sistema)}</div>`).join('')||'<div class="vacio">Sin equipos</div>'}</div>`});
};
Acc.fRefrescar=async()=>{Fab.cerrar();await Datos.cargar();Bus.emit('equipos');Toast.mostrar('Equipos actualizados','ok')};
Acc.notif=()=>{
 if(!S.silenciado)Toast.mostrar('Notificaciones silenciadas','forzar','Puedes activarlas de nuevo aquí.');
 S.silenciado=!S.silenciado; guardar('silencio',S.silenciado); pintaNotif();
 if(!S.silenciado)Toast.mostrar('Notificaciones activadas','ok');
};

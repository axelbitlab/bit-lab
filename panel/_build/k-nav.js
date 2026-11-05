
/* =====================================================================
   Navegación, dock y menú flotante
   ===================================================================== */
const Nav={
 ir(v){
  if(!Vistas[v])v='equipos';
  const ant=Vistas[S.vista];
  if(ant&&ant.salir&&S.vista!==v)ant.salir();
  S.vista=v; guardar('vista',v);
  const V=Vistas[v], c=$('#vista');
  $('#tit').textContent=V.titulo;
  c.className=V.llena?'llena':'';
  c.innerHTML=`<div class="vista-in" style="${V.llena?'height:100%':''}">${V.render()}</div>`;
  c.scrollTop=0;
  V.montar&&V.montar();
  this.sub(); Dock.marcar();
 },
 sub(){ const V=Vistas[S.vista]; if(V&&V.sub)$('#subt').textContent=V.sub() }
};

const Dock={
 montar(){
  const d=$('#dock');
  if(d.querySelector('.btn-d'))return;
  d.insertAdjacentHTML('beforeend',VISTAS.map(([id,n,ic])=>
   `<button class="btn-d" data-acc="nav" data-v="${id}" aria-label="${n}">${ico(ic,22)}<span>${n}</span><b class="bd" hidden></b></button>`).join(''));
 },
 marcar(){
  const i=VISTAS.findIndex(x=>x[0]===S.vista), bs=$$('#dock .btn-d');
  if(!bs.length)return;
  bs.forEach((b,k)=>b.classList.toggle('act',k===i));
  const l=$('#lente'); if(l)l.style.transform=`translateX(${Math.max(0,i)*bs[0].offsetWidth}px)`;
  const bd=(k,n)=>{const e=$('.bd',bs[k]); if(!e)return; e.hidden=!n; e.textContent=n};
  bd(0,S.dispositivos.filter(x=>x.en_linea).length);
  bd(1,S.ejActiva&&!FIN.includes(S.ejActiva.estado)?1:0);
 }
};
Acc.nav=el=>{Fab.cerrar();Nav.ir(el.dataset.v)};
Acc.mCerrar=()=>Modal.cerrar();

const Fab={
 el:null,p:null,abierto:false,drag:null,movio:false,
 montar(){
  this.el=$('#fab'); this.p=$('#fabPanel');
  if(this._listo)return; this._listo=true;
  this.el.innerHTML=ico('terminal',24);
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
  const it=(ic,c,t,s,a,dis)=>`<button class="it" data-acc="${a}" ${dis?'disabled style="opacity:.4"':''}>
   <span class="cico" style="--c:${c}">${ico(ic,17)}</span><span><b>${t}</b><small>${esc(s)}</small></span></button>`;
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
Acc.fEquipos=()=>{Fab.cerrar();Nav.ir('equipos')};
Acc.fCatalogo=()=>{Fab.cerrar();Nav.ir('catalogo')};
Acc.fRefrescar=async()=>{Fab.cerrar();await Datos.cargar();Bus.emit('equipos');Toast.mostrar('Equipos actualizados','ok')};
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
Acc.notif=()=>{
 if(!S.silenciado)Toast.mostrar('Notificaciones silenciadas','forzar','Puedes activarlas de nuevo aquí.');
 S.silenciado=!S.silenciado; guardar('silencio',S.silenciado); pintaNotif();
 if(!S.silenciado)Toast.mostrar('Notificaciones activadas','ok');
};
Acc.salir=()=>{
 Modal.abrir({aria:'Cerrar sesión',ancho:420,titulo:'Cerrar sesión',
  html:`<p style="line-height:1.6">Se cerrará la sesión de <b>${esc(S.perfil?.nombre||S.correo||'')}</b>.
   Las ejecuciones en curso siguen su camino en el equipo.</p>`,
  pie:`<button class="btn" data-acc="mCerrar">Quedarme</button>
   <button class="btn pel" data-acc="salirYa">Cerrar sesión</button>`});
};
Acc.salirYa=()=>{Modal.cerrar();Acceso.salir()};

/* ---------- eventos globales ---------- */
document.addEventListener('click',e=>{
 if(Fab.abierto&&!e.target.closest('#fabPanel')&&!e.target.closest('#fab'))Fab.cerrar();
 const el=e.target.closest('[data-acc]'); if(!el)return;
 const f=Acc[el.dataset.acc]; if(f)f(el,e);
});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'){ if(!$('#modal').hidden)Modal.cerrar(); else Fab.cerrar() }
});
document.addEventListener('change',e=>{const el=e.target.closest('[data-chg]');if(el&&Chg[el.dataset.chg])Chg[el.dataset.chg](el,e)});
document.addEventListener('input',e=>{const el=e.target.closest('[data-inp]');if(el&&Inp[el.dataset.inp])Inp[el.dataset.inp](el,e)});
document.addEventListener('pointermove',e=>{
 const v=e.target.closest&&e.target.closest('.vid');
 if(v){const r=v.getBoundingClientRect();v.style.setProperty('--mx',(e.clientX-r.left)+'px');v.style.setProperty('--my',(e.clientY-r.top)+'px')}
},{passive:true});
addEventListener('resize',()=>Dock.marcar());

/* ---------- arranque ---------- */
Acceso.iniciar();
})();

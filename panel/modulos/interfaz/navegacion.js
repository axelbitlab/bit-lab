/* =====================================================================
   UI · Navegación entre vistas y páginas modulares
   ===================================================================== */
const MAPA_PAGINAS = {
  monitoreo: 'equipos.html',
  catalogo: 'catalogo.html',
  terminal: 'terminal.html',
  historial: 'historial.html',
  masiva: 'masiva.html',
  usuarios: 'usuarios.html',
  claves: 'claves.html'
};

/* Catálogo fijo del dock: cada página HTML ahora carga solo SU PROPIO
   módulo de vista (p.ej. equipos.html solo carga monitoreo/vista.js), así
   que Mod.listaVistas() ya no sirve para pintar el dock — solo contendría
   la vista de la página actual. El dock necesita conocer TODAS las
   secciones para poder redirigir entre páginas, así que se define aquí
   una sola vez, en el mismo orden que antes tenían las vistas registradas. */
const CATALOGO_NAV = [
  {id:'monitoreo', nombre:'Monitoreo', icono:'monitor',  orden:10},
  {id:'catalogo',  nombre:'Catálogo',  icono:'list',      orden:20},
  {id:'terminal',  nombre:'Terminal',  icono:'terminal',  orden:30},
  {id:'historial', nombre:'Historial', icono:'history',   orden:40},
  {id:'masiva',    nombre:'Masiva',    icono:'layers',    orden:50},
  {id:'usuarios',  nombre:'Usuarios',  icono:'users',     orden:60, soloAdmin:true},
  {id:'claves',    nombre:'Claves',    icono:'key',       orden:70, soloAdmin:true},
];

const Nav={
 ir(v){
  const paginaActual = document.body.dataset.pagina;
  const destinoUrl = MAPA_PAGINAS[v];

  // Si la vista solicitada corresponde a otra página HTML, redirigir
  if (paginaActual && destinoUrl && !window.location.pathname.endsWith(destinoUrl)) {
    guardar('vista', v);
    window.location.href = destinoUrl;
    return;
  }

  const lista = Mod.listaVistas();
  if(!Vistas[v]){
   v = paginaActual || lista[0]?.id || 'monitoreo';
  }
  const ant = Vistas[S.vista];
  if(ant && ant.salir && S.vista!==v) ant.salir();
  S.vista = v; guardar('vista',v);
  const V = Vistas[v], c = $('#vista');
  if(!V || !c){ return; }
  $('#tit').textContent = V.titulo || '';
  c.className = V.llena ? 'llena' : '';
  c.innerHTML = `<div class="vista-in" style="${V.llena?'height:100%':''}">${V.html?V.html():(V.render?V.render():'')}</div>`;
  c.scrollTop = 0;
  V.montar && V.montar();
  this.sub();
  Dock.marcar();
 },
 sub(){ const V=Vistas[S.vista]; if(V&&V.sub&&$('#subt'))$('#subt').textContent=V.sub() }
};

const Dock={
 // Secciones solo-admin (p.ej. Usuarios) se ocultan del dock para técnicos.
 // S.perfil ya está cargado para cuando Acceso.dentro() llama Dock.montar()
 // la primera vez; si por algo se llama antes (evento vistas:registradas en
 // el primer load del módulo de la página), simplemente aún no se ve ese botón
 // y se vuelve a montar correctamente después del login.
 _items(){ return CATALOGO_NAV.filter(v=>!v.soloAdmin || S.perfil?.rol==='administrador') },
 montar(){
  const d=$('#dock');
  if(!d) return;
  const lista=this._items();
  const marca=d.querySelector('#lente');
  d.innerHTML='';
  if(marca)d.appendChild(marca); else d.insertAdjacentHTML('beforeend','<i id="lente"></i>');
  d.insertAdjacentHTML('beforeend',lista.map(v=>
   `<button class="btn-d" data-acc="nav" data-v="${v.id}" aria-label="${esc(v.nombre)}">${ico(v.icono,22)}<span>${esc(v.nombre)}</span><b class="bd" hidden></b></button>`).join(''));
  this.marcar();
 },
 marcar(){
  const paginaActual = document.body.dataset.pagina || S.vista || 'monitoreo';
  const lista=this._items();
  const i=lista.findIndex(x=>x.id===paginaActual), bs=$$('#dock .btn-d');
  if(!bs.length)return;
  bs.forEach((b,k)=>b.classList.toggle('act',k===i));
  const l=$('#lente'); if(l && bs[0])l.style.transform=`translateX(${Math.max(0,i)*bs[0].offsetWidth}px)`;
  const bd=(id,n)=>{const b=bs.find(x=>x.dataset.v===id); if(!b)return; const e=$('.bd',b); if(!e)return; e.hidden=!n; e.textContent=n};
  if(S.dispositivos) bd('monitoreo',S.dispositivos.filter(x=>x.en_linea).length);
  if(S.ejActiva) bd('terminal',!FIN.includes(S.ejActiva.estado)?1:0);
 }
};

Acc.nav=el=>{ if(typeof Fab!=='undefined')Fab.cerrar(); Nav.ir(el.dataset.v) };

Bus.on('vistas:registradas',()=>{ if($('#dock') && !$('#dock').hidden) Dock.montar() });
window.Nav = Nav;
window.Dock = Dock;

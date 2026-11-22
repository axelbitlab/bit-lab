/* =====================================================================
   UI · Navegación entre vistas y dock inferior
   ===================================================================== */
const Nav={
 ir(v){
  const lista=Mod.listaVistas();
  if(!Vistas[v]){
   v=lista[0]?.id||'monitoreo';
  }
  const ant=Vistas[S.vista];
  if(ant&&ant.salir&&S.vista!==v)ant.salir();
  S.vista=v; guardar('vista',v);
  const V=Vistas[v], c=$('#vista');
  if(!V){ c.innerHTML='<div class="vacio" style="padding:40px">Esta vista ya no está instalada.</div>'; return }
  $('#tit').textContent=V.titulo||'';
  c.className=V.llena?'llena':'';
  c.innerHTML=`<div class="vista-in" style="${V.llena?'height:100%':''}">${V.html?V.html():(V.render?V.render():'')}</div>`;
  c.scrollTop=0;
  V.montar&&V.montar();
  this.sub(); Dock.marcar();
 },
 sub(){ const V=Vistas[S.vista]; if(V&&V.sub)$('#subt').textContent=V.sub() }
};

const Dock={
 montar(){
  const d=$('#dock');
  const lista=Mod.listaVistas();
  const marca=d.querySelector('#lente');
  d.innerHTML='';
  if(marca)d.appendChild(marca); else d.insertAdjacentHTML('beforeend','<i id="lente"></i>');
  d.insertAdjacentHTML('beforeend',lista.map(v=>
   `<button class="btn-d" data-acc="nav" data-v="${v.id}" aria-label="${esc(v.nombre)}">${ico(v.icono,22)}<span>${esc(v.nombre)}</span><b class="bd" hidden></b></button>`).join(''));
  this.marcar();
 },
 marcar(){
  const lista=Mod.listaVistas();
  const i=lista.findIndex(x=>x.id===S.vista), bs=$$('#dock .btn-d');
  if(!bs.length)return;
  bs.forEach((b,k)=>b.classList.toggle('act',k===i));
  const l=$('#lente'); if(l && bs[0])l.style.transform=`translateX(${Math.max(0,i)*bs[0].offsetWidth}px)`;
  const bd=(id,n)=>{const b=bs.find(x=>x.dataset.v===id); if(!b)return; const e=$('.bd',b); if(!e)return; e.hidden=!n; e.textContent=n};
  bd('monitoreo',S.dispositivos.filter(x=>x.en_linea).length);
  bd('terminal',S.ejActiva&&!FIN.includes(S.ejActiva.estado)?1:0);
 }
};
Acc.nav=el=>{ if(typeof Fab!=='undefined')Fab.cerrar(); Nav.ir(el.dataset.v) };

// Repintar el dock cuando se registren vistas tarde.
Bus.on('vistas:registradas',()=>{ if($('#dock') && !$('#dock').hidden) Dock.montar() });

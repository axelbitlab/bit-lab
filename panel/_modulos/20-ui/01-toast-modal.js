/* =====================================================================
   UI · Toast + Modal genérico
   ===================================================================== */
const Toast={
 mostrar(t,tipo='ok',sub=''){
  if(S.silenciado&&tipo!=='forzar')return;
  const c={ok:'var(--verde)',aviso:'var(--ambar)',err:'var(--pel)',info:'var(--cian)'}[tipo]||'var(--cian)';
  const icn={ok:'check',aviso:'alert',err:'alert',info:'zap'}[tipo]||'zap';
  const el=document.createElement('div');el.className='toast vid';
  el.innerHTML=`<span class="cico" style="--c:${c}">${ico(icn,15)}</span><div><b>${esc(t)}</b>${sub?`<small>${esc(sub)}</small>`:''}</div>`;
  $('#toasts').appendChild(el);setTimeout(()=>{el.style.transition='.4s';el.style.opacity=0;el.style.transform='translateX(30px)';setTimeout(()=>el.remove(),400)},4200);
 }
};

const Modal={
 abrir(o){
  const m=$('#modal');
  m.innerHTML=`<div class="velo" data-acc="mCerrar"></div><section class="vid ${o.lado?'hoja':'caja'}" role="dialog" aria-modal="true" aria-label="${esc(o.aria||'Diálogo')}" style="--w:${o.ancho||640}px"><header><h2>${o.titulo}</h2><button class="ib" data-acc="mCerrar" aria-label="Cerrar">${ico('x',16)}</button></header><div class="cuerpo">${o.html}</div>${o.pie?`<footer>${o.pie}</footer>`:''}</section>`;
  m.hidden=false;o.montar&&o.montar(m);
 },
 cerrar(){const m=$('#modal');m.hidden=true;m.innerHTML=''}
};
const PanelAlertas={
 _abierto:false,_el:null,
 // Recopilar alertas de todos los dispositivos (mismo helper que VistaMonitoreo)
 _alertas(){
  const info={cpu:['CPU alta','pel','cpu'],memoria:['Memoria alta','ambar','cpu'],
   disco:['Disco casi lleno','ambar','hardDrive'],proceso:['Proceso elevado','indigo','activity'],
   red:['Sin contacto reciente','tx3','wifiOff']};
  const lista=[];
  S.dispositivos.forEach(d=>{
   const aa=(typeof Datos!=='undefined'&&Datos._alertasActivas)?Datos._alertasActivas(d):[];
   aa.forEach(tipo=>{
    const [msg,col,ic]=info[tipo]||[tipo,'tx3','alert'];
    lista.push({id:d.id,tipo,mensaje:msg,color:`var(--${col})`,icono:ic,nombre:d.nombre});
   });
  });
  return lista;
 },
 abrir(){
  if(this._abierto){this.cerrar();return}
  const btn=$('#btnNotif'); if(!btn)return;
  const alertas=this._alertas();
  const r=btn.getBoundingClientRect();
  const panel=document.createElement('div');
  panel.id='alerta-panel'; panel.className='vid alerta-popup';
  panel.innerHTML=`<div class="ap-head"><span>${ico('bell',14)} <b>Alertas activas</b></span>
   <span class="badge">${alertas.length}</span></div>
   ${alertas.length?alertas.map(a=>`<div class="ap-item" data-id="${a.id}">
    <div class="ap-item-top">
     <span class="ap-ico-equipo" style="color:${a.color}">${ico(a.icono,15)}</span>
     <div class="ap-txt"><b class="ap-nombre">${esc(a.nombre)}</b><small class="ap-msg">${esc(a.mensaje)}</small></div>
    </div>
    <div class="ap-acciones">
     <button class="ap-btn ap-btn-menu" data-acc="apAbrirMiniMenu" data-id="${a.id}" title="Abrir menú del equipo">
      ${ico('monitor',12)} Mini menú
     </button>
     <button class="ap-btn ap-btn-det" data-acc="apVerDetalle" data-id="${a.id}" title="Ver detalles">
      ${ico('info',12)} Detalle
     </button>
    </div>
   </div>`).join(''):'<div class="ap-vacio">✅ Sin alertas activas</div>'}
   ${S.silenciado?`<div class="ap-sil">${ico('bellOff',12)} Notificaciones silenciadas</div>`:''}
   <div class="ap-pie">
    <button class="ib sm" data-acc="notifToggle">${S.silenciado?ico('bell',13)+' Activar':ico('bellOff',13)+' Silenciar'}</button>
   </div>`;
  const w=280, x=Math.max(8,Math.min(r.right-w,innerWidth-w-8));
  panel.style.cssText=`position:fixed;top:${r.bottom+6}px;left:${x}px;width:${w}px;z-index:9999`;
  document.body.appendChild(panel);
  this._el=panel; this._abierto=true;
  setTimeout(()=>document.addEventListener('pointerdown',this._fuera,{capture:true,once:true}),0);
 },
 _fuera(e){
  const p=document.getElementById('alerta-panel');
  if(p&&!p.contains(e.target)){PanelAlertas.cerrar()}
  else{setTimeout(()=>document.addEventListener('pointerdown',PanelAlertas._fuera,{capture:true,once:true}),0)}
 },
 cerrar(){
  if(this._el){this._el.remove();this._el=null}
  this._abierto=false;
 }
};

const pintaNotif=()=>{
 const b=$('#btnNotif');if(!b)return;
 const alertas=PanelAlertas._alertas();
 const silenciado=S.silenciado;
 b.innerHTML=ico(silenciado?'bellOff':'bell',16);
 b.setAttribute('aria-pressed',silenciado);
 b.setAttribute('data-badge',alertas.length||'');
 b.classList.toggle('tiene-alertas',alertas.length>0&&!silenciado);
};

Acc.mCerrar=()=>Modal.cerrar();
Acc.apIrEquipo=el=>{
 const id=el.closest('[data-id]')?.dataset.id;
 PanelAlertas.cerrar();
 if(id&&typeof Sel!=='undefined') Sel.fijar([id]);
 if(typeof Nav!=='undefined') Nav.ir('monitoreo');
};
Acc.apAbrirMiniMenu=el=>{
 const id=el.closest('[data-id]')?.dataset.id; if(!id)return;
 PanelAlertas.cerrar();
 // Buscar tarjeta del equipo en el grid para anclar el mini menú junto a ella
 const tarjeta=document.querySelector(`.vid[data-id="${id}"]`)||document.querySelector(`[data-id="${id}"]`);
 if(tarjeta){
  const r=tarjeta.getBoundingClientRect();
  if(typeof MiniMenu!=='undefined') MiniMenu.abrir(id, r.right+6, r.top);
  else if(typeof Sel!=='undefined'){ Sel.fijar([id]); }
 } else {
  // Equipo no visible – ir a monitoreo primero
  if(typeof Nav!=='undefined') Nav.ir('monitoreo');
  setTimeout(()=>{
   const t=document.querySelector(`[data-id="${id}"]`);
   if(t&&typeof MiniMenu!=='undefined'){
    const r=t.getBoundingClientRect();
    MiniMenu.abrir(id,r.right+6,r.top);
   }
  },350);
 }
};
Acc.apVerDetalle=el=>{
 const item=el.closest('.ap-item'); if(!item)return;
 item.classList.toggle('ap-item--expandido');
 const id=item.dataset.id;
 const a=PanelAlertas._alertas().find(x=>x.id===id); if(!a)return;
 let det=item.querySelector('.ap-detalle-bloque');
 if(!det){
  det=document.createElement('div'); det.className='ap-detalle-bloque';
  const lineas=[];
  if(a.valor!==undefined) lineas.push(`Valor actual: <b>${a.valor}${a.unidad||'%'}</b>`);
  if(a.umbral!==undefined) lineas.push(`Límite configurado: ${a.umbral}${a.unidad||'%'}`);
  if(a.ts) lineas.push(`Detectado: ${new Date(a.ts).toLocaleTimeString('es-MX')}`);
  det.innerHTML=lineas.length?lineas.join(' · '):'<i>Sin datos adicionales disponibles</i>';
  item.appendChild(det);
 }
};
Acc.notifToggle=()=>{
 S.silenciado=!S.silenciado; guardar('silencio',S.silenciado);
 pintaNotif(); PanelAlertas.cerrar();
 Toast.mostrar(S.silenciado?'Notificaciones silenciadas':'Notificaciones activadas',S.silenciado?'aviso':'ok');
};

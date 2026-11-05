
/* =====================================================================
   Pantalla 2 · Equipos disponibles
   ===================================================================== */
const Acc={},Chg={},Inp={};
const Vistas={};

Vistas.equipos={
 titulo:'Equipos',
 sub(){
  const on=S.dispositivos.filter(d=>d.en_linea).length, t=S.dispositivos.length;
  return t?`${on} de ${t} en línea · latido cada 30 s`:'Sin equipos registrados';
 },
 barra(v,c){return `<div class="med-b"><i style="width:${Math.min(100,Math.max(0,v||0))}%;background:${c}"></i></div>`},
 color(p){return p==null?'var(--tx3)':p<60?'var(--verde)':p<85?'var(--ambar)':'var(--pel)'},

 tarjeta(d){
  const on=d.en_linea, act=d.id===S.dispActivo;
  const dsk=d.disco, usado=dsk?100-(dsk.pct??0):null;
  return `<button class="eq vid ${on?'':'off'}" data-acc="eqAbrir" data-id="${d.id}"
   aria-label="Abrir terminal en ${esc(d.nombre)}"${act?' style="border-color:rgba(57,255,136,.4)"':''}>
   <div class="eh">
    <span class="dot ${on?'on':'off'}"></span>
    <span class="nn"><b>${esc(d.nombre)}</b><small>${esc(d.ip_local||'sin IP')} · ${esc(d.usuario_so||'—')}</small></span>
    ${soB(d.sistema)}
   </div>
   <div class="med">
    <div class="m" style="--c:${this.color(d.cpu)}"><span>CPU</span><b>${d.cpu==null?'—':d.cpu+'%'}</b>
     ${on?this.barra(d.cpu,this.color(d.cpu)):''}</div>
    <div class="m" style="--c:${this.color(d.ram)}"><span>Memoria</span><b>${d.ram==null?'—':d.ram+'%'}</b>
     ${on?this.barra(d.ram,this.color(d.ram)):''}</div>
    <div class="m" style="--c:${this.color(usado)}"><span>Disco ${dsk?esc(dsk.u):''}</span>
     <b>${dsk?gb(dsk.libre)+' libres':'—'}</b>${on&&dsk?this.barra(usado,this.color(usado)):''}</div>
    <div class="m"><span>Agente</span><b style="font-size:12.5px">v${esc(d.version_agente||'—')}</b>
     <div class="mut3" style="font:500 10px var(--f-mono);margin-top:5px">${d.ints.length} intérpretes</div></div>
   </div>
   <div class="pie-e">
    <span class="grow">${on?'latido '+relativo(d.visto):'sin contacto '+relativo(d.visto)}</span>
    ${on?`<span class="flag" style="color:var(--verde);background:rgba(57,255,136,.1);border:1px solid rgba(57,255,136,.25)">${ico('terminal',11)} Abrir</span>`
        :`<span class="flag" style="color:var(--tx3)">${ico('plug',11)} Fuera de línea</span>`}
   </div></button>`;
 },

 render(){
  const on=S.dispositivos.filter(d=>d.en_linea).length;
  const t=S.dispositivos.length;
  if(!t)return `<section class="vid panel vacio" style="display:grid;gap:12px;place-items:center;padding:46px 24px">
   <span class="cico" style="--c:var(--ambar);width:52px;height:52px;border-radius:16px">${ico('plug',22)}</span>
   <div style="text-align:center;line-height:1.6">Todavía no hay equipos registrados.<br>
   <span class="mut3" style="font-size:12.5px">Instala el agente en una computadora y aparecerá aquí en menos de un minuto.</span></div></section>`;
  return `<div class="stats" style="margin-bottom:14px">
   <div class="stat cr" style="--c:var(--verde)"><b>${on}</b><small>En línea</small></div>
   <div class="stat cr" style="--c:var(--pel)"><b>${t-on}</b><small>Fuera de línea</small></div>
   <div class="stat cr" style="--c:var(--azul)"><b>${S.comandos.length}</b><small>Comandos</small></div>
   <div class="stat cr" style="--c:var(--cian)"><b>${t}</b><small>Equipos</small></div></div>
   <div class="tools"><div class="grow"><input type="search" data-inp="eqQ" id="eqQ"
     placeholder="Buscar por nombre, IP o usuario" autocomplete="off">${ico('search',16)}</div>
    <button class="btn" data-acc="eqRefrescar">${ico('retry',14)} Actualizar</button></div>
   <div class="eq-grid" id="eq-grid">${this.lista()}</div>`;
 },

 lista(){
  const q=(this._q||'').toLowerCase().trim();
  const l=S.dispositivos.filter(d=>!q||
   (d.nombre+' '+(d.ip_local||'')+' '+(d.usuario_so||'')+' '+(d.version_so||'')).toLowerCase().includes(q));
  return l.map(d=>this.tarjeta(d)).join('')||
   '<div class="vacio vid panel" style="grid-column:1/-1">Ningún equipo coincide con la búsqueda.</div>';
 },

 refrescar(){ const g=$('#eq-grid'); if(g)g.innerHTML=this.lista(); Nav.sub() }
};
Inp.eqQ=el=>{Vistas.equipos._q=el.value;Vistas.equipos.refrescar()};
Acc.eqRefrescar=async()=>{
 await Datos.cargar();
 Vistas.equipos.refrescar();
 Toast.mostrar('Equipos actualizados','ok');
};
Acc.eqAbrir=el=>{
 const d=dev(el.dataset.id);
 if(!d)return;
 if(!d.en_linea){
  Toast.mostrar(d.nombre+' está fuera de línea','aviso','El agente no ha dado latido. No se puede abrir la terminal.');
  return;
 }
 S.dispActivo=d.id; guardar('disp',d.id); S.interprete=null;
 Nav.ir('terminal');
};
Bus.on('equipos',()=>{ if(S.vista==='equipos')Vistas.equipos.refrescar(); if(S.vista==='terminal')Vistas.terminal.cabecera() });

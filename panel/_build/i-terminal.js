
/* =====================================================================
   Terminal en vivo — xterm.js
   ===================================================================== */
const Term={
 _inst:null,_fit:null,
 mont(host){
  if(this._inst){this._inst.dispose();this._inst=null}
  const t=new Terminal({theme:{background:'#07070b',foreground:'#e2e8f0',
   cursor:'#39ff88',selectionBackground:'rgba(57,255,136,.22)',
   black:'#1e1e2e',red:'#ff5470',green:'#39ff88',yellow:'#ffb703',
   blue:'#3b82f6',magenta:'#c084fc',cyan:'#22d3ee',white:'#e2e8f0',
   brightBlack:'#64748b',brightRed:'#ff5470',brightGreen:'#39ff88',
   brightYellow:'#ffb703',brightBlue:'#60a5fa',brightMagenta:'#d8b4fe',
   brightCyan:'#67e8f9',brightWhite:'#f1f5f9'},
   fontFamily:'JetBrains Mono, monospace',fontSize:13,
   lineHeight:1.45,cursorBlink:true,scrollback:3000,
   convertEol:true,allowTransparency:true});
  if(window.FitAddon){const f=new FitAddon.FitAddon();t.loadAddon(f);this._fit=f}
  if(window.WebLinksAddon)t.loadAddon(new WebLinksAddon.WebLinksAddon());
  t.open(host);
  this._inst=t;
  setTimeout(()=>this.ajustar(),80);
  const ro=new ResizeObserver(()=>this.ajustar());
  ro.observe(host);
  return t;
 },
 ajustar(){ try{this._fit?.fit()}catch(_){} },
 escr(txt,tipo='std'){
  const t=this._inst; if(!t)return;
  if(tipo==='err')t.write('\x1b[31m'+txt+'\x1b[0m');
  else if(tipo==='sys')t.write('\x1b[33m'+txt+'\x1b[0m');
  else t.write(txt);
 },
 limpiar(){ this._inst?.clear() },
 bienvenida(d){
  if(!this._inst)return;
  this._inst.writeln(`\x1b[32m╭─ Bitlab-IT Terminal ─────────────────────────────╮\x1b[0m`);
  this._inst.writeln(`\x1b[32m│\x1b[0m  Equipo : \x1b[1m${d.nombre}\x1b[0m`);
  this._inst.writeln(`\x1b[32m│\x1b[0m  SO     : ${d.sistema} ${d.version_so||''}`);
  this._inst.writeln(`\x1b[32m│\x1b[0m  IP     : ${d.ip_local||'—'}`);
  this._inst.writeln(`\x1b[32m╰──────────────────────────────────────────────────╯\x1b[0m`);
  this._inst.writeln('');
 }
};

Vistas.terminal={
 titulo:'Terminal',
 sub:()=>S.dispActivo?dev(S.dispActivo)?.nombre||'':'Elige un equipo',
 llena:true,
 _q:'',
 render(){
  return `<div class="t-wrap">
   <!-- columna central: terminal -->
   <div class="t-main tarj">
    ${this.cabecera()}
    <div id="xterm-host"></div>
    <div class="t-pie">
     <div class="t-linea">
      <span class="gp">&gt;_</span>
      <input id="t-input" data-inp="tCmd" placeholder="Escribe un comando…" autocomplete="off" spellcheck="false" ${!S.dispActivo?'disabled':''}>
      <button class="btn ok" data-acc="tEnviar" ${!S.dispActivo?'disabled':''} style="flex:none">${ico('play',16)}</button>
     </div>
     <div id="t-aviso" class="t-aviso">${this.estado()}</div>
    </div>
   </div>
   <!-- columna derecha: comandos + datos equipo -->
   <div class="t-lado tarj">
    <div class="lado-cmd">
     <div class="buscar">
      <span class="ico">${ico('search',14)}</span>
      <input class="inp" data-inp="tBuscar" placeholder="Buscar…" value="${esc(this._q)}">
     </div>
     <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <span style="font:600 10.5px var(--f-mono);color:var(--tx3);text-transform:uppercase;letter-spacing:.08em">Comandos recomendados</span>
      <button class="btn-ic" data-acc="tLimpiar" title="Limpiar terminal">${ico('x',14)}</button>
     </div>
     <div class="rec" id="rec-lista">${this.recomendados()}</div>
    </div>
    <div class="lado-eq" id="lado-eq-data">${this.datos()}</div>
   </div>
  </div>`;
 },
 montar(){
  const host=$('#xterm-host');
  if(host){
   Term.mont(host);
   const d=dev(S.dispActivo);
   if(d)Term.bienvenida(d);
  }
  this.hist();
  Bus.on('equipos',()=>{
   const h=$('#lado-eq-data'); if(h)h.innerHTML=this.datos();
   const inp=$('#t-input'); const btn=$('[data-acc=tEnviar]');
   const ok=!!dev(S.dispActivo);
   if(inp)inp.disabled=!ok;
   if(btn)btn.disabled=!ok;
  });
 },
 salir(){ Realtime.dejar() },
 cabecera(){
  const d=dev(S.dispActivo);
  return `<div class="t-cab">
   <div class="nn">
    <b>${d?esc(d.nombre):'Sin equipo seleccionado'}</b>
    <small>${d?`${d.sistema} · ${d.ip_local||'—'}`:'Selecciona un equipo en Equipos'}</small>
   </div>
   ${d?`<span id="ws-ind" style="display:flex;align-items:center;gap:5px;padding:4px 10px;border-radius:99px;border:1px solid rgba(255,255,255,.12);font:600 10.5px var(--f-mono);letter-spacing:.05em;color:var(--tx3)">
    <span class="dot"></span><span id="ws-txt">Conectando…</span></span>`:''}
   ${d?`<span class="seg">${ico('stop',14)}<button class="btn-ic" data-acc="tCancelar" title="Cancelar ejecución" disabled>${ico('stop',14)}</button></span>`:''}
   <select class="sel-inline" data-inp="tInt" style="font:600 11.5px var(--f-mono)">
    ${(d?.ints||['powershell']).map(i=>`<option>${i}</option>`).join('')}
   </select>
  </div>`;
 },
 estado(){
  const ej=S.ejActiva;
  if(!ej)return `${ico('terminal',14)} Listo`;
  const cl={en_cola:'var(--tx3)',despachado:'var(--ambar)',ejecutando:'var(--verde)',
   exitoso:'var(--verde)',fallido:'var(--pel)',tiempo_agotado:'var(--pel)',cancelado:'var(--tx3)'};
  const lbl={en_cola:'En cola…',despachado:'Despachando…',ejecutando:'Ejecutando…',
   exitoso:`Listo (${ej.codigo_salida??'—'})`,fallido:`Error (${ej.codigo_salida??'—'})`,
   tiempo_agotado:'Tiempo agotado',cancelado:'Cancelado'};
  return `<span style="color:${cl[ej.estado]||'var(--tx)'}">${ico('activity',14)} ${lbl[ej.estado]||ej.estado}</span>`;
 },
 recomendados(){
  const d=dev(S.dispActivo); if(!d)return '<div class="mut3" style="font-size:12px;padding:4px">Selecciona un equipo para ver comandos recomendados</div>';
  const q=this._q.toLowerCase();
  const lista=Datos.recomendados(d).filter(c=>!q||c.nombre.toLowerCase().includes(q));
  if(!lista.length)return '<div class="mut3" style="font-size:12px;padding:4px">Sin comandos disponibles</div>';
  return lista.slice(0,30).map(c=>{
   const ta=c.tipo_alerta&&TA[c.tipo_alerta];
   const badge=ta?`<span style="color:${ta.c};font-size:10px;font-weight:600">${ico(ta.ic,10)} ${c.tipo_alerta}</span>`:
    `<span style="color:var(--tx3);font-size:10px">${c.interprete||'auto'}</span>`;
   const dest=c.destructivo?`<span class="flag pel" style="font-size:10px;padding:1px 5px">${ico('alert',9)}</span>`:'';
   return `<button class="rec-i" data-acc="tCmd2" data-id="${c.id}" ${!d.en_linea?'disabled':''}
    title="${esc(c.descripcion||c.nombre)}">
    <span class="cico" style="--c:${ta?.c||'var(--indigo)'};width:30px;height:30px;border-radius:10px;flex:none">${ico(ta?.ic||'terminal',14)}</span>
    <span class="tt"><b>${esc(c.nombre)}</b><small>${esc(c.descripcion||'')||badge}</small></span>
    ${dest}
   </button>`;
  }).join('');
 },
 datos(){
  const d=dev(S.dispActivo); if(!d)return '<div class="mut3" style="padding:12px;font-size:12px">Sin equipo</div>';
  const bar=(v,max=100)=>`<div class="med-b"><i style="width:${Math.min(100,v||0)}%;background:${v>80?'var(--pel)':v>60?'var(--ambar)':'var(--verde)'}"></i></div>`;
  return `<dl class="kv" style="grid-template-columns:auto 1fr;gap:5px 10px;font-size:12px">
   <dt>IP</dt><dd>${esc(d.ip_local||'—')}</dd>
   <dt>SO</dt><dd>${esc(d.sistema)} ${esc(d.version_so||'')}</dd>
   <dt>Arch</dt><dd>${esc(d.arquitectura||'—')}</dd>
   <dt>Agente</dt><dd>v${esc(d.version_agente||'—')}</dd>
   <dt>CPU</dt><dd>${d.cpu!=null?d.cpu+'%':'—'}${d.cpu!=null?bar(d.cpu):''}</dd>
   <dt>RAM</dt><dd>${d.ram!=null?d.ram+'%':'—'}${d.ram!=null?bar(d.ram):''}</dd>
   ${d.disco?`<dt>${esc(d.disco.u||'C:')}</dt><dd>${d.disco.libre!=null?d.disco.libre+'GB libre':'—'}${d.disco.pct!=null?bar(100-d.disco.pct):''}</dd>`:''}
   <dt>Visto</dt><dd>${relativo(d.visto)}</dd>
  </dl>`;
 },
 hist(){
  const ej=S.ejActiva;
  if(!ej)return;
  Datos.salida(ej.id,0).then(frags=>{
   frags.forEach(f=>Term.escr(f.texto,f.flujo==='error_estandar'?'err':'std'));
  });
  if(!FIN.includes(ej.estado))
   Realtime.seguir(ej.id,
    f=>Term.escr(f.contenido,f.flujo==='error_estandar'?'err':'std'),
    n=>{ S.ejActiva={...S.ejActiva,...n};
     const a=$('#t-aviso'); if(a)a.innerHTML=Vistas.terminal.estado();
     const btn=$('[data-acc=tCancelar]'); if(btn)btn.disabled=FIN.includes(n.estado);
     if(FIN.includes(n.estado))Realtime.dejar(); }
   );
 }
};

Inp.tCmd=el=>{S._cmdPendiente=el.value};
Inp.tBuscar=el=>{Vistas.terminal._q=el.value;const r=$('#rec-lista');if(r)r.innerHTML=Vistas.terminal.recomendados()};
Inp.tInt=el=>{S._interprete=el.value};

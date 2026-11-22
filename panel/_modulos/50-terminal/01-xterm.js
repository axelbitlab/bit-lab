/* =====================================================================
   TERMINAL · xterm.js
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
  setTimeout(()=>this.ajustar(),30);
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

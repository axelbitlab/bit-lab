/* =====================================================================
   TERMINAL · xterm.js  (tema dinámico claro / oscuro)
   ===================================================================== */

/** Paletas de color para xterm según el tema activo */
const XTERM_TEMAS = {
 oscuro: {
  background:'#07070b',       foreground:'#e2e8f0',
  cursor:'#39ff88',           selectionBackground:'rgba(57,255,136,.22)',
  black:'#1e1e2e',            red:'#ff5470',
  green:'#39ff88',            yellow:'#ffb703',
  blue:'#3b82f6',             magenta:'#c084fc',
  cyan:'#22d3ee',             white:'#e2e8f0',
  brightBlack:'#64748b',      brightRed:'#ff5470',
  brightGreen:'#39ff88',      brightYellow:'#ffb703',
  brightBlue:'#60a5fa',       brightMagenta:'#d8b4fe',
  brightCyan:'#67e8f9',       brightWhite:'#f1f5f9'
 },
 claro: {
  background:'#f8fbfe',       foreground:'#0d1b2a',
  cursor:'#00b85a',           selectionBackground:'rgba(0,184,90,.25)',
  black:'#2c3e50',            red:'#c2185b',
  green:'#1a7a40',            yellow:'#7c4a00',
  blue:'#1a66ff',             magenta:'#5b4fd4',
  cyan:'#008db8',             white:'#2c3e50',
  brightBlack:'#607d8b',      brightRed:'#d93060',
  brightGreen:'#00b85a',      brightYellow:'#c47c00',
  brightBlue:'#4480ff',       brightMagenta:'#7b6de0',
  brightCyan:'#00aad4',       brightWhite:'#0d1b2a'
 }
};

const Term={
 _inst:null,_fit:null,
 _tema(){ return document.documentElement.getAttribute('data-tema')==='claro'?'claro':'oscuro' },
 mont(host){
  if(this._inst){this._inst.dispose();this._inst=null}
  const paleta=XTERM_TEMAS[this._tema()];
  const t=new Terminal({theme:paleta,
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
 /** Actualiza la paleta de xterm cuando el usuario cambia el tema */
 actualizarTema(){
  if(!this._inst)return;
  const paleta=XTERM_TEMAS[this._tema()];
  this._inst.options.theme=paleta;
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
  const esClaro=this._tema()==='claro';
  const col=esClaro?'\x1b[32m':'\x1b[32m';  // verde ANSI — contrasta en ambos temas
  this._inst.writeln(`${col}╭─ Bitlab-IT Terminal ─────────────────────────────╮\x1b[0m`);
  this._inst.writeln(`${col}│\x1b[0m  Equipo : \x1b[1m${d.nombre}\x1b[0m`);
  this._inst.writeln(`${col}│\x1b[0m  SO     : ${d.sistema} ${d.version_so||''}`);
  this._inst.writeln(`${col}│\x1b[0m  IP     : ${d.ip_local||'—'}`);
  this._inst.writeln(`${col}╰──────────────────────────────────────────────────╯\x1b[0m`);
  this._inst.writeln('');
 }
};
window.Term = Term;

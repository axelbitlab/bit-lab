/* =====================================================================
   NÚCLEO · Selección de equipos, sesiones de terminal y helpers
   ===================================================================== */

/* ---------- helpers de búsqueda ---------- */
const uid=p=>(p||'')+(Date.now().toString(36))+Math.random().toString(36).slice(2,6);
const catById=id=>S.categorias.find(c=>String(c.id)===String(id))||{nombre:'Sin categoría',col:'var(--tx2)',ic:'grid'};
const cmdById=id=>S.comandos.find(c=>String(c.id)===String(id))||null;
const compat=(cmd,d)=>{
 if(!cmd||!d)return false;
 const cs=cmd.sistema||cmd.so||'todos';
 return cs==='todos'||cs===d.sistema;
};
const catIco=(cat,s=18)=>{
 const c=typeof cat==='object'?cat:catById(cat);
 return `<span class="cico" style="--c:${c.col||'var(--tx2)'}">${ico(c.ic||'grid',s)}</span>`;
};
const prompt=(d,int)=>{
 if(!d)return '>';
 const i=int||inter(d);
 return `${d.nombre}:${(INT[i]||{g:'>'}).g}`;
};
const lineaHTML=l=>{
 if(l.f==='i') return `<div class="ln i"><span>${esc(l.p||'>')}</span> ${esc(l.t)}</div>`;
 return `<div class="ln ${l.f||'o'}">${esc(l.t)||'&nbsp;'}</div>`;
};
const flagAdm='<span class="flag" style="color:var(--ambar);background:rgba(255,200,87,.1);border:1px solid rgba(255,200,87,.2)">'+ico('shield',11)+' Admin</span>';
const flagDes='<span class="flag pel" style="font-size:11px">'+ico('alert',11)+' Destructivo</span>';
const bajar=el=>{if(el)el.scrollTop=el.scrollHeight};
const cercaFondo=el=>el?el.scrollHeight-el.scrollTop-el.clientHeight<60:true;

/* ---------- Sel: servicio de selección reutilizable ---------- */
const Sel={
 ids:new Set(),multi:false,interprete:'auto',punto:{x:200,y:200},
 get lista(){return [...this.ids].map(dev).filter(Boolean)},
 _fin(punto){if(punto)this.punto=punto;Bus.emit('sel')},
 fijar(ids,p){this.ids=new Set(ids);this._fin(p)},
 alternar(id,p){this.ids.has(id)?this.ids.delete(id):this.ids.add(id);this._fin(p)},
 unir(ids,p){ids.forEach(i=>this.ids.add(i));this._fin(p)},
 limpiar(){this.ids.clear();this.interprete='auto';this._fin()},
 porEtiqueta(t,p){this.fijar(S.dispositivos.filter(d=>(d.etiquetas||[]).includes(t)).map(d=>d.id),p)},
 porSede(s,p){this.fijar(S.dispositivos.filter(d=>(d.sede||'General')===s).map(d=>d.id),p)},
 enLinea(p){this.fijar(S.dispositivos.filter(d=>d.en_linea).map(d=>d.id),p)}
};

/* ---------- Sesion: gestión de sesiones de terminal ---------- */
const Sesion={
 abrir(dispId,int){
  let s=S.sesiones.find(x=>x.dispId===dispId);
  if(!s){
   const d=dev(dispId);
   if(!d) return null;
   const defInt=d.sistema&&SO[d.sistema]?SO[d.sistema].def:'powershell';
   const pref=Sel.interprete!=='auto'&&(d.ints||[]).includes(Sel.interprete)?Sel.interprete:
    ((d.ints||[]).includes(defInt)?defInt:(d.ints||['powershell'])[0]);
   s={id:uid('s'),dispId,int:int||pref,lineas:[],ejId:null,hist:[],hi:-1,guardable:null};
   s.lineas.push(
    {f:'s',t:`agente:saludo · v${d.version_agente||'—'} · ${(SO[d.sistema]||{n:d.sistema}).n} · intérpretes: ${(d.ints||[]).join(', ')}`},
    {f:'s',t:d.en_linea?'Sesión lista.':'Agente fuera de línea.'}
   );
   S.sesiones.push(s);
  }
  S.sesionActiva=s.id; S.ultimoDisp=dispId; S.dispActivo=dispId; guardar('disp',dispId);
  return s;
 },
 cerrar(id){
  const i=S.sesiones.findIndex(s=>s.id===id); if(i<0)return;
  S.sesiones.splice(i,1);
  if(S.sesionActiva===id) S.sesionActiva=S.sesiones[Math.max(0,i-1)]?.id||null;
  if(S.sesiones.length){
   const act=this.actual();
   if(act){S.dispActivo=act.dispId;guardar('disp',act.dispId)}
  }
 },
 actual(){return S.sesiones.find(s=>s.id===S.sesionActiva)||null}
};

/* ---------- Sync: sincronizar checkboxes con Sel ---------- */
function Sync(){
 $$('[data-dev]').forEach(el=>{
  const s=Sel.ids.has(el.dataset.dev);
  el.classList.toggle('sel',s);
  const c=el.querySelector('input[type=checkbox]');
  if(c)c.checked=s;
 });
}

/* ─── acciones de selección compartidas ─── */
const modSel=e=>e.shiftKey||e.metaKey||e.ctrlKey||Sel.multi;
const pt=e=>({x:e.clientX,y:e.clientY});
Acc.selNodo=(el,e)=>{const id=el.dataset.dev||el.dataset.id,p=pt(e);if(modSel(e))Sel.alternar(id,p);else if(Sel.ids.size===1&&Sel.ids.has(id))Sel.limpiar();else Sel.fijar([id],p)};
Acc.selChk=(el,e)=>{e.stopPropagation();Sel.alternar(el.dataset.id,pt(e))};
Acc.selEnLinea=(el,e)=>Sel.enLinea(pt(e));
Acc.selTag=(el,e)=>Sel.porEtiqueta(el.dataset.v,pt(e));
Acc.selLimpiar=()=>Sel.limpiar();

/* ─── Sel → re-sync vistas ─── */
Bus.on('sel',()=>{
 Sync();
 Nav.sub&&Nav.sub();
 Dock.marcar&&Dock.marcar();
 // Abrir mini menú si hay selección individual (solo desde fuera de Terminal)
 if(Sel.ids.size>0 && typeof MiniMenu!=='undefined' && MiniMenu.abrir){
  const lista=Sel.lista;
  // No abrir mini-menú automáticamente si estamos en la vista terminal
  // (tAbrirSesion ya maneja la apertura de sesión directamente)
  if(lista.length===1 && S.vista!=='terminal'){
   MiniMenu.abrir(lista[0].id, Sel.punto.x, Sel.punto.y);
  }
 }
});

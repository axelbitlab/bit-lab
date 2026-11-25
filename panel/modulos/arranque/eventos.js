/* =====================================================================
   ARRANQUE · Delegación global de eventos
   ===================================================================== */
document.addEventListener('click',e=>{
 if(typeof Fab!=='undefined' && Fab.abierto && !e.target.closest('#fabPanel') && !e.target.closest('#fab')) Fab.cerrar();
 const el=e.target.closest('[data-acc]'); if(!el)return;
 const f=Acc[el.dataset.acc]; if(f)f(el,e);
});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'){
  if($('#m-cuenta') && !$('#m-cuenta').hidden){Cuenta.cerrar()}
  else if(typeof MiniMenu!=='undefined' && MiniMenu._el && !MiniMenu._el.hidden){MiniMenu.cerrar()}
  else if($('#modal') && !$('#modal').hidden){Modal.cerrar()}
  else if(typeof Fab!=='undefined'){Fab.cerrar()}
 }
});
document.addEventListener('change',e=>{
 const el=e.target.closest('[data-chg]');
 if(el && Chg[el.dataset.chg])Chg[el.dataset.chg](el,e);
});
document.addEventListener('input',e=>{
 const el=e.target.closest('[data-inp]');
 if(el && Inp[el.dataset.inp])Inp[el.dataset.inp](el,e);
});
let _rafPointer=false;
document.addEventListener('pointermove',e=>{
 if(_rafPointer)return;
 _rafPointer=true;
 requestAnimationFrame(()=>{
  _rafPointer=false;
  const v=e.target.closest&&e.target.closest('.vid');
  if(v){
   const r=v.getBoundingClientRect();
   v.style.setProperty('--mx',(e.clientX-r.left)+'px');
   v.style.setProperty('--my',(e.clientY-r.top)+'px');
  }
 });
},{passive:true});
addEventListener('resize',()=>{ if(typeof Dock!=='undefined')Dock.marcar() });

/* =====================================================================
   CUENTA · Tema claro / oscuro (persistente en localStorage)
   ===================================================================== */
const Tema={
 clave:'btl.tema',
 actual(){ try{return localStorage.getItem(this.clave)||'oscuro'}catch(_){return 'oscuro'} },
 aplicar(t){
  document.documentElement.setAttribute('data-tema',t==='claro'?'claro':'oscuro');
  try{localStorage.setItem(this.clave,t)}catch(_){}
  const oA=$('#mc-t-oscuro'),cA=$('#mc-t-claro');
  if(oA&&cA){
   oA.classList.toggle('act',t==='oscuro');
   cA.classList.toggle('act',t==='claro');
  }
  // Actualizar paleta de xterm si está montado
  if(typeof Term!=='undefined'&&Term.actualizarTema) Term.actualizarTema();
  if(typeof Vistas!=='undefined'&&Vistas.masiva&&Vistas.masiva.actualizarTema) Vistas.masiva.actualizarTema();
  if(typeof Bus!=='undefined'&&Bus.emit) Bus.emit('tema:cambiado', t);
 },
 iniciar(){ this.aplicar(this.actual()) }
};
window.Tema = Tema;

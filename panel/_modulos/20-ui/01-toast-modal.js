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
const pintaNotif=()=>{const b=$('#btnNotif');if(!b)return;b.innerHTML=ico(S.silenciado?'bellOff':'bell',16);b.setAttribute('aria-pressed',S.silenciado)};

Acc.mCerrar=()=>Modal.cerrar();


/* =====================================================================
   Motor de ejecución
   ===================================================================== */

const Motor={
 async lanzar(texto=null,cmdId=null,confirmar=false){
  const d=dev(S.dispActivo);
  if(!d){Toast.mostrar('Selecciona un equipo primero','aviso');return}
  if(!d.en_linea){Toast.mostrar('El equipo está fuera de línea','aviso');return}
  if(!texto&&!cmdId){Toast.mostrar('Escribe un comando','aviso');return}
  try{
   const id=await Datos.ejecutar({dispositivo:d.id,comando:cmdId,texto,confirmar});
   S.ejActiva={id,estado:'en_cola',codigo_salida:null};
   Term.limpiar();
   if(texto)Term.escr(`\x1b[36m$ ${texto}\x1b[0m\r\n`);
   const aviso=$('#t-aviso'); if(aviso)aviso.innerHTML=Vistas.terminal.estado();
   const btn=$('[data-acc=tCancelar]'); if(btn)btn.disabled=false;
   const inp=$('#t-input'); if(inp){inp.value='';S._cmdPendiente=''}
   Vistas.terminal.hist();
  }catch(e){
   if(e.message?.includes('destructivo')||e.message?.includes('confirmacion')){
    Modal.abrir({aria:'Confirmar ejecución',ancho:420,titulo:'Acción destructiva',
     html:`<p style="line-height:1.6">Este comando está marcado como <b style="color:var(--pel)">destructivo</b>.<br>
      ¿Deseas continuar?</p>`,
     pie:`<button class="btn" data-acc="mCerrar">Cancelar</button>
      <button class="btn pel" data-acc="tConfirmar" data-txt="${esc(texto||'')}" data-id="${cmdId||''}">Ejecutar de todas formas</button>`});
   }else{
    Toast.mostrar('Error al lanzar comando','err',e.message);
   }
  }
 },
 async avance(ej){
  if(!ej||FIN.includes(ej.estado))return;
  const datos=await Datos.ejecucion(ej.id);
  if(!datos)return;
  S.ejActiva={...ej,...datos};
  const aviso=$('#t-aviso'); if(aviso)aviso.innerHTML=Vistas.terminal.estado();
 },
 reconciliar(){
  if(!S.ejActiva||FIN.includes(S.ejActiva.estado))return;
  this.avance(S.ejActiva);
 }
};

setInterval(()=>{if(S.perfil&&S.ejActiva)Motor.reconciliar()},8000);

Acc.tEnviar=()=>Motor.lanzar(S._cmdPendiente?.trim()||$('#t-input')?.value?.trim());
Acc.tCmd2=el=>{
 const c=S.comandos.find(x=>x.id===parseInt(el.dataset.id)); if(!c)return;
 if(c.destructivo){
  Modal.abrir({aria:'Confirmar ejecución',ancho:420,titulo:'Acción destructiva',
   html:`<p style="line-height:1.6">El comando <b>${esc(c.nombre)}</b> está marcado como <b style="color:var(--pel)">destructivo</b>.<br>¿Continuar?</p>`,
   pie:`<button class="btn" data-acc="mCerrar">Cancelar</button>
    <button class="btn pel" data-acc="tConfirmar" data-id="${c.id}">Ejecutar de todas formas</button>`});
 }else{
  Motor.lanzar(null,c.id);
 }
};
Acc.tConfirmar=el=>Motor.lanzar(el.dataset.txt||null,el.dataset.id?parseInt(el.dataset.id):null,true);
Acc.tCancelar=async()=>{
 if(!S.ejActiva)return;
 try{await Datos.cancelar(S.ejActiva.id);Toast.mostrar('Cancelando…','aviso')}
 catch(e){Toast.mostrar('Error al cancelar','err',e.message)}
};
Acc.tLimpiar=()=>Term.limpiar();

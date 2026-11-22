/* =====================================================================
   TERMINAL · Motor de ejecución
   ===================================================================== */
const Motor={
 async lanzar(texto=null,cmdId=null,confirmar=false){
  const d=dev(S.dispActivo);
  if(!d){Toast.mostrar('Selecciona un equipo primero','aviso');return}
  if(!d.en_linea){Toast.mostrar('El equipo está fuera de línea','aviso');return}
  if(!texto&&!cmdId){Toast.mostrar('Escribe un comando','aviso');return}
  try{
   // BTL-200: si el comando tiene variantes, resolver el script correcto para este SO
   const cmdObj=cmdId?S.comandos.find(x=>x.id===cmdId):null;
   let textoFinal=texto;
   let cmdIdFinal=cmdId;
   if(cmdObj && typeof esMultiPlataforma==='function' && esMultiPlataforma(cmdObj)){
    const scriptVariante=resolverScript(cmdObj,d);
    if(scriptVariante){
     textoFinal=scriptVariante; // script ad-hoc para este SO
     cmdIdFinal=cmdId;          // referencia al comando en historial
    }
   }
   const id=await Datos.ejecutar({dispositivo:d.id,comando:cmdIdFinal,texto:textoFinal,confirmar});
   S.ejActiva={id,estado:'en_cola',codigo_salida:null};
   Term.limpiar();
   if(cmdObj){
    const scriptMostrar=(typeof resolverScript==='function'?resolverScript(cmdObj,d):null)||cmdObj.script||'';
    const badgeSO=(typeof esMultiPlataforma==='function'&&esMultiPlataforma(cmdObj))?' \x1b[35m[multi-SO → '+(d.sistema||'?')+']\x1b[0m':'';
    Term.escr('\x1b[36m$ [Catálogo: '+cmdObj.nombre+']'+badgeSO+'\x1b[0m\r\n\x1b[90m'+scriptMostrar+'\x1b[0m\r\n');
   }else if(textoFinal){
    Term.escr(`\x1b[36m$ ${texto}\x1b[0m\r\n`);
   }
   Term.escr(`\x1b[33m⏳ Despachado al equipo (esperando respuesta del agente)...\x1b[0m\r\n`);
   const aviso=$('#t-aviso'); if(aviso)aviso.innerHTML=VistaTerminal.estado();
   const btn=$('[data-acc=tCancelar]'); if(btn)btn.disabled=false;
   const inp=$('#t-input'); if(inp){inp.value='';S._cmdPendiente=''}
   VistaTerminal.hist();
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
  const aviso=$('#t-aviso'); if(aviso)aviso.innerHTML=VistaTerminal.estado();
 },
 reconciliar(){
  if(!S.ejActiva||FIN.includes(S.ejActiva.estado))return;
  this.avance(S.ejActiva);
 }
};

setInterval(()=>{if(S.perfil&&S.ejActiva)Motor.reconciliar()},8000);

Acc.tEnviar=()=>{
 const val=$('#t-input')?.value?.trim();
 const txt=S._cmdPendiente?.trim()||val;
 if(!txt){Toast.mostrar('Escribe un comando primero','aviso');return}
 Motor.lanzar(txt);
};
Acc.tCmd2=el=>{
 const id=el.dataset.id;
 const c=cmdById(id); if(!c)return;
 if(c.destructivo){
  Modal.abrir({aria:'Confirmar ejecución',ancho:420,titulo:'Acción destructiva',
   html:`<p style="line-height:1.6">El comando <b>${esc(c.nombre)}</b> está marcado como <b style="color:var(--pel)">destructivo</b>.<br>¿Continuar?</p>`,
   pie:`<button class="btn" data-acc="mCerrar">Cancelar</button>
    <button class="btn pel" data-acc="tConfirmar" data-id="${c.id}" data-txt="${esc(c.script||'')}">Ejecutar de todas formas</button>`});
 }else{
  Motor.lanzar(c.script||null,c.id);
 }
};
Acc.tConfirmar=el=>Motor.lanzar(el.dataset.txt||null,el.dataset.id?parseInt(el.dataset.id):null,true);
Acc.tCancelar=async()=>{
 if(!S.ejActiva)return;
 try{
  Term.escr('\r\n\x1b[33m[CANCELANDO POR EL USUARIO...]\x1b[0m\r\n');
  await Datos.cancelar(S.ejActiva.id);
  Toast.mostrar('Cancelando…','aviso');
 }catch(e){Toast.mostrar('Error al cancelar','err',e.message)}
};
Acc.tLimpiar=()=>Term.limpiar();

// Lanzar un comando desde el mini menú contextual sobre un equipo específico
Acc.miniLanzar=el=>{
 const id=el.dataset.id;
 const eqId=el.dataset.eq;
 const c=typeof cmdById==='function'?cmdById(id):S.comandos.find(x=>String(x.id)===String(id)); if(!c)return;
 const d=dev(eqId); if(!d)return;
 if(!d.en_linea){Toast.mostrar(d.nombre+' está fuera de línea','aviso');return}
 S.dispActivo=d.id; guardar('disp',d.id);
 Sesion.abrir(d.id);
 if(typeof MiniMenu!=='undefined')MiniMenu.cerrar();
 Nav.ir('terminal');
 // Pequeño delay para que la vista se monte antes de lanzar
 setTimeout(()=>{
  if(c.destructivo){
   Modal.abrir({aria:'Confirmar ejecución',ancho:420,titulo:'Acción destructiva',
    html:`<p style="line-height:1.6">El comando <b>${esc(c.nombre)}</b> está marcado como <b style="color:var(--pel)">destructivo</b>.<br>¿Continuar?</p>`,
    pie:`<button class="btn" data-acc="mCerrar">Cancelar</button>
     <button class="btn pel" data-acc="tConfirmar" data-id="${c.id}" data-txt="${esc(c.script||'')}">Ejecutar de todas formas</button>`});
  }else{
   Motor.lanzar(c.script||null,c.id);
  }
 },180);
};

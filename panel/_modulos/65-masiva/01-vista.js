/* =====================================================================
   MASIVA · Vista de ejecución en múltiples equipos con mosaico
   ===================================================================== */
const VistaMasiva={
 titulo:'Masiva',
 sub(){return VistaMasiva._lote?`Lote activo — ${VistaMasiva._lote.ok+VistaMasiva._lote.fail}/${VistaMasiva._lote.total}`:'Ejecución en varios equipos'},
 llena:true,
 _seleccion:[],
 _lote:null,
 _terms:{},

 render(){
  const enLinea=S.dispositivos.filter(d=>d.en_linea);
  return `<div class="mas-wrap">
   <div class="mcab">
    <div class="mcab-iz">
     <h3>Ejecución masiva</h3>
     <span class="mcount">${this._seleccion.length} equipos seleccionados</span>
    </div>
    <div class="mcab-der">
     ${this._lote?`
      <span class="mprog">
       ${pill('exitoso')} <b>${this._lote.ok||0}</b>
       ${pill('fallido')} <b>${this._lote.fail||0}</b>
       ${pill('ejecutando')} <b>${this._lote.run||0}</b>
       ${pill('en_cola')} <b>${this._lote.queue||0}</b>
      </span>
      <button class="btn pel" data-acc="masCancelar">${ico('stop',14)} Cancelar todo</button>
      <button class="btn" data-acc="masReintentar">${ico('retry',14)} Reintentar fallidos</button>
     `:''}
     <button class="btn" data-acc="masDescargar">${ico('download',14)} Descargar</button>
    </div>
   </div>
   <div class="mas-body">
    <div class="mas-sel" id="mas-sel">
     <div class="tools" style="margin-bottom:8px">
      <div class="grow"><span class="ico">${ico('search',14)}</span>
       <input data-inp="masQ" placeholder="Filtrar equipos…" autocomplete="off"></div>
     </div>
     <div class="mas-lista" id="mas-lista">
      ${enLinea.map(d=>{
       const sel=this._seleccion.includes(d.id);
       return `<label class="mas-eq${sel?' sel':''}">
        <input type="checkbox" data-chg="masCheck" data-id="${d.id}" ${sel?'checked':''}>
        <span class="ico">${soB(d.sistema)}</span>
        <span class="nm">${esc(d.nombre)}</span>
        <small>${esc(d.ip_local||'')}</small>
       </label>`;
      }).join('')}
     </div>
     <div style="padding:10px">
      <button class="btn w100" data-acc="masTodos">Seleccionar todos</button>
     </div>
     <div class="mas-cmd">
      <h4>Comando</h4>
      <select data-chg="masComando" id="mas-cmd-sel" style="width:100%;margin-bottom:8px">
       ${VistaMasiva._opcionesComandos(this._seleccion)}
      </select>
      <div style="margin-bottom:8px">
       <textarea data-inp="masTexto" id="mas-texto" placeholder="…o escribe un comando manual" rows="3" style="width:100%;resize:vertical;font:13px var(--f-mono);background:var(--neg);color:var(--txt);border:1px solid var(--borde);border-radius:10px;padding:10px"></textarea>
      </div>
      <button class="btn verde w100" data-acc="masLanzar" id="mas-lanzar">${ico('send',14)} Lanzar en ${this._seleccion.length} equipos</button>
     </div>
    </div>
    <div class="mosaico" id="mosaico">
     ${this._renderTiles()}
    </div>
   </div>
  </div>`;
 },

 // Devuelve las <option> del catálogo filtradas según los SO de los equipos seleccionados.
 // Si hay mezcla de SO → solo muestra comandos con variantes (⚡ Multi-SO).
 // Si hay un solo SO → muestra comandos de ese SO + comandos Multi-SO.
 // Si no hay selección → muestra todos.
 _opcionesComandos(seleccion){
  const sos=new Set();
  (seleccion||[]).forEach(id=>{
   const d=dev(id);
   if(d?.sistema)sos.add((d.sistema||'').toLowerCase());
  });
  let comandosFiltrados;
  if(sos.size===0){
   // Sin selección: mostrar todos
   comandosFiltrados=S.comandos;
  } else if(sos.size===1){
   // Un solo SO: multi-SO + comandos de ese SO + comandos "todos"
   const so=[...sos][0];
   comandosFiltrados=S.comandos.filter(c=>{
    if(typeof esMultiPlataforma==='function'&&esMultiPlataforma(c))return true;
    const cs=(c.sistema||'').toLowerCase();
    return cs==='todos'||cs===so||cs==='';
   });
  } else {
   // Mezcla de SO: solo comandos Multi-SO (tienen script para cada SO)
   comandosFiltrados=S.comandos.filter(c=>typeof esMultiPlataforma==='function'&&esMultiPlataforma(c));
  }
  // Eliminar duplicados por id (por si hay registros repetidos en BD)
  const vistos=new Set();
  const unicos=comandosFiltrados.filter(c=>{
   if(vistos.has(c.id))return false;
   vistos.add(c.id);return true;
  });
  const hayMezcla=sos.size>1;
  const label=hayMezcla
   ?'— Solo comandos Multi-SO (selección mixta) —'
   :'— Seleccionar del catálogo —';
  return `<option value="">${label}</option>`+
   unicos.map(c=>{
    const multi=typeof esMultiPlataforma==='function'&&esMultiPlataforma(c);
    const badge=multi?' (Multi-SO)':'';
    return `<option value="${c.id}">${esc(c.nombre)}${badge}</option>`;
   }).join('');
 },

 // Actualiza el <select> de comandos sin re-renderizar toda la vista
 _actualizarSelect(){
  const sel=$('#mas-cmd-sel');
  if(!sel)return;
  const anterior=sel.value;
  sel.innerHTML=VistaMasiva._opcionesComandos(VistaMasiva._seleccion);
  // Intentar mantener la selección anterior si sigue disponible
  if(anterior&&[...sel.options].some(o=>o.value===anterior))sel.value=anterior;
 },

 _renderTiles(){
  if(!this._lote||!this._lote.ejecuciones) return '<div class="vacio" style="padding:40px;grid-column:1/-1">Selecciona equipos y lanza un comando para ver el mosaico.</div>';
  return this._lote.ejecuciones.map((ej,idx)=>{
   const d=dev(ej.dispositivo_id);
   const tileKey=ej.id || `err-${idx}-${ej.dispositivo_id}`;
   return `<div class="tile" data-ej="${tileKey}">
    <div class="tile-cab">
     <span>${soB(d?.sistema)} <b>${esc(d?.apodo||d?.nombre||'—')}</b></span>
     ${pill(ej.estado)}
    </div>
    <div class="tile-term" id="tile-t-${tileKey}">
     ${ej.error ? `<div style="padding:16px;color:#ff4d6d;font-family:var(--f-mono);font-size:12px;line-height:1.6"><b style="color:#fff">No se pudo despachar:</b><br>${esc(ej.error)}</div>` : ''}
    </div>
   </div>`;
  }).join('');
 },

 _tema(){
  return document.documentElement.getAttribute('data-tema')==='claro'?'claro':'oscuro';
 },
 _paleta(){
  if(this._tema()==='claro'){
   return {
    background:'#ffffff',
    foreground:'#0f172a',
    cursor:'#2563eb',
    selectionBackground:'rgba(37,99,235,.20)',
    black:'#0f172a',
    red:'#dc2626',
    green:'#16a34a',
    yellow:'#d97706',
    blue:'#2563eb',
    magenta:'#7c3aed',
    cyan:'#0891b2',
    white:'#f8fafc',
    brightBlack:'#64748b',
    brightRed:'#ef4444',
    brightGreen:'#22c55e',
    brightYellow:'#f59e0b',
    brightBlue:'#3b82f6',
    brightMagenta:'#8b5cf6',
    brightCyan:'#06b6d4',
    brightWhite:'#0f172a'
   };
  }
  return {
   background:'#07070b',
   foreground:'#e2e8f0',
   cursor:'#39ff88',
   selectionBackground:'rgba(57,255,136,.22)',
   black:'#1e1e2e',
   red:'#ff5470',
   green:'#39ff88',
   yellow:'#ffb703',
   blue:'#3b82f6',
   magenta:'#c084fc',
   cyan:'#22d3ee',
   white:'#e2e8f0',
   brightBlack:'#64748b',
   brightRed:'#ff5470',
   brightGreen:'#39ff88',
   brightYellow:'#ffb703',
   brightBlue:'#60a5fa',
   brightMagenta:'#d8b4fe',
   brightCyan:'#67e8f9',
   brightWhite:'#f1f5f9'
  };
 },

 montar(){
  if(this._lote && this._lote.ejecuciones){
   const paleta=this._paleta();
   this._lote.ejecuciones.forEach(ej=>{
    if(!ej.id)return;
    const host=$(`#tile-t-${ej.id}`);
    if(!host)return;
    const t=new Terminal({theme:paleta,
     fontFamily:'JetBrains Mono, monospace',fontSize:11,lineHeight:1.3,
     cursorBlink:false,scrollback:1000,convertEol:true,allowTransparency:true});
    if(window.FitAddon){const f=new FitAddon.FitAddon();t.loadAddon(f);
     t.open(host);try{f.fit()}catch(_){}
     this._terms[ej.id]={term:t,fit:f};
    }else{t.open(host);this._terms[ej.id]={term:t}}
   });
   this._suscribir();
  }
 },

 actualizarTema(){
  const p=this._paleta();
  Object.values(this._terms||{}).forEach(item=>{
   if(item?.term?.options) item.term.options.theme=p;
  });
 },

 salir(){
  Object.values(this._terms).forEach(t=>t.term?.dispose());
  this._terms={};
 },

 _suscribir(){
  if(!this._lote)return;
  this._lote.ejecuciones.forEach(ej=>{
   if(!ej.id)return;
   const canal=sb.channel('masiva_'+ej.id);
   canal.on('postgres_changes',{event:'INSERT',schema:'public',table:'fragmentos_salida_comandos',filter:`ejecucion_id=eq.${ej.id}`},
    payload=>{
     const f=payload.new;
     const t=this._terms[ej.id];
     if(!t)return;
     if(f.flujo==='error_estandar')t.term.write('\x1b[31m'+f.texto+'\x1b[0m');
     else t.term.write(f.texto);
    }).subscribe();
  });
 },

 async _lanzarLote(){
  const cmdId=$('#mas-cmd-sel')?.value;
  const texto=$('#mas-texto')?.value?.trim();
  if(!cmdId&&!texto){Toast.mostrar('Selecciona un comando o escribe uno','aviso');return}
  if(!this._seleccion.length){Toast.mostrar('Selecciona al menos un equipo','aviso');return}

  const ejecuciones=[];
  const cmdObj=cmdId?S.comandos.find(x=>String(x.id)===String(cmdId)):null;
  for(const dId of this._seleccion){
   const dObj=dev(dId);
   try{
    if(!dObj) throw new Error('Equipo no encontrado');
    if(!dObj.en_linea) throw new Error('El equipo está fuera de línea');
    // BTL-200: resolver variante de script por SO del equipo destino
    let textoFinal=texto||null;
    let cmdIdFinal=cmdId?parseInt(cmdId):null;
    const esMulti=cmdObj && typeof esMultiPlataforma==='function' && esMultiPlataforma(cmdObj);
    if(esMulti){
     const variante=resolverScript(cmdObj,dObj);
     if(variante){
      textoFinal=variante;    // script específico para este SO
      cmdIdFinal=parseInt(cmdId); // mantener referencia al comando
     }
    }
    let id;
    try{
     id=await Datos.ejecutar({dispositivo:dId,comando:cmdIdFinal,texto:textoFinal});
    }catch(errRpc){
     // Si el backend rechaza c.sistema <> d.sistema (ej. comando con sistema='todos' o variantes)
     // reintentar directamente con el script resuelto de la variante
     if(/sistema de este equipo|sistema/i.test(errRpc.message||'') && textoFinal){
      id=await Datos.ejecutar({dispositivo:dId,comando:null,texto:textoFinal});
     }else{
      throw errRpc;
     }
    }
    ejecuciones.push({id,dispositivo_id:dId,estado:'en_cola'});
   }catch(e){
    ejecuciones.push({id:null,dispositivo_id:dId,estado:'fallido',error:e.message});
   }
  }
  this._lote={
   ejecuciones,
   total:ejecuciones.length,
   ok:0, fail:ejecuciones.filter(e=>e.estado==='fallido').length,
   run:0, queue:ejecuciones.filter(e=>e.estado==='en_cola').length
  };
  Nav.ir('masiva');
  this._pollLote();
 },

 async _pollLote(){
  if(!this._lote)return;
  const poll=async()=>{
   let ok=0,fail=0,run=0,queue=0;
   for(const ej of this._lote.ejecuciones){
    if(!ej.id)continue;
    if(FIN.includes(ej.estado))continue;
    const datos=await Datos.ejecucion(ej.id);
    if(datos)ej.estado=datos.estado;
   }
   this._lote.ejecuciones.forEach(e=>{
    const st=(e.estado||'').toLowerCase();
    if(st==='exitoso'||st==='exitosa'||st==='completado')ok++;
    else if(st==='fallido'||st==='fallida'||st==='tiempo_agotado')fail++;
    else if(st==='ejecutando')run++;
    else if(st==='en_cola'||st==='despachado'||st==='pendiente')queue++;
   });
   Object.assign(this._lote,{ok,fail,run,queue});
   // Update header counts
   const prog=$('.mprog');
   if(prog)prog.innerHTML=`${pill('exitoso')} <b>${ok}</b> ${pill('fallido')} <b>${fail}</b> ${pill('ejecutando')} <b>${run}</b> ${pill('en_cola')} <b>${queue}</b>`;
   // Update tile pills
   this._lote.ejecuciones.forEach(ej=>{
    const tile=$(`.tile[data-ej="${ej.id}"]`);
    if(tile){
     const cab=tile.querySelector('.tile-cab');
     const p=cab?.querySelector('.pill');
     if(p){
      const tmp=document.createElement('div');
      tmp.innerHTML=pill(ej.estado);
      if(tmp.firstElementChild)p.replaceWith(tmp.firstElementChild);
     }
    }
   });
   if(run>0||queue>0)setTimeout(poll,5000);
   else Toast.mostrar(`Lote finalizado: ${ok} exitosos, ${fail} fallidos`,'ok');
  };
  setTimeout(poll,3000);
 }
};

Inp.masQ=el=>{
 const q=el.value.toLowerCase();
 $$('#mas-lista .mas-eq').forEach(l=>{
  const nm=$('.nm',l)?.textContent?.toLowerCase()||'';
  l.hidden=q&&!nm.includes(q);
 });
};
Chg.masComando=el=>{
 const id=el.value;
 const txt=$('#mas-texto');
 if(!id||!txt){if(txt)txt.placeholder='…o escribe un comando manual';return}
 const c=S.comandos.find(x=>String(x.id)===String(id));
 if(!c)return;
 // Si es Multi-SO, mostrar el script del primer SO disponible como referencia
 let preview=c.script||'';
 if(typeof esMultiPlataforma==='function'&&esMultiPlataforma(c)&&c.variantes){
  const v=c.variantes;
  preview=v.windows||v.macos||v.linux||c.script||'';
 }
 txt.placeholder=preview||'Script del comando seleccionado';
 // No sobrescribir si ya escribió algo manualmente
 if(!txt.value.trim()) txt.value='';
};
Chg.masCheck=el=>{
 const id=el.dataset.id;
 if(el.checked){
  if(!VistaMasiva._seleccion.includes(id))VistaMasiva._seleccion.push(id);
 }else{
  VistaMasiva._seleccion=VistaMasiva._seleccion.filter(x=>x!==id);
 }
 el.closest('.mas-eq')?.classList.toggle('sel',el.checked);
 const btn=$('#mas-lanzar');
 if(btn)btn.innerHTML=`${ico('send',14)} Lanzar en ${VistaMasiva._seleccion.length} equipos`;
 const cnt=$('.mcount');
 if(cnt)cnt.textContent=`${VistaMasiva._seleccion.length} equipos seleccionados`;
 VistaMasiva._actualizarSelect();
};
Acc.masTodos=()=>{
 VistaMasiva._seleccion=S.dispositivos.filter(d=>d.en_linea).map(d=>d.id);
 $$('#mas-lista input[type=checkbox]').forEach(c=>{c.checked=true;c.closest('.mas-eq')?.classList.add('sel')});
 const btn=$('#mas-lanzar');
 if(btn)btn.innerHTML=`${ico('send',14)} Lanzar en ${VistaMasiva._seleccion.length} equipos`;
 const cnt=$('.mcount');
 if(cnt)cnt.textContent=`${VistaMasiva._seleccion.length} equipos seleccionados`;
 VistaMasiva._actualizarSelect();
};
Acc.masLanzar=()=>VistaMasiva._lanzarLote();
Acc.masCancelar=async()=>{
 if(!VistaMasiva._lote)return;
 for(const ej of VistaMasiva._lote.ejecuciones){
  if(ej.id&&!FIN.includes(ej.estado)){
   try{await Datos.cancelar(ej.id)}catch(_){}
  }
 }
 Toast.mostrar('Cancelando lote…','aviso');
};
Acc.masReintentar=async()=>{
 if(!VistaMasiva._lote)return;
 const fallidos=VistaMasiva._lote.ejecuciones.filter(e=>e.estado==='fallido'||e.estado==='tiempo_agotado');
 if(!fallidos.length){Toast.mostrar('No hay ejecuciones fallidas','aviso');return}
 const cmdId=$('#mas-cmd-sel')?.value;
 const texto=$('#mas-texto')?.value?.trim();
 for(const ej of fallidos){
  try{
   const id=await Datos.ejecutar({dispositivo:ej.dispositivo_id,comando:cmdId?parseInt(cmdId):null,texto:texto||null});
   ej.id=id; ej.estado='en_cola';
  }catch(_){}
 }
 Toast.mostrar(`Reintentando ${fallidos.length} ejecuciones`,'ok');
 VistaMasiva._pollLote();
};
Acc.masDescargar=async()=>{
 if(!VistaMasiva._lote||!VistaMasiva._lote.ejecuciones||!VistaMasiva._lote.ejecuciones.length){
  Toast.mostrar('No hay resultados para descargar','aviso'); return;
 }
 let txt='Bitlab-IT · Reporte de Ejecución Masiva\n'+'='.repeat(50)+'\n';
 txt+=`Fecha: ${new Date().toLocaleString('es-MX')}\n`;
 txt+=`Equipos: ${VistaMasiva._lote.total} · Exitosos: ${VistaMasiva._lote.ok} · Fallidos: ${VistaMasiva._lote.fail}\n\n`;
 for(const ej of VistaMasiva._lote.ejecuciones){
  const d=dev(ej.dispositivo_id);
  txt+='─'.repeat(40)+'\n';
  txt+=`Equipo: ${d?.nombre||ej.dispositivo_id} (${d?.sistema||'?'}) · Estado: ${ej.estado}\n`;
  if(ej.id){
   try{
    const frags=await Datos.salida(ej.id,0);
    if(frags&&frags.length) txt+=frags.map(f=>f.texto).join('');
   }catch(_){}
  }
  txt+='\n';
 }
 const blob=new Blob([txt],{type:'text/plain;charset=utf-8'});
 const url=URL.createObjectURL(blob);
 const a=document.createElement('a');
 a.href=url; a.download='bitlab-masiva-'+Date.now()+'.txt';
 document.body.appendChild(a); a.click();
 setTimeout(()=>{URL.revokeObjectURL(url);a.remove()},1000);
 Toast.mostrar('Descarga lista','ok');
};

Mod.registrarVista({
 id:'masiva', nombre:'Masiva', icono:'layers', orden:50,
 definicion:VistaMasiva
});

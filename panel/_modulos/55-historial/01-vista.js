/* =====================================================================
   HISTORIAL · Vista de ejecuciones con filtros y agrupación por lote
   ===================================================================== */
const VistaHistorial={
 titulo:'Historial',
 sub:()=>'Ejecuciones recientes',
 llena:false,
 _filtro:{estado:'',equipo:'',desde:'',hasta:''},
 _datos:[],
 _lotes:{},
 _abiertos:{},

 render(){
  return `<div class="hist-wrap">
   <div class="filtros">
    <label class="campo"><span>Estado</span>
     <select data-chg="histEstado">
      <option value="">Todos</option>
      <option value="exitoso">Exitoso</option>
      <option value="fallido">Fallido</option>
      <option value="ejecutando">Ejecutando</option>
      <option value="cancelado">Cancelado</option>
      <option value="tiempo_agotado">Tiempo agotado</option>
     </select>
    </label>
    <label class="campo"><span>Equipo</span>
     <select data-chg="histEquipo">
      <option value="">Todos</option>
      ${S.dispositivos.map(d=>`<option value="${d.id}"${this._filtro.equipo===d.id?' selected':''}>${esc(d.nombre)}</option>`).join('')}
     </select>
    </label>
    <label class="campo"><span>Desde</span>
     <input type="date" data-chg="histDesde" value="${this._filtro.desde}">
    </label>
    <label class="campo"><span>Hasta</span>
     <input type="date" data-chg="histHasta" value="${this._filtro.hasta}">
    </label>
   </div>
   <div class="tools" style="margin-bottom:10px">
    <div class="grow">
     <span class="ico">${ico('search',14)}</span>
     <input data-inp="histQ" placeholder="Buscar comando o equipo…" autocomplete="off">
    </div>
    <button class="btn" data-acc="histRefrescar">${ico('retry',14)} Actualizar</button>
   </div>
   <div class="tarj" style="overflow:hidden;padding:0">
    <div class="tab-scroll"><table class="t" id="hist-tabla">
     <thead><tr>
      <th style="width:34px"></th>
      <th>Fecha</th><th>Equipo</th><th>Comando</th>
      <th>Estado</th><th>Duración</th><th>Código</th><th>Acciones</th>
     </tr></thead>
     <tbody id="hist-body"></tbody>
    </table></div>
   </div>
   <div id="hist-vacio" class="vacio" hidden>Sin ejecuciones que coincidan con los filtros.</div>
  </div>`;
 },

 montar(){
  this._cargar();
 },

 async _cargar(){
  try{
   let q=sb.from('ejecuciones_comandos')
    .select('id,dispositivo_id,comando_id,lote_id,estado,texto_comando,interprete,codigo_salida,duracion_ms,mensaje_error,creado,iniciado,terminado,origen')
    .order('creado',{ascending:false}).limit(200);
   const f=this._filtro;
   if(f.estado)q=q.eq('estado',f.estado);
   if(f.equipo)q=q.eq('dispositivo_id',f.equipo);
   if(f.desde)q=q.gte('creado',f.desde+'T00:00:00');
   if(f.hasta)q=q.lte('creado',f.hasta+'T23:59:59');
   const {data,error}=await q;
   if(error){Toast.mostrar('Error al cargar historial','err',error.message);return}
   this._datos=data||[];
   this._renderTabla();
  }catch(e){
   Toast.mostrar('Error al cargar historial','err',e.message);
  }
 },

 _renderTabla(){
  const body=$('#hist-body');
  const vacio=$('#hist-vacio');
  if(!body)return;
  const q=(this._q||'').toLowerCase();
  let filas=this._datos;
  if(q){
   filas=filas.filter(e=>{
    const d=dev(e.dispositivo_id);
    const c=S.comandos.find(x=>x.id===e.comando_id);
    const txt=[d?.nombre,c?.nombre,e.texto_comando].filter(Boolean).join(' ').toLowerCase();
    return txt.includes(q);
   });
  }
  if(!filas.length){
   body.innerHTML='';
   if(vacio)vacio.hidden=false;
   return;
  }
  if(vacio)vacio.hidden=true;

  // Agrupar por lote
  const lotes={};
  const sueltas=[];
  filas.forEach(e=>{
   if(e.lote_id){
    if(!lotes[e.lote_id])lotes[e.lote_id]={items:[],estado:null};
    lotes[e.lote_id].items.push(e);
   }else sueltas.push(e);
  });

  let html='';
  const pintados=new Set();

  filas.forEach(e=>{
   if(pintados.has(e.id))return;
   if(e.lote_id && lotes[e.lote_id] && lotes[e.lote_id].items.length>1){
    const lote=lotes[e.lote_id];
    if(pintados.has('lote_'+e.lote_id))return;
    pintados.add('lote_'+e.lote_id);
    const abierto=this._abiertos[e.lote_id];
    const ok=lote.items.filter(x=>x.estado==='exitoso').length;
    const fail=lote.items.filter(x=>x.estado==='fallido'||x.estado==='tiempo_agotado').length;
    html+=`<tr class="grupo" data-acc="histLote" data-lote="${e.lote_id}">
     <td>${ico(abierto?'chev':'chev',14)}</td>
     <td>${this._fecha(lote.items[0].creado)}</td>
     <td><span class="flag">${lote.items.length} equipos</span></td>
     <td><b>Lote</b></td>
     <td><span class="fl">${pill('exitoso')} <small>${ok}</small> ${pill('fallido')} <small>${fail}</small></span></td>
     <td>—</td><td>—</td>
     <td><div class="acts">
      <button class="ib" title="Reintentar fallidos" data-acc="histReintentarLote" data-lote="${e.lote_id}">${ico('retry',14)}</button>
     </div></td>
    </tr>`;
    if(abierto){
     lote.items.forEach(h=>{
      pintados.add(h.id);
      html+=this._fila(h,true);
     });
    }
    lote.items.forEach(h=>pintados.add(h.id));
   }else{
    pintados.add(e.id);
    html+=this._fila(e,false);
   }
  });
  body.innerHTML=html;
 },

 _fila(e,hijo){
  const d=dev(e.dispositivo_id);
  const c=S.comandos.find(x=>x.id===e.comando_id);
  return `<tr class="fila${hijo?' hijo':''}" data-acc="histDetalle" data-id="${e.id}">
   <td></td>
   <td style="white-space:nowrap;font-size:12px">${this._fecha(e.creado)}</td>
   <td><div class="nm"><b>${esc(d?.nombre||'—')}</b><small>${esc(d?.ip_local||'')}</small></div></td>
   <td><div><span class="cmdn">${esc(c?.nombre||'Comando manual')}</span>
    <span class="cmdt">${esc(e.texto_comando||c?.script||'')}</span></div></td>
   <td>${pill(e.estado)}</td>
   <td style="font:12px var(--f-mono)">${durTxt(e.duracion_ms)}</td>
   <td style="font:12px var(--f-mono)">${e.codigo_salida!=null?e.codigo_salida:'—'}</td>
   <td><div class="acts">
    <button class="ib" title="Ver salida" data-acc="histSalida" data-id="${e.id}">${ico('expand',14)}</button>
    ${FIN.includes(e.estado)?`<button class="ib" title="Reintentar" data-acc="histReintentar" data-id="${e.id}">${ico('retry',14)}</button>`:''}
    ${!FIN.includes(e.estado)?`<button class="ib pel" title="Cancelar" data-acc="histCancelar" data-id="${e.id}">${ico('stop',14)}</button>`:''}
   </div></td>
  </tr>`;
 },

 _fecha(t){
  if(!t)return '—';
  const d=new Date(t);
  return d.toLocaleDateString('es-MX',{day:'2-digit',month:'short'})+' '+d.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
 },

 async verSalida(id){
  const frags=await Datos.salida(id,0);
  const ej=await Datos.ejecucion(id);
  const d=dev(ej?.dispositivo_id);
  const txt=frags.map(f=>{
   if(f.flujo==='error_estandar')return `<div class="ln e">${esc(f.texto)}</div>`;
   return `<div class="ln o">${esc(f.texto)}</div>`;
  }).join('')||'<div class="ln s">Sin salida registrada.</div>';
  Modal.abrir({aria:'Salida de ejecución',lado:true,ancho:640,titulo:'Salida · '+(d?.nombre||'Equipo'),
   html:`<div class="kv" style="margin-bottom:12px">
    <dt>Estado</dt><dd>${pill(ej?.estado||'—')}</dd>
    <dt>Duración</dt><dd>${durTxt(ej?.duracion_ms)}</dd>
    <dt>Código</dt><dd>${ej?.codigo_salida??'—'}</dd>
    ${ej?.mensaje_error?`<dt>Error</dt><dd style="color:var(--pel)">${esc(ej.mensaje_error)}</dd>`:''}
   </div>
   <div class="tcuerpo" style="max-height:50vh;border-radius:14px">${txt}</div>`,
   pie:`<button class="btn" data-acc="mCerrar">Cerrar</button>`
  });
 }
};

Inp.histQ=el=>{VistaHistorial._q=el.value;VistaHistorial._renderTabla()};
Chg.histEstado=el=>{VistaHistorial._filtro.estado=el.value;VistaHistorial._cargar()};
Chg.histEquipo=el=>{VistaHistorial._filtro.equipo=el.value;VistaHistorial._cargar()};
Chg.histDesde=el=>{VistaHistorial._filtro.desde=el.value;VistaHistorial._cargar()};
Chg.histHasta=el=>{VistaHistorial._filtro.hasta=el.value;VistaHistorial._cargar()};
Acc.histRefrescar=()=>VistaHistorial._cargar();
Acc.histLote=el=>{
 const id=el.closest('[data-lote]')?.dataset.lote;
 if(id){VistaHistorial._abiertos[id]=!VistaHistorial._abiertos[id];VistaHistorial._renderTabla()}
};
Acc.histDetalle=el=>{
 const id=el.closest('[data-id]')?.dataset.id;
 if(id)VistaHistorial.verSalida(parseInt(id));
};
Acc.histSalida=el=>VistaHistorial.verSalida(parseInt(el.dataset.id));
Acc.histReintentar=async el=>{
 const id=parseInt(el.dataset.id);
 const ej=await Datos.ejecucion(id);
 if(!ej)return;
 try{
  await Datos.ejecutar({dispositivo:ej.dispositivo_id,comando:ej.comando_id,texto:ej.texto_comando});
  Toast.mostrar('Reintentando ejecución','ok');
  VistaHistorial._cargar();
 }catch(e){Toast.mostrar('Error al reintentar','err',e.message)}
};
Acc.histCancelar=async el=>{
 const id=parseInt(el.dataset.id);
 try{await Datos.cancelar(id);Toast.mostrar('Cancelando…','aviso');VistaHistorial._cargar()}
 catch(e){Toast.mostrar('Error al cancelar','err',e.message)}
};

Mod.registrarVista({
 id:'historial', nombre:'Historial', icono:'history', orden:40,
 definicion:VistaHistorial
});

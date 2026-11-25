/* =====================================================================
   DATOS · Lectura y escritura contra Supabase
   ===================================================================== */
const Datos={
 async cargar(){ await Promise.all([this.equipos(),this.comandos()]) },

 async equipos(){
  let data, error;
  ({data,error}=await sb.from('dispositivos')
   .select('id,nombre,apodo,sistema,ip_local,usuario_so,version_so,arquitectura,version_agente,interpretes,metricas,ultimo_latido,ultimo_contacto,en_linea,activo')
   .eq('activo',true).order('en_linea',{ascending:false}).order('nombre'));
  if(error && /apodo/i.test(error.message||'')){
   ({data,error}=await sb.from('dispositivos')
    .select('id,nombre,sistema,ip_local,usuario_so,version_so,arquitectura,version_agente,interpretes,metricas,ultimo_latido,ultimo_contacto,en_linea,activo')
    .eq('activo',true).order('en_linea',{ascending:false}).order('nombre'));
  }
  if(error){Toast.mostrar('No se pudieron leer los equipos','err',error.message);return}
  const apodosLocales=leer('apodos_equipos',{})||{};
  const eliminados=(typeof leer==='function'?leer('btl_dispositivos_eliminados',[]):[])||[];
  S.dispositivos=(data||[])
   .filter(d=>!eliminados.includes(String(d.id)))
   .map(d=>{
    const norm=this.normaliza(d);
    if(!norm.apodo && apodosLocales[norm.id]) norm.apodo=apodosLocales[norm.id];
    return norm;
   });
  if(S.dispActivo&&(!dev(S.dispActivo)||eliminados.includes(String(S.dispActivo)))){
    S.dispActivo=null;
    if(typeof guardar==='function') guardar('disp',null);
  }
 },

 async eliminarDispositivo(id){
  const d=dev(id);
  const nombreDisp=d?.nombre||'Dispositivo';

  // 1. Guardar de inmediato en la lista negra persistente local (localStorage)
  const eliminados=(typeof leer==='function'?leer('btl_dispositivos_eliminados',[]):[])||[];
  if(!eliminados.includes(String(id))){
   eliminados.push(String(id));
   if(typeof guardar==='function') guardar('btl_dispositivos_eliminados', eliminados);
  }

  // 2. Limpiar memoria local y sesiones de terminal
  S.dispositivos=(S.dispositivos||[]).filter(x=>String(x.id)!==String(id));
  if(typeof Sel!=='undefined'&&Sel.ids) Sel.ids.delete(id);
  if(S.sesiones) S.sesiones=S.sesiones.filter(s=>String(s.dispId)!==String(id));
  if(String(S.dispActivo)===String(id)){
   S.dispActivo=null;
   if(typeof guardar==='function') guardar('disp',null);
  }
  if(String(S.ultimoDisp)===String(id)) S.ultimoDisp=null;

  // 3. Ejecutar revocación oficial en Supabase (marca activo=false, en_linea=false)
  try {
   await sb.rpc('revocar_dispositivo', { p_dispositivo: id, p_activo: false });
  } catch (_) {}

  // 4. Ejecutar RPC de eliminación definitiva completa en Supabase si existe
  try {
   await sb.rpc('admin_eliminar_dispositivo_completo', { p_dispositivo_id: id });
  } catch (_) {}

  // 5. Intentar actualización y borrado directo en tablas de Supabase
  try {
   await sb.from('dispositivos').update({ activo: false, en_linea: false }).eq('id', id);
  } catch (_) {}
  try {
   await sb.from('ejecuciones_comandos').delete().eq('dispositivo_id', id);
   await sb.from('credenciales_dispositivos').delete().eq('dispositivo_id', id);
   await sb.from('dispositivos').delete().eq('id', id);
  } catch (_) {}

  Bus.emit('equipos');
  return { ok: true, nombre: nombreDisp };
 },

 normaliza(d){
  const m=d.metricas||{};
  const discos=Array.isArray(m.discos)?m.discos:[];
  const pr=discos[0]||null;
  return {...d,
   ints:Array.isArray(d.interpretes)?d.interpretes:[],
   cpu:m.cpu_pct??null,
   ram:m.memoria_usada_pct??null,
   ramTot:m.memoria_total_mb?Math.round(m.memoria_total_mb/1024):null,
   disco:pr?{u:pr.unidad,tot:pr.total_gb,libre:pr.libre_gb,pct:pr.libre_pct}:null,
   discos, procesos:Array.isArray(m.procesos_top)?m.procesos_top:[],
   encendido:m.tiempo_encendido_seg??null,
   visto:d.ultimo_latido||d.ultimo_contacto};
 },

 async comandos(){
  // Categorías base por defecto si la base de datos está vacía
  const defaultCats=[
   {id:1,nombre:'Diagnóstico',color:'#8b5cf6',icono:'activity',orden:10},
   {id:2,nombre:'Red',color:'#06b6d4',icono:'wifi',orden:20},
   {id:3,nombre:'Servicios',color:'#3b82f6',icono:'cpu',orden:30},
   {id:4,nombre:'Mantenimiento',color:'#8b5cf6',icono:'wrench',orden:40},
   {id:5,nombre:'Seguridad',color:'#10b981',icono:'lock',orden:50},
   {id:6,nombre:'Disco',color:'#f59e0b',icono:'hdd',orden:60}
  ];
  let {data:cats}=await sb.from('categorias_comandos').select('id,nombre,color,icono,orden').order('orden').order('nombre');
  if(!cats || !cats.length){
   cats=leer('categorias_locales',defaultCats);
  }
  S.categorias=(cats||[]).map(c=>{
   let col=c.color;
   if((c.nombre||'').toLowerCase().includes('diagn') || c.id===1 || c.color==='#00f59b'){
    col='#8b5cf6';
   }
   return {...c,color:col||'#8b5cf6',icono:c.icono||'tag'};
  });
  // Intentar con variantes + tipos_alerta (array) y tipo_alerta (texto legacy).
  // Si alguna columna no existe, se hace fallback sin ella.
  let cmds, error;
  ({data:cmds,error}=await sb.from('comandos')
   .select('id,categoria_id,nombre,descripcion,sistema,script,interprete,variantes,destructivo,requiere_admin,timeout_seg,tipos_alerta,tipo_alerta,activo')
   .eq('activo',true).order('nombre'));
  if(error && /tipos_alerta|column/i.test(error.message||'')){
   ({data:cmds,error}=await sb.from('comandos')
    .select('id,categoria_id,nombre,descripcion,sistema,script,interprete,variantes,destructivo,requiere_admin,timeout_seg,tipo_alerta,activo')
    .eq('activo',true).order('nombre'));
  }
  if(error && /tipo_alerta|column/i.test(error.message||'')){
   ({data:cmds,error}=await sb.from('comandos')
    .select('id,categoria_id,nombre,descripcion,sistema,script,interprete,variantes,destructivo,requiere_admin,timeout_seg,activo')
    .eq('activo',true).order('nombre'));
  }
  if(error && /variantes|column/i.test(error.message||'')){
   // variantes aún no existe en BD — funciona sin ella (retrocompatible)
   ({data:cmds,error}=await sb.from('comandos')
    .select('id,categoria_id,nombre,descripcion,sistema,script,interprete,destructivo,requiere_admin,timeout_seg,activo')
    .eq('activo',true).order('nombre'));
  }
  if(error){
   console.warn('Error al leer comandos de Supabase:', error);
   const cache = leer('comandos_cache', []);
   if(cache && cache.length){
    S.comandos = cache;
    if(typeof Toast!=='undefined')Toast.mostrar('Catálogo en modo local (caché)','aviso',error.message);
   } else {
    S.comandos=[];
    if(typeof Toast!=='undefined')Toast.mostrar('No se pudo leer el catálogo','aviso',error.message);
   }
   Bus.emit('comandos:cargados', S.comandos);
   return;
  }
  // Normalizar: siempre dejar tipos_alerta como array, aún cuando sólo
  // venga la columna legacy tipo_alerta.
  const lista=(cmds||[]).map(c=>{
   const ta=alertasDe(c);
   return {...c, tipos_alerta:ta, tipo_alerta:ta[0]||null};
  });
  // Auto-agrupar comandos con el mismo nombre en distintos SO para crear Multi-SO
  S.comandos=typeof autoAgruparComandos==='function'?autoAgruparComandos(lista):lista;
  guardar('comandos_cache', S.comandos);
  Bus.emit('comandos:cargados', S.comandos);
 },

 /* ─── Recomendaciones por reglas ────────────────────────────────────
    Devuelve los comandos del catálogo relevantes para las métricas
    reales del equipo. Alertas activas primero, luego el resto.         */
 recomendados(d){
  if(!d)return [];
  const alertas=this._alertasActivas(d);
  const so=(d.sistema||'').toLowerCase();

  // Helper para detectar qué tipo de alertas cubre cada comando
  const detector=c=>{
   const tipos=new Set(alertasDe(c));
   const catNom=(S.categorias?.find(cat=>cat.id==c.categoria_id)?.nombre||'').toLowerCase();
   const texto=`${c.nombre||''} ${c.descripcion||''} ${c.script||''}`.toLowerCase();

   if(catNom.includes('disco') || /disco|disk|espacio|almacenamiento|df\s+-h|get-psdrive/i.test(texto)){
    tipos.add('disco');
   }
   if(catNom.includes('cpu') || /cpu|procesador|carga/i.test(texto)){
    tipos.add('cpu');
   }
   if(catNom.includes('memoria') || /memoria|ram|swap/i.test(texto)){
    tipos.add('memoria');
   }
   if(catNom.includes('red') || /red|ip|ping|ifconfig|ipconfig|puerto|dns/i.test(texto)){
    tipos.add('red');
   }
   if(catNom.includes('proceso') || /proceso|tasklist|ps\s+-|kill|top/i.test(texto)){
    tipos.add('proceso');
   }
   return [...tipos];
  };

  // Filtrar comandos compatibles con el SO del equipo (o todos/multiplataforma)
  const compatibles=S.comandos.filter(c=>{
   if(c.sistema==='todos'||c.sistema===so)return true;
   if(typeof esMultiPlataforma==='function'&&esMultiPlataforma(c))return true;
   return false;
  });

  // Puntuación por coincidencia con alertas activas
  const puntua=c=>{
   if(!alertas.length)return 0;
   const ta=detector(c);
   const coincidencias=ta.filter(t=>alertas.includes(t)).length;
   return coincidencias>0 ? (coincidencias*100) : 0;
  };

  const conPeso=compatibles.map(c=>({cmd:c, peso:puntua(c)}));

  // Si hay alertas activas, priorizar estrictamente los comandos de la alerta
  if(alertas.length>0){
   const recomendadosPorAlerta=conPeso.filter(x=>x.peso>0);
   recomendadosPorAlerta.sort((a,b)=>b.peso-a.peso);

   if(recomendadosPorAlerta.length>0){
    const restantes=conPeso.filter(x=>x.peso===0);
    return [...recomendadosPorAlerta.map(x=>x.cmd), ...restantes.map(x=>x.cmd)];
   }
  }

  // Sin alertas o si no hay coincidencia directa, ordenar por diagnóstico/relevancia
  conPeso.sort((a,b)=>{
   const esDiagA=(a.cmd.nombre||'').toLowerCase().includes('diagn') || a.cmd.categoria_id===1;
   const esDiagB=(b.cmd.nombre||'').toLowerCase().includes('diagn') || b.cmd.categoria_id===1;
   if(esDiagA && !esDiagB) return -1;
   if(!esDiagA && esDiagB) return 1;
   return (a.cmd.nombre||'').localeCompare(b.cmd.nombre||'');
  });

  return conPeso.map(x=>x.cmd);
 },

 _alertasActivas(d){
  const alertas=[];
  const m=d;
  if(m.cpu!=null && m.cpu>80) alertas.push('cpu');
  if(m.ram!=null && m.ram>85) alertas.push('memoria');
  
  // Alerta de disco real: cuando el espacio libre es menor al 50% (o 20%) o usado > 50%
  if(m.disco){
   const librePct=m.disco.pct!=null ? m.disco.pct : (m.disco.tot ? (m.disco.libre/m.disco.tot*100) : null);
   if(librePct!=null && librePct<50) alertas.push('disco');
  }
  if(Array.isArray(m.discos)){
   m.discos.forEach(dk=>{
    const lPct=dk.libre_pct!=null ? dk.libre_pct : null;
    if(lPct!=null && lPct<50 && !alertas.includes('disco'))
     alertas.push('disco');
   });
  }
  if(Array.isArray(m.procesos)&&m.procesos.some(p=>p.cpu>50))
   alertas.push('proceso');
  if(m.visto){
   const seg=(Date.now()-new Date(m.visto))/1000;
   if(seg>120) alertas.push('red');
  }
  return alertas;
 },

 async ejecutar({dispositivo,comando=null,texto=null,confirmar=false}){
  const {data,error}=await sb.rpc('crear_ejecucion',{
   p_dispositivo:dispositivo, p_comando:comando, p_texto:texto,
   p_simulacion:false, p_confirmar:confirmar});
  if(error)throw error;
  return data;
 },

 async cancelar(id){
  const {error}=await sb.rpc('cancelar_ejecucion',{p_ejecucion:id});
  if(error)throw error;
 },

 async ejecucion(id){
  const {data}=await sb.from('ejecuciones_comandos')
   .select('id,dispositivo_id,comando_id,estado,texto_comando,interprete,codigo_salida,duracion_ms,mensaje_error,creado,iniciado,terminado')
   .eq('id',id).maybeSingle();
  return data;
 },

 async salida(id,desde=0){
  const {data}=await sb.from('fragmentos_salida_comandos')
   .select('secuencia,flujo,texto').eq('ejecucion_id',id)
   .gt('secuencia',desde).order('secuencia').limit(4000);
  return data||[];
 },

 async crearComando(campos){
  const tipos = Array.isArray(campos.tipos_alerta) ? campos.tipos_alerta : [];
  const base = {
   p_nombre:campos.nombre, p_descripcion:campos.descripcion||'',
   p_categoria_id:campos.categoria_id, p_sistema:campos.sistema,
   p_script:campos.script, p_interprete:campos.interprete||'powershell',
   p_destructivo:!!campos.destructivo, p_requiere_admin:!!campos.requiere_admin,
   p_timeout_seg:campos.timeout_seg||60
  };
  // Intentar primero con tipos_alerta (array). Si el backend sólo
  // conoce la versión vieja (p_tipo_alerta), caer al primer elemento.
  let r = await sb.rpc('crear_comando', {...base, p_tipos_alerta: tipos});
  if(r.error && /tipos_alerta|p_tipos_alerta|does not exist|no matching|does not match/i.test(r.error.message||'')){
   r = await sb.rpc('crear_comando', {...base, p_tipo_alerta: tipos[0]||null});
  }
  if(r.error) throw r.error;
  await this.comandos();
  return r.data;
 },

 async actualizarComando(id,campos){
  const tipos = Array.isArray(campos.tipos_alerta) ? campos.tipos_alerta : [];
  const base = {
   p_id:id, p_nombre:campos.nombre, p_descripcion:campos.descripcion||'',
   p_categoria_id:campos.categoria_id, p_sistema:campos.sistema,
   p_script:campos.script, p_interprete:campos.interprete||'powershell',
   p_destructivo:!!campos.destructivo, p_requiere_admin:!!campos.requiere_admin,
   p_timeout_seg:campos.timeout_seg||60
  };
  let r = await sb.rpc('actualizar_comando', {...base, p_tipos_alerta: tipos});
  if(r.error && /tipos_alerta|p_tipos_alerta|does not exist|no matching|does not match/i.test(r.error.message||'')){
   r = await sb.rpc('actualizar_comando', {...base, p_tipo_alerta: tipos[0]||null});
  }
  if(r.error) throw r.error;
  await this.comandos();
 },

 async eliminarComando(id){
  const {error}=await sb.rpc('eliminar_comando',{p_id:id});
  if(error)throw error;
  await this.comandos();
 },

 async duplicarComando(id){
  const {data,error}=await sb.rpc('duplicar_comando',{p_id:id});
  if(error)throw error;
  await this.comandos();
  return data;
 }
};
window.Datos = Datos;

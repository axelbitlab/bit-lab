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
  S.dispositivos=(data||[]).map(d=>{
   const norm=this.normaliza(d);
   if(!norm.apodo && apodosLocales[norm.id]) norm.apodo=apodosLocales[norm.id];
   return norm;
  });
  if(S.dispActivo&&!dev(S.dispActivo))S.dispActivo=null;
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
   if(typeof Toast!=='undefined')Toast.mostrar('No se pudo leer el catálogo','aviso',error.message);
   S.comandos=[]; return;
  }
  // Normalizar: siempre dejar tipos_alerta como array, aún cuando sólo
  // venga la columna legacy tipo_alerta.
  S.comandos=(cmds||[]).map(c=>{
   const ta=alertasDe(c);
   return {...c, tipos_alerta:ta, tipo_alerta:ta[0]||null};
  });
  Bus.emit('comandos:cargados', S.comandos);
 },

 /* ─── Recomendaciones por reglas ────────────────────────────────────
    Devuelve los comandos del catálogo relevantes para las métricas
    reales del equipo. Alertas activas primero, luego el resto.         */
 recomendados(d){
  if(!d)return [];
  const alertas=this._alertasActivas(d);
  const compatibles=S.comandos.filter(c=>
   c.sistema===d.sistema || c.sistema==='todos');
  const puntua=c=>{
   const ta=alertasDe(c);
   if(!ta.length)return 0;
   // cuántas de sus categorías coinciden con alertas activas
   return ta.filter(t=>alertas.includes(t)).length;
  };
  const conPeso=compatibles.map(c=>[c,puntua(c)]);
  conPeso.sort((a,b)=>b[1]-a[1]);
  return conPeso.map(x=>x[0]);
 },

 _alertasActivas(d){
  const alertas=[];
  const m=d;
  if(m.cpu!=null && m.cpu>80) alertas.push('cpu');
  if(m.ram!=null && m.ram>85) alertas.push('memoria');
  if(m.disco){
   const usadoPct=m.disco.pct!=null?m.disco.pct:null;
   if(usadoPct!=null && usadoPct<20) alertas.push('disco');
  }
  if(Array.isArray(m.discos)){
   m.discos.forEach(dk=>{
    if(dk.libre_pct!=null && dk.libre_pct<20 && !alertas.includes('disco'))
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

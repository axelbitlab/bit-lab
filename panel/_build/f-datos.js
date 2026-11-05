
/* =====================================================================
   Datos reales
   ===================================================================== */
const Datos={
 async cargar(){ await Promise.all([this.equipos(),this.comandos()]) },

 async equipos(){
  const {data,error}=await sb.from('dispositivos')
   .select('id,nombre,sistema,ip_local,usuario_so,version_so,arquitectura,version_agente,interpretes,metricas,ultimo_latido,ultimo_contacto,en_linea,activo')
   .eq('activo',true).order('en_linea',{ascending:false}).order('nombre');
  if(error){Toast.mostrar('No se pudieron leer los equipos','err',error.message);return}
  S.dispositivos=(data||[]).map(this.normaliza);
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
  const [{data:cats},{data:cmds,error}]=await Promise.all([
   sb.from('categorias_comandos').select('id,nombre,orden').order('orden').order('nombre'),
   sb.from('comandos').select('id,categoria_id,nombre,descripcion,sistema,script,interprete,destructivo,requiere_admin,timeout_seg,tipo_alerta,activo')
     .eq('activo',true).order('nombre')]);
  if(error){Toast.mostrar('No se pudo leer el catálogo','aviso',error.message);return}
  S.categorias=cats||[]; S.comandos=cmds||[];
 },

 /* ─── Recomendaciones por reglas (sin IA) ───────────────────────────
    Analiza las métricas reales del equipo y devuelve los comandos del
    catálogo que son relevantes según el estado detectado.
    Orden: alertas activas primero, luego por sistema operativo.         */
 recomendados(d){
  if(!d)return [];
  const alertas=this._alertasActivas(d);
  const compatibles=S.comandos.filter(c=>
   c.sistema===d.sistema || c.sistema==='todos');
  const prioritarios=compatibles.filter(c=>
   c.tipo_alerta && alertas.includes(c.tipo_alerta));
  const resto=compatibles.filter(c=>
   !c.tipo_alerta || !alertas.includes(c.tipo_alerta));
  return [...prioritarios,...resto];
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
  const {data,error}=await sb.rpc('crear_comando',{
   p_nombre:campos.nombre, p_descripcion:campos.descripcion||'',
   p_categoria_id:campos.categoria_id, p_sistema:campos.sistema,
   p_script:campos.script, p_interprete:campos.interprete||'powershell',
   p_destructivo:!!campos.destructivo, p_requiere_admin:!!campos.requiere_admin,
   p_timeout_seg:campos.timeout_seg||60, p_tipo_alerta:campos.tipo_alerta||null});
  if(error)throw error;
  await this.comandos();
  return data;
 },

 async actualizarComando(id,campos){
  const {error}=await sb.rpc('actualizar_comando',{
   p_id:id, p_nombre:campos.nombre, p_descripcion:campos.descripcion||'',
   p_categoria_id:campos.categoria_id, p_sistema:campos.sistema,
   p_script:campos.script, p_interprete:campos.interprete||'powershell',
   p_destructivo:!!campos.destructivo, p_requiere_admin:!!campos.requiere_admin,
   p_timeout_seg:campos.timeout_seg||60, p_tipo_alerta:campos.tipo_alerta||null});
  if(error)throw error;
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

/* =====================================================================
   Tiempo real: estado de equipos, salida y cierre de ejecuciones
   ===================================================================== */
const Realtime={
 conectar(){
  this.cortar();
  S.canalEq=sb.channel('eq')
   .on('postgres_changes',{event:'UPDATE',schema:'public',table:'dispositivos'},({new:n})=>{
    const i=S.dispositivos.findIndex(d=>d.id===n.id);
    if(i<0){Datos.equipos().then(()=>Bus.emit('equipos'));return}
    const antes=S.dispositivos[i].en_linea;
    S.dispositivos[i]=Datos.normaliza({...S.dispositivos[i],...n});
    if(antes!==n.en_linea&&!S.silenciado)
     Toast.mostrar(n.nombre+(n.en_linea?' se conectó':' se desconectó'),n.en_linea?'ok':'aviso');
    Bus.emit('equipos');
   })
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'dispositivos'},()=>{
    Datos.equipos().then(()=>Bus.emit('equipos'));
   })
   .subscribe(st=>this.indicador(st));
 },
 seguir(id,alLlegar,alCerrar){
  this.dejar();
  S.canalSalida=sb.channel('sal-'+id)
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'fragmentos_salida_comandos',
        filter:'ejecucion_id=eq.'+id},({new:n})=>alLlegar(n))
   .subscribe();
  S.canalEjec=sb.channel('ej-'+id)
   .on('postgres_changes',{event:'UPDATE',schema:'public',table:'ejecuciones_comandos',
        filter:'id=eq.'+id},({new:n})=>alCerrar(n))
   .subscribe();
 },
 dejar(){
  if(S.canalSalida){sb.removeChannel(S.canalSalida);S.canalSalida=null}
  if(S.canalEjec){sb.removeChannel(S.canalEjec);S.canalEjec=null}
 },
 cortar(){ this.dejar(); if(S.canalEq){sb.removeChannel(S.canalEq);S.canalEq=null} },
 indicador(st){
  const ok=st==='SUBSCRIBED', e=$('#ws-ind');
  if(!e)return;
  $('#ws-txt').textContent=ok?'En vivo':'Reconectando…';
  e.style.borderColor=ok?'rgba(57,255,136,.3)':'rgba(255,183,3,.35)';
  e.style.background=ok?'rgba(57,255,136,.08)':'rgba(255,183,3,.08)';
  e.style.color=ok?'var(--verde)':'var(--ambar)';
 }
};

setInterval(()=>{ if(S.perfil)Datos.equipos().then(()=>Bus.emit('equipos')) },30000);

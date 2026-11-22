/* =====================================================================
   DATOS · Realtime (equipos, salida y cierre de ejecuciones)
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
  const txt=$('#ws-txt'); if(txt)txt.textContent=ok?'En vivo':'Reconectando…';
  e.style.borderColor=ok?'rgba(57,255,136,.3)':'rgba(255,183,3,.35)';
  e.style.background=ok?'rgba(57,255,136,.08)':'rgba(255,183,3,.08)';
  e.style.color=ok?'var(--verde)':'var(--ambar)';
 }
};

setInterval(()=>{ if(S.perfil)Datos.equipos().then(()=>Bus.emit('equipos')) },30000);

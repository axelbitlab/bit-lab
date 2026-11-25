/* =====================================================================
   VARIANTES · Helpers para comandos Multi-SO con scripts por plataforma
   ===================================================================== */

function normalizarNombreCmd(nom){
 return String(nom||'').trim().toLowerCase().replace(/\s+/g,' ');
}

function esMultiPlataforma(cmd){
 if(!cmd)return false;
 if(cmd.esVirtual||cmd.esMulti)return true;
 if(!cmd.variantes)return false;
 const v=cmd.variantes;
 return !!(v.windows||v.macos||v.linux);
}

function resolverScript(cmd, dispositivo){
 if(!cmd)return null;
 const so=(dispositivo?.sistema||'').toLowerCase();
 if(cmd.variantes){
  const v=cmd.variantes;
  let s=null;
  if(so==='windows'&&v.windows) s=v.windows;
  else if((so==='macos'||so==='darwin')&&v.macos) s=v.macos;
  else if(so==='linux'&&v.linux) s=v.linux;
  if(s){
   // Compatibilidad BSD: en macOS, ps no tiene el flag GNU '--sort'
   if((so==='macos'||so==='darwin') && s.includes('ps aux --sort')) {
    s = `ps -A -o user,pid,%cpu,%mem,comm -r | head -11 | awk 'NR==1{print "USER      PID   %CPU  %MEM  COMANDO"} NR>1{printf "%-8s  %-6s  %-5s  %-5s  %s\\n", $1,$2,$3,$4,$5}'`;
   }
   return s;
  }
 }
 return cmd.script||null;
}

function sistemasCubiertos(cmd){
 if(cmd.sistemas_cubiertos&&Array.isArray(cmd.sistemas_cubiertos)) return cmd.sistemas_cubiertos;
 if(!esMultiPlataforma(cmd)) return cmd?.sistema?[cmd.sistema]:[];
 const v=cmd.variantes||{};
 return ['windows','macos','linux'].filter(s=>v[s]&&v[s].trim());
}

/**
 * Agrupa automáticamente comandos que comparten el mismo nombre pero diferente SO,
 * sintetizando un comando Multi-SO virtual con sus variantes por plataforma.
 */
function autoAgruparComandos(cmds){
 if(!Array.isArray(cmds)) return [];
 const grupos={};

 cmds.forEach(c=>{
  const clave = normalizarNombreCmd(c.nombre);
  if(!grupos[clave]) grupos[clave]=[];
  grupos[clave].push(c);
 });

 const resultado=[];
 const yaVistosVirtuales=new Set();

 Object.entries(grupos).forEach(([clave, lista])=>{
  // Si ya existe un comando con variantes explícitas en BD
  const nativoMulti = lista.find(c=>c.variantes&&(c.variantes.windows||c.variantes.macos||c.variantes.linux));

  // Recopilar scripts e IDs por SO
  const porSo={};
  const idsPorSo={};
  lista.forEach(c=>{
   const so=(c.sistema||'').toLowerCase();
   if(so&&so!=='todos'){
    if(!porSo[so] && c.script){
     porSo[so]=c.script;
     idsPorSo[so]=c.id;
    }
   }
   if(c.variantes){
    if(c.variantes.windows&&!porSo.windows) porSo.windows=c.variantes.windows;
    if(c.variantes.macos&&!porSo.macos) porSo.macos=c.variantes.macos;
    if(c.variantes.linux&&!porSo.linux) porSo.linux=c.variantes.linux;
   }
  });

  const sistemas = Object.keys(porSo);

  // Si hay más de un SO disponible para comandos con este mismo nombre
  if(sistemas.length > 1){
   const base = lista[0];
   const virtual = {
    ...base,
    id: nativoMulti ? nativoMulti.id : `multi_${base.id}`,
    nombre: base.nombre,
    sistema: 'todos',
    esVirtual: !nativoMulti,
    esMulti: true,
    variantes: {
     windows: porSo.windows||null,
     macos: porSo.macos||null,
     linux: porSo.linux||null
    },
    id_por_so: idsPorSo,
    sistemas_cubiertos: sistemas,
    descripcion: base.descripcion || `Comando Multi-SO compatible con ${sistemas.join(', ')}`
   };
   resultado.push(virtual);
   yaVistosVirtuales.add(clave);
  }

  // Conservar también los comandos individuales originales
  lista.forEach(c=>{
   resultado.push(c);
  });
 });

 return resultado;
}

// Auto-agrupar si los comandos ya estaban en S
if(typeof S!=='undefined'&&Array.isArray(S.comandos)&&S.comandos.length){
 S.comandos=autoAgruparComandos(S.comandos);
}
window.autoAgruparComandos = autoAgruparComandos;
window.esMultiPlataforma = esMultiPlataforma;
window.resolverScript = resolverScript;

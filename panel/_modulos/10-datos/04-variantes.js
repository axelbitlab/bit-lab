/* =====================================================================
   VARIANTES · Helpers para comandos Multi-SO con scripts por plataforma
   ===================================================================== */

function esMultiPlataforma(cmd){
 if(!cmd)return false;
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
 if(!esMultiPlataforma(cmd)) return cmd?.sistema?[cmd.sistema]:[];
 const v=cmd.variantes;
 return ['windows','macos','linux'].filter(s=>v[s]&&v[s].trim());
}

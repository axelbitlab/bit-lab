/* =====================================================================
   DATOS · Cliente Supabase y verificaciones de arranque
   ===================================================================== */
const alto=m=>{
 document.body.insertAdjacentHTML('afterbegin',
  '<div style="position:fixed;inset:0;z-index:999;display:grid;place-items:center;padding:28px;'+
  'background:#0a0a0f;color:#e8e8ee;font:14px system-ui;text-align:center;line-height:1.7">'+
  '<div style="max-width:430px">'+m+'</div></div>');
};
if(typeof BTL_CONFIG==='undefined'||!BTL_CONFIG.supabase_url||!BTL_CONFIG.supabase_key){
 alto('Falta <code>panel/config.js</code>.<br>Copia <code>config.example.js</code> como <code>config.js</code> '+
      'y pon la URL y la llave publicable del proyecto.');
 return;
}
if(!window.supabase?.createClient||!window.Terminal||!window.FitAddon){
 const f=[!window.supabase?.createClient&&'supabase-js',!window.Terminal&&'xterm',!window.FitAddon&&'xterm-addon-fit'].filter(Boolean);
 alto('No se pudieron cargar las librerías del panel ('+f.join(', ')+').<br><br>'+
      '<span style="color:#9a9aa8;font-size:13px">Revisa la conexión a internet. Si la red bloquea CDNs, '+
      'hay que servir las librerías desde el propio servidor.</span>');
 return;
}
const sb=window.supabase.createClient(BTL_CONFIG.supabase_url,BTL_CONFIG.supabase_key,
 {auth:{persistSession:true,autoRefreshToken:true}});

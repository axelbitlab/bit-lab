/* =====================================================================
   ARRANQUE · Terminal Independiente (terminal.html)
   ===================================================================== */
(async function() {
  'use strict';

  // Aplicar tema guardado
  if (typeof Tema !== 'undefined' && Tema.iniciar) {
    Tema.iniciar();
  }

  // Verificar si hay configuración
  if (typeof sb === 'undefined' || !sb) {
    console.error('Cliente Supabase no disponible.');
    return;
  }

  // Verificar sesión existente en Supabase
  try {
    const { data } = await sb.auth.getSession();
    if (!data || !data.session) {
      window.location.replace('index.html');
      return;
    }

    // Inicializar sesión y cargar datos de dispositivos y catálogo
    await Acceso.dentro(data.session);

    // Montar forzosamente la vista de Terminal
    Nav.ir('terminal');
  } catch (err) {
    console.error('Error al inicializar Terminal Independiente:', err);
    window.location.replace('index.html');
  }
})();

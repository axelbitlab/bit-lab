/* =====================================================================
   MÓDULO · Inicio de Sesión Autónomo (Login)
   ===================================================================== */
(async function() {
  'use strict';
  
  if (typeof BTL_CONFIG === 'undefined' || !BTL_CONFIG.supabase_url) {
    const err = document.getElementById('lg-err');
    if (err) err.textContent = 'Error: No se encontró config.js o las credenciales de Supabase.';
    return;
  }

  const sb = supabase.createClient(BTL_CONFIG.supabase_url, BTL_CONFIG.supabase_key);
  
  // 1. Si ya existe una sesión activa y válida, redirigir automáticamente al panel
  try {
    const { data } = await sb.auth.getSession();
    if (data?.session) {
      window.location.replace('equipos.html');
      return;
    }
  } catch (e) {
    console.warn('Sesión no encontrada o expirada:', e);
  }

  // 2. Control del formulario de inicio de sesión
  const form = document.getElementById('f-login');
  const btn = document.getElementById('lg-btn');
  const err = document.getElementById('lg-err');
  const correo = document.getElementById('lg-correo');
  const pass = document.getElementById('lg-pass');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (err) err.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Verificando…';

    const emailVal = correo.value.trim();
    const passVal = pass.value;

    try {
      const { data: authData, error: authErr } = await sb.auth.signInWithPassword({
        email: emailVal,
        password: passVal
      });

      if (authErr) {
        if (err) err.textContent = /invalid/i.test(authErr.message) ? 'Correo o contraseña incorrectos.' : authErr.message;
        btn.disabled = false;
        btn.textContent = 'Entrar al panel';
        if (pass) pass.select();
        return;
      }

      btn.textContent = 'Acceso correcto. Entrando…';
      window.location.replace('equipos.html');
    } catch (ex) {
      if (err) err.textContent = 'Error al conectar con Supabase: ' + ex.message;
      btn.disabled = false;
      btn.textContent = 'Entrar al panel';
    }
  });
})();

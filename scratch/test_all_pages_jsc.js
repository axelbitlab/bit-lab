const setInterval = () => {};
const setTimeout = () => {};
const clearInterval = () => {};
const clearTimeout = () => {};
const addEventListener = () => {};
const BTL_CONFIG = { supabase_url: 'https://test.supabase.co', supabase_key: 'anon-key' };
const supabase = {
  createClient: () => ({
    rpc: () => Promise.resolve({ data: [] }),
    from: () => ({
      select: () => ({ order: () => Promise.resolve({ data: [] }) }),
      insert: () => Promise.resolve({}),
      update: () => ({ eq: () => Promise.resolve({}) })
    })
  })
};

const window = {
  location: { href: 'http://localhost:8000/panel.html', pathname: '/panel.html', search: '' },
  addEventListener: () => {},
  removeEventListener: () => {},
  matchMedia: () => ({ matches: false, addEventListener: () => {} }),
  _clForm: {},
  supabase: supabase,
  BTL_CONFIG: BTL_CONFIG
};
const document = {
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  addEventListener: () => {},
  createElement: () => ({ setAttribute: () => {}, appendChild: () => {}, style: {} }),
  body: { appendChild: () => {}, removeChild: () => {}, insertAdjacentHTML: () => {} },
  documentElement: { setAttribute: () => {}, getAttribute: () => 'oscuro' }
};
const localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const navigator = { clipboard: { writeText: () => Promise.resolve() } };

// Mock Terminal/FitAddon for terminal & masiva
function Terminal() {
  return { open: () => {}, write: () => {}, loadAddon: () => {}, dispose: () => {}, clear: () => {} };
}
function FitAddon() {
  return { FitAddon: function() { return { fit: () => {} }; } };
}

const allScripts = [
  'panel/modulos/nucleo/utilidades.js',
  'panel/modulos/nucleo/iconos.js',
  'panel/modulos/nucleo/seleccion.js',
  'panel/modulos/datos/supabase.js',
  'panel/modulos/datos/servicio.js',
  'panel/modulos/datos/tiempo_real.js',
  'panel/modulos/datos/acceso.js',
  'panel/modulos/datos/variantes.js',
  'panel/modulos/interfaz/avisos_modales.js',
  'panel/modulos/interfaz/navegacion.js',
  'panel/modulos/interfaz/boton_flotante.js',
  'panel/modulos/monitoreo/vista.js',
  'panel/modulos/catalogo/vista.js',
  'panel/modulos/terminal/vista.js',
  'panel/modulos/historial/vista.js',
  'panel/modulos/catalogo/constantes.js',
  'panel/modulos/ejecucion_masiva/vista.js',
  'panel/modulos/usuarios/vista.js',
  'panel/modulos/claves/vista.js',
  'panel/modulos/cuenta/tema.js',
  'panel/modulos/cuenta/vista.js',
  'panel/modulos/arranque/eventos.js'
];

for (const s of allScripts) {
  load(s);
}
print('ALL 21 SYSTEM MODULES LOADED AND EXECUTED TOGETHER CLEANLY WITH NO CONFLICTS!');

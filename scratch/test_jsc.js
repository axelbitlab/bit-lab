const window = { _clForm: {}, addEventListener: () => {} };
const document = { querySelector: () => null, querySelectorAll: () => [] };
const localStorage = { getItem: () => null, setItem: () => {} };
const sb = {};

load('panel/modulos/nucleo/utilidades.js');
load('panel/modulos/nucleo/iconos.js');
load('panel/modulos/claves/vista.js');

print('COMPILATION AND EXECUTION SUCCESSFUL!');

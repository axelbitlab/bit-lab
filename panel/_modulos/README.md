# Panel modular — Bitlab-IT

Carpetas independientes. Cada una se registra sola y no depende
de otras más allá de lo que publica `00-nucleo`.

Orden de carga (prefijo numérico):

* **00-nucleo** — `Bus` (publicar/escuchar), `Mod` (registro de módulos),
  `Acc` (acciones por `data-acc`), `Chg`, `Inp` (eventos), `Vistas`
  (registro de pantallas), utilidades ($), estado base `S`,
  constantes `SO`/`INT`/`EST`/`FIN`, iconos (`ico`, `P`).
* **10-datos** — Cliente Supabase (`sb`), `Datos` (lectura/escritura),
  `Realtime` (canales en vivo), `Acceso` (login/logout).
* **20-ui** — `Toast`, `Modal`, `Nav` (ruteo entre vistas), `Dock`
  (barra inferior), `Fab` (menú flotante global), `Tema` (claro/oscuro).
* **30-equipos** — Vista de equipos.
* **40-catalogo** — Vista de catálogo (CRUD + filtros).
* **50-terminal** — Vista de terminal + `Term` (xterm.js) + `Motor`.
* **60-cuenta** — Modal "Mi cuenta" (perfil + cambiar contraseña).
* **70-mini-menu** — Menú contextual flotante por equipo seleccionado.
* **90-arranque** — Delegación global de eventos y `Acceso.iniciar()`.

### Reglas
1. Un módulo nunca importa otro directamente; se comunica por
   `Bus.emit(...)`/`Bus.on(...)` o buscando lo que publicó el núcleo.
2. Si borras una carpeta de 30-70, su botón del dock y sus acciones
   dejan de existir, pero el resto sigue funcionando.
3. Para agregar una pantalla nueva, crea `panel/_modulos/NN-mi-vista/`
   con un `index.js` que haga `Vistas.miVista = {...}` y registre
   su entrada en el dock llamando a `Mod.registrarVista(...)`.

### Compilación
`python3 panel/ensamblar.py` concatena todos los archivos en orden
alfabético dentro de cada carpeta y genera `panel/index.html` con
un `build-id` único para romper caché.

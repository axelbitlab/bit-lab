# Arquitectura Modular del Panel Bitlab-IT

Este directorio contiene todo el código fuente modular del panel de control de Bitlab-IT, dividido en componentes independientes y auto-contenidos organizados en español.

## Estructura de Directorios

- **`plantilla/`**:
  - `encabezado.html`: Estructura del `<head>`, metas de control de caché, tipografías y librerías externas vía CDN (Supabase JS, xterm.js).
  - `cuerpo.html`: Estructura visual base (`<body>`), contenedor de inicio de sesión, cabecera superior, dock de navegación y modales globales.

- **`estilos/`**:
  - `base.css`: Variables de tema (colores, sombras, tipografía, reset) y diseño general.
  - `componentes.css`: Estilos de botones, tarjetas vidriadas (glassmorphism), formularios y tablas.
  - `vistas.css`: Reglas específicas para las pantallas de Monitoreo, Catálogo, Terminal e Historial.
  - `mini-menu.css`: Estilos del menú contextual inferior de acciones rápidas sobre equipos.

- **`nucleo/`**:
  - `utilidades.js`: Funciones auxiliares de formateo (fechas, duraciones, bytes, escape de HTML) y bus de eventos (`Bus`). Inicia el IIFE global.
  - `iconos.js`: Diccionario de iconos SVG vectoriales optimizados (`Ico`).
  - `seleccion.js`: Lógica de selección de equipos, persistencia en almacenamiento local y filtrado de equipos activos.

- **`datos/`**:
  - `supabase.js`: Inicialización del cliente oficial de Supabase con credenciales de configuración.
  - `servicio.js`: Métodos asíncronos para consulta y actualización de dispositivos, comandos y ejecuciones (`Datos`).
  - `tiempo_real.js`: Suscripciones por WebSockets para actualización instantánea de estado de equipos y streaming de terminal (`Realtime`).
  - `acceso.js`: Control de autenticación de usuario, inicio y cierre de sesión, roles (admin/operador).
  - `variantes.js`: Resolución inteligente de scripts para comandos multi-plataforma (Windows / macOS / Linux).

- **`interfaz/`**:
  - `avisos_modales.js`: Sistema de notificaciones emergentes (`Toast`) y ventanas modales de confirmación (`Modal`).
  - `navegacion.js`: Barra dock inferior interactiva para alternar entre las distintas pantallas.
  - `boton_flotante.js`: Botón flotante de acción rápida (FAB) para acceso directo a terminal y utilidades.
  - `menu_contextual.js`: Menú inferior desplegable con acciones directas para el equipo seleccionado (ping, reinicio, terminal).

- **`monitoreo/`**:
  - `vista.js`: Pantalla principal con cuadrícula de tarjetas de equipos, filtros de búsqueda, estado de conectividad en vivo y métricas de CPU/RAM/Disco.

- **`catalogo/`**:
  - `constantes.js`: Categorías de comandos y tipos de alerta visual.
  - `vista.js`: Catálogo de scripts predefinidos, buscador por palabras clave, filtro estricto por sistema operativo compatible y panel de alta/edición.

- **`terminal/`**:
  - `emulador.js`: Instancia e inicialización de la terminal emulada mediante xterm.js con tema oscuro y redimensionamiento automático (`FitAddon`).
  - `vista.js`: Interfaz de la consola con pestañas multi-equipo, selector de comandos rápidos y atajos de teclado.
  - `motor.js`: Despacho de órdenes de ejecución hacia Supabase y streaming en tiempo real de salida estándar (`stdout`/`stderr`).

- **`historial/`**:
  - `vista.js`: Bitácora histórica con filtros por equipo, estado (exitosa, fallida, cancelada) y visor deslizable de logs completos.

- **`ejecucion_masiva/`**:
  - `vista.js`: Asistente en 3 pasos para despachar un mismo comando a múltiples equipos seleccionados en paralelo.

- **`cuenta/`**:
  - `tema.js`: Alternancia inmediata entre tema oscuro y tema claro con persistencia.
  - `vista.js`: Modal de perfil de usuario autenticado, información del rol y botón de cierre de sesión.

- **`arranque/`**:
  - `eventos.js`: Escuchador global de teclado (`Escape` para cerrar modales, `Ctrl+Enter` para ejecutar, etc.).
  - `inicio.js`: Punto de entrada (`Acceso.iniciar()`) que valida la sesión existente y cierra el IIFE global.

---

## Compilación y Despliegue

Para combinar todos estos módulos en un único archivo autónomo de producción:

```bash
python3 panel/ensamblar.py
```

Esto generará `panel/index.html` con un identificador único `build-id` para garantizar que los navegadores carguen la versión más reciente sin inconvenientes de caché.

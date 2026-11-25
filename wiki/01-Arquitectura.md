# Arquitectura

## Visión general

```
┌──────────────────────┐        HTTPS (REST + RPC)        ┌───────────────────────────┐
│   Panel (navegador)   │ ────────────────────────────────▶ │                           │
│  HTML/JS estático      │                                   │                           │
│  panel/index.html      │ ◀──────── WebSocket (Realtime) ── │   Supabase (Postgres)     │
│  + panel/_modulos/*.js │                                   │  - RLS por organización   │
└──────────────────────┘                                   │  - Funciones RPC          │
                                                              │    SECURITY DEFINER       │
┌──────────────────────┐        HTTPS (REST + RPC,          │  - Realtime (WAL → WS)    │
│  Agente Windows        │        firmado HMAC, sondeo       │                           │
│  agente.ps1            │ ────────────────────────────────▶ │                           │
└──────────────────────┘        cada ~2 s)                 └───────────────────────────┘
┌──────────────────────┐
│  Agente Mac            │
│  agente.sh (launchd)   │ ───────────────────────────────▶ (mismo endpoint RPC)
└──────────────────────┘
```

No hay un backend intermedio propio (sin NestJS, sin Socket.IO, sin Redis/BullMQ):
el panel y los agentes hablan directamente con el proyecto de Supabase.

## Capa de presentación — el panel

- Un solo HTML ensamblado por `panel/ensamblar.py` a partir de módulos en
  `panel/_modulos/<carpeta>/*.js` y los estilos en `panel/_build/estilos.css`.
- Carpetas principales: `00-nucleo`, `10-datos`, `20-ui`, `30-equipos`,
  `40-catalogo`, `50-terminal`, `55-historial`, `60-cuenta`, `65-masiva`,
  `70-mini-menu`, `90-arranque`.
- El cliente de Supabase se crea en `panel/_modulos/10-datos/01-supabase.js` con
  `window.supabase.createClient(BTL_CONFIG.supabase_url, BTL_CONFIG.supabase_key)`,
  usando `config.js` (no versionado) a partir de `config.example.js`.
- Toda la lectura/escritura de datos pasa por un único módulo,
  `panel/_modulos/10-datos/02-datos.js`, que concentra las llamadas `sb.rpc(...)` y
  `sb.from(...)`.

## Capa de datos y seguridad — Supabase

- Postgres con Row Level Security (RLS) habilitado en todas las tablas sensibles.
  Cada fila queda limitada a la organización del usuario mediante las funciones
  `es_administrador()`, `mi_organizacion()` y `puede_ver_organizacion(org)`
  (ver `supabase/migrations/20261103000000_modulo_comandos.sql`).
- Las operaciones de escritura (crear ejecución, cancelar, CRUD del catálogo,
  alta de dispositivo) no se hacen con `insert`/`update` directos desde el panel:
  pasan por funciones `SECURITY DEFINER` (`crear_ejecucion`, `cancelar_ejecucion`,
  `crear_comando`, `actualizar_comando`, `eliminar_comando`, `duplicar_comando`,
  `mi_perfil`) que validan permisos y organización antes de tocar la tabla.
- La auditoría (`auditoria_comandos`) se llena sola con triggers (`_auditar()`),
  no por código del panel, y la tabla es inmutable (no se puede editar ni borrar,
  lo impide un trigger `_auditoria_inmutable()`).

## Tiempo real del panel — Supabase Realtime

`panel/_modulos/10-datos/03-realtime.js` abre canales de Supabase Realtime
(WebSocket) suscritos a cambios de Postgres (`postgres_changes`):

- Canal `eq`: `UPDATE`/`INSERT` en `dispositivos` → actualiza el mapa/lista de
  equipos y muestra el toast de conexión/desconexión.
- Canal `sal-<id>`: `INSERT` en `fragmentos_salida_comandos` filtrado por
  `ejecucion_id` → alimenta la terminal en vivo línea por línea.
- Canal `ej-<id>`: `UPDATE` en `ejecuciones_comandos` filtrado por `id` → avisa
  cuándo una ejecución termina (estado, código de salida, duración).

El indicador "En vivo" de la barra superior (`#ws-ind`) refleja el estado de
suscripción de estos canales (`SUBSCRIBED` = en vivo, si no, "Reconectando…").

## Protocolo del agente (Windows y Mac)

Los agentes **no** abren un WebSocket: hacen peticiones HTTPS a
`POST /rest/v1/rpc/agente_rpc` (y `agente_registrar` para el alta inicial) en un
bucle de sondeo (`while true … sleep 2`, ver `agente.sh` / `agente.ps1`). Cada
llamada a `agente_rpc` lleva:

- `dispositivo` (uuid), `ts` (marca de tiempo), `nonce` (número único de 16–64
  caracteres, anti-repetición vía tabla `nonces_agente`).
- `firma`: HMAC-SHA256 con llave = hash del token del equipo, sobre el mensaje
  `accion|ts|nonce|cuerpo`.
- `accion`: una de `latido`, `reclamar`, `salida`, `finalizar`, `rotar`.

La función valida forma, marca de tiempo (tolerancia de 300 s), firma y que el
equipo no esté revocado, antes de ejecutar la acción. Ver el detalle de cada
acción en [API y eventos](03-API-y-Eventos.md).

## Catálogo, ejecuciones y mini menú

- El catálogo (`comandos`, `categorias_comandos`) se administra desde
  `panel/_modulos/40-catalogo`.
- Una ejecución individual (catálogo o manual) se crea con `crear_ejecucion`
  desde la terminal (`50-terminal`) o el mini menú contextual (`70-mini-menu`).
- La ejecución masiva (`65-masiva`) **no** usa la función `crear_lote` de la base
  de datos: lanza `crear_ejecucion` una vez por cada equipo seleccionado y sigue
  el progreso con un canal de Realtime por ejecución (`masiva_<id>`). La tabla
  `lotes_ejecuciones` existe en el modelo de datos pero no la usa el panel hoy.

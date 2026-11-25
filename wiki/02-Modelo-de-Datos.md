# Modelo de datos

Tomado directamente de las migraciones en `supabase/migrations/`
(`20261028000000_demo_terminal.sql` y, sobre todo, `20261103000000_modulo_comandos.sql`
más los ajustes posteriores). Nombres de tabla y columna tal cual están en la base.

## Organizaciones y usuarios

**`organizaciones`** — `id` (uuid, pk), `nombre` (único), `activa`, `creado`.

**`perfiles_usuarios`** — `usuario_id` (uuid, pk, referencia a `auth.users`),
`nombre`, `rol` (`administrador` | `tecnico`), `organizacion_id`, `activo`,
`debe_cambiar_contrasena`, `creado`, `actualizado`.

## Equipos y credenciales

**`dispositivos`** — `id` (uuid, pk), `nombre`, `sistema` (`windows` | `macos`),
`organizacion_id`, `ip_local`, `ip_publica`, `usuario_so`, `version_so`,
`arquitectura`, `version_agente`, `interpretes` (jsonb), `metricas` (jsonb),
`ultimo_contacto`, `ultimo_latido`, `en_linea`, `activo`, `creado`.
Único por `(organizacion_id, nombre)`.

**`credenciales_dispositivos`** — `dispositivo_id` (pk, fk a `dispositivos`),
`token_hash` (sha256 del token real — el token en claro nunca se guarda),
`rotacion_solicitada`, `actualizado`. Tabla separada a propósito: nadie puede
leer el hash desde el panel ni desde Realtime.

**`nonces_agente`** — `dispositivo_id`, `nonce`, `recibido`. Clave primaria
compuesta `(dispositivo_id, nonce)`: un nonce repetido rompe el `insert` y la
llamada se rechaza (anti-repetición).

**`claves_registro`** — `id` (uuid, pk), `organizacion_id`, `descripcion`,
`clave_hash` (único), `usos`, `usos_maximos`, `vence`, `activa`, `creado_por`,
`creado`. La clave en claro (`BTL-…`) solo se muestra una vez, al crearla.

**`etiquetas_dispositivos`** y **`acciones_rapidas_usuarios`** — previstas en el
planteamiento original para agrupar equipos y personalizar el mini menú; no
aparecen creadas en las migraciones actuales.

## Catálogo de comandos

**`categorias_comandos`** — `id` (smallint, pk), `nombre` (único), `orden`.

**`comandos`** — `id` (int, pk), `categoria_id`, `nombre`, `sistema`
(`windows` | `macos`), `script`, `descripcion`, `destructivo`, `requiere_admin`,
`interprete` (`powershell` | `cmd` | `zsh` | `bash`), `timeout_seg` (5–3600),
`activo`, `actualizado`. Único por `(nombre, sistema)`.

**`patrones_bloqueados`** — `id`, `patron` (regex), `descripcion`. Lista de
patrones peligrosos que el CRUD del catálogo no deja guardar (formatear disco,
`diskpart`, `dd if=`, borrado recursivo de raíz, descargar y ejecutar código,
bomba de procesos, desactivar SIP en macOS, etc.).

## Ejecuciones

**`ejecuciones_comandos`** — `id` (bigint, pk), `dispositivo_id`, `comando_id`
(nulo si es manual), `estado` (`pendiente` | `ejecutando` | `exitosa` | `fallida`
| `cancelada` | `tiempo_agotado`), `organizacion_id`, `origen` (`catalogo` |
`manual` | `programado` | `reintento`), `texto_comando`, `interprete`,
`argumentos` (jsonb), `lote_id`, `ejecucion_padre_id` (para reintentos),
`cancelacion_solicitada`, `confirmado_destructivo`, `modo_simulacion`,
`codigo_salida`, `mensaje_error`, `duracion_ms`, `lineas_recibidas`,
`solicitado_por`, `creado`, `iniciado`, `terminado`.

**`fragmentos_salida_comandos`** — `id` (bigint, pk), `ejecucion_id`,
`secuencia`, `flujo` (`stdout` | `stderr` | `sistema`), `texto` (máx. 4000
caracteres por fragmento), `creado`. Único por `(ejecucion_id, secuencia)` —
un reintento del mismo envío no duplica líneas.

**`lotes_ejecuciones`** — `id` (uuid, pk), `organizacion_id`, `nombre`,
`comando_id`, `total`, `creado_por`, `creado`. Existe en el modelo pero hoy el
panel no la usa (ver nota en [Arquitectura](01-Arquitectura.md)).

**`comandos_programados`** — `id`, `organizacion_id`, `comando_id`,
`dispositivo_id`, `expresion_cron`, `activo`, `ultima_ejecucion`,
`proxima_ejecucion`, `creado_por`, `creado`. Tabla y validación de formato cron
listas; no se encontró UI del panel que la use todavía.

## Alertas

**`tipos_alerta`** — `codigo` (pk), `nombre`, `severidad` (`baja`|`media`|`alta`),
`condicion`.

**`alertas_comandos`** — relación `tipo_alerta` ↔ `comando_id` con `orden`, para
sugerir comandos del catálogo según el tipo de alerta (reglas, no IA).

## Auditoría

**`auditoria_comandos`** — `id` (bigint, pk), `usuario_id`, `organizacion_id`,
`accion`, `entidad`, `entidad_id`, `antes`/`despues` (jsonb, sin `token_hash` ni
`clave_hash`), `ip`, `creado`. Se llena por triggers (`_auditar()`) sobre
`comandos`, `perfiles_usuarios`, `claves_registro`, `ejecuciones_comandos`
(alta, cambio de estado, cancelación) y `dispositivos` (alta/baja y cambios
relevantes). Es inmutable: un trigger (`_auditoria_inmutable()`) bloquea
`update`/`delete` sobre esta tabla.

## Seguridad por fila (RLS) — resumen

Todas las tablas de negocio tienen RLS habilitado. El patrón general:

- Lectura de `dispositivos`, `ejecuciones_comandos`, `fragmentos_salida_comandos`,
  `lotes_ejecuciones`, `comandos_programados`: limitada a la organización del
  usuario (`puede_ver_organizacion(organizacion_id)`), o a cualquier
  administrador.
- `categorias_comandos` y `tipos_alerta`/`alertas_comandos`: lectura abierta a
  cualquier usuario autenticado; escritura solo administrador.
- `comandos`: lectura de comandos activos para cualquiera, o todos si es
  administrador; escritura solo administrador.
- `auditoria_comandos` y `claves_registro`: lectura solo administrador.
- `credenciales_dispositivos` y `nonces_agente`: sin política de lectura para
  el panel — solo las tocan las funciones `SECURITY DEFINER` del protocolo del
  agente.

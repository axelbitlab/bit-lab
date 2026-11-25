# API y eventos en tiempo real

No hay rutas REST propias (`/api/...`): toda la "API" son funciones RPC de
Postgres expuestas por Supabase en `POST /rest/v1/rpc/<función>`, más lectura
directa de tablas (`GET /rest/v1/<tabla>`) filtrada por RLS.

## Funciones que llama el panel (usuario autenticado)

Todas viven en `panel/_modulos/10-datos/02-datos.js`.

| Función                | Para qué                                            |
|-------------------------|------------------------------------------------------|
| `mi_perfil()`           | Carga nombre, rol y organización del usuario al entrar. |
| `crear_ejecucion(p_dispositivo, p_comando, p_texto, p_simulacion, p_confirmar)` | Lanza una ejecución (catálogo o manual) desde la terminal, el mini menú o la vista masiva (una llamada por equipo). |
| `cancelar_ejecucion(p_ejecucion)` | Cancela una ejecución pendiente o en curso. |
| `crear_comando(...)` / `actualizar_comando(...)` | Alta/edición de un comando del catálogo (acepta `p_tipos_alerta` o `p_tipo_alerta` para asociarlo a alertas). |
| `eliminar_comando(p_id)` | Baja lógica de un comando del catálogo. |
| `duplicar_comando(p_id)` | Clona un comando existente. |

Funciones definidas en la base pero **sin** llamada desde el panel hoy:
`crear_lote`, `reintentar_ejecucion`, `crear_clave_registro`,
`revocar_dispositivo`, `rotar_token_dispositivo`. Las de administración de
claves y dispositivos se usan manualmente desde el SQL Editor de Supabase (ver
[Instalación del agente](04-Instalacion-Agente.md)).

## Tablas que lee el panel directamente (`sb.from(...)`)

`dispositivos`, `comandos`, `categorias_comandos`, `ejecuciones_comandos`,
`fragmentos_salida_comandos` — siempre filtradas por RLS según la organización
del usuario.

## Protocolo del agente (`agente_rpc` / `agente_registrar`)

### `agente_registrar(p_clave, p_equipo)`

Alta/reingreso de un equipo con una clave `BTL-...` (ver
[Instalación del agente](04-Instalacion-Agente.md)). Valida que la clave exista,
esté activa, no haya vencido y no supere `usos_maximos`. Crea o reutiliza la fila
en `dispositivos`, genera un token de 256 bits, guarda solo su hash en
`credenciales_dispositivos`, y devuelve:

```json
{ "dispositivo_id": "...", "token": "...", "intervalo_latido": 30, "intervalo_sondeo": 2 }
```

### `agente_rpc(p_dispositivo, p_ts, p_nonce, p_firma, p_accion, p_cuerpo)`

Única puerta para todo lo demás. Cada llamada se firma con
`HMAC-SHA256(llave = sha256(token), mensaje = accion|ts|nonce|cuerpo)` y se
valida: forma del nonce, tamaño del cuerpo (máx. 256 KB), que `|ahora − ts| ≤ 300 s`,
la firma, y que el equipo no esté revocado. Cada nonce se inserta en
`nonces_agente`; si ya existía, la llamada se rechaza (anti-repetición).

Acciones (`p_accion`):

- **`latido`** — el agente reporta `ip_local`, `usuario_so`, `version_so`,
  `arquitectura`, `version_agente`, `interpretes` y `metricas` (de ahí sale, por
  ejemplo, el dato de CPU). Marca `en_linea = true` y `ultimo_latido = now()`.
  Devuelve si toca rotar el token.
- **`reclamar`** — el agente pide trabajo: toma la ejecución `pendiente` más
  antigua de ese equipo (`for update skip locked`, así dos sondeos no toman la
  misma), la pasa a `ejecutando` y le manda el script, intérprete, si es
  simulación, el timeout y una firma adicional del lado del servidor (para que
  el agente confirme que la orden viene de quien conoce su propia llave).
- **`salida`** — el agente entrega hasta 500 líneas de salida por llamada,
  guardadas en `fragmentos_salida_comandos` (tope de 20 000 líneas por
  ejecución; de ahí en adelante se marca `truncada`). Devuelve si se pidió
  cancelar.
- **`finalizar`** — cierra la ejecución con `estado`, `codigo_salida` y
  `duracion_ms`.
- **`rotar`** — genera un token nuevo y lo reemplaza en
  `credenciales_dispositivos`.

### Mantenimiento automático

`mantenimiento_agentes()` (pensada para correr con `pg_cron` cada minuto) marca
`en_linea = false` a los equipos sin latido reciente y limpia nonces viejos.

## Eventos de Supabase Realtime (lo que de verdad hace "vivo" al panel)

Ver también [Arquitectura](01-Arquitectura.md). Canales abiertos desde
`panel/_modulos/10-datos/03-realtime.js`:

| Canal          | Tabla / filtro                                   | Efecto en el panel |
|----------------|---------------------------------------------------|---------------------|
| `eq`           | `dispositivos`, `INSERT`/`UPDATE`                  | Refresca equipos; toast de conexión/desconexión. |
| `sal-<id>`     | `fragmentos_salida_comandos`, `INSERT` filtrado por `ejecucion_id` | Alimenta la terminal en vivo. |
| `ej-<id>`      | `ejecuciones_comandos`, `UPDATE` filtrado por `id` | Avisa el cierre de la ejecución (estado, código, duración). |
| `masiva_<id>`  | igual que `ej-<id>`, uno por cada equipo de la tanda | Progreso de la vista de ejecución masiva. |

El indicador "En vivo" de la barra superior refleja el estado de suscripción
(`SUBSCRIBED`) de estos canales, no una métrica de latencia de red.

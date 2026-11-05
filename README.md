# bit-lab · Bitlab Terminal

Módulo de comandos remotos para la plataforma de monitoreo de Bitlab-IT (estadía UPQ, proyecto BTL en Jira).

| Carpeta | Contenido |
|---|---|
| `supabase/migrations/` | Base de datos en orden: 001 demo inicial, 002 módulo completo (organizaciones, roles, RLS, auditoría, protocolo firmado del agente). |
| `supabase/tests/` | `prueba_seguridad.sql`: 23 casos de RLS y del protocolo del agente con resultado PASA/FALLA. |
| `supabase/seed/` | `crear_usuarios_demo.py`: crea las cuentas demo con contraseña temporal. |
| `agente/` | Agente de endpoint para Windows (PowerShell) y macOS (zsh). |
| `panel/` | Panel web con consola en vivo (xterm.js + Supabase Realtime). |
| `docs/` | Entregables E1 a E8 en PDF. |

## Seguridad

- Ningún secreto se sube: `.env`, `panel/config.js` y `agente.config.json` están en `.gitignore`; solo se versionan los `*.example`.
- El panel y el agente usan solo la llave pública (anon/publishable). La llave secreta se usa únicamente en el seeder, desde `.env`.
- Los equipos se registran con una clave de registro por organización y reciben un token de 256 bits; en la base solo queda su hash.
- Cada llamada del agente va firmada con HMAC-SHA256, marca de tiempo y número único (sin reenvíos).
- RLS por organización en todas las tablas; auditoría inmutable.

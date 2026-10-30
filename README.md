# bit-lab · Bitlab Terminal

Módulo de comandos remotos para la plataforma de monitoreo de Bitlab-IT (estadía UPQ).

- `supabase/migrations/` — tablas, RLS, funciones del agente y catálogo inicial.
- `agente/` — agente de endpoint en PowerShell (Windows).
- `panel/` — panel web con consola en vivo (xterm.js + Supabase Realtime).

Configuración local (no se sube a git): `panel/config.js` y `agente/agente.config.json`.

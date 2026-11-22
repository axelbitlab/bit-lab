# BTL-200 · Comandos multiplataforma — Instrucciones de despliegue en Supabase

## Paso 1: Migración (una sola vez)

Pega en el **Editor SQL** de Supabase:

```
supabase/migrations/20261122000000_variantes_multiplataforma.sql
```

Agrega la columna `variantes JSONB` a la tabla `comandos`.

## Paso 2: Seed de comandos multiplataforma

Pega en el **Editor SQL** de Supabase:

```
supabase/seed/comandos_multiplataforma.sql
```

Crea 4 comandos con `sistema='todos'` y variantes por SO:

| Comando | Windows | macOS | Linux |
|---------|---------|-------|-------|
| Top 10 procesos | `Get-Process \| Sort CPU` | `ps aux --sort=-%cpu` | `ps aux --sort=-%cpu` |
| Espacio en discos | `Get-PSDrive` | `df -h` | `df -h --output=...` |
| Uso de memoria RAM | `Get-CimInstance Win32_OS` | `vm_stat` via python3 | `free -h` |
| Interfaces de red activas | `Get-NetIPAddress` | `ifconfig` | `ip -4 addr show` |

## Paso 3: Reload del panel

El panel ya fue reconstruido con `python3 panel/ensamblar.py`.
Recarga la página en el navegador (Ctrl+F5 / Cmd+Shift+R).

## Cómo funciona

1. Los 4 comandos tienen `sistema = 'todos'` → aparecen en la lista de cualquier equipo.
2. Al lanzar desde terminal individual o masiva, el panel llama `resolverScript(cmd, dispositivo)`.
3. Se selecciona la clave `windows`, `macos` o `linux` del campo `variantes` según `dispositivo.sistema`.
4. Si no hay variante para ese SO, se usa `cmd.script` como respaldo.
5. El script ad-hoc se envía al agente como `texto` (ejecución manual), conservando la referencia al comando para el historial.
6. En la terminal aparece el badge `[multi-SO → macos]` en color morado.
7. En el catálogo los 4 comandos muestran el badge `⚡ Multi-SO` en lugar de Windows/macOS/Linux.

## Sin migración (alternativa temporal)

Si no puedes correr la migración ahora, el panel funciona igual con comandos de `sistema='todos'`
sin el campo `variantes` — simplemente no hace la resolución por SO y usa `cmd.script` como antes.
La columna `variantes` puede agregarse después sin romper nada.

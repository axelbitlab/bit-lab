# Panel Bitlab-IT · Cambios 2026-11-05

## Fase A · Modularización

* Nueva carpeta `panel/_modulos/` con nueve subcarpetas numeradas.
  Cada una se compila sola y no depende del resto más allá del
  núcleo: Bus, Mod, Acc, Chg, Inp, Vistas, S.
* Ensamblador nuevo `panel/ensamblar.py`: concatena los módulos en
  orden alfanumérico, agrega los estilos y produce `panel/index.html`
  con un `build-id` que rompe la caché del navegador.
* Registro dinámico de vistas: cada carpeta hace
  `Mod.registrarVista({id, nombre, icono, orden, definicion})`.
  Si borras la carpeta 40-catalogo, su botón del dock desaparece
  y el resto del panel sigue funcionando.
* El `_build/` anterior queda como respaldo; si `_modulos/` se
  elimina, el ensamblador cae de nuevo a `_build/`.

## Fase B · Clasificación multi-categoría

* Migración `20261106000000_tipos_alerta_multi.sql`:
  * Agrega `tipos_alerta text[]` a `comandos` (índice GIN).
  * Backfill desde la columna legacy `tipo_alerta`.
  * Trigger `_comandos_sync_tipo_alerta` mantiene `tipo_alerta`
    sincronizado con `tipos_alerta[1]` para clientes antiguos.
  * Funciones RPC `crear_comando` y `actualizar_comando` aceptan
    ambos: `p_tipos_alerta` (array) y `p_tipo_alerta` (texto).
* Migración `20261106000100_clasificacion_comandos.sql`:
  * Clasifica los 20 comandos del seed existente.
  * Agrega 11 comandos Windows y 10 macOS nuevos.
  * Varias categorías por comando:
    * "Procesos que más consumen" → cpu + memoria + proceso
    * "Información del sistema" → sistema + memoria
    * "Conexiones abiertas" → red + seguridad
    * "Reiniciar cola de impresión" → impresora + mantenimiento
    * "Matar proceso por nombre" → proceso + mantenimiento
    * "Limpiar temporales / caché" → disco + mantenimiento
    * "Top CPU en tiempo real" → cpu + proceso
    * "Últimos errores del sistema" → sistema + seguridad
    * "Reiniciar adaptador de red" → red + mantenimiento
    * "Usuarios locales" → seguridad + sistema
  * Total: 22 comandos clasificados en 9 tipos de alerta
    (cpu, memoria, disco, proceso, impresora, red, sistema,
    mantenimiento, seguridad).
* Panel: la columna "Alerta" del catálogo ahora muestra todas las
  etiquetas del comando. El formulario trae chips con checkbox para
  elegir una o varias. Los filtros siguen aceptando un único tipo
  (busca comandos que tengan ese tipo entre los suyos).

## Fase C · Mini menú contextual por equipo

* Carpeta nueva `panel/_modulos/70-mini-menu/`.
* Al hacer clic en una tarjeta de equipo se abre un menú flotante
  posicionado junto al cursor con:
  1. Cabecera: nombre, SO, IP, estado y el chip de alertas activas.
  2. Hasta 8 comandos recomendados, ordenados por cuántas de sus
     alertas coinciden con las alertas activas del equipo.
     Cada botón lleva un ícono de rayo amarillo cuando es
     recomendado por alerta activa, y un ícono rojo cuando es
     destructivo.
  3. Atajos: "Abrir terminal" (cambia a la vista terminal con ese
     equipo) y "Ver catálogo" (filtra el catálogo por el SO del
     equipo).
* Las tarjetas de equipo muestran un chip ámbar con el conteo de
  alertas cuando tienen alguna. También se pinta un borde ámbar
  sutil.
* Si borras la carpeta 70-mini-menu, las tarjetas vuelven al
  comportamiento anterior (abrir terminal directo al clic).

## Cómo aplicar

En Supabase > SQL Editor:

```sql
-- 1) Esquema (tipos_alerta array + trigger + RPC)
\i supabase/migrations/20261106000000_tipos_alerta_multi.sql
-- 2) Clasificación de los 22 comandos
\i supabase/migrations/20261106000100_clasificacion_comandos.sql
```

En la Mac, para regenerar el panel:

```bash
python3 panel/ensamblar.py
```

En el navegador: `Cmd + Shift + R` para forzar carga sin caché.

-- ============================================================================
-- Bitlab Terminal · Migración 20261106000100
-- Clasificación multi-categoría de 20+ comandos del catálogo.
-- Cada comando recibe uno o varios tipos_alerta según su utilidad real.
-- Las categorías de alerta válidas son:
--   cpu, memoria, disco, proceso, impresora, red, sistema,
--   mantenimiento, seguridad
--
-- Un comando puede pertenecer a varios tipos (ej: "procesos top" sirve
-- tanto para CPU como para memoria y procesos).
-- ============================================================================

-- Asegurar categorías base.
INSERT INTO public.categorias_comandos (nombre, descripcion, color, icono, orden)
VALUES
  ('Diagnóstico',    'Comandos de diagnóstico general',          '#6366f1', 'activity', 10),
  ('Archivos',       'Listado y análisis de archivos',           '#10b981', 'list',     15),
  ('Disco',          'Gestión y análisis de discos',             '#f59e0b', 'hdd',      20),
  ('Red',            'Conectividad y diagnóstico de red',        '#06b6d4', 'wifi',     30),
  ('Procesos',       'Gestión de procesos y servicios',          '#8b5cf6', 'cpu',      40),
  ('Impresoras',     'Gestión de impresoras y colas',            '#10b981', 'print',    50),
  ('Sistema',        'Información y configuración del sistema',  '#3b82f6', 'shield',   60),
  ('Mantenimiento',  'Limpieza, actualizaciones y mantenimiento','#ef4444', 'wrench',   70),
  ('Seguridad',      'Auditoría y verificación de seguridad',    '#dc2626', 'lock',     80)
ON CONFLICT (nombre) DO NOTHING;

-- ---------- Tabla de clasificación por nombre+sistema ----------
-- Se aplica como UPDATE masivo para los comandos existentes.
-- Para los que falten, se insertan a continuación.

WITH clasificacion(nombre, sistema, tipos, cat) AS (VALUES
  -- Windows (lo que ya hay en el seed + extras que aseguran cobertura)
  ('Carpeta actual',             'windows', ARRAY['sistema']::text[],                    'Diagnóstico'),
  ('Listar carpeta',             'windows', ARRAY['sistema']::text[],                    'Archivos'),
  ('Carpetas del usuario',       'windows', ARRAY['sistema']::text[],                    'Archivos'),
  ('Espacio en disco',           'windows', ARRAY['disco']::text[],                      'Diagnóstico'),
  ('Información del sistema',    'windows', ARRAY['sistema','memoria']::text[],          'Diagnóstico'),
  ('Procesos que más consumen',  'windows', ARRAY['cpu','memoria','proceso']::text[],    'Procesos'),
  ('Configuración de red',       'windows', ARRAY['red']::text[],                        'Red'),
  ('Probar salida a internet',   'windows', ARRAY['red']::text[],                        'Red'),
  ('Conexiones abiertas',        'windows', ARRAY['red','seguridad']::text[],            'Red'),
  ('Servicios detenidos',        'windows', ARRAY['sistema','mantenimiento']::text[],    'Mantenimiento'),
  ('Últimos errores del sistema','windows', ARRAY['sistema','seguridad']::text[],        'Mantenimiento'),
  ('Reiniciar cola de impresión','windows', ARRAY['impresora','mantenimiento']::text[],  'Impresoras'),
  -- macOS
  ('Carpeta actual',             'macos',   ARRAY['sistema']::text[],                    'Diagnóstico'),
  ('Listar carpeta',             'macos',   ARRAY['sistema']::text[],                    'Archivos'),
  ('Espacio en disco',           'macos',   ARRAY['disco']::text[],                      'Diagnóstico'),
  ('Información del sistema',    'macos',   ARRAY['sistema','memoria']::text[],          'Diagnóstico'),
  ('Procesos que más consumen',  'macos',   ARRAY['cpu','memoria','proceso']::text[],    'Procesos'),
  ('Configuración de red',       'macos',   ARRAY['red']::text[],                        'Red'),
  ('Probar salida a internet',   'macos',   ARRAY['red']::text[],                        'Red'),
  ('Tiempo encendido',           'macos',   ARRAY['sistema','cpu']::text[],              'Mantenimiento')
)
UPDATE public.comandos c
   SET tipos_alerta = cl.tipos,
       categoria_id = (SELECT id FROM public.categorias_comandos WHERE nombre = cl.cat),
       actualizado  = now()
  FROM clasificacion cl
 WHERE c.nombre = cl.nombre
   AND c.sistema = cl.sistema;

-- ---------- Comandos nuevos: ampliar el catálogo a 20+ con multi-categoría ----------

-- Windows · nuevos
INSERT INTO public.comandos
  (categoria_id, nombre, descripcion, sistema, script, interprete, destructivo, requiere_admin, timeout_seg, tipos_alerta, activo)
SELECT c.id, v.nombre, v.descripcion, 'windows', v.script, v.interprete, v.destructivo, v.admin, v.seg, v.tipos, true
FROM (VALUES
 ('Disco',         'Archivos grandes',             'Los 20 archivos más grandes del disco C:',
  'Get-ChildItem -Path C:\ -Recurse -File -ErrorAction SilentlyContinue | Sort-Object Length -Descending | Select-Object -First 20 FullName, @{n=''TamGB'';e={[math]::Round($_.Length/1GB,2)}} | Format-Table -AutoSize',
  'powershell', false, false, 120, ARRAY['disco','mantenimiento']::text[]),
 ('Mantenimiento', 'Limpiar temporales',           'Vaciar carpeta TEMP del usuario (NO elimina archivos en uso)',
  'Get-ChildItem $env:TEMP -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue; Write-Host "Temporales limpiados"',
  'powershell', true, false, 180, ARRAY['disco','mantenimiento']::text[]),
 ('Sistema',       'Uso de memoria',               'Memoria total, usada y libre en MB',
  'Get-CimInstance Win32_OperatingSystem | Select-Object @{n=''TotalMB'';e={[math]::Round($_.TotalVisibleMemorySize/1024)}}, @{n=''LibreMB'';e={[math]::Round($_.FreePhysicalMemory/1024)}}, @{n=''UsadoPct'';e={[math]::Round((1-$_.FreePhysicalMemory/$_.TotalVisibleMemorySize)*100,1)}} | Format-List',
  'powershell', false, false, 30, ARRAY['memoria']::text[]),
 ('Impresoras',    'Cola de impresión',            'Trabajos pendientes en todas las impresoras',
  'Get-Printer | ForEach-Object { Get-PrintJob -PrinterName $_.Name -ErrorAction SilentlyContinue } | Format-Table PrinterName, Id, DocumentName, UserName, SubmittedTime -AutoSize',
  'powershell', false, false, 45, ARRAY['impresora']::text[]),
 ('Impresoras',    'Impresoras instaladas',        'Lista de impresoras y su estado',
  'Get-Printer | Format-Table Name, DriverName, PortName, PrinterStatus -AutoSize',
  'powershell', false, false, 30, ARRAY['impresora']::text[]),
 ('Procesos',      'Matar proceso por nombre',     'Termina procesos cuyo nombre coincida',
  'Get-Process -Name "notepad" -ErrorAction SilentlyContinue | Stop-Process -Force; Write-Host "OK"',
  'powershell', true, false, 30, ARRAY['proceso','mantenimiento']::text[]),
 ('Red',           'DNS: pruebas de resolución',   'Prueba resolución de DNS a sitios comunes',
  'Resolve-DnsName google.com, github.com, microsoft.com -ErrorAction SilentlyContinue | Format-Table Name, Type, IPAddress -AutoSize',
  'powershell', false, false, 30, ARRAY['red']::text[]),
 ('Seguridad',     'Usuarios locales',             'Cuentas de usuario locales del equipo',
  'Get-LocalUser | Format-Table Name, Enabled, LastLogon, PasswordExpires -AutoSize',
  'powershell', false, true, 30, ARRAY['seguridad','sistema']::text[]),
 ('Seguridad',     'Estado de Windows Defender',   'Resumen del antivirus de Windows',
  'Get-MpComputerStatus | Select-Object AntivirusEnabled, RealTimeProtectionEnabled, AntispywareEnabled, QuickScanEndTime, AMEngineVersion | Format-List',
  'powershell', false, false, 30, ARRAY['seguridad']::text[]),
 ('Diagnóstico',   'Top CPU en tiempo real',       'Los 10 procesos con más CPU',
  'Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 Id, ProcessName, @{n=''CPU'';e={[math]::Round($_.CPU,1)}}, @{n=''MemMB'';e={[math]::Round($_.WS/1MB)}} | Format-Table -AutoSize',
  'powershell', false, false, 30, ARRAY['cpu','proceso']::text[]),
 ('Mantenimiento', 'Reiniciar adaptador de red',   'Deshabilita y re-habilita el adaptador activo',
  'Get-NetAdapter | Where-Object Status -eq ''Up'' | Restart-NetAdapter -Confirm:$false',
  'powershell', true, true, 60, ARRAY['red','mantenimiento']::text[])
) AS v(cat, nombre, descripcion, script, interprete, destructivo, admin, seg, tipos)
JOIN public.categorias_comandos c ON c.nombre = v.cat
ON CONFLICT (nombre, sistema) DO UPDATE
  SET descripcion = EXCLUDED.descripcion, script = EXCLUDED.script,
      interprete = EXCLUDED.interprete, destructivo = EXCLUDED.destructivo,
      requiere_admin = EXCLUDED.requiere_admin, timeout_seg = EXCLUDED.timeout_seg,
      categoria_id = EXCLUDED.categoria_id, tipos_alerta = EXCLUDED.tipos_alerta,
      actualizado = now(), activo = true;

-- macOS · nuevos
INSERT INTO public.comandos
  (categoria_id, nombre, descripcion, sistema, script, interprete, destructivo, requiere_admin, timeout_seg, tipos_alerta, activo)
SELECT c.id, v.nombre, v.descripcion, 'macos', v.script, 'zsh', v.destructivo, v.admin, v.seg, v.tipos, true
FROM (VALUES
 ('Disco',         'Archivos grandes',             'Los 20 archivos más grandes de la carpeta personal',
  'find ~ -type f -size +100M -exec ls -lah {} \; 2>/dev/null | sort -k5 -hr | head -20',
  false, false, 120, ARRAY['disco','mantenimiento']::text[]),
 ('Mantenimiento', 'Limpiar caché del usuario',    'Vacía ~/Library/Caches (archivos no bloqueados)',
  'rm -rf ~/Library/Caches/* 2>/dev/null; echo "Caché limpiado"',
  true, false, 90, ARRAY['disco','mantenimiento']::text[]),
 ('Sistema',       'Uso de memoria',               'Memoria física, libre, activa e inactiva',
  'vm_stat | perl -ne ''/page size of (\d+)/ and $size=$1; /Pages\s+([^:]+)[^\d]+(\d+)/ and printf("%-30s % 16.2f MB\n", "$1:", $2 * $size / 1048576);''',
  false, false, 30, ARRAY['memoria']::text[]),
 ('Impresoras',    'Cola de impresión',            'Trabajos en todas las colas',
  'lpstat -o 2>/dev/null; echo "---"; lpstat -p 2>/dev/null',
  false, false, 30, ARRAY['impresora']::text[]),
 ('Impresoras',    'Impresoras instaladas',        'Lista de impresoras configuradas',
  'lpstat -v 2>/dev/null',
  false, false, 30, ARRAY['impresora']::text[]),
 ('Procesos',      'Matar proceso por nombre',     'Termina procesos cuyo nombre coincida',
  'pkill -f "Safari" 2>/dev/null; echo "OK (ajusta el nombre en el script)"',
  true, false, 30, ARRAY['proceso','mantenimiento']::text[]),
 ('Red',           'DNS: pruebas de resolución',   'Prueba resolución a sitios comunes',
  'for h in google.com github.com apple.com; do echo "--- $h ---"; dig +short "$h" 2>/dev/null | head -4; done',
  false, false, 30, ARRAY['red']::text[]),
 ('Seguridad',     'Firewall de macOS',            'Estado del cortafuegos del sistema',
  '/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>/dev/null; /usr/libexec/ApplicationFirewall/socketfilterfw --getstealthmode 2>/dev/null',
  false, false, 30, ARRAY['seguridad']::text[]),
 ('Seguridad',     'Usuarios del sistema',         'Cuentas con acceso a shell',
  'dscl . -list /Users | grep -v "^_" | sort',
  false, false, 30, ARRAY['seguridad','sistema']::text[]),
 ('Diagnóstico',   'Top CPU en tiempo real',       'Los 10 procesos con más CPU',
  'ps -arcwwwxo pid,user,%cpu,%mem,command | head -11',
  false, false, 30, ARRAY['cpu','proceso']::text[])
) AS v(cat, nombre, descripcion, script, destructivo, admin, seg, tipos)
JOIN public.categorias_comandos c ON c.nombre = v.cat
ON CONFLICT (nombre, sistema) DO UPDATE
  SET descripcion = EXCLUDED.descripcion, script = EXCLUDED.script,
      destructivo = EXCLUDED.destructivo,
      requiere_admin = EXCLUDED.requiere_admin, timeout_seg = EXCLUDED.timeout_seg,
      categoria_id = EXCLUDED.categoria_id, tipos_alerta = EXCLUDED.tipos_alerta,
      actualizado = now(), activo = true;

-- Comprobación: cuántos quedaron con clasificación
SELECT
  sistema,
  count(*)                                  AS total,
  count(*) FILTER (WHERE cardinality(tipos_alerta) > 0) AS clasificados,
  count(*) FILTER (WHERE cardinality(tipos_alerta) > 1) AS multi_cat
FROM public.comandos
WHERE activo
GROUP BY sistema
ORDER BY sistema;

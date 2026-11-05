-- =====================================================================
-- Bitlab Terminal · Comandos recomendados de la demo
-- Se pega en el editor SQL de Supabase. Se puede correr varias veces.
--
-- Todos son de solo lectura salvo el último (reiniciar la cola de
-- impresión), que va marcado como destructivo para mostrar la
-- confirmación doble en la demo.
-- =====================================================================

insert into public.categorias_comandos (nombre, orden) values
  ('Diagnóstico', 1), ('Archivos', 2), ('Red', 3), ('Mantenimiento', 4)
on conflict (nombre) do update set orden = excluded.orden;

-- ---------- Windows ----------
insert into public.comandos
  (categoria_id, nombre, descripcion, sistema, script, interprete, destructivo, requiere_admin, timeout_seg, activo)
select c.id, v.nombre, v.descripcion, 'windows', v.script, v.interprete, v.destructivo, v.admin, v.seg, true
from (values
 ('Diagnóstico',  'Carpeta actual',            'Muestra en qué ruta está trabajando la sesión',
  'Get-Location', 'powershell', false, false, 30),
 ('Archivos',     'Listar carpeta',            'Archivos y carpetas del directorio actual',
  'Get-ChildItem | Format-Table Name, Length, LastWriteTime -AutoSize', 'powershell', false, false, 30),
 ('Archivos',     'Carpetas del usuario',      'Contenido de la carpeta personal',
  'Get-ChildItem $env:USERPROFILE | Format-Table Name, LastWriteTime -AutoSize', 'powershell', false, false, 30),
 ('Diagnóstico',  'Espacio en disco',          'Unidades con total y espacio libre',
  'Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{n=''UsadoGB'';e={[math]::Round($_.Used/1GB,1)}}, @{n=''LibreGB'';e={[math]::Round($_.Free/1GB,1)}} | Format-Table -AutoSize',
  'powershell', false, false, 30),
 ('Diagnóstico',  'Información del sistema',   'Equipo, sistema operativo, memoria y tiempo encendido',
  'Get-CimInstance Win32_OperatingSystem | Select-Object CSName, Caption, Version, OSArchitecture, @{n=''MemoriaGB'';e={[math]::Round($_.TotalVisibleMemorySize/1MB,1)}}, LastBootUpTime | Format-List',
  'powershell', false, false, 60),
 ('Diagnóstico',  'Procesos que más consumen', 'Los 15 procesos con más memoria',
  'Get-Process | Sort-Object WS -Descending | Select-Object -First 15 Id, ProcessName, @{n=''MemoriaMB'';e={[math]::Round($_.WS/1MB)}} | Format-Table -AutoSize',
  'powershell', false, false, 30),
 ('Red',          'Configuración de red',      'IP, máscara y puerta de enlace de cada adaptador',
  'ipconfig /all', 'cmd', false, false, 30),
 ('Red',          'Probar salida a internet',  'Cuatro pings a 8.8.8.8',
  'ping -n 4 8.8.8.8', 'cmd', false, false, 40),
 ('Red',          'Conexiones abiertas',       'Puertos a la escucha y conexiones establecidas',
  'Get-NetTCPConnection -State Listen, Established | Select-Object -First 25 LocalAddress, LocalPort, RemoteAddress, State | Format-Table -AutoSize',
  'powershell', false, false, 30),
 ('Mantenimiento','Servicios detenidos',       'Servicios que deberían iniciar solos y no están corriendo',
  'Get-Service | Where-Object {$_.Status -ne ''Running'' -and $_.StartType -eq ''Automatic''} | Format-Table Name, DisplayName, Status -AutoSize',
  'powershell', false, false, 45),
 ('Mantenimiento','Últimos errores del sistema','Los 15 errores más recientes del registro de eventos',
  'Get-WinEvent -FilterHashtable @{LogName=''System''; Level=2} -MaxEvents 15 | Select-Object TimeCreated, ProviderName, Message | Format-List',
  'powershell', false, true, 60),
 ('Mantenimiento','Reiniciar cola de impresión','Reinicia el servicio Spooler: corta los trabajos en curso',
  'Restart-Service -Name Spooler -Force; Get-Service Spooler', 'powershell', true, true, 60)
) as v(cat, nombre, descripcion, script, interprete, destructivo, admin, seg)
join public.categorias_comandos c on c.nombre = v.cat
on conflict (nombre, sistema) do update
  set descripcion = excluded.descripcion, script = excluded.script,
      interprete = excluded.interprete, destructivo = excluded.destructivo,
      requiere_admin = excluded.requiere_admin, timeout_seg = excluded.timeout_seg,
      categoria_id = excluded.categoria_id, activo = true;

-- ---------- macOS ----------
insert into public.comandos
  (categoria_id, nombre, descripcion, sistema, script, interprete, destructivo, requiere_admin, timeout_seg, activo)
select c.id, v.nombre, v.descripcion, 'macos', v.script, 'zsh', false, v.admin, v.seg, true
from (values
 ('Diagnóstico',  'Carpeta actual',            'Muestra en qué ruta está trabajando la sesión', 'pwd', false, 30),
 ('Archivos',     'Listar carpeta',            'Archivos y carpetas con tamaño y fecha',        'ls -lah', false, 30),
 ('Diagnóstico',  'Espacio en disco',          'Unidades montadas con espacio libre',            'df -h', false, 30),
 ('Diagnóstico',  'Información del sistema',   'Modelo, procesador, memoria y versión',          'system_profiler SPSoftwareDataType SPHardwareDataType', false, 60),
 ('Diagnóstico',  'Procesos que más consumen', 'Los 15 procesos con más memoria',                'ps aux | sort -nrk 4 | head -15', false, 30),
 ('Red',          'Configuración de red',      'Direcciones IP de cada interfaz',                'ifconfig | grep -E "^[a-z]|inet "', false, 30),
 ('Red',          'Probar salida a internet',  'Cuatro pings a 8.8.8.8',                         'ping -c 4 8.8.8.8', false, 40),
 ('Mantenimiento','Tiempo encendido',          'Desde cuándo está prendido y carga del sistema', 'uptime', false, 30)
) as v(cat, nombre, descripcion, script, admin, seg)
join public.categorias_comandos c on c.nombre = v.cat
on conflict (nombre, sistema) do update
  set descripcion = excluded.descripcion, script = excluded.script,
      requiere_admin = excluded.requiere_admin, timeout_seg = excluded.timeout_seg,
      categoria_id = excluded.categoria_id, activo = true;

-- Comprobación
select sistema, count(*) as comandos, count(*) filter (where destructivo) as destructivos
  from public.comandos where activo group by sistema order by sistema;

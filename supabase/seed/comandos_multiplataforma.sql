-- =====================================================================
-- Bitlab Terminal · BTL-200: Comandos multiplataforma (no destructivos)
-- Se puede correr varias veces (ON CONFLICT DO UPDATE).
--
-- Estos comandos usan sistema='todos' y tienen variantes JSONB con el
-- script específico para cada SO. El panel selecciona la variante
-- correcta antes de despachar al agente.
--
-- Categorías usadas: Diagnóstico, Red  (creadas en comandos_demo.sql)
-- =====================================================================

-- Asegurar que las categorías base existan
insert into public.categorias_comandos (nombre, color, icono, orden)
values
  ('Diagnóstico', '#00f59b', 'activity',  10),
  ('Red',         '#06b6d4', 'wifi',       20),
  ('Procesos',    '#3b82f6', 'cpu',        30),
  ('Almacenamiento', '#f59e0b', 'hdd',     40)
on conflict (nombre) do update
  set color = excluded.color,
      icono = excluded.icono,
      orden = excluded.orden;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Top 10 procesos (CPU + memoria)
-- ─────────────────────────────────────────────────────────────────────
insert into public.comandos
  (categoria_id, nombre, descripcion, sistema, script, variantes,
   interprete, destructivo, requiere_admin, timeout_seg, activo)
select
  c.id,
  'Top 10 procesos',
  'Los 10 procesos que más CPU y memoria consumen. Funciona en Windows, macOS y Linux.',
  'todos',
  -- script = variante Windows (default / compatibilidad)
  'Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 Id, ProcessName, @{n=''CPU'';e={[math]::Round($_.CPU,2)}}, @{n=''MemMB'';e={[math]::Round($_.WS/1MB)}} | Format-Table -AutoSize',
  -- variantes JSON
  jsonb_build_object(
    'windows',
    'Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 Id, ProcessName, @{n=''CPU'';e={[math]::Round($_.CPU,2)}}, @{n=''MemMB'';e={[math]::Round($_.WS/1MB)}} | Format-Table -AutoSize',
    'macos',
    'ps -A -o user,pid,%cpu,%mem,comm -r | head -11 | awk ''NR==1{print "USER      PID   %CPU  %MEM  COMANDO"} NR>1{printf "%-8s  %-6s  %-5s  %-5s  %s\n", $1,$2,$3,$4,$5}''',
    'linux',
    'ps aux --sort=-%cpu | head -11 | awk ''NR==1{print "USER      PID   %CPU  %MEM  COMANDO"} NR>1{printf "%-8s  %-6s  %-5s  %-5s  %s\n", $1,$2,$3,$4,$11}'''
  ),
  'automatico',
  false, false, 60, true
from public.categorias_comandos c
where c.nombre = 'Procesos'
limit 1
on conflict do nothing;

-- Si ya existía con ese nombre, actualizamos variantes
update public.comandos
set variantes = jsonb_build_object(
    'windows',
    'Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 Id, ProcessName, @{n=''CPU'';e={[math]::Round($_.CPU,2)}}, @{n=''MemMB'';e={[math]::Round($_.WS/1MB)}} | Format-Table -AutoSize',
    'macos',
    'ps -A -o user,pid,%cpu,%mem,comm -r | head -11 | awk ''NR==1{print "USER      PID   %CPU  %MEM  COMANDO"} NR>1{printf "%-8s  %-6s  %-5s  %-5s  %s\n", $1,$2,$3,$4,$5}''',
    'linux',
    'ps aux --sort=-%cpu | head -11 | awk ''NR==1{print "USER      PID   %CPU  %MEM  COMANDO"} NR>1{printf "%-8s  %-6s  %-5s  %-5s  %s\n", $1,$2,$3,$4,$11}'''
  ),
  sistema = 'todos'
where nombre = 'Top 10 procesos' and activo = true;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Espacio en discos
-- ─────────────────────────────────────────────────────────────────────
insert into public.comandos
  (categoria_id, nombre, descripcion, sistema, script, variantes,
   interprete, destructivo, requiere_admin, timeout_seg, activo)
select
  c.id,
  'Espacio en discos',
  'Muestra el uso de espacio en todas las unidades / particiones montadas.',
  'todos',
  'Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{n=''TotalGB'';e={[math]::Round($_.Used/1GB+$_.Free/1GB,1)}}, @{n=''UsadoGB'';e={[math]::Round($_.Used/1GB,1)}}, @{n=''LibreGB'';e={[math]::Round($_.Free/1GB,1)}} | Format-Table -AutoSize',
  jsonb_build_object(
    'windows',
    'Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{n=''TotalGB'';e={[math]::Round($_.Used/1GB+$_.Free/1GB,1)}}, @{n=''UsadoGB'';e={[math]::Round($_.Used/1GB,1)}}, @{n=''LibreGB'';e={[math]::Round($_.Free/1GB,1)}} | Format-Table -AutoSize',
    'macos',
    'df -h | awk ''NR==1{print $0} NR>1 && /^\// {printf "%-20s %6s %6s %6s %5s  %s\n",$1,$2,$3,$4,$5,$9}''',
    'linux',
    'df -h --output=source,size,used,avail,pcent,target | awk ''NR==1{print $0} NR>1 && /^\// {print $0}'''
  ),
  'automatico',
  false, false, 30, true
from public.categorias_comandos c
where c.nombre = 'Almacenamiento'
limit 1
on conflict do nothing;

update public.comandos
set variantes = jsonb_build_object(
    'windows',
    'Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{n=''TotalGB'';e={[math]::Round($_.Used/1GB+$_.Free/1GB,1)}}, @{n=''UsadoGB'';e={[math]::Round($_.Used/1GB,1)}}, @{n=''LibreGB'';e={[math]::Round($_.Free/1GB,1)}} | Format-Table -AutoSize',
    'macos',
    'df -h | awk ''NR==1{print $0} NR>1 && /^\// {printf "%-20s %6s %6s %6s %5s  %s\n",$1,$2,$3,$4,$5,$9}''',
    'linux',
    'df -h --output=source,size,used,avail,pcent,target | awk ''NR==1{print $0} NR>1 && /^\// {print $0}'''
  ),
  sistema = 'todos'
where nombre = 'Espacio en discos' and activo = true;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Uso de memoria RAM
-- ─────────────────────────────────────────────────────────────────────
insert into public.comandos
  (categoria_id, nombre, descripcion, sistema, script, variantes,
   interprete, destructivo, requiere_admin, timeout_seg, activo)
select
  c.id,
  'Uso de memoria RAM',
  'Muestra total, usada y libre de la RAM del sistema.',
  'todos',
  '$os = Get-CimInstance Win32_OperatingSystem; $tot=[math]::Round($os.TotalVisibleMemorySize/1MB,2); $lib=[math]::Round($os.FreePhysicalMemory/1MB,2); $usa=[math]::Round($tot-$lib,2); Write-Host "Total: $tot GB  |  Usada: $usa GB  |  Libre: $lib GB"',
  jsonb_build_object(
    'windows',
    '$os = Get-CimInstance Win32_OperatingSystem; $tot=[math]::Round($os.TotalVisibleMemorySize/1MB,2); $lib=[math]::Round($os.FreePhysicalMemory/1MB,2); $usa=[math]::Round($tot-$lib,2); Write-Host "Total: $tot GB  |  Usada: $usa GB  |  Libre: $lib GB"',
    'macos',
    'python3 -c "
import subprocess, re
vm = subprocess.check_output([''vm_stat''], text=True)
pages = {m.group(1): int(m.group(2)) for m in re.finditer(r''Pages (\w+):\s+(\d+)'', vm)}
page_size = 4096
used = (pages.get(''active'',0) + pages.get(''wired down'',0) + pages.get(''speculative'',0)) * page_size
free = pages.get(''free'',0) * page_size
total = sum(pages.values()) * page_size
print(f''Total: {total/1e9:.2f} GB  |  Usada: {used/1e9:.2f} GB  |  Libre: {free/1e9:.2f} GB'')
"',
    'linux',
    'free -h | awk ''/^Mem:/{printf "Total: %s  |  Usada: %s  |  Libre: %s\n", $2,$3,$4}'''
  ),
  'automatico',
  false, false, 30, true
from public.categorias_comandos c
where c.nombre = 'Diagnóstico'
limit 1
on conflict do nothing;

update public.comandos
set variantes = jsonb_build_object(
    'windows',
    '$os = Get-CimInstance Win32_OperatingSystem; $tot=[math]::Round($os.TotalVisibleMemorySize/1MB,2); $lib=[math]::Round($os.FreePhysicalMemory/1MB,2); $usa=[math]::Round($tot-$lib,2); Write-Host "Total: $tot GB  |  Usada: $usa GB  |  Libre: $lib GB"',
    'macos',
    'python3 -c "
import subprocess, re
vm = subprocess.check_output([''vm_stat''], text=True)
pages = {m.group(1): int(m.group(2)) for m in re.finditer(r''Pages (\w+):\s+(\d+)'', vm)}
page_size = 4096
used = (pages.get(''active'',0) + pages.get(''wired down'',0) + pages.get(''speculative'',0)) * page_size
free = pages.get(''free'',0) * page_size
total = sum(pages.values()) * page_size
print(f''Total: {total/1e9:.2f} GB  |  Usada: {used/1e9:.2f} GB  |  Libre: {free/1e9:.2f} GB'')
"',
    'linux',
    'free -h | awk ''/^Mem:/{printf "Total: %s  |  Usada: %s  |  Libre: %s\n", $2,$3,$4}'''
  ),
  sistema = 'todos'
where nombre = 'Uso de memoria RAM' and activo = true;

-- ─────────────────────────────────────────────────────────────────────
-- 4. Interfaces de red activas
-- ─────────────────────────────────────────────────────────────────────
insert into public.comandos
  (categoria_id, nombre, descripcion, sistema, script, variantes,
   interprete, destructivo, requiere_admin, timeout_seg, activo)
select
  c.id,
  'Interfaces de red activas',
  'Lista adaptadores de red con IP, máscara y estado.',
  'todos',
  'Get-NetIPAddress | Where-Object {$_.AddressFamily -eq ''IPv4'' -and $_.IPAddress -ne ''127.0.0.1''} | Select-Object InterfaceAlias, IPAddress, PrefixLength, @{n=''Estado'';e={(Get-NetAdapter -Name $_.InterfaceAlias -EA SilentlyContinue).Status}} | Format-Table -AutoSize',
  jsonb_build_object(
    'windows',
    'Get-NetIPAddress | Where-Object {$_.AddressFamily -eq ''IPv4'' -and $_.IPAddress -ne ''127.0.0.1''} | Select-Object InterfaceAlias, IPAddress, PrefixLength, @{n=''Estado'';e={(Get-NetAdapter -Name $_.InterfaceAlias -EA SilentlyContinue).Status}} | Format-Table -AutoSize',
    'macos',
    'ifconfig | awk ''/^[a-z]/{iface=$1} /inet [0-9]/ && !/127\.0\.0\.1/{printf "%-15s  %s\n", iface, $2}''',
    'linux',
    'ip -4 addr show | awk ''/^[0-9]+: [^lo]/{iface=$2} /inet /{gsub("/.*",""); printf "%-15s  %s\n", iface, $2}'''
  ),
  'automatico',
  false, false, 30, true
from public.categorias_comandos c
where c.nombre = 'Red'
limit 1
on conflict do nothing;

update public.comandos
set variantes = jsonb_build_object(
    'windows',
    'Get-NetIPAddress | Where-Object {$_.AddressFamily -eq ''IPv4'' -and $_.IPAddress -ne ''127.0.0.1''} | Select-Object InterfaceAlias, IPAddress, PrefixLength, @{n=''Estado'';e={(Get-NetAdapter -Name $_.InterfaceAlias -EA SilentlyContinue).Status}} | Format-Table -AutoSize',
    'macos',
    'ifconfig | awk ''/^[a-z]/{iface=$1} /inet [0-9]/ && !/127\.0\.0\.1/{printf "%-15s  %s\n", iface, $2}''',
    'linux',
    'ip -4 addr show | awk ''/^[0-9]+: [^lo]/{iface=$2} /inet /{gsub("/.*",""); printf "%-15s  %s\n", iface, $2}'''
  ),
  sistema = 'todos'
where nombre = 'Interfaces de red activas' and activo = true;

-- ─────────────────────────────────────────────────────────────────────
-- Resumen
-- ─────────────────────────────────────────────────────────────────────
select nombre, sistema,
       case when variantes is not null then 'SÍ' else 'NO' end as tiene_variantes
from public.comandos
where nombre in ('Top 10 procesos','Espacio en discos','Uso de memoria RAM','Interfaces de red activas')
order by nombre;

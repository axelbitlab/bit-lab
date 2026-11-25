<#
  Bitlab Terminal · Instalador del agente para Windows · v1.1.0

  Qué hace:
    1. Copia el agente y su configuración a C:\ProgramData\BitlabAgente
    2. Deja esa carpeta accesible solo para SYSTEM y Administradores
    3. Crea una tarea programada que arranca el agente con el equipo
    4. Lo enciende y espera a que el equipo quede registrado en el panel

  Se puede volver a correr: actualiza los archivos y conserva la credencial.
  Compatible con Windows PowerShell 5.1, sin instalar nada.
#>
[CmdletBinding()]
param(
  [string]$ClaveRegistro,
  [string]$Destino = (Join-Path $env:ProgramData 'BitlabAgente'),
  [switch]$NoIniciar
)

$ErrorActionPreference = 'Continue'
$NombreTarea = 'BitlabAgente'
$Origen = Split-Path -Parent $MyInvocation.MyCommand.Path
$guardar = $false
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

function Paso($t)  { Write-Host ""; Write-Host "  $t" -ForegroundColor Cyan }
function Bien($t)  { Write-Host "    OK  $t" -ForegroundColor Green }
function Aviso($t) { Write-Host "    !   $t" -ForegroundColor Yellow }
function Mal($t)   { Write-Host "    X   $t" -ForegroundColor Red }

Write-Host ""
Write-Host "  ============================================" -ForegroundColor DarkCyan
Write-Host "   Bitlab Terminal - Agente para Windows" -ForegroundColor White
Write-Host "  ============================================" -ForegroundColor DarkCyan

# ---------- 1. Comprobaciones previas ----------
Paso "1/6  Comprobando el equipo"

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Mal "Hay que ejecutar como administrador. Cierra esta ventana y usa INSTALAR.bat."
  exit 1
}
Bien "Permisos de administrador"

if ($PSVersionTable.PSVersion.Major -lt 5) {
  Mal "Se necesita Windows PowerShell 5.1 o superior (este equipo tiene $($PSVersionTable.PSVersion))."
  exit 2
}
Bien "PowerShell $($PSVersionTable.PSVersion)"

$rutaAgente = Join-Path $Origen 'agente.ps1'
$rutaConfig = Join-Path $Origen 'config.json'
foreach ($f in @($rutaAgente, $rutaConfig)) {
  if (-not (Test-Path $f)) {
    Mal "Falta $(Split-Path -Leaf $f) junto al instalador. Descomprime el ZIP completo antes de instalar."
    exit 3
  }
}
Bien "Archivos del paquete completos"

# ---------- 2. Configuración ----------
Paso "2/6  Revisando la configuracion"

try { $cfg = Get-Content $rutaConfig -Raw -Encoding UTF8 | ConvertFrom-Json }
catch { Mal "config.json no es un JSON valido: $($_.Exception.Message)"; exit 4 }

if ($ClaveRegistro) { $cfg | Add-Member -NotePropertyName clave_registro -NotePropertyValue $ClaveRegistro -Force }

$url   = [string]$cfg.supabase_url
$llave = [string]$cfg.publishable_key
$clave = [string]$cfg.clave_registro

if ($url -notmatch '^https://') { Mal "supabase_url debe empezar con https://"; exit 4 }
if ([string]::IsNullOrWhiteSpace($llave)) {
  Mal "Falta publishable_key en config.json"; exit 4
}
if ([string]::IsNullOrWhiteSpace($clave) -or $clave -notlike 'BTL-*') {
  Aviso "config.json no trae la clave de registro"
  Write-Host ""
  Write-Host "    La clave la entrega el administrador. Se ve asi: BTL-a1b2c3..." -ForegroundColor Yellow
  Write-Host "    Para no tener que escribirla en cada equipo, ponla una sola vez" -ForegroundColor DarkGray
  Write-Host "    dentro de config.json antes de repartir el paquete." -ForegroundColor DarkGray
  Write-Host ""
  $clave = (Read-Host "    Pega la clave de registro y presiona Enter").Trim()
  if ([string]::IsNullOrWhiteSpace($clave) -or $clave -notlike 'BTL-*') {
    Mal "Sin una clave valida no se puede registrar el equipo."
    Write-Host ""
    Write-Host "    El administrador la genera en el editor SQL de Supabase con:" -ForegroundColor DarkGray
    Write-Host "      select crear_clave_registro(" -ForegroundColor DarkGray
    Write-Host "        (select id from organizaciones limit 1)," -ForegroundColor DarkGray
    Write-Host "        'Instalador Windows', 50, 90);" -ForegroundColor DarkGray
    exit 4
  }
  $cfg | Add-Member -NotePropertyName clave_registro -NotePropertyValue $clave -Force
  $guardar = $true
}
Bien "Proyecto: $url"
Bien "Clave de registro presente"

# conectividad
try {
  $prueba = Invoke-WebRequest -Uri "$url/rest/v1/" -Headers @{ apikey = $llave } -TimeoutSec 15 -UseBasicParsing
  Bien "El servidor responde (HTTP $($prueba.StatusCode))"
} catch {
  $codigo = $null
  try { $codigo = [int]$_.Exception.Response.StatusCode } catch {}
  if ($codigo) { Bien "El servidor responde (HTTP $codigo)" }
  else { Aviso "No se pudo contactar al servidor ahora. La instalacion sigue; el agente reintentara solo." }
}

# ---------- 3. Copiar archivos ----------
Paso "3/6  Instalando en $Destino"

try {
  foreach ($d in @($Destino, (Join-Path $Destino 'logs'), (Join-Path $Destino 'tmp'))) {
    if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
  }
  Bien "Carpetas creadas"
} catch {
  Mal "No se pudieron crear las carpetas: $($_.Exception.Message)"
  exit -1
}

# detener agente previo si existe
$tareaPrevia = $null
try { $tareaPrevia = Get-ScheduledTask -TaskName $NombreTarea -ErrorAction SilentlyContinue } catch {}
if ($tareaPrevia) {
  try { Stop-ScheduledTask -TaskName $NombreTarea -ErrorAction SilentlyContinue } catch {}
  Start-Sleep -Seconds 1
  Aviso "Habia una instalacion previa: se actualiza"
}

# matar TODOS los procesos de powershell que tengan BitlabAgente en su línea de comando
# Se usa wmic porque funciona en PS 5.1 y puede matar procesos de SYSTEM
try {
  $wmiProcs = Get-WmiObject Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue
  foreach ($wp in $wmiProcs) {
    if ($wp.CommandLine -like '*BitlabAgente*' -and $wp.ProcessId -ne $PID) {
      & taskkill.exe /PID $wp.ProcessId /T /F 2>&1 | Out-Null
    }
  }
} catch {}
Start-Sleep -Seconds 3

# tomar posesión y abrir permisos de la carpeta anterior
if (Test-Path $Destino) {
  & takeown.exe /F $Destino /R /A /D S 2>&1 | Out-Null
  & icacls.exe $Destino '/grant' "*S-1-5-32-544:(OI)(CI)F" '/T' '/C' '/Q' 2>&1 | Out-Null
  Bien "Permisos de carpeta anterior recuperados"
}

# copiar agente.ps1 — si falla por bloqueo, renombrar el viejo y poner el nuevo
$destAgente = Join-Path $Destino 'agente.ps1'
try {
  Copy-Item $rutaAgente $destAgente -Force
  Bien "agente.ps1 copiado"
} catch {
  # plan B: renombrar el archivo bloqueado y copiar el nuevo
  try {
    $viejo = Join-Path $Destino 'agente.ps1.viejo'
    if (Test-Path $viejo) { Remove-Item $viejo -Force -ErrorAction SilentlyContinue }
    Rename-Item $destAgente $viejo -Force -ErrorAction Stop
    Copy-Item $rutaAgente $destAgente -Force
    Bien "agente.ps1 copiado (se renombro el anterior)"
  } catch {
    Mal "No se pudo copiar agente.ps1: $($_.Exception.Message)"
    Write-Host ""
    Write-Host "    El archivo esta bloqueado por otro proceso." -ForegroundColor DarkGray
    Write-Host "    Abre el Administrador de tareas, busca 'powershell' en Detalles," -ForegroundColor DarkGray
    Write-Host "    termina los que digan BitlabAgente, y vuelve a correr INSTALAR.bat." -ForegroundColor DarkGray
    exit -1
  }
}

# config.json: guardar la clave si se escribió manualmente
$destinoConfig = Join-Path $Destino 'config.json'
try {
  if ($guardar) {
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($destinoConfig, ($cfg | ConvertTo-Json -Depth 6), $utf8)
  } else {
    Copy-Item $rutaConfig $destinoConfig -Force
  }
  Bien "config.json copiado"
} catch {
  Mal "No se pudo copiar config.json: $($_.Exception.Message)"
  exit -1
}

if (Test-Path (Join-Path $Destino 'credencial.json')) { Bien "credencial.json existente conservada" }

# ---------- 4. Permisos ----------
Paso "4/6  Cerrando permisos de la carpeta"
try {
  $r = & icacls.exe $Destino '/inheritance:r' '/grant:r' '*S-1-5-18:(OI)(CI)F' '/grant:r' '*S-1-5-32-544:(OI)(CI)F' '/T' '/C' 2>&1
  if ($LASTEXITCODE -eq 0) {
    Bien "Solo SYSTEM y Administradores tienen acceso"
  } else {
    Aviso "icacls terminó con código $LASTEXITCODE"
  }
} catch {
  Aviso "No se pudieron ajustar los permisos: $($_.Exception.Message)"
}

# ---------- 5. Tarea programada ----------
Paso "5/6  Programando el arranque automatico"

if ($tareaPrevia) {
  try { Unregister-ScheduledTask -TaskName $NombreTarea -Confirm:$false -ErrorAction SilentlyContinue } catch {}
}

try {
  $ps     = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $accion = New-ScheduledTaskAction -Execute $ps `
              -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Destino\agente.ps1`"" `
              -WorkingDirectory $Destino

  $disparadores = @(New-ScheduledTaskTrigger -AtStartup)

  $cuenta = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

  $opciones = New-ScheduledTaskSettingsSet `
                -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
                -StartWhenAvailable -DontStopOnIdleEnd `
                -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
                -ExecutionTimeLimit (New-TimeSpan -Seconds 0) `
                -MultipleInstances IgnoreNew

  Register-ScheduledTask -TaskName $NombreTarea -Action $accion -Trigger $disparadores `
    -Principal $cuenta -Settings $opciones `
    -Description 'Agente de monitoreo y terminal remota de Bitlab-IT' | Out-Null
  Bien "Tarea '$NombreTarea' creada (arranca con el equipo, como SYSTEM)"
} catch {
  Mal "No se pudo crear la tarea programada: $($_.Exception.Message)"
  Write-Host ""
  Write-Host "    Intenta cerrar cualquier otra ventana del Programador de Tareas" -ForegroundColor DarkGray
  Write-Host "    y vuelve a correr INSTALAR.bat como administrador." -ForegroundColor DarkGray
  exit -1
}

if ($NoIniciar) {
  Aviso "No se inicio el agente porque se pidio -NoIniciar"
  exit 0
}

try {
  Start-ScheduledTask -TaskName $NombreTarea
  Bien "Agente iniciado"
} catch {
  Aviso "No se pudo iniciar la tarea ahora: $($_.Exception.Message)"
  Write-Host "    El agente arrancara solo en el proximo reinicio." -ForegroundColor DarkGray
}

# ---------- 6. Verificación ----------
Paso "6/6  Esperando a que el equipo se registre"

$rutaCred = Join-Path $Destino 'credencial.json'
$rutaLog  = Join-Path $Destino 'logs\agente.log'
$limite   = (Get-Date).AddSeconds(60)
$ok       = $false

while ((Get-Date) -lt $limite) {
  Start-Sleep -Seconds 3
  if (Test-Path $rutaCred) { $ok = $true; break }
  if (Test-Path $rutaLog) {
    $ultimas = @()
    try { $ultimas = @(Get-Content $rutaLog -Tail 6 -ErrorAction SilentlyContinue) } catch {}
    $fallo = $ultimas | Where-Object { $_ -match 'Clave de registro inv|ERROR' } | Select-Object -Last 1
    if ($fallo) { Mal ($fallo -replace '^\S+ \S+ ', ''); break }
  }
  Write-Host "    ..." -NoNewline -ForegroundColor DarkGray
}
Write-Host ""

if ($ok) {
  try {
    $cred = Get-Content $rutaCred -Raw -Encoding UTF8 | ConvertFrom-Json
    Bien "Equipo registrado como $env:COMPUTERNAME"
    Bien "Identificador: $($cred.dispositivo_id)"
  } catch {
    Bien "Equipo registrado como $env:COMPUTERNAME"
  }
  Write-Host ""
  Write-Host "    El equipo ya aparece en el panel y acepta comandos." -ForegroundColor Green
  Write-Host "    Registro local: $rutaLog" -ForegroundColor DarkGray
  exit 0
}

Mal "El equipo no se registro en 60 segundos"
Write-Host ""
Write-Host "    Causas mas comunes:" -ForegroundColor Yellow
Write-Host "      - La clave de registro ya se uso el maximo de veces o vencio" -ForegroundColor DarkGray
Write-Host "      - No hay salida a internet hacia $url" -ForegroundColor DarkGray
Write-Host "      - El reloj del equipo esta desfasado (prueba: w32tm /resync)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "    Detalle en: $rutaLog" -ForegroundColor DarkGray
if (Test-Path $rutaLog) {
  Write-Host ""
  try {
    Get-Content $rutaLog -Tail 12 | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray }
  } catch {}
}
exit 5

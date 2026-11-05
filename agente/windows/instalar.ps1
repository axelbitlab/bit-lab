<#
  Bitlab Terminal · Instalador del agente para Windows · v1.0.0
  BTL-28 (arranque automático) · BTL-29 (instalador)

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
  [string]$ClaveRegistro,                     # opcional: si no, se lee de config.json
  [string]$Destino = (Join-Path $env:ProgramData 'BitlabAgente'),
  [switch]$NoIniciar
)

$ErrorActionPreference = 'Stop'

# Cualquier error no previsto se explica en pantalla en vez de cerrar la ventana
# con un codigo pelado que no le dice nada a quien instala.
trap {
  Write-Host ""
  Write-Host "    X   Se interrumpio la instalacion" -ForegroundColor Red
  Write-Host "        $($_.Exception.Message)" -ForegroundColor Red
  if ($_.InvocationInfo -and $_.InvocationInfo.Line) {
    Write-Host "        linea $($_.InvocationInfo.ScriptLineNumber): $($_.InvocationInfo.Line.ToString().Trim())" -ForegroundColor DarkGray
  }
  Write-Host ""
  Write-Host "    Manda esta pantalla a quien te dio el instalador." -ForegroundColor Yellow
  Write-Host ""
  exit 90
}

$NombreTarea = 'BitlabAgente'
$Origen = Split-Path -Parent $MyInvocation.MyCommand.Path
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
if ([string]::IsNullOrWhiteSpace($llave) -or $llave -like '*...*') {
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
  # se guarda en el archivo que se copia al destino, no en el del paquete
  $guardar = $true
}
Bien "Proyecto: $url"
Bien "Clave de registro presente"

# conectividad: si no hay salida, mejor avisar ahora que fallar en silencio
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

foreach ($d in @($Destino, (Join-Path $Destino 'logs'), (Join-Path $Destino 'tmp'))) {
  if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
}

# Detener cualquier tarea previa de forma forzada para liberar el archivo agente.ps1
try { & schtasks.exe /end /tn $NombreTarea 2>$null | Out-Null } catch {}
$tareaPrevia = try { Get-ScheduledTask -TaskName $NombreTarea -ErrorAction Stop } catch { $null }
if ($tareaPrevia) {
  try { Stop-ScheduledTask -TaskName $NombreTarea -ErrorAction SilentlyContinue } catch {}
  Aviso "Habia una instalacion previa: se actualiza"
}
Start-Sleep -Seconds 2

# Tomar posesión y permisos por si estaban restringidos por SYSTEM en la carpeta de destino
try {
  & takeown.exe /f $Destino /r /d y 2>$null | Out-Null
  & icacls.exe $Destino /grant "*S-1-5-32-544:(OI)(CI)F" /T /C /Q 2>$null | Out-Null
} catch {}

# Se cierra cualquier proceso powershell huérfano que tenga cargado agente.ps1
$miPid = $PID
$padrePid = try { (Get-CimInstance Win32_Process -Filter "ProcessId=$PID" -ErrorAction Stop).ParentProcessId } catch { $null }
$marcaAgente = (Join-Path $Destino 'agente.ps1')
Get-Process -Name powershell, pwsh -ErrorAction SilentlyContinue |
  Where-Object { $_.Id -ne $miPid -and ($null -eq $padrePid -or $_.Id -ne $padrePid) } |
  ForEach-Object {
    $procId = $_.Id
    $cmd = try { (Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction Stop).CommandLine } catch { $null }
    if ($cmd -and ($cmd -like "*$marcaAgente*" -or $cmd -like "*\agente.ps1*" -or $cmd -like "* .\agente.ps1*")) {
      try { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue; Aviso "Se cerro un agente que seguia corriendo (PID $procId)" } catch {}
    }
  }

# Copiar agente.ps1 con reintentos para evitar bloqueos temporales de Windows
$destinoAgente = Join-Path $Destino 'agente.ps1'
$copiado = $false
for ($intento = 1; $intento -le 5; $intento++) {
  try {
    if (Test-Path $destinoAgente) {
      & icacls.exe $destinoAgente /grant "*S-1-5-32-544:F" 2>$null | Out-Null
      Remove-Item $destinoAgente -Force -ErrorAction Stop
    }
    Copy-Item $rutaAgente $destinoAgente -Force -ErrorAction Stop
    $copiado = $true
    break
  } catch {
    Start-Sleep -Seconds 1
  }
}
if (-not $copiado) {
  Copy-Item $rutaAgente $destinoAgente -Force
}
Bien "agente.ps1"

# la credencial no se toca: si el equipo ya estaba registrado, conserva su token
$destinoConfig = Join-Path $Destino 'config.json'
if ($guardar) {
  # la clave se escribio a mano: se guarda en el destino, no en el paquete
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($destinoConfig, ($cfg | ConvertTo-Json -Depth 6), $utf8)
} else {
  # Liberar config.json si esta bloqueado por instalacion previa (SYSTEM lock)
  if (Test-Path $destinoConfig) {
    try { & icacls.exe $destinoConfig /grant "*S-1-5-32-544:F" /Q 2>$null | Out-Null } catch {}
    try { Remove-Item $destinoConfig -Force -ErrorAction SilentlyContinue } catch {}
  }
  $copiadoCfg = $false
  for ($i = 1; $i -le 5; $i++) {
    try { Copy-Item $rutaConfig $destinoConfig -Force -ErrorAction Stop; $copiadoCfg = $true; break }
    catch { Start-Sleep -Seconds 1 }
  }
  if (-not $copiadoCfg) { Copy-Item $rutaConfig $destinoConfig -Force }
}
Bien "config.json"
if (Test-Path (Join-Path $Destino 'credencial.json')) { Bien "credencial.json existente conservada" }

# ---------- 4. Permisos ----------
Paso "4/6  Cerrando permisos de la carpeta"
try {
  & icacls.exe $Destino '/inheritance:r' '/grant:r' '*S-1-5-18:(OI)(CI)F' '/grant:r' '*S-1-5-32-544:(OI)(CI)F' '/T' '/C' | Out-Null
  Bien "Solo SYSTEM y Administradores tienen acceso"
} catch {
  Aviso "No se pudieron ajustar los permisos: $($_.Exception.Message)"
}

# ---------- 5. Tarea programada (BTL-28) ----------
Paso "5/6  Programando el arranque automatico"

try {
  Unregister-ScheduledTask -TaskName $NombreTarea -Confirm:$false -ErrorAction Stop
} catch {}

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

if ($NoIniciar) {
  Aviso "No se inicio el agente porque se pidio -NoIniciar"
  exit 0
}

try {
  Start-ScheduledTask -TaskName $NombreTarea -ErrorAction Stop
  Bien "Agente iniciado"
} catch {
  Aviso "Iniciando proceso del agente directamente..."
  Start-Process -FilePath $ps -ArgumentList "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Destino\agente.ps1`"" -WorkingDirectory $Destino
  Bien "Agente iniciado"
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
    $ultimas = Get-Content $rutaLog -Tail 6 -ErrorAction SilentlyContinue
    $fallo = $ultimas | Where-Object { $_ -match 'Clave de registro inv|ERROR' } | Select-Object -Last 1
    if ($fallo) { Mal ($fallo -replace '^\S+ \S+ ', ''); break }
  }
  Write-Host "    ..." -NoNewline -ForegroundColor DarkGray
}
Write-Host ""

if ($ok) {
  $cred = Get-Content $rutaCred -Raw -Encoding UTF8 | ConvertFrom-Json
  Bien "Equipo registrado como $env:COMPUTERNAME"
  Bien "Identificador: $($cred.dispositivo_id)"
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
  Get-Content $rutaLog -Tail 12 | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray }
}
exit 5

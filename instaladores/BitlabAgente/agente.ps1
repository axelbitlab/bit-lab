<#
  Bitlab Terminal · Agente de endpoint para Windows · v1.0.0
  Épica 2 · BTL-23 (métricas), BTL-25 (ejecutor), BTL-26 (tiempo máximo, cancelación, simulación),
            BTL-27 (reintentos con espera exponencial)

  Qué hace:
    1. Si el equipo no está registrado, se registra solo con la clave del instalador.
    2. Cada 30 s manda un latido con métricas (CPU, memoria, discos, procesos).
    3. Cada 2 s pregunta si hay una orden; la ejecuta en PowerShell o cmd y manda la salida en vivo.
    4. Respeta el tiempo máximo, la cancelación desde el panel y el modo simulación.
  Seguridad:
    - Cada llamada va firmada con HMAC-SHA256 (llave = sha256 del token), marca de tiempo y número único.
    - Verifica la firma del servidor en cada orden antes de ejecutarla.
    - El token vive en credencial.json con permisos solo para SYSTEM y Administradores.
    - El token nunca se escribe en el registro (log).
  Compatible con Windows PowerShell 5.1 (sin instalar nada).
#>
[CmdletBinding()]
param([switch]$UnaVez)   # -UnaVez: hace un ciclo y termina (para pruebas)

$ErrorActionPreference = 'Stop'
$VersionAgente = '1.0.0'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

$EsWindows = ($env:OS -eq 'Windows_NT')

# ---------- rutas: instalado (ProgramData) o en modo prueba (junto al script) ----------
$DirInstalado = if ($EsWindows) { Join-Path $env:ProgramData 'BitlabAgente' } else { '/nonexistent' }
if (Test-Path (Join-Path $DirInstalado 'config.json')) { $DirDatos = $DirInstalado }
else { $DirDatos = $PSScriptRoot }
$RutaConfig     = if (Test-Path (Join-Path $DirDatos 'config.json')) { Join-Path $DirDatos 'config.json' } else { Join-Path $DirDatos 'agente.config.json' }
$RutaCredencial = Join-Path $DirDatos 'credencial.json'
$DirLogs        = Join-Path $DirDatos 'logs'
$DirTmp         = Join-Path $DirDatos 'tmp'
foreach ($d in @($DirLogs, $DirTmp)) { if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null } }

# ---------- registro local (rota a 1 MB, conserva 3) ----------
function Write-Log([string]$Mensaje, [string]$Nivel = 'INFO') {
    $linea = '{0:yyyy-MM-dd HH:mm:ss} [{1}] {2}' -f (Get-Date), $Nivel, $Mensaje
    try {
        $ruta = Join-Path $DirLogs 'agente.log'
        if ((Test-Path $ruta) -and ((Get-Item $ruta).Length -gt 1MB)) {
            for ($i = 2; $i -ge 1; $i--) {
                $a = Join-Path $DirLogs "agente.$i.log"
                if (Test-Path $a) { Move-Item $a (Join-Path $DirLogs ("agente.{0}.log" -f ($i + 1))) -Force }
            }
            Move-Item $ruta (Join-Path $DirLogs 'agente.1.log') -Force
        }
        Add-Content -Path $ruta -Value $linea -Encoding UTF8
    } catch {}
    Write-Host $linea
}

# ---------- permisos: solo SYSTEM y Administradores (y el usuario actual en modo prueba) ----------
function Protect-Archivo([string]$Ruta) {
    if (-not $EsWindows) { return }
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    $argsIcacls = @($Ruta, '/inheritance:r', '/grant:r', '*S-1-5-18:F', '/grant:r', '*S-1-5-32-544:F')
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        $argsIcacls += @('/grant:r', ('*{0}:F' -f [Security.Principal.WindowsIdentity]::GetCurrent().User.Value))
    }
    & icacls.exe @argsIcacls | Out-Null
}

# ---------- configuración ----------
if (-not (Test-Path $RutaConfig)) { Write-Log "Falta la configuración ($RutaConfig)" 'ERROR'; exit 2 }
$Config = Get-Content $RutaConfig -Raw -Encoding UTF8 | ConvertFrom-Json
$Base   = ([string]$Config.supabase_url).TrimEnd('/')
$Llave  = [string]$Config.publishable_key
if ($Base -notmatch '^https://' -and $Base -notmatch '^http://127\.0\.0\.1') { Write-Log 'La URL de Supabase debe usar https' 'ERROR'; exit 2 }

# ---------- utilidades criptográficas ----------
$Utf8 = New-Object System.Text.UTF8Encoding($false)
function Get-Sha256Hex([string]$Texto) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return (-join ($sha.ComputeHash($Utf8.GetBytes($Texto)) | ForEach-Object { $_.ToString('x2') })) } finally { $sha.Dispose() }
}
function Get-HmacHex([string]$LlaveHex, [string]$Mensaje) {
    $h = New-Object Security.Cryptography.HMACSHA256 (, $Utf8.GetBytes($LlaveHex))
    try { return (-join ($h.ComputeHash($Utf8.GetBytes($Mensaje)) | ForEach-Object { $_.ToString('x2') })) } finally { $h.Dispose() }
}
function Test-IgualSeguro([string]$A, [string]$B) {   # comparación en tiempo constante
    if ($null -eq $A -or $null -eq $B -or $A.Length -ne $B.Length) { return $false }
    $r = 0; for ($i = 0; $i -lt $A.Length; $i++) { $r = $r -bor ([int][char]$A[$i] -bxor [int][char]$B[$i]) }
    return ($r -eq 0)
}

# ---------- HTTP ----------
class ErrorServidor : System.Exception {
    [int]$Codigo
    ErrorServidor([string]$m, [int]$c) : base($m) { $this.Codigo = $c }
}
function Invoke-Rpc([string]$Funcion, [hashtable]$Cuerpo) {
    $json  = ConvertTo-Json -InputObject $Cuerpo -Depth 8 -Compress
    $bytes = $Utf8.GetBytes($json)
    try {
        return Invoke-RestMethod -Method Post -Uri "$Base/rest/v1/rpc/$Funcion" -Body $bytes `
            -ContentType 'application/json; charset=utf-8' -Headers @{ apikey = $Llave } -TimeoutSec 30
    } catch {
        $resp = $_.Exception.Response
        if ($null -ne $resp) {
            $msg = $_.ErrorDetails.Message
            if (-not $msg) { try { $msg = (New-Object IO.StreamReader($resp.GetResponseStream())).ReadToEnd() } catch {} }
            try { $msg = (ConvertFrom-Json $msg).message } catch {}
            throw [ErrorServidor]::new([string]$msg, [int]$resp.StatusCode)
        }
        throw   # error de red: lo maneja el reintento
    }
}

# ---------- credencial ----------
$Script:Cred = $null
function Read-Credencial {
    if (Test-Path $RutaCredencial) {
        try { $Script:Cred = Get-Content $RutaCredencial -Raw -Encoding UTF8 | ConvertFrom-Json } catch { $Script:Cred = $null }
    }
}
function Save-Credencial([string]$DispositivoId, [string]$Token) {
    $obj = [ordered]@{ dispositivo_id = $DispositivoId; token = $Token }
    $tmp = "$RutaCredencial.tmp"
    [IO.File]::WriteAllText($tmp, (ConvertTo-Json $obj -Compress), $Utf8)
    Move-Item $tmp $RutaCredencial -Force
    Protect-Archivo $RutaCredencial
    $Script:Cred = [pscustomobject]$obj
}
function Get-LlaveFirma { return (Get-Sha256Hex ([string]$Script:Cred.token)) }

# ---------- datos del equipo ----------
function Get-DatosEquipo {
    $datos = [ordered]@{
        nombre = $env:COMPUTERNAME; sistema = 'windows'; version_agente = $VersionAgente
        interpretes = @('powershell', 'cmd'); ip_local = $null; usuario_so = $null; version_so = $null; arquitectura = $null
    }
    if (-not $EsWindows) { $datos.nombre = [Environment]::MachineName; return $datos }
    try {
        $os = Get-CimInstance Win32_OperatingSystem
        $datos.version_so   = '{0} ({1})' -f $os.Caption, $os.Version
        $datos.arquitectura = $os.OSArchitecture
        $datos.usuario_so   = (Get-CimInstance Win32_ComputerSystem).UserName
        $ip = Get-CimInstance Win32_NetworkAdapterConfiguration -Filter 'IPEnabled = TRUE' |
              Where-Object { $_.DefaultIPGateway } | Select-Object -First 1
        if ($ip) { $datos.ip_local = @($ip.IPAddress | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' })[0] }
    } catch { Write-Log "No se pudieron leer datos del equipo: $($_.Exception.Message)" 'WARN' }
    if (Get-Command pwsh.exe -ErrorAction SilentlyContinue) { $datos.interpretes += 'pwsh' }
    return $datos
}

function Get-Metricas {   # BTL-23
    if (-not $EsWindows) { return @{ cpu_pct = 0 } }
    $m = [ordered]@{}
    try {
        $m.cpu_pct = [math]::Round(((Get-CimInstance Win32_Processor | Measure-Object LoadPercentage -Average).Average), 1)
        $os = Get-CimInstance Win32_OperatingSystem
        $m.memoria_total_mb  = [math]::Round($os.TotalVisibleMemorySize / 1KB)
        $m.memoria_usada_pct = [math]::Round((1 - $os.FreePhysicalMemory / $os.TotalVisibleMemorySize) * 100, 1)
        $m.tiempo_encendido_seg = [int]((Get-Date) - $os.LastBootUpTime).TotalSeconds
        $m.discos = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType = 3' | ForEach-Object {
            [ordered]@{ unidad = $_.DeviceID; total_gb = [math]::Round($_.Size / 1GB, 1); libre_gb = [math]::Round($_.FreeSpace / 1GB, 1)
                        libre_pct = if ($_.Size) { [math]::Round($_.FreeSpace / $_.Size * 100, 1) } else { 0 } } })
        $m.procesos_top = @(Get-Process | Sort-Object WS -Descending | Select-Object -First 5 | ForEach-Object {
            [ordered]@{ pid = $_.Id; nombre = $_.ProcessName; memoria_mb = [math]::Round($_.WS / 1MB); responde = [bool]$_.Responding } })
    } catch { Write-Log "Métricas incompletas: $($_.Exception.Message)" 'WARN' }
    return $m
}

# ---------- registro automático ----------
function Register-Equipo {
    $clave = [string]$Config.clave_registro
    if (-not $clave) { throw 'Falta clave_registro en la configuración' }
    $datos = Get-DatosEquipo
    $r = Invoke-Rpc 'agente_registrar' @{ p_clave = $clave; p_equipo = $datos }
    Save-Credencial ([string]$r.dispositivo_id) ([string]$r.token)
    Write-Log ("Equipo registrado como {0} ({1})" -f $datos.nombre, $r.dispositivo_id)
}

# ---------- llamada firmada ----------
function Invoke-Agente([string]$Accion, $Cuerpo) {
    $texto = if ($null -eq $Cuerpo) { '{}' } else { ConvertTo-Json -InputObject $Cuerpo -Depth 8 -Compress }
    $ts    = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $nonce = [guid]::NewGuid().ToString('N')
    $firma = Get-HmacHex (Get-LlaveFirma) ("{0}|{1}|{2}|{3}" -f $Accion, $ts, $nonce, $texto)
    return Invoke-Rpc 'agente_rpc' @{ p_dispositivo = $Script:Cred.dispositivo_id; p_ts = $ts; p_nonce = $nonce
                                      p_firma = $firma; p_accion = $Accion; p_cuerpo = $texto }
}

function Send-Latido {
    $datos = Get-DatosEquipo
    $datos['metricas'] = Get-Metricas
    $r = Invoke-Agente 'latido' $datos
    if ($r.rotar_token) {
        $n = Invoke-Agente 'rotar' @{}
        Save-Credencial $Script:Cred.dispositivo_id ([string]$n.token)
        Write-Log 'Token rotado a petición del administrador'
    }
}

# ---------- ejecución de una orden (BTL-25, BTL-26) ----------
function Invoke-Orden($Orden) {
    $id = [int64]$Orden.id
    $script:seq = 0
    $script:buffer = New-Object System.Collections.Generic.List[object]
    $inicio = Get-Date

    $script:lineasError = 0
    function Add-Linea([string]$Flujo, [string]$Texto) {
        $Texto = $Texto -replace "\x1B\[[0-9;?]*[A-Za-z]", ''   # sin códigos de color
        if ($Flujo -eq 'stderr' -and $Texto.Trim()) { $script:lineasError++ }
        $script:seq++
        $script:buffer.Add([ordered]@{ s = $script:seq; f = $Flujo; t = $Texto })
    }
    function Send-Salida {   # devuelve $true si el panel pidió cancelar
        if ($script:buffer.Count -eq 0) { $r = Invoke-Agente 'salida' @{ ejecucion_id = $id; lineas = @() } }
        else {
            $lote = $script:buffer.GetRange(0, [math]::Min(500, $script:buffer.Count)).ToArray()
            $r = Invoke-Agente 'salida' @{ ejecucion_id = $id; lineas = $lote }
            $script:buffer.RemoveRange(0, $lote.Count)
        }
        return [bool]$r.cancelar
    }
    function Complete-Orden([string]$Estado, $Codigo, [string]$MensajeError) {
        $intentos = 0
        while ($true) {
            try {
                while ($script:buffer.Count -gt 0) { [void](Send-Salida) }
                [void](Invoke-Agente 'finalizar' @{ ejecucion_id = $id; estado = $Estado; codigo = $Codigo
                                                    duracion_ms = [int]((Get-Date) - $inicio).TotalMilliseconds; error = $MensajeError })
                break
            } catch [ErrorServidor] { Write-Log "No se pudo finalizar #${id}: $($_.Exception.Message)" 'WARN'; break }
            catch {
                $intentos++; if ($intentos -gt 8) { Write-Log "Se perdió el cierre de #$id" 'ERROR'; break }
                Start-Sleep -Seconds ([math]::Min(60, [math]::Pow(2, $intentos)))
            }
        }
        Write-Log "Ejecución #$id terminada: $Estado (código $Codigo)"
    }

    # 1. la orden debe venir firmada por el servidor
    $esperada = Get-HmacHex (Get-LlaveFirma) ("{0}|{1}" -f $id, [string]$Orden.script)
    if (-not (Test-IgualSeguro $esperada ([string]$Orden.firma))) {
        Write-Log "Orden #$id rechazada: la firma del servidor no coincide" 'ERROR'
        Add-Linea 'sistema' 'Orden rechazada por el agente: firma no válida'
        Complete-Orden 'fallida' 1 'Firma de la orden no válida'
        return
    }

    $interprete = [string]$Orden.interprete
    $timeout = [int]$Orden.timeout_seg; if ($timeout -le 0) { $timeout = 120 }
    Write-Log "Ejecución #$id ($interprete, máx. ${timeout}s, simulación=$($Orden.simulacion))"

    # 2. simulación: no se ejecuta nada
    if ($Orden.simulacion) {
        Add-Linea 'sistema' "[simulación] Intérprete: $interprete · tiempo máximo: $timeout s"
        Add-Linea 'sistema' '[simulación] Se ejecutaría el siguiente comando, sin aplicar cambios:'
        foreach ($l in ([string]$Orden.script -split "`r?`n")) { Add-Linea 'stdout' $l }
        Complete-Orden 'exitosa' 0 $null
        return
    }

    # 3. ejecución real en un proceso aparte, con salida a archivos que se leen en vivo
    $out = Join-Path $DirTmp "ejec_$id.out"; $err = Join-Path $DirTmp "ejec_$id.err"
    Remove-Item $out, $err -ErrorAction SilentlyContinue
    if ($interprete -eq 'cmd') {
        $exe = Join-Path $env:SystemRoot 'System32\cmd.exe'
        $argumentos = '/d /s /c "chcp 65001>nul & ' + [string]$Orden.script + '"'
    } else {
        $exe = if ($interprete -eq 'pwsh' -and (Get-Command pwsh.exe -ErrorAction SilentlyContinue)) { 'pwsh.exe' }
               elseif ($EsWindows) { Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe' }
               else { 'pwsh' }
        # Se ejecuta como archivo .ps1 temporal (con BOM para PowerShell 5.1) para que los errores salgan como texto
        $rutaPs1 = Join-Path $DirTmp "ejec_$id.ps1"
        $envoltura = @(
            'try { chcp.com 65001 > $null } catch {}'
            '[Console]::OutputEncoding = [Text.Encoding]::UTF8'
            '$ProgressPreference = "SilentlyContinue"; $ErrorActionPreference = "Continue"'
            'if ($PSStyle) { $PSStyle.OutputRendering = "PlainText" }'
            '& {'
            [string]$Orden.script
            '}'
            '$__ok = $?'
            'if ($LASTEXITCODE) { exit $LASTEXITCODE }'
            'if (-not $__ok) { exit 1 }'
            'exit 0'
        ) -join "`r`n"
        [IO.File]::WriteAllText($rutaPs1, $envoltura, (New-Object System.Text.UTF8Encoding($true)))
        $argumentos = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$rutaPs1`""
    }

    Add-Linea 'sistema' ("Ejecutando en {0} · {1}" -f $interprete, $(if ($EsWindows) { $env:COMPUTERNAME } else { [Environment]::MachineName }))
    try {
        $p = Start-Process -FilePath $exe -ArgumentList $argumentos -NoNewWindow -PassThru `
                           -RedirectStandardOutput $out -RedirectStandardError $err
        $null = $p.Handle   # necesario para leer ExitCode después
    } catch {
        Add-Linea 'stderr' "No se pudo iniciar el intérprete: $($_.Exception.Message)"
        Complete-Orden 'fallida' 1 'No se pudo iniciar el intérprete'
        return
    }

    $lectores = @{}
    foreach ($par in @(@('stdout', $out), @('stderr', $err))) {
        $lectores[$par[0]] = @{ ruta = $par[1]; pos = 0L; resto = '' }
    }
    function Read-Nuevo {
        foreach ($flujo in @('stdout', 'stderr')) {
            $l = $lectores[$flujo]
            if (-not (Test-Path $l.ruta)) { continue }
            $fs = [IO.File]::Open($l.ruta, 'Open', 'Read', 'ReadWrite')
            try {
                if ($fs.Length -le $l.pos) { continue }
                [void]$fs.Seek($l.pos, 'Begin')
                $bytes = New-Object byte[] ($fs.Length - $l.pos)
                $n = $fs.Read($bytes, 0, $bytes.Length)
                $l.pos += $n
                $texto = $l.resto + $Utf8.GetString($bytes, 0, $n)
                $partes = $texto -split "`r?`n"
                $l.resto = $partes[-1]
                for ($i = 0; $i -lt $partes.Count - 1; $i++) { Add-Linea $flujo $partes[$i] }
            } finally { $fs.Dispose() }
        }
    }

    $estado = $null; $ultimoEnvio = Get-Date; $ultimoLatido = Get-Date; $fallosEnvio = 0
    while (-not $p.HasExited) {
        Start-Sleep -Milliseconds 250
        Read-Nuevo
        $ahora = Get-Date
        if (($ahora - $inicio).TotalSeconds -gt $timeout) { $estado = 'tiempo_agotado'; break }
        if ($script:buffer.Count -ge 20 -or ($ahora - $ultimoEnvio).TotalSeconds -ge 1) {
            try {
                if (Send-Salida) { $estado = 'cancelada'; break }
                $fallosEnvio = 0
            } catch [ErrorServidor] {
                Write-Log "El servidor rechazó la salida de #${id}: $($_.Exception.Message)" 'WARN'; $estado = 'cancelada'; break
            } catch { $fallosEnvio++ }   # sin red: las líneas se quedan en el búfer (BTL-27)
            $ultimoEnvio = $ahora
        }
        if (($ahora - $ultimoLatido).TotalSeconds -ge 30) { try { Send-Latido } catch {}; $ultimoLatido = $ahora }
        if ($script:buffer.Count -gt 20000) { $script:buffer.RemoveRange(0, 10000); Add-Linea 'sistema' '[se descartaron líneas por falta de red]' }
    }

    if ($estado) {   # perro guardián: termina el proceso y sus hijos
        try { & taskkill.exe /PID $p.Id /T /F 2>$null | Out-Null } catch { try { $p.Kill() } catch {} }
        Start-Sleep -Milliseconds 300
        Read-Nuevo
        Add-Linea 'sistema' $(if ($estado -eq 'cancelada') { 'Ejecución cancelada desde el panel' } else { "Se superó el tiempo máximo de $timeout s" })
        Complete-Orden $estado $null $(if ($estado -eq 'cancelada') { 'Cancelada por el usuario' } else { 'Tiempo agotado' })
    } else {
        $p.WaitForExit()
        Read-Nuevo
        foreach ($flujo in @('stdout', 'stderr')) { if ($lectores[$flujo].resto) { Add-Linea $flujo $lectores[$flujo].resto } }
        $codigo = $p.ExitCode
        if ($codigo -eq 0 -and $interprete -ne 'cmd' -and $script:lineasError -gt 0) {
            Complete-Orden 'fallida' 1 'El comando terminó con errores'   # PowerShell escribió errores
        } else {
            Complete-Orden $(if ($codigo -eq 0) { 'exitosa' } else { 'fallida' }) $codigo $null
        }
    }
    Remove-Item $out, $err, (Join-Path $DirTmp "ejec_$id.ps1") -ErrorAction SilentlyContinue
}

# ---------- ciclo principal ----------
$mutex = $null
if ($EsWindows) {
    $creado = $false
    $mutex = New-Object System.Threading.Mutex($true, 'Global\BitlabAgente', [ref]$creado)
    if (-not $creado) { Write-Log 'Ya hay un agente corriendo en este equipo; se cierra esta copia.'; exit 0 }
}

Write-Log "Agente Bitlab v$VersionAgente iniciado (datos en $DirDatos)"
Read-Credencial
$fallos = 0; $ultimoLatido = [datetime]::MinValue
while ($true) {
    try {
        if (-not $Script:Cred) { Register-Equipo; $ultimoLatido = [datetime]::MinValue }
        if (((Get-Date) - $ultimoLatido).TotalSeconds -ge 30) { Send-Latido; $ultimoLatido = Get-Date }
        $r = Invoke-Agente 'reclamar' @{}
        if ($r.ejecucion) { Invoke-Orden $r.ejecucion }
        $fallos = 0
    } catch [ErrorServidor] {
        $m = $_.Exception.Message
        Write-Log "Servidor: $m" 'WARN'
        if ($m -match 'no registrado|Firma no v') {
            Write-Log 'La credencial ya no es válida; se registrará de nuevo.' 'WARN'
            Remove-Item $RutaCredencial -ErrorAction SilentlyContinue; $Script:Cred = $null
        }
        if ($m -match 'revocado') { Write-Log 'El administrador revocó este equipo. Esperando 10 minutos.' 'WARN'; Start-Sleep -Seconds 600 }
        if ($m -match 'reloj') { Start-Sleep -Seconds 60 }
        $fallos++; Start-Sleep -Seconds ([math]::Min(60, [math]::Pow(2, [math]::Min($fallos, 6))))
    } catch {
        $fallos++
        $espera = [math]::Min(60, [math]::Pow(2, [math]::Min($fallos, 6))) + (Get-Random -Maximum 1000) / 1000
        Write-Log ("Sin conexión ({0}). Reintento en {1:N0} s." -f $_.Exception.Message, $espera) 'WARN'
        Start-Sleep -Seconds $espera
    }
    if ($UnaVez) { break }
    Start-Sleep -Seconds 2
}

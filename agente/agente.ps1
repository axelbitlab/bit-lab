<#
  Bitlab Terminal · Agente de endpoint (Windows) · versión demo
  - Cada 2 s pregunta a Supabase si hay un comando pendiente para este equipo.
  - Ejecuta SOLO el script del catálogo (nunca texto libre).
  - Manda la salida línea por línea en vivo y al final el estado.
  Uso:  powershell -NoProfile -ExecutionPolicy Bypass -File .\agente.ps1
  Config: agente.config.json junto a este archivo (ver agente.config.example.json)
#>
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$cfgPath = Join-Path $PSScriptRoot 'agente.config.json'
if (-not (Test-Path $cfgPath)) { throw "Falta $cfgPath. Copia agente.config.example.json y llénalo." }
$cfg   = Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
$Base  = $cfg.supabase_url.TrimEnd('/')
$Key   = $cfg.publishable_key
$Token = $cfg.token
$Poll  = if ($cfg.intervalo_seg) { [double]$cfg.intervalo_seg } else { 2 }

function Invoke-Rpc([string]$fn, [hashtable]$body) {
    $json  = ConvertTo-Json -InputObject $body -Depth 6 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($json)
    Invoke-RestMethod -Method Post -Uri "$Base/rest/v1/rpc/$fn" -Body $bytes `
        -ContentType 'application/json; charset=utf-8' -Headers @{ apikey = $Key } -TimeoutSec 20 -ErrorAction Stop
}

function Write-Log([string]$msg) { Write-Host ("[{0:HH:mm:ss}] {1}" -f (Get-Date), $msg) }

function Invoke-Ejecucion($job) {
    $ErrorActionPreference = 'Continue'   # que el stderr de un comando no corte la ejecución
    $id = [int64]$job.ejecucion_id
    $script:seq = 0
    $script:buf = New-Object System.Collections.Generic.List[object]
    $script:lastFlush = [DateTime]::UtcNow

    function Send-Buffer {
        if ($script:buf.Count -eq 0) { return }
        $lineas = $script:buf.ToArray()
        $script:buf.Clear()
        for ($i = 0; $i -lt 3; $i++) {
            try { Invoke-Rpc 'agente_salida' @{ p_token = $Token; p_ejecucion = $id; p_lineas = $lineas } | Out-Null; break }
            catch { Start-Sleep -Milliseconds (500 * [math]::Pow(2, $i)) }   # reintento con espera exponencial
        }
        $script:lastFlush = [DateTime]::UtcNow
    }
    function Add-Linea([string]$flujo, [string]$texto) {
        $script:seq++
        $script:buf.Add(@{ s = $script:seq; f = $flujo; t = $texto })
        Write-Host $texto
        if ($script:buf.Count -ge 20 -or ([DateTime]::UtcNow - $script:lastFlush).TotalMilliseconds -ge 250) { Send-Buffer }
    }

    Write-Log "Ejecución #$id -> $($job.script)"
    $estado = 'exitosa'; $codigo = 0

    if ($job.simulacion) {
        Add-Linea 'sistema' "[simulación] Se ejecutaría: $($job.script)"
    } else {
        $global:LASTEXITCODE = 0
        try {
            $sb = [ScriptBlock]::Create($job.script)
            & $sb 2>&1 | ForEach-Object {
                if ($_ -is [System.Management.Automation.ErrorRecord]) {
                    Add-Linea 'stderr' $_.ToString()
                } elseif ($_ -is [string]) {
                    Add-Linea 'stdout' $_
                } else {
                    foreach ($l in ($_ | Out-String -Stream -Width 200)) { Add-Linea 'stdout' $l }
                }
            }
            if ($LASTEXITCODE -ne 0) { $estado = 'fallida'; $codigo = [int]$LASTEXITCODE }
        } catch {
            Add-Linea 'stderr' $_.ToString()
            $estado = 'fallida'; $codigo = 1
        }
    }

    Send-Buffer
    Invoke-Rpc 'agente_finalizar' @{ p_token = $Token; p_ejecucion = $id; p_codigo = $codigo; p_estado = $estado } | Out-Null
    Write-Log "Ejecución #$id terminada: $estado (código $codigo)"
}

Write-Log "Agente Bitlab Terminal en línea en $env:COMPUTERNAME. Ctrl+C para detener."
$fallos = 0
while ($true) {
    try {
        $jobs = @(Invoke-Rpc 'agente_reclamar' @{ p_token = $Token })
        $fallos = 0
        foreach ($j in $jobs) { if ($j) { Invoke-Ejecucion $j } }
    } catch {
        $fallos++
        $espera = [math]::Min(60, [math]::Pow(2, $fallos))
        Write-Log "Sin conexión o error ($($_.Exception.Message)). Reintento en $espera s."
        Start-Sleep -Seconds $espera
        continue
    }
    Start-Sleep -Seconds $Poll
}

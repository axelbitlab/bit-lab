<#  Bitlab Terminal · Quita el agente de este equipo.
    Detiene la tarea, la borra y elimina la carpeta de instalación.
    El equipo deja de dar latido y el panel lo marca fuera de línea. #>
$ErrorActionPreference = 'SilentlyContinue'
$NombreTarea = 'BitlabAgente'
$Destino = Join-Path $env:ProgramData 'BitlabAgente'

Write-Host ""
Write-Host "  Quitando el agente Bitlab de este equipo" -ForegroundColor Cyan
Write-Host ""

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host "    X   Hay que ejecutar como administrador." -ForegroundColor Red
  exit 1
}

if (Get-ScheduledTask -TaskName $NombreTarea -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $NombreTarea
  Start-Sleep -Seconds 2
  Unregister-ScheduledTask -TaskName $NombreTarea -Confirm:$false
  Write-Host "    OK  Tarea programada eliminada" -ForegroundColor Green
} else {
  Write-Host "    !   No habia tarea programada" -ForegroundColor Yellow
}

Get-Process powershell -ErrorAction SilentlyContinue | ForEach-Object {
  $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -ErrorAction SilentlyContinue).CommandLine
  if ($cmd -like '*BitlabAgente*') { try { $_.Kill(); Write-Host "    OK  Proceso detenido" -ForegroundColor Green } catch {} }
}

if (Test-Path $Destino) {
  # se guarda el registro por si hace falta revisarlo después
  $respaldo = Join-Path $env:ProgramData ("BitlabAgente_log_{0:yyyyMMdd_HHmm}.txt" -f (Get-Date))
  if (Test-Path (Join-Path $Destino 'logs\agente.log')) {
    Copy-Item (Join-Path $Destino 'logs\agente.log') $respaldo -Force
    Write-Host "    OK  Registro guardado en $respaldo" -ForegroundColor Green
  }
  & icacls.exe $Destino '/grant' "*S-1-5-32-544:(OI)(CI)F" '/T' '/C' | Out-Null
  Remove-Item $Destino -Recurse -Force
  Write-Host "    OK  Carpeta de instalacion eliminada" -ForegroundColor Green
} else {
  Write-Host "    !   No habia carpeta de instalacion" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  Listo. El equipo dejara de aparecer en linea en el panel." -ForegroundColor Green
Write-Host "  Para quitarlo de la lista, un administrador lo revoca desde Supabase." -ForegroundColor DarkGray

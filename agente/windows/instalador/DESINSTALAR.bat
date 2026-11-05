@echo off
rem ====================================================================
rem  Bitlab Terminal - Quitar el agente de este equipo
rem ====================================================================
title Desinstalador del agente Bitlab
cd /d "%~dp0"
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo  Se necesitan permisos de administrador. Acepta el aviso de Windows.
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Start-Process -FilePath '%~f0' -Verb RunAs" 2>nul
  exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0desinstalar.ps1"
echo.
pause

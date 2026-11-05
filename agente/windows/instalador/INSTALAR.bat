@echo off
rem ====================================================================
rem  Bitlab Terminal - Instalador del agente para Windows
rem  Doble clic en este archivo y aceptar el aviso de Windows.
rem ====================================================================
title Instalador del agente Bitlab
cd /d "%~dp0"

rem --- Pedir permisos de administrador si no los tiene ---
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo.
  echo  Se necesitan permisos de administrador.
  echo  Aparecera un aviso de Windows: elige "Si".
  echo.
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Start-Process -FilePath '%~f0' -Verb RunAs" 2>nul
  if errorlevel 1 (
    echo.
    echo  No se concedieron los permisos. La instalacion no continuo.
    echo.
    pause
  )
  exit /b
)

rem --- Ya somos administrador: ejecutar el instalador ---
schtasks /end /tn "BitlabAgente" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1"
set CODIGO=%errorlevel%

echo.
if %CODIGO% equ 0 (
  echo  ====================================================
  echo   Listo. El equipo ya aparece en el panel de Bitlab.
  echo  ====================================================
) else (
  echo  ====================================================
  echo   La instalacion no se completo. Codigo: %CODIGO%
  echo   Revisa el detalle de arriba.
  echo  ====================================================
)
echo.
pause
exit /b %CODIGO%

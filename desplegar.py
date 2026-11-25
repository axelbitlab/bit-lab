#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
  BITLAB IT · ASISTENTE DE DESPLIEGUE RÁPIDO (INSTALADOR Y CONFIGURADOR)
=============================================================================
Este script configura y despliega la solución completa de Bitlab IT:
  1. Configuración de conexión a Supabase (panel web y agentes).
  2. Guía y verificación de la migración SQL unificada de base de datos.
  3. Despliegue / Instalación del Agente Bitlab en esta máquina (Mac/Windows/Linux).
  4. Lanzamiento del servidor web del panel (http://localhost:8000).
  5. Diagnóstico de salud y estado en tiempo real.
=============================================================================
"""

import sys
import os
import platform
import subprocess
import shutil
import json
import webbrowser

DIR_RAIZ = os.path.dirname(os.path.abspath(__file__))
DIR_PANEL = os.path.join(DIR_RAIZ, "panel")
DIR_INSTALADORES = os.path.join(DIR_RAIZ, "instaladores")
DIR_SUPABASE = os.path.join(DIR_RAIZ, "supabase")
ARCHIVO_MIGRACION = os.path.join(DIR_SUPABASE, "MIGRACION_COMPLETA_UNIFICADA.sql")

SO_ACTUAL = platform.system().lower()  # 'darwin' (mac), 'windows', 'linux'

COLOR_VERDE = "\033[92m"
COLOR_CIAN = "\033[96m"
COLOR_AMARILLO = "\033[93m"
COLOR_ROJO = "\033[91m"
COLOR_RESET = "\033[0m"
COLOR_BOLD = "\033[1m"

def cprint(texto, color=""):
    print(f"{color}{texto}{COLOR_RESET}")

def limpiar_pantalla():
    os.system("cls" if os.name == "nt" else "clear")

def banner():
    limpiar_pantalla()
    cprint("╔═══════════════════════════════════════════════════════════════════╗", COLOR_CIAN)
    cprint("║            BITLAB IT · SISTEMA DE GESTIÓN REMOTA                 ║", COLOR_BOLD + COLOR_CIAN)
    cprint("║       Instalador y Desplegador Universal Multiplataforma          ║", COLOR_CIAN)
    cprint("╚═══════════════════════════════════════════════════════════════════╝", COLOR_CIAN)
    print(f" Sistema detectado: {COLOR_VERDE}{platform.system()} ({platform.machine()}){COLOR_RESET}")
    print(f" Directorio raíz:  {DIR_RAIZ}")
    print("───────────────────────────────────────────────────────────────────")

def leer_config_actual():
    """Lee la configuración actual de Supabase si existe."""
    url = ""
    key = ""
    # Intentar desde panel/config.js
    cfg_js = os.path.join(DIR_PANEL, "config.js")
    if os.path.exists(cfg_js):
        try:
            with open(cfg_js, "r", encoding="utf-8") as f:
                content = f.read()
                for line in content.splitlines():
                    if "supabase_url" in line and ":" in line:
                        url = line.split(":", 1)[1].strip().strip('",;\' ')
                    if "supabase_key" in line and ":" in line:
                        key = line.split(":", 1)[1].strip().strip('",;\' ')
        except Exception:
            pass
    return url, key

def guardar_config(url, key, clave_registro="BTL-DEMO-2026-KEY"):
    """Guarda la configuración en panel/config.js y en los instaladores de agentes."""
    url = url.strip().rstrip("/")
    key = key.strip()
    clave_registro = clave_registro.strip()

    # 1. Guardar panel/config.js
    cfg_js = os.path.join(DIR_PANEL, "config.js")
    with open(cfg_js, "w", encoding="utf-8") as f:
        f.write(f'const BTL_CONFIG = {{\n  supabase_url: "{url}",\n  supabase_key: "{key}",\n}};\n')

    # 2. Guardar instaladores/BitlabAgente_Mac/config.json
    mac_cfg = {
        "supabase_url": url,
        "supabase_anon_key": key,
        "clave_registro": clave_registro
    }
    dir_mac = os.path.join(DIR_INSTALADORES, "BitlabAgente_Mac")
    if os.path.exists(dir_mac):
        with open(os.path.join(dir_mac, "config.json"), "w", encoding="utf-8") as f:
            json.dump(mac_cfg, f, indent=2)

    # 3. Guardar instaladores/BitlabAgente/config.json (Windows)
    dir_win = os.path.join(DIR_INSTALADORES, "BitlabAgente")
    if os.path.exists(dir_win):
        with open(os.path.join(dir_win, "config.json"), "w", encoding="utf-8") as f:
            json.dump(mac_cfg, f, indent=2)

    # Recompilar panel modular
    ensamblar = os.path.join(DIR_PANEL, "ensamblar.py")
    if os.path.exists(ensamblar):
        subprocess.run([sys.executable, ensamblar, "--modular"], cwd=DIR_RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    cprint("\n✓ Configuración guardada y sincronizada correctamente.", COLOR_VERDE)

def menu_configuracion():
    banner()
    cprint("► CONFIGURACIÓN DE CONEXIÓN A SUPABASE\n", COLOR_BOLD)
    url_actual, key_actual = leer_config_actual()
    print(f"URL actual:     {url_actual or '(no configurada)'}")
    print(f"Llave actual:   {(key_actual[:15] + '...' + key_actual[-8:]) if len(key_actual) > 25 else (key_actual or '(no configurada)')}\n")

    cambiar = input("¿Deseas ingresar nuevos parámetros de Supabase? (s/N): ").strip().lower()
    if cambiar in ("s", "si", "y", "yes"):
        nueva_url = input("\n1. URL del Proyecto Supabase (ej: https://xyz.supabase.co): ").strip()
        nueva_key = input("2. Llave Pública / Anon Key de Supabase: ").strip()
        nueva_reg = input("3. Clave de Registro de Agentes [Enter para 'BTL-DEMO-2026-KEY']: ").strip() or "BTL-DEMO-2026-KEY"
        if nueva_url and nueva_key:
            guardar_config(nueva_url, nueva_key, nueva_reg)
        else:
            cprint("Valores no válidos. No se aplicaron cambios.", COLOR_ROJO)
    input("\nPresiona Enter para continuar...")

def menu_migracion():
    banner()
    cprint("► MIGRACIÓN COMPLETA UNIFICADA DE BASE DE DATOS\n", COLOR_BOLD)
    print("La migración unificada crea todas las tablas, funciones RPC seguras, políticas RLS,")
    print("la clave de registro maestra ('BTL-DEMO-2026-KEY') y el catálogo completo de comandos.")
    print(f"\nArchivo: {COLOR_CIAN}{ARCHIVO_MIGRACION}{COLOR_RESET}")

    if not os.path.exists(ARCHIVO_MIGRACION):
        cprint("Error: No se encontró el archivo de migración.", COLOR_ROJO)
        input("\nPresiona Enter para volver...")
        return

    tam = os.path.getsize(ARCHIVO_MIGRACION)
    print(f"Tamaño: {tam} bytes ({tam // 1024} KB)\n")
    print("Instrucciones para aplicar en Supabase:")
    print("  1. Entra a tu consola de Supabase: https://supabase.com/dashboard")
    print("  2. Abre la sección 'SQL Editor' y pulsa en 'New query'.")
    print("  3. Abre o copia el contenido de MIGRACION_COMPLETA_UNIFICADA.sql y pégalo.")
    print("  4. Haz clic en el botón 'Run' para ejecutarla.\n")

    copiar = input("¿Deseas abrir la carpeta de la migración para ver el archivo? (s/N): ").strip().lower()
    if copiar in ("s", "si", "y", "yes"):
        if SO_ACTUAL == "darwin":
            subprocess.run(["open", "-R", ARCHIVO_MIGRACION])
        elif SO_ACTUAL == "windows":
            os.system(f'explorer /select,"{ARCHIVO_MIGRACION}"')
        else:
            subprocess.run(["xdg-open", DIR_SUPABASE])

    input("\nPresiona Enter para continuar...")

def desplegar_agente_local():
    banner()
    cprint("► DESPLEGAR E INSTALAR AGENTE EN ESTE EQUIPO\n", COLOR_BOLD)

    if SO_ACTUAL == "darwin":
        cprint("Detectado sistema macOS.", COLOR_CIAN)
        cprint("Instalando Agente Bitlab como servicio en segundo plano (LaunchAgent)...", COLOR_AMARILLO)
        script_instalador = os.path.join(DIR_INSTALADORES, "BitlabAgente_Mac", "instalar.command")
        if not os.path.exists(script_instalador):
            cprint("Error: No se encontró instalador para Mac.", COLOR_ROJO)
            input("\nPresiona Enter para continuar...")
            return

        os.chmod(script_instalador, 0o755)
        res = subprocess.run(["/bin/bash", script_instalador], cwd=os.path.join(DIR_INSTALADORES, "BitlabAgente_Mac"))
        if res.returncode == 0:
            cprint("\n✓ Agente macOS desplegado y en ejecución activa.", COLOR_VERDE)
        else:
            cprint("\nHubo un detalle en la instalación. Revisa los permisos.", COLOR_AMARILLO)

    elif SO_ACTUAL == "windows":
        cprint("Detectado sistema Windows.", COLOR_CIAN)
        cprint("Lanzando instalador de PowerShell...", COLOR_AMARILLO)
        bat_instalador = os.path.join(DIR_INSTALADORES, "BitlabAgente", "INSTALAR.bat")
        if os.path.exists(bat_instalador):
            os.system(f'"{bat_instalador}"')
        else:
            ps_instalador = os.path.join(DIR_INSTALADORES, "BitlabAgente", "instalar.ps1")
            os.system(f'powershell -ExecutionPolicy Bypass -File "{ps_instalador}"')

    else:
        cprint("Detectado sistema Linux.", COLOR_CIAN)
        cprint("Para Linux, se utiliza el agente script ejecutado con bash.", COLOR_AMARILLO)
        # Soporte nativo para Linux
        dir_linux = os.path.join(DIR_INSTALADORES, "BitlabAgente_Mac")
        sh_agente = os.path.join(dir_linux, "agente.sh")
        if os.path.exists(sh_agente):
            os.chmod(sh_agente, 0o755)
            print(f"Ejecutando agente Linux: {sh_agente}")
            subprocess.Popen(["/bin/bash", sh_agente], cwd=dir_linux)
            cprint("\n✓ Agente iniciado en segundo plano.", COLOR_VERDE)

    input("\nPresiona Enter para continuar...")

def iniciar_panel_web():
    banner()
    cprint("► INICIANDO PANEL WEB DE ADMINISTRACIÓN\n", COLOR_BOLD)
    print("Iniciando servidor web local en el puerto 8000...")
    servidor_py = os.path.join(DIR_PANEL, "servidor.py")

    # Abrir navegador tras breve delay
    try:
        webbrowser.open("http://localhost:8000")
    except Exception:
        pass

    cprint("\nPanel disponible en: http://localhost:8000", COLOR_VERDE)
    cprint("Presiona Ctrl+C en cualquier momento para detener el servidor web.\n", COLOR_AMARILLO)

    try:
        subprocess.run([sys.executable, servidor_py], cwd=DIR_RAIZ)
    except KeyboardInterrupt:
        cprint("\nServidor web detenido.", COLOR_AMARILLO)

def desinstalar_agente_local():
    banner()
    cprint("► DESINSTALACIÓN COMPLETA DEL AGENTE\n", COLOR_BOLD)
    conf = input("¿Estás seguro de que deseas desinstalar y borrar todo rastro del agente? (s/N): ").strip().lower()
    if conf not in ("s", "si", "y", "yes"):
        return

    if SO_ACTUAL == "darwin":
        sh_des = os.path.join(DIR_INSTALADORES, "BitlabAgente_Mac", "DESINSTALAR.sh")
        if os.path.exists(sh_des):
            os.chmod(sh_des, 0o755)
            subprocess.run(["/bin/bash", sh_des])
            cprint("\n✓ Agente desinstalado completamente de macOS.", COLOR_VERDE)
    elif SO_ACTUAL == "windows":
        bat_des = os.path.join(DIR_INSTALADORES, "BitlabAgente", "DESINSTALAR.bat")
        if os.path.exists(bat_des):
            os.system(f'"{bat_des}"')
            cprint("\n✓ Agente desinstalado de Windows.", COLOR_VERDE)
    input("\nPresiona Enter para continuar...")

def empaquetar_entrega():
    banner()
    cprint("► EMPAQUETADO FINAL DEL PROYECTO PARA ENTREGA (.ZIP)\n", COLOR_BOLD)
    nombre_zip = "bitlab_entrega_final.zip"
    ruta_zip = os.path.join(DIR_RAIZ, nombre_zip)

    # Recompilar panel antes de empaquetar
    ensamblar = os.path.join(DIR_PANEL, "ensamblar.py")
    if os.path.exists(ensamblar):
        subprocess.run([sys.executable, ensamblar, "--modular"], cwd=DIR_RAIZ, stdout=subprocess.DEVNULL)

    cprint("Comprimiendo archivos de la solución...", COLOR_AMARILLO)
    carpetas_incluir = ["panel", "instaladores", "supabase", "docs"]
    archivos_incluir = ["desplegar.py", "INICIAR_PANEL.command", "INICIAR_PANEL.bat", "LEEME_ENTREGA.md"]

    import zipfile
    with zipfile.ZipFile(ruta_zip, "w", zipfile.ZIP_DEFLATED) as zf:
        for arch in archivos_incluir:
            p = os.path.join(DIR_RAIZ, arch)
            if os.path.exists(p):
                zf.write(p, arcname=arch)
        for carp in carpetas_incluir:
            p_carp = os.path.join(DIR_RAIZ, carp)
            if os.path.exists(p_carp):
                for root, dirs, files in os.walk(p_carp):
                    if ".git" in root or "__pycache__" in root or ".DS_Store" in root:
                        continue
                    for f in files:
                        if f.endswith(".pyc") or f == ".DS_Store":
                            continue
                        full_p = os.path.join(root, f)
                        rel_p = os.path.relpath(full_p, DIR_RAIZ)
                        zf.write(full_p, arcname=rel_p)

    cprint(f"\n✓ Paquete completo generado exitosamente: {ruta_zip}", COLOR_VERDE)
    cprint(f"Tamaño: {os.path.getsize(ruta_zip) // (1024*1024) + 1} MB", COLOR_CIAN)
    input("\nPresiona Enter para continuar...")

def main():
    while True:
        banner()
        print("Selecciona una opción:\n")
        print("  1. Iniciar Panel Web (localhost:8000)")
        print("  2. Desplegar e Instalar Agente en este equipo (Mac/Win/Linux)")
        print("  3. Configurar Conexión Supabase (URL, Llaves, Clave de Registro)")
        print("  4. Ver / Abrir Migración SQL Unificada Completa")
        print("  5. Desinstalar Agente por completo")
        print("  6. Generar archivo .ZIP de entrega final")
        print("  0. Salir\n")
        opc = input("Opción [1-6, 0]: ").strip()

        if opc == "1":
            iniciar_panel_web()
        elif opc == "2":
            desplegar_agente_local()
        elif opc == "3":
            menu_configuracion()
        elif opc == "4":
            menu_migracion()
        elif opc == "5":
            desinstalar_agente_local()
        elif opc == "6":
            empaquetar_entrega()
        elif opc == "0":
            cprint("\n¡Hasta pronto!", COLOR_VERDE)
            break

if __name__ == "__main__":
    main()


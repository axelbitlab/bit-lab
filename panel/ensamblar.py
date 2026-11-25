#!/usr/bin/env python3
"""
Ensamblador del Panel Bitlab-IT.

Combina los módulos organizados en 'panel/modulos/' (estilos, plantillas HTML y lógica JS)
para generar 'panel/index.html' unificado con identificador de compilación (build-id)
que previene problemas de caché en navegadores.

Estructura modular:
- modulos/estilos/: CSS base, componentes, vistas y menús.
- modulos/plantilla/: Encabezado HTML con CDN y cuerpo base de la aplicación.
- modulos/nucleo/: Utilidades globales, iconos SVG y gestión de selección.
- modulos/datos/: Cliente Supabase, servicios, realtime, autenticación y variantes multi-SO.
- modulos/interfaz/: Modales, notificaciones toast, barra dock y menús contextuales.
- modulos/monitoreo/: Cuadrícula de equipos y métricas de estado.
- modulos/catalogo/: Catálogo de comandos agrupados y filtrado por SO.
- modulos/terminal/: Emulador xterm, pestañas multi-equipo y motor de ejecución en streaming.
- modulos/historial/: Bitácora de ejecuciones históricas y visor de salida.
- modulos/ejecucion_masiva/: Asistente de lanzamiento por lotes.
- modulos/cuenta/: Selector de tema claro/oscuro y perfil de usuario.
- modulos/arranque/: Atajos de teclado y arranque del ciclo de vida.
"""
import sys
import time
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
MOD = RAIZ / "modulos"

# Orden explícito y controlado de estilos CSS
ARCHIVOS_CSS = [
    MOD / "estilos" / "base.css",
    MOD / "estilos" / "componentes.css",
    MOD / "estilos" / "vistas.css",
    MOD / "estilos" / "mini-menu.css",
]

# Plantillas base HTML
PLANTILLA_HEAD = MOD / "plantilla" / "encabezado.html"
PLANTILLA_BODY = MOD / "plantilla" / "cuerpo.html"

# Secuencia determinista de dependencias JavaScript
MODULOS_JS_ORDEN = [
    # 1. Núcleo base: utilidades, iconos y gestión de selección de equipos
    ("nucleo", ["utilidades.js", "iconos.js", "seleccion.js"]),
    # 2. Capa de datos: Supabase, servicios, tiempo real, permisos y variantes multi-SO
    ("datos", ["supabase.js", "servicio.js", "tiempo_real.js", "acceso.js", "variantes.js"]),
    # 3. Interfaz y componentes globales: modales, toasts, dock de navegación y menús
    ("interfaz", ["avisos_modales.js", "navegacion.js", "boton_flotante.js", "menu_contextual.js"]),
    # 4. Módulos de vistas principales
    ("monitoreo", ["vista.js"]),
    ("catalogo", ["constantes.js", "vista.js"]),
    ("terminal", ["emulador.js", "vista.js", "motor.js"]),
    ("historial", ["vista.js"]),
    ("ejecucion_masiva", ["vista.js"]),
    ("cuenta", ["tema.js", "vista.js"]),
    # 5. Arranque y eventos globales del sistema
    ("arranque", ["eventos.js", "inicio.js"]),
]


def leer_archivo(ruta: Path) -> str:
    """Lee el contenido de un archivo UTF-8 de forma segura."""
    try:
        return ruta.read_text(encoding="utf-8")
    except FileNotFoundError:
        print(f"[!] Advertencia: Archivo no encontrado: {ruta}")
        return ""


def compilar_css() -> str:
    """Concatena los archivos CSS en el orden especificado."""
    partes = []
    for css_file in ARCHIVOS_CSS:
        if css_file.exists():
            contenido = leer_archivo(css_file)
            partes.append(f"/* === {css_file.name} === */\n{contenido}")
        else:
            print(f"[!] CSS no encontrado: {css_file}")
    return "\n\n".join(partes)


def compilar_js() -> str:
    """Concatena los módulos JavaScript en orden estricto de dependencias."""
    bloques = []
    total_archivos = 0
    for carpeta, archivos in MODULOS_JS_ORDEN:
        for arch in archivos:
            ruta = MOD / carpeta / arch
            if ruta.exists():
                contenido = leer_archivo(ruta)
                bloques.append(f"/* ░▒ modulo: {carpeta}/{arch} ▒░ */\n{contenido}")
                total_archivos += 1
            else:
                print(f"[!] Módulo JS no encontrado: {ruta}")
    return "\n\n".join(bloques), total_archivos


def construir() -> str:
    """Ensambla el documento HTML completo."""
    build_id = str(int(time.time()))
    css_total = compilar_css()
    js_bundle, num_modulos = compilar_js()

    encabezado = leer_archivo(PLANTILLA_HEAD)
    cuerpo = leer_archivo(PLANTILLA_BODY)

    # Inyección de build-id y estilos
    html_head = encabezado.replace("{{BUILD_ID}}", build_id).replace("{{ESTILOS_CSS}}", css_total)

    # Armado final
    html_final = f"{html_head}\n{cuerpo}\n<script>\n{js_bundle}\n</script>\n</body>\n</html>"
    return html_final, build_id, num_modulos


def main():
    salida = RAIZ / "index.html"
    html, build_id, num_modulos = construir()
    salida.write_text(html, encoding="utf-8")
    tam = len(html.encode("utf-8"))
    print(f"✓ Panel compilado exitosamente: {salida}")
    print(f"  - Tamaño final: {tam:,} bytes")
    print(f"  - Build ID: {build_id}")
    print(f"  - Módulos JS incluidos: {num_modulos}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Ensamblador del panel Bitlab-IT.

Combina los módulos en panel/_modulos/ más los estilos y plantillas
en panel/_build/ para producir panel/index.html con un build-id único
que rompe la caché del navegador.

Uso:
    python3 panel/ensamblar.py
    python3 panel/ensamblar.py --modular      # usa _modulos/
    python3 panel/ensamblar.py --build        # usa _build/ (legado)

Por defecto usa _modulos/ si existe y tiene archivos; si no, _build/.
"""
import sys
import time
from pathlib import Path

RAIZ = Path(__file__).resolve().parent     # panel/
MOD  = RAIZ / "_modulos"
BUI  = RAIZ / "_build"

ESTILOS_DEMO = RAIZ / "_build" / "c-estilos-demo.css"
ESTILOS_BASE = RAIZ / "_build" / "estilos.css"
CUERPO       = RAIZ / "_build" / "d-cuerpo.html"
CDN          = RAIZ / "_build" / "cdn-scripts.html"


def leer(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8")
    except FileNotFoundError:
        return ""


def archivos_js_modulares() -> list[Path]:
    """Lista los JS de panel/_modulos/ en orden: carpeta alfabética, luego
    archivo alfabético dentro de cada carpeta."""
    if not MOD.exists():
        return []
    salida = []
    for carpeta in sorted(d for d in MOD.iterdir() if d.is_dir()):
        for arch in sorted(carpeta.iterdir()):
            if arch.suffix == ".js":
                salida.append(arch)
    return salida


def archivos_css_modulares() -> list[Path]:
    carp = MOD / "estilos"
    if not carp.exists():
        return []
    return sorted(p for p in carp.iterdir() if p.suffix == ".css")


def archivos_js_legado() -> list[Path]:
    """Fallback: archivos .js dentro de _build/ en orden alfabético."""
    if not BUI.exists():
        return []
    return sorted(p for p in BUI.iterdir() if p.suffix == ".js")


def construir(modo: str) -> str:
    build_id = str(int(time.time()))
    css_demo = leer(ESTILOS_DEMO)
    css_base = leer(ESTILOS_BASE)
    cuerpo   = leer(CUERPO)
    cdn      = leer(CDN)

    # CSS extra desde los módulos (mini-menú, etc.)
    css_extra = "\n".join(leer(p) for p in archivos_css_modulares())

    # Selección de fuente de JS
    if modo == "modular":
        js_files = archivos_js_modulares()
    elif modo == "legado":
        js_files = archivos_js_legado()
    else:
        js_files = archivos_js_modulares() or archivos_js_legado()

    partes_js = []
    for p in js_files:
        contenido = leer(p)
        # pequeño comentario para rastrear qué archivo entró
        partes_js.append(f"/* ░▒ {p.relative_to(RAIZ)} ▒░ */\n{contenido}")

    js_bundle = "\n".join(partes_js)

    html = (
        '<!doctype html><html lang="es"><head><meta charset="utf-8">'
        f'<meta name="build-id" content="{build_id}">'
        '<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">'
        '<meta http-equiv="Pragma" content="no-cache">'
        '<meta http-equiv="Expires" content="0">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        '<title>Bitlab-IT · Panel</title>'
        f'<!-- build {build_id} -->\n'
        '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
        '<link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@700&family=Manrope:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">\n'
        '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css">\n'
        '<style>\n'
        + css_base
        + '\n/* ====== Estilos demo ====== */\n'
        + css_demo
        + '\n/* ====== Estilos de módulos (fase A) ====== */\n'
        + css_extra
        + '\n</style>\n'
        + cdn
        + '\n'
        + cuerpo
        + '\n<script>\n'
        + js_bundle
        + '\n</script>\n</body></html>'
    )
    return html


def main():
    modo = "auto"
    if "--modular" in sys.argv: modo = "modular"
    elif "--build" in sys.argv or "--legado" in sys.argv: modo = "legado"

    salida = RAIZ / "index.html"
    html = construir(modo)
    salida.write_text(html, encoding="utf-8")
    tam = len(html.encode("utf-8"))
    mod_real = "modular" if archivos_js_modulares() else "legado"
    print(f"✓ {salida} ({tam} bytes, build {html[html.index('build-id') + 19:html.index('build-id') + 29]}, modo={mod_real if modo=='auto' else modo})")


if __name__ == "__main__":
    main()

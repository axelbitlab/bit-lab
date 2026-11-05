#!/usr/bin/env python3
"""
Bitlab Terminal · Seeder de usuarios demo (BTL-38)

Crea en Supabase Auth las cuentas de la demo y su perfil con rol:
  · Administrador global de Bitlab-IT (Sandra)  -> administrador
  · Inge (desarrollo)                           -> administrador
  · Técnico demo                                -> técnico

Las contraseñas se generan al azar, se muestran UNA sola vez en esta
terminal y nunca se guardan en archivos ni en GitHub. Cada usuario debe
cambiarla en su primer inicio de sesión.

Uso (desde la carpeta del repo):
  python3 supabase/seed/crear_usuarios_demo.py
  python3 supabase/seed/crear_usuarios_demo.py --correo-admin otro@correo.com --correo-inge yo@correo.com

Necesita un archivo .env en la raíz del repo (está en .gitignore) con:
  SUPABASE_URL=https://TU-PROYECTO.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=la llave secreta (service_role o sb_secret_...)

Solo usa la biblioteca estándar de Python.
"""
import argparse
import json
import os
import secrets
import string
import sys
import urllib.error
import urllib.parse
import urllib.request

ORGANIZACION_DEMO = "Bitlab Demo"


def cargar_env(ruta):
    datos = {}
    if os.path.exists(ruta):
        with open(ruta, encoding="utf-8") as f:
            for linea in f:
                linea = linea.strip()
                if not linea or linea.startswith("#") or "=" not in linea:
                    continue
                k, v = linea.split("=", 1)
                datos[k.strip()] = v.strip().strip('"').strip("'")
    for k in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
        if os.environ.get(k):
            datos[k] = os.environ[k]
    return datos


def contrasena_temporal(longitud=16):
    alfabeto = string.ascii_letters + string.digits + "!#$%*+-=?@"
    while True:
        c = "".join(secrets.choice(alfabeto) for _ in range(longitud))
        if (any(x.islower() for x in c) and any(x.isupper() for x in c)
                and any(x.isdigit() for x in c) and any(x in "!#$%*+-=?@" for x in c)):
            return c


class Supabase:
    def __init__(self, url, llave):
        self.url = url.rstrip("/")
        self.cabeceras = {"apikey": llave, "Content-Type": "application/json"}
        if llave.startswith("eyJ"):  # llave service_role antigua (JWT)
            self.cabeceras["Authorization"] = "Bearer " + llave

    def pedir(self, metodo, ruta, cuerpo=None, extra=None):
        datos = json.dumps(cuerpo).encode("utf-8") if cuerpo is not None else None
        cab = dict(self.cabeceras, **(extra or {}))
        req = urllib.request.Request(self.url + ruta, data=datos, headers=cab, method=metodo)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                texto = r.read().decode("utf-8")
                return r.status, (json.loads(texto) if texto else None)
        except urllib.error.HTTPError as e:
            texto = e.read().decode("utf-8", "replace")
            try:
                return e.code, json.loads(texto)
            except ValueError:
                return e.code, {"mensaje": texto}

    def buscar_usuario(self, correo):
        pagina = 1
        while True:
            st, r = self.pedir("GET", f"/auth/v1/admin/users?page={pagina}&per_page=200")
            if st != 200:
                raise SystemExit(f"No se pudo listar usuarios ({st}): {r}")
            usuarios = r.get("users", []) if isinstance(r, dict) else r
            for u in usuarios:
                if (u.get("email") or "").lower() == correo.lower():
                    return u
            if len(usuarios) < 200:
                return None
            pagina += 1


def main():
    ap = argparse.ArgumentParser(description="Crea los usuarios demo de Bitlab Terminal")
    ap.add_argument("--correo-admin", default="contacto@bitlab-it.com", help="Correo del administrador global (Sandra)")
    ap.add_argument("--correo-inge", default="axel.bitlabit@gmail.com", help="Correo de la cuenta de desarrollo")
    ap.add_argument("--correo-tecnico", default="tecnico.demo@bitlab-it.com", help="Correo del técnico demo")
    ap.add_argument("--restablecer", action="store_true",
                    help="Si el usuario ya existe, le asigna una contraseña temporal nueva")
    args = ap.parse_args()

    raiz = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    env = cargar_env(os.path.join(raiz, ".env"))
    if not env.get("SUPABASE_URL") or not env.get("SUPABASE_SERVICE_ROLE_KEY"):
        raise SystemExit("Falta .env con SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (ver .env.example)")
    sb = Supabase(env["SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])

    st, orgs = sb.pedir("GET", "/rest/v1/organizaciones?select=id&nombre=eq." + urllib.parse.quote(ORGANIZACION_DEMO))
    if st != 200 or not orgs:
        raise SystemExit("No existe la organización 'Bitlab Demo'. ¿Ya corriste la migración 002?")
    org_id = orgs[0]["id"]

    cuentas = [
        (args.correo_admin, "Sandra Lucía de la Fuente Bermúdez", "administrador"),
        (args.correo_inge, "Axel Gabriel Ramírez Ortiz", "administrador"),
        (args.correo_tecnico, "Técnico Demo", "tecnico"),
    ]
    resumen = []
    for correo, nombre, rol in cuentas:
        existente = sb.buscar_usuario(correo)
        contrasena = None
        if existente is None:
            contrasena = contrasena_temporal()
            st, r = sb.pedir("POST", "/auth/v1/admin/users", {
                "email": correo, "password": contrasena, "email_confirm": True,
                "user_metadata": {"nombre": nombre}})
            if st not in (200, 201):
                raise SystemExit(f"No se pudo crear {correo} ({st}): {r}")
            usuario_id = r["id"]
            estado = "creado"
        else:
            usuario_id = existente["id"]
            estado = "ya existía"
            if args.restablecer:
                contrasena = contrasena_temporal()
                st, r = sb.pedir("PUT", f"/auth/v1/admin/users/{usuario_id}", {"password": contrasena})
                if st != 200:
                    raise SystemExit(f"No se pudo restablecer {correo} ({st}): {r}")
                estado = "contraseña restablecida"

        st, r = sb.pedir("POST", "/rest/v1/perfiles_usuarios?on_conflict=usuario_id", {
            "usuario_id": usuario_id, "nombre": nombre, "rol": rol, "organizacion_id": org_id,
            "activo": True, "debe_cambiar_contrasena": contrasena is not None},
            {"Prefer": "resolution=merge-duplicates,return=minimal"})
        if st not in (200, 201, 204):
            raise SystemExit(f"No se pudo guardar el perfil de {correo} ({st}): {r}")
        resumen.append((correo, rol, estado, contrasena))

    print("\nUsuarios demo de Bitlab Terminal (organización: Bitlab Demo)\n")
    for correo, rol, estado, contrasena in resumen:
        print(f"  {correo:<34} {rol:<14} {estado:<24} {contrasena or '(sin cambio)'}")
    print("\nLas contraseñas se muestran solo esta vez. Entrégalas en persona o por un medio seguro;")
    print("no las pegues en Jira, GitHub, WhatsApp grupal ni en la documentación.")
    print("Al primer inicio de sesión el panel pedirá cambiarlas.\n")


if __name__ == "__main__":
    sys.exit(main())

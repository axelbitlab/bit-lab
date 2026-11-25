#!/usr/bin/env bash
# Bitlab Terminal · Instalador del agente para Mac · v1.0.0
# BTL-28 (arranque launchd), BTL-29 (instalador)
#
# Uso: doble clic sobre este archivo en el Finder
# (macOS abrirá una Terminal y ejecutará el instalador automáticamente)
#
# Qué hace:
#   1. Copia el agente y la configuración a ~/Library/Application Support/BitlabAgente
#   2. Crea un LaunchAgent (plist) que arranca el agente con el inicio de sesión
#   3. Lo activa y espera a que el equipo quede registrado en el panel

set -euo pipefail

# --- colores ---
CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; GRAY='\033[0;90m'; NC='\033[0m'
paso()  { echo ""; echo -e "  ${CYAN}$1${NC}"; }
bien()  { echo -e "    ${GREEN}OK${NC}  $1"; }
aviso() { echo -e "    ${YELLOW}!${NC}   $1"; }
mal()   { echo -e "    ${RED}X${NC}   $1"; }

pausar_y_salir() {
  local codigo="${1:-1}"
  echo ""
  read -rp "    Presiona Enter para cerrar..." _
  exit "$codigo"
}

# Para que cualquier error inesperado se vea antes de cerrar la ventana
trap 'echo ""; mal "Instalación interrumpida: $BASH_COMMAND (línea $LINENO)"; echo ""; echo -e "    ${YELLOW}Manda esta pantalla a quien te dio el instalador.${NC}"; pausar_y_salir 90' ERR

NOMBRE_LABEL="com.bitlabit.agente"
NOMBRE_TAREA="BitlabAgente"
ORIGEN="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESTINO="$HOME/Library/Application Support/BitlabAgente"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST="$PLIST_DIR/$NOMBRE_LABEL.plist"

echo ""
echo -e "  ${CYAN}============================================${NC}"
echo -e "   ${NC}Bitlab Terminal - Agente para Mac${NC}"
echo -e "  ${CYAN}============================================${NC}"

# ---------- 1. Comprobaciones previas ----------
paso "1/6  Comprobando el equipo"

if [[ "$(uname)" != "Darwin" ]]; then
  mal "Este instalador es solo para macOS."
  pausar_y_salir 1
fi
bien "Sistema operativo macOS $(sw_vers -productVersion 2>/dev/null || uname -r)"

if ! command -v python3 &>/dev/null; then
  mal "Se necesita python3. Instala las Xcode Command Line Tools: xcode-select --install"
  pausar_y_salir 2
fi
bien "python3 $(python3 --version 2>&1 | awk '{print $2}')"

if ! command -v curl &>/dev/null; then
  mal "Se necesita curl (debería estar preinstalado en macOS)."
  pausar_y_salir 2
fi
bien "curl disponible"

RUTA_AGENTE="$ORIGEN/agente.sh"
RUTA_CONFIG="$ORIGEN/config.json"
for f in "$RUTA_AGENTE" "$RUTA_CONFIG"; do
  if [[ ! -f "$f" ]]; then
    mal "Falta $(basename "$f") junto al instalador. Descomprime el ZIP completo antes de instalar."
    pausar_y_salir 3
  fi
done
bien "Archivos del paquete completos"

# ---------- 2. Configuración ----------
paso "2/6  Revisando la configuración"

SUPABASE_URL="$(python3 -c "import json,sys; c=json.load(open(sys.argv[1])); print(c.get('supabase_url','').rstrip('/'))" "$RUTA_CONFIG" 2>/dev/null || true)"
PUBLISHABLE_KEY="$(python3 -c "import json,sys; c=json.load(open(sys.argv[1])); print(c.get('publishable_key',''))" "$RUTA_CONFIG" 2>/dev/null || true)"
CLAVE_REGISTRO="$(python3 -c "import json,sys; c=json.load(open(sys.argv[1])); print(c.get('clave_registro',''))" "$RUTA_CONFIG" 2>/dev/null || true)"

if [[ -z "$SUPABASE_URL" ]] || [[ "$SUPABASE_URL" != https://* ]]; then
  mal "supabase_url no es válida en config.json (debe empezar con https://)."
  pausar_y_salir 4
fi
if [[ -z "$PUBLISHABLE_KEY" ]]; then
  mal "Falta publishable_key en config.json."
  pausar_y_salir 4
fi
bien "Proyecto: $SUPABASE_URL"

if [[ -z "$CLAVE_REGISTRO" ]] || [[ "$CLAVE_REGISTRO" != BTL-* ]]; then
  aviso "config.json no trae clave_registro"
  echo ""
  echo -e "    ${YELLOW}La clave la entrega el administrador. Se ve así: BTL-a1b2c3...${NC}"
  echo ""
  read -rp "    Pega la clave de registro y presiona Enter: " CLAVE_REGISTRO
  CLAVE_REGISTRO="$(echo "$CLAVE_REGISTRO" | xargs)"
  if [[ -z "$CLAVE_REGISTRO" ]] || [[ "$CLAVE_REGISTRO" != BTL-* ]]; then
    mal "Sin una clave válida no se puede registrar el equipo."
    echo ""
    echo -e "    ${GRAY}El administrador la genera en el editor SQL de Supabase con:${NC}"
    echo -e "    ${GRAY}  select crear_clave_registro((select id from organizaciones limit 1), 'Instalador Mac', 50, 90);${NC}"
    pausar_y_salir 4
  fi
  GUARDAR_CLAVE=1
else
  GUARDAR_CLAVE=0
fi
bien "Clave de registro presente"

# conectividad (no bloquea si aún no hay conexión)
if curl -sS --max-time 10 -o /dev/null -w "%{http_code}" \
     -H "apikey: $PUBLISHABLE_KEY" "$SUPABASE_URL/rest/v1/" 2>/dev/null | grep -qE '^[2-4]'; then
  bien "El servidor responde"
else
  aviso "No se pudo contactar al servidor ahora. La instalación continúa; el agente reintentará automáticamente."
fi

# ---------- 3. Copiar archivos ----------
paso "3/6  Instalando en $DESTINO"

mkdir -p "$DESTINO/logs" "$DESTINO/tmp"

# Detener agente previo si existe
if [[ -f "$PLIST" ]]; then
  launchctl unload "$PLIST" 2>/dev/null || true
  aviso "Había una instalación previa: se actualiza"
  sleep 1
fi
pkill -f "$DESTINO/agente.sh" 2>/dev/null || true

# Copiar agente
cp "$RUTA_AGENTE" "$DESTINO/agente.sh"
chmod +x "$DESTINO/agente.sh"
bien "agente.sh"

# Copiar config (con o sin clave)
if [[ "$GUARDAR_CLAVE" -eq 1 ]]; then
  python3 -c "
import json, sys
with open(sys.argv[1], 'r', encoding='utf-8') as f:
    c = json.load(f)
c['clave_registro'] = sys.argv[2]
with open(sys.argv[3], 'w', encoding='utf-8') as f:
    json.dump(c, f, indent=2)
" "$RUTA_CONFIG" "$CLAVE_REGISTRO" "$DESTINO/config.json"
else
  cp "$RUTA_CONFIG" "$DESTINO/config.json"
fi
chmod 600 "$DESTINO/config.json"
bien "config.json"

# Copiar desinstalador
cp "$ORIGEN/DESINSTALAR.sh" "$DESTINO/DESINSTALAR.sh" 2>/dev/null || true
chmod +x "$DESTINO/DESINSTALAR.sh" 2>/dev/null || true

# Conservar credencial existente
if [[ -f "$DESTINO/credencial.json" ]]; then
  bien "credencial.json existente conservada"
fi

# ---------- 4. Permisos ----------
paso "4/6  Asegurando permisos de la carpeta"
chmod 700 "$DESTINO"
chmod 700 "$DESTINO/logs" "$DESTINO/tmp"
bien "Solo el usuario $(whoami) tiene acceso"

# ---------- 5. LaunchAgent (arranque automático) ----------
paso "5/6  Configurando arranque automático con launchd"

mkdir -p "$PLIST_DIR"
cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$NOMBRE_LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$DESTINO/agente.sh</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$DESTINO</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$DESTINO/logs/launchd.log</string>
    <key>StandardErrorPath</key>
    <string>$DESTINO/logs/launchd.log</string>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin</string>
        <key>LANG</key>
        <string>en_US.UTF-8</string>
        <key>LC_ALL</key>
        <string>en_US.UTF-8</string>
    </dict>
</dict>
</plist>
PLIST_EOF

launchctl unload "$PLIST" 2>/dev/null || true
sleep 1
if ! launchctl load -w "$PLIST" 2>/dev/null; then
  launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null || true
fi
bien "LaunchAgent '$NOMBRE_LABEL' configurado y activo"

# ---------- 6. Verificación ----------
paso "6/6  Esperando a que el equipo se registre"

RUTA_CRED="$DESTINO/credencial.json"
RUTA_LOG="$DESTINO/logs/agente.log"
LIMITE=$(($(date +%s) + 60))
OK=0

while [[ "$(date +%s)" -lt "$LIMITE" ]]; do
  sleep 3
  if [[ -f "$RUTA_CRED" ]]; then OK=1; break; fi
  if [[ -f "$RUTA_LOG" ]]; then
    FALLO="$(grep -E 'ERROR|Clave de registro inv' "$RUTA_LOG" 2>/dev/null | tail -1 || true)"
    if [[ -n "$FALLO" ]]; then
      mal "$(echo "$FALLO" | sed 's/^[^ ]* [^ ]* //')"
      break
    fi
  fi
  echo -n "    ..."
done
echo ""

if [[ "$OK" -eq 1 ]]; then
  CRED_ID="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('dispositivo_id','(desconocido)'))" "$RUTA_CRED" 2>/dev/null || echo '(desconocido)')"
  NOMBRE="$(hostname -s 2>/dev/null || scutil --get ComputerName 2>/dev/null || echo 'mac')"
  bien "Equipo registrado como $NOMBRE"
  bien "Identificador: $CRED_ID"
  echo ""
  echo -e "    ${GREEN}El equipo ya aparece en el panel y acepta comandos.${NC}"
  echo -e "    ${GRAY}Registro local: $RUTA_LOG${NC}"
  pausar_y_salir 0
fi

mal "El equipo no se registró en 60 segundos."
echo ""
echo -e "    ${YELLOW}Causas más comunes:${NC}"
echo -e "    ${GRAY}- La clave de registro ya se usó el máximo de veces o venció${NC}"
echo -e "    ${GRAY}- No hay salida a internet hacia $SUPABASE_URL${NC}"
echo -e "    ${GRAY}- El reloj del equipo está desfasado${NC}"
echo ""
echo -e "    ${GRAY}Detalle en: $RUTA_LOG${NC}"
if [[ -f "$RUTA_LOG" ]]; then
  echo ""
  tail -12 "$RUTA_LOG" | while IFS= read -r l; do echo -e "      ${GRAY}$l${NC}"; done
fi
pausar_y_salir 5

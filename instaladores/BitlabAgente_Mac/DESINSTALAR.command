#!/usr/bin/env bash
# Bitlab Terminal · Desinstalador del agente para Mac · v1.0.0

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
bien()  { echo -e "    ${GREEN}OK${NC}  $1"; }
aviso() { echo -e "    ${YELLOW}!${NC}   $1"; }

echo ""
echo -e "  ${CYAN}Bitlab Terminal - Desinstalador para Mac${NC}"
echo ""
read -rp "    ¿Seguro que quieres desinstalar el agente? (s/N): " CONFIRM
CONFIRM="$(echo "$CONFIRM" | tr '[:upper:]' '[:lower:]')"
if [[ "$CONFIRM" != "s" && "$CONFIRM" != "si" && "$CONFIRM" != "y" && "$CONFIRM" != "yes" ]]; then
  echo "    Cancelado."; exit 0
fi

PLIST="$HOME/Library/LaunchAgents/com.bitlabit.agente.plist"
DESTINO="$HOME/Library/Application Support/BitlabAgente"

# Detener el servicio en launchd (soporta macOS moderno bootout y legacy unload)
launchctl bootout "gui/$(id -u)/com.bitlabit.agente" 2>/dev/null || true
if [[ -f "$PLIST" ]]; then
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  bien "LaunchAgent eliminado"
fi

# Detener procesos en ejecución
pkill -9 -f "agente.sh" 2>/dev/null || true
pkill -9 -f "BitlabAgente" 2>/dev/null || true
bien "Procesos del agente detenidos"

# Eliminar carpeta de datos, configuración y credencial
if [[ -d "$DESTINO" ]]; then
  rm -rf "$DESTINO"
  bien "Carpeta del agente y credenciales eliminadas"
fi

echo ""
echo -e "    ${GREEN}El agente fue desinstalado completamente de esta Mac.${NC}"
echo -e "    El equipo aparecerá como 'Fuera de línea' en el panel para preservar su historial."
echo ""
read -rp "    Presiona Enter para cerrar..." _

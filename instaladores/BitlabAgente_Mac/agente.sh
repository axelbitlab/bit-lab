#!/usr/bin/env bash
# Bitlab Terminal · Agente de endpoint para Mac · v1.0.0
# Épica 3 · BTL-30 (agente Mac), BTL-28 (arranque launchd)
#
# Qué hace:
#   1. Si el equipo no está registrado, se registra solo con la clave del instalador.
#   2. Cada 30 s manda un latido con métricas (CPU, memoria, discos, procesos).
#   3. Cada 2 s pregunta si hay una orden; la ejecuta en zsh o bash y manda la salida en vivo.
#   4. Respeta el tiempo máximo, la cancelación desde el panel y el modo simulación.
# Seguridad:
#   - Cada llamada va firmada con HMAC-SHA256 (llave = sha256 del token), marca de tiempo y nonce.
#   - Verifica la firma del servidor en cada orden antes de ejecutarla.
#   - El token vive en credencial.json con permisos 600 (solo el usuario dueño).
#   - El token nunca se escribe en el log.
# Compatible con macOS 12+ (Monterey). Requiere: curl, openssl, python3 (preinstalados en macOS).

set -euo pipefail

VERSION_AGENTE="1.0.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------- rutas ----------
DIR_INSTALADO="$HOME/Library/Application Support/BitlabAgente"
if [[ -f "$DIR_INSTALADO/config.json" ]]; then
  DIR_DATOS="$DIR_INSTALADO"
else
  DIR_DATOS="$SCRIPT_DIR"
fi

RUTA_CONFIG="$DIR_DATOS/config.json"
if [[ ! -f "$RUTA_CONFIG" ]]; then
  RUTA_CONFIG="$DIR_DATOS/agente.config.json"
fi
RUTA_CREDENCIAL="$DIR_DATOS/credencial.json"
DIR_LOGS="$DIR_DATOS/logs"
DIR_TMP="$DIR_DATOS/tmp"
mkdir -p "$DIR_LOGS" "$DIR_TMP"

# ---------- log (rota a 1 MB, conserva 3) ----------
log() {
  local nivel="${2:-INFO}"
  local linea
  linea="$(date '+%Y-%m-%d %H:%M:%S') [$nivel] $1"
  local ruta="$DIR_LOGS/agente.log"
  if [[ -f "$ruta" ]] && [[ $(stat -f%z "$ruta" 2>/dev/null || stat -c%s "$ruta" 2>/dev/null) -gt 1048576 ]]; then
    [[ -f "$DIR_LOGS/agente.2.log" ]] && mv "$DIR_LOGS/agente.2.log" "$DIR_LOGS/agente.3.log"
    [[ -f "$DIR_LOGS/agente.1.log" ]] && mv "$DIR_LOGS/agente.1.log" "$DIR_LOGS/agente.2.log"
    mv "$ruta" "$DIR_LOGS/agente.1.log"
  fi
  echo "$linea" | tee -a "$ruta"
}

# ---------- configuración ----------
if [[ ! -f "$RUTA_CONFIG" ]]; then log "Falta la configuración ($RUTA_CONFIG)" ERROR; exit 2; fi

SUPABASE_URL="$(python3 -c "import json,sys; c=json.load(open('$RUTA_CONFIG')); print(c['supabase_url'].rstrip('/'))")"
PUBLISHABLE_KEY="$(python3 -c "import json,sys; c=json.load(open('$RUTA_CONFIG')); print(c['publishable_key'])")"
CLAVE_REGISTRO="$(python3 -c "import json,sys; c=json.load(open('$RUTA_CONFIG')); print(c.get('clave_registro',''))" 2>/dev/null || true)"

if [[ "$SUPABASE_URL" != https://* ]]; then log "supabase_url debe usar https" ERROR; exit 2; fi

# ---------- criptografía (openssl + python3) ----------
sha256_hex() {
  printf '%s' "$1" | openssl dgst -sha256 -hex 2>/dev/null | awk '{print $NF}'
}
hmac_hex() {
  local llave_hex="$1" mensaje="$2"
  printf '%s' "$mensaje" | openssl dgst -sha256 -hmac "$llave_hex" -hex 2>/dev/null | awk '{print $NF}'
}
# Comparación en tiempo constante (Python para evitar short-circuit de bash)
igual_seguro() {
  python3 -c "
import sys, hmac
a = sys.argv[1].encode(); b = sys.argv[2].encode()
sys.exit(0 if hmac.compare_digest(a, b) else 1)
" "$1" "$2"
}

# ---------- HTTP: llama a un RPC de Supabase ----------
invoke_rpc() {
  local funcion="$1" cuerpo="$2"
  local respuesta
  respuesta="$(curl -sS --max-time 30 \
    -X POST "$SUPABASE_URL/rest/v1/rpc/$funcion" \
    -H "apikey: $PUBLISHABLE_KEY" \
    -H "Content-Type: application/json; charset=utf-8" \
    --data-raw "$cuerpo" \
    -w "\n__HTTP_STATUS__:%{http_code}")"
  local status
  status="$(printf '%s' "$respuesta" | tail -1 | sed 's/__HTTP_STATUS__://')"
  local body
  body="$(printf '%s' "$respuesta" | sed '$d')"
  if [[ "$status" -ge 400 ]]; then
    local msg
    msg="$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(d.get('message',sys.argv[1]))" "$body" 2>/dev/null || echo "$body")"
    echo "__ERROR__:$status:$msg" >&2
    return 1
  fi
  printf '%s' "$body"
}

# ---------- credencial ----------
DISPOSITIVO_ID=""
TOKEN=""
LLAVE_FIRMA=""

leer_credencial() {
  if [[ -f "$RUTA_CREDENCIAL" ]]; then
    DISPOSITIVO_ID="$(python3 -c "import json; c=json.load(open('$RUTA_CREDENCIAL')); print(c['dispositivo_id'])" 2>/dev/null || true)"
    TOKEN="$(python3 -c "import json; c=json.load(open('$RUTA_CREDENCIAL')); print(c['token'])" 2>/dev/null || true)"
    if [[ -n "$TOKEN" ]]; then
      LLAVE_FIRMA="$(sha256_hex "$TOKEN")"
    fi
  fi
}

guardar_credencial() {
  local disp_id="$1" tok="$2"
  python3 -c "
import json
d = {'dispositivo_id': '$disp_id', 'token': '$tok'}
with open('$RUTA_CREDENCIAL.tmp', 'w') as f:
    json.dump(d, f)
"
  mv "$RUTA_CREDENCIAL.tmp" "$RUTA_CREDENCIAL"
  chmod 600 "$RUTA_CREDENCIAL"
  DISPOSITIVO_ID="$disp_id"
  TOKEN="$tok"
  LLAVE_FIRMA="$(sha256_hex "$tok")"
}

# ---------- datos del equipo ----------
datos_equipo() {
  local nombre ip version_so arq usuario interpretes
  nombre="$(hostname -s 2>/dev/null || scutil --get ComputerName 2>/dev/null || echo 'mac')"
  version_so="$(sw_vers -productName 2>/dev/null) $(sw_vers -productVersion 2>/dev/null)"
  arq="$(uname -m)"
  usuario="$(whoami)"
  ip="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo '')"
  interpretes='["zsh","bash"]'
  python3 -c "
import json
print(json.dumps({
  'nombre': '$nombre',
  'sistema': 'macos',
  'version_agente': '$VERSION_AGENTE',
  'version_so': '$version_so',
  'arquitectura': '$arq',
  'usuario_so': '$usuario',
  'ip_local': '$ip',
  'interpretes': [\"zsh\",\"bash\"]
}))
"
}

# ---------- métricas ----------
metricas() {
  python3 - <<'PYEOF'
import subprocess, json, re, os, sys

def run(cmd):
    try:
        return subprocess.check_output(cmd, shell=True, stderr=subprocess.DEVNULL, text=True).strip()
    except Exception:
        return ''

# CPU (promedio 1s con top)
cpu_raw = run("top -l 2 -n 0 -s 1 | grep 'CPU usage' | tail -1")
cpu_pct = 0.0
m = re.search(r'([\d.]+)%\s+user.*?([\d.]+)%\s+sys', cpu_raw)
if m:
    cpu_pct = round(float(m.group(1)) + float(m.group(2)), 1)

# RAM
import resource
try:
    page = resource.getpagesize()
except Exception:
    page = 4096
vm = run("vm_stat")
pages = {}
for line in vm.splitlines():
    for k in ['Pages free','Pages active','Pages inactive','Pages wired down','Pages speculative']:
        if line.startswith(k):
            try: pages[k] = int(line.split(':')[1].strip().rstrip('.'))
            except: pass
total_pages = pages.get('Pages free',0)+pages.get('Pages active',0)+pages.get('Pages inactive',0)+pages.get('Pages wired down',0)+pages.get('Pages speculative',0)
used_pages  = pages.get('Pages active',0)+pages.get('Pages wired down',0)
mem_raw = run("sysctl -n hw.memsize")
try:
    mem_total_mb = round(int(mem_raw)/(1024*1024))
except Exception:
    mem_total_mb = round(total_pages*page/1024/1024)
mem_usada_pct = round(used_pages/total_pages*100,1) if total_pages else 0

# Uptime
uptime_seg = 0
try:
    boot = run("sysctl -n kern.boottime")
    import re as re2, time
    sec = re2.search(r'sec = (\d+)', boot)
    if sec: uptime_seg = int(time.time()) - int(sec.group(1))
except: pass

# Discos
discos = []
df = run("df -k")
for line in df.splitlines()[1:]:
    p = line.split()
    if len(p) >= 6 and p[0].startswith('/dev/'):
        try:
            total_gb = round(int(p[1])*1024/1024/1024/1024,1)
            libre_gb  = round(int(p[3])*1024/1024/1024/1024,1)
            libre_pct = round(libre_gb/total_gb*100,1) if total_gb else 0
            discos.append({'unidad':p[5],'total_gb':total_gb,'libre_gb':libre_gb,'libre_pct':libre_pct})
        except: pass

# Procesos top 5 por memoria
procesos = []
ps = run("ps aux")
procs = []
for line in ps.splitlines()[1:]:
    p = line.split(None,10)
    if len(p) >= 6:
        try: procs.append({'pid':int(p[1]),'nombre':p[10].split('/')[-1][:40],'mem_pct':float(p[3]),'responde':True})
        except: pass
procs.sort(key=lambda x: x['mem_pct'], reverse=True)
procesos = procs[:5]

print(json.dumps({
    'cpu_pct': cpu_pct,
    'memoria_total_mb': mem_total_mb,
    'memoria_usada_pct': mem_usada_pct,
    'tiempo_encendido_seg': uptime_seg,
    'discos': discos,
    'procesos_top': procesos
}))
PYEOF
}

# ---------- llamada firmada ----------
invoke_agente() {
  local accion="$1" cuerpo_json="$2"
  local ts nonce firma cuerpo_rpc
  ts="$(date -u +%s)"
  nonce="$(uuidgen | tr -d '-' | tr '[:upper:]' '[:lower:]')"
  firma="$(hmac_hex "$LLAVE_FIRMA" "${accion}|${ts}|${nonce}|${cuerpo_json}")"
  cuerpo_rpc="$(python3 -c "
import json, sys
print(json.dumps({
  'p_dispositivo': sys.argv[1],
  'p_ts': int(sys.argv[2]),
  'p_nonce': sys.argv[3],
  'p_firma': sys.argv[4],
  'p_accion': sys.argv[5],
  'p_cuerpo': sys.argv[6]
}))
" "$DISPOSITIVO_ID" "$ts" "$nonce" "$firma" "$accion" "$cuerpo_json")"
  invoke_rpc "agente_rpc" "$cuerpo_rpc"
}

# ---------- registro automático ----------
registrar_equipo() {
  if [[ -z "$CLAVE_REGISTRO" ]]; then log "Falta clave_registro en la configuración" ERROR; return 1; fi
  local datos_json
  datos_json="$(datos_equipo)"
  local body
  body="$(python3 -c "import json, sys; print(json.dumps({'p_clave': sys.argv[1], 'p_equipo': json.loads(sys.stdin.read())}))" "$CLAVE_REGISTRO" <<< "$datos_json")"
  local resp
  if ! resp="$(invoke_rpc 'agente_registrar' "$body" 2>&1)"; then
    log "Error al registrar el equipo: $resp" ERROR
    return 1
  fi
  local disp_id tok
  disp_id="$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(d.get('dispositivo_id',''))" "$resp" 2>/dev/null || true)"
  tok="$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(d.get('token',''))" "$resp" 2>/dev/null || true)"
  if [[ -z "$disp_id" ]] || [[ -z "$tok" ]]; then
    log "Respuesta de registro no contiene credenciales: $resp" ERROR
    return 1
  fi
  guardar_credencial "$disp_id" "$tok"
  local nombre
  nombre="$(hostname -s 2>/dev/null || echo 'mac')"
  log "Equipo registrado como $nombre ($disp_id)"
}

# ---------- latido ----------
send_latido() {
  local datos_json met_json combinado
  datos_json="$(datos_equipo)"
  met_json="$(metricas)"
  combinado="$(python3 -c "
import json, sys
d = json.loads(sys.argv[1])
d['metricas'] = json.loads(sys.argv[2])
print(json.dumps(d))
" "$datos_json" "$met_json")"
  local resp
  resp="$(invoke_agente 'latido' "$combinado")"
  # rotación de token
  local rotar
  rotar="$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(d.get('rotar_token','false'))" "$resp" 2>/dev/null || echo 'false')"
  if [[ "$rotar" == "True" ]] || [[ "$rotar" == "true" ]]; then
    local nr
    nr="$(invoke_agente 'rotar' '{}')"
    local nuevo_tok
    nuevo_tok="$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['token'])" "$nr")"
    guardar_credencial "$DISPOSITIVO_ID" "$nuevo_tok"
    log "Token rotado a petición del administrador"
  fi
}

# ---------- ejecución de una orden ----------
SEQ=0
BUFFER_FILE=""
BUFFER_COUNT=0

ahora_ms() {
  python3 -c 'import time; print(int(time.time()*1000))' 2>/dev/null || echo "$(( $(date +%s) * 1000 ))"
}

agregar_linea() {
  local flujo="$1" texto="$2"
  # quitar códigos de color ANSI
  texto="$(printf '%s' "$texto" | sed 's/\x1B\[[0-9;?]*[A-Za-z]//g')"
  SEQ=$((SEQ+1))
  python3 -c 'import json, sys; print(json.dumps({"s": int(sys.argv[1]), "f": sys.argv[2], "t": sys.argv[3]}))' "$SEQ" "$flujo" "$texto" >> "$BUFFER_FILE"
  BUFFER_COUNT=$((BUFFER_COUNT+1))
}

send_salida() {
  local ejecucion_id="$1"
  local cancelar="false"
  local lineas_json="[]"
  if [[ "$BUFFER_COUNT" -gt 0 ]]; then
    # tomar hasta 500 líneas
    lineas_json="$(head -500 "$BUFFER_FILE" | python3 -c "
import sys,json
lines = [json.loads(l) for l in sys.stdin if l.strip()]
print(json.dumps(lines))
")"
    local total_lineas
    total_lineas="$(wc -l < "$BUFFER_FILE")"
    if [[ "$total_lineas" -le 500 ]]; then
      > "$BUFFER_FILE"
      BUFFER_COUNT=0
    else
      local tmp_buf
      tmp_buf="$(mktemp "$DIR_TMP/buf_XXXXXX")"
      tail -n +501 "$BUFFER_FILE" > "$tmp_buf"
      mv "$tmp_buf" "$BUFFER_FILE"
      BUFFER_COUNT=$((total_lineas-500))
    fi
  fi
  local cuerpo
  cuerpo="$(python3 -c "
import json,sys
print(json.dumps({'ejecucion_id': int(sys.argv[1]), 'lineas': json.loads(sys.argv[2])}))
" "$ejecucion_id" "$lineas_json")"
  local resp
  resp="$(invoke_agente 'salida' "$cuerpo" 2>/dev/null || echo '{}')"
  cancelar="$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(str(d.get('cancelar',False)).lower())" "$resp" 2>/dev/null || echo 'false')"
  [[ "$cancelar" == "true" ]]
}

complete_orden() {
  local ejecucion_id="$1" estado="$2" codigo="$3" error_msg="$4" duracion_ms="$5"
  local intentos=0
  while true; do
    # vaciar buffer primero
    while [[ "$BUFFER_COUNT" -gt 0 ]]; do
      send_salida "$ejecucion_id" || true
    done
    local cuerpo
    cuerpo="$(python3 -c "
import json,sys
d = {'ejecucion_id': int(sys.argv[1]), 'estado': sys.argv[2], 'duracion_ms': int(sys.argv[5])}
if sys.argv[3] != 'null': d['codigo'] = int(sys.argv[3])
if sys.argv[4]: d['error'] = sys.argv[4]
print(json.dumps(d))
" "$ejecucion_id" "$estado" "$codigo" "$error_msg" "$duracion_ms")"
    if invoke_agente 'finalizar' "$cuerpo" >/dev/null 2>&1; then
      break
    fi
    intentos=$((intentos+1))
    if [[ "$intentos" -gt 8 ]]; then log "Se perdió el cierre de #$ejecucion_id" ERROR; break; fi
    sleep $((2**intentos < 60 ? 2**intentos : 60))
  done
  local nombre
  nombre="$(hostname -s 2>/dev/null || echo 'mac')"
  log "Ejecución #$ejecucion_id terminada: $estado (código $codigo) en $nombre"
}

invoke_orden() {
  local orden_json="$1"

  local id interprete timeout_seg simulacion script firma_orden
  id="$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['id'])" "$orden_json")"
  interprete="$(python3 -c "import json,sys; print(json.loads(sys.argv[1]).get('interprete','zsh'))" "$orden_json")"
  timeout_seg="$(python3 -c "import json,sys; v=json.loads(sys.argv[1]).get('timeout_seg',120); print(v if v and v>0 else 120)" "$orden_json")"
  simulacion="$(python3 -c "import json,sys; print(str(json.loads(sys.argv[1]).get('simulacion',False)).lower())" "$orden_json")"
  script="$(python3 -c "import json,sys; print(json.loads(sys.argv[1]).get('script',''))" "$orden_json")"
  firma_orden="$(python3 -c "import json,sys; print(json.loads(sys.argv[1]).get('firma',''))" "$orden_json")"

  SEQ=0
  BUFFER_FILE="$(mktemp "$DIR_TMP/buf_${id}_XXXXXX")"
  BUFFER_COUNT=0

  # Verificar firma del servidor
  local firma_esperada
  firma_esperada="$(hmac_hex "$LLAVE_FIRMA" "${id}|${script}")"
  if ! igual_seguro "$firma_esperada" "$firma_orden"; then
    log "Orden #$id rechazada: firma del servidor no válida" ERROR
    agregar_linea "sistema" "Orden rechazada por el agente: firma no válida"
    complete_orden "$id" "fallida" "1" "Firma de la orden no válida" "0"
    rm -f "$BUFFER_FILE"; return
  fi

  log "Ejecución #$id ($interprete, máx. ${timeout_seg}s, simulación=$simulacion)"

  # Simulación
  if [[ "$simulacion" == "true" ]]; then
    agregar_linea "sistema" "[simulación] Intérprete: $interprete · tiempo máximo: ${timeout_seg}s"
    agregar_linea "sistema" "[simulación] Se ejecutaría el siguiente comando, sin aplicar cambios:"
    while IFS= read -r linea; do agregar_linea "stdout" "$linea"; done <<< "$script"
    complete_orden "$id" "exitosa" "0" "" "0"
    rm -f "$BUFFER_FILE"; return
  fi

  # Ejecución real
  local nombre_equipo
  nombre_equipo="$(hostname -s 2>/dev/null || echo 'mac')"
  agregar_linea "sistema" "Ejecutando en $interprete · $nombre_equipo"

  local shell_exe
  case "$interprete" in
    bash) shell_exe="/bin/bash" ;;
    *)    shell_exe="/bin/zsh"  ;;
  esac

  local script_tmp out_tmp err_tmp
  script_tmp="$(mktemp "$DIR_TMP/ejec_${id}_XXXXXX.sh")"
  out_tmp="$(mktemp "$DIR_TMP/ejec_${id}_XXXXXX.out")"
  err_tmp="$(mktemp "$DIR_TMP/ejec_${id}_XXXXXX.err")"

  # Envolver el script para capturar código de salida
  cat > "$script_tmp" <<SCRIPT_EOF
#!/usr/bin/env $shell_exe
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
$script
SCRIPT_EOF
  chmod +x "$script_tmp"

  local t_inicio_ms t_inicio_s
  t_inicio_ms="$(ahora_ms)"
  t_inicio_s=$((t_inicio_ms / 1000))

  # Lanzar proceso hijo
  "$shell_exe" "$script_tmp" >"$out_tmp" 2>"$err_tmp" &
  local PID_HIJO=$!

  local estado="" pos_out=0 pos_err=0 ultimo_envio
  ultimo_envio="$(date +%s)"
  local ultimo_latido
  ultimo_latido="$(date +%s)"

  # Leer salida en vivo con polling
  while kill -0 "$PID_HIJO" 2>/dev/null; do
    sleep 0.25

    # leer stdout nuevo
    if [[ -f "$out_tmp" ]]; then
      local nuevo_out
      nuevo_out="$(tail -c +$((pos_out+1)) "$out_tmp" 2>/dev/null || true)"
      if [[ -n "$nuevo_out" ]]; then
        pos_out=$((pos_out + ${#nuevo_out}))
        while IFS= read -r linea; do
          agregar_linea "stdout" "$linea"
        done <<< "$nuevo_out"
      fi
    fi
    # leer stderr nuevo
    if [[ -f "$err_tmp" ]]; then
      local nuevo_err
      nuevo_err="$(tail -c +$((pos_err+1)) "$err_tmp" 2>/dev/null || true)"
      if [[ -n "$nuevo_err" ]]; then
        pos_err=$((pos_err + ${#nuevo_err}))
        while IFS= read -r linea; do
          [[ -n "$linea" ]] && agregar_linea "stderr" "$linea"
        done <<< "$nuevo_err"
      fi
    fi

    local ahora
    ahora="$(date +%s)"

    # tiempo máximo
    if [[ $((ahora - t_inicio_s)) -gt "$timeout_seg" ]]; then
      estado="tiempo_agotado"; break
    fi

    # enviar buffer si lleno o cada 1s
    if [[ "$BUFFER_COUNT" -ge 20 ]] || [[ $((ahora - ultimo_envio)) -ge 1 ]]; then
      if send_salida "$id"; then estado="cancelada"; break; fi
      ultimo_envio="$ahora"
    fi

    # latido cada 30s
    if [[ $((ahora - ultimo_latido)) -ge 30 ]]; then
      send_latido 2>/dev/null || true
      ultimo_latido="$ahora"
    fi

    # protección de buffer
    if [[ "$BUFFER_COUNT" -gt 20000 ]]; then
      head -10000 "$BUFFER_FILE" > "${BUFFER_FILE}.trim" && mv "${BUFFER_FILE}.trim" "$BUFFER_FILE"
      BUFFER_COUNT=10000
      agregar_linea "sistema" "[se descartaron líneas por acumulación]"
    fi
  done

  if [[ -n "$estado" ]]; then
    # perro guardián: terminar proceso y descendientes
    kill -TERM "$PID_HIJO" 2>/dev/null || true
    sleep 0.3
    kill -KILL "$PID_HIJO" 2>/dev/null || true
    # drena salida final
    if [[ -f "$out_tmp" ]]; then
      local resto_out
      resto_out="$(tail -c +$((pos_out+1)) "$out_tmp" 2>/dev/null || true)"
      [[ -n "$resto_out" ]] && while IFS= read -r l; do agregar_linea "stdout" "$l"; done <<< "$resto_out"
    fi
    local msg_estado
    if [[ "$estado" == "cancelada" ]]; then
      msg_estado="Ejecución cancelada desde el panel"
    else
      msg_estado="Se superó el tiempo máximo de ${timeout_seg}s"
    fi
    agregar_linea "sistema" "$msg_estado"
    local t_fin_ms duracion_ms
    t_fin_ms="$(ahora_ms)"
    duracion_ms=$((t_fin_ms - t_inicio_ms))
    [[ "$duracion_ms" -lt 0 ]] && duracion_ms=0
    local error_msg
    if [[ "$estado" == "cancelada" ]]; then error_msg="Cancelada por el usuario"; else error_msg="Tiempo agotado"; fi
    complete_orden "$id" "$estado" "null" "$error_msg" "$duracion_ms"
  else
    local codigo_salida=0
    wait "$PID_HIJO" 2>/dev/null || codigo_salida=$?

    # drena resto de salida
    if [[ -f "$out_tmp" ]]; then
      local resto_out
      resto_out="$(tail -c +$((pos_out+1)) "$out_tmp" 2>/dev/null || true)"
      [[ -n "$resto_out" ]] && while IFS= read -r l; do agregar_linea "stdout" "$l"; done <<< "$resto_out"
    fi
    if [[ -f "$err_tmp" ]]; then
      local resto_err
      resto_err="$(tail -c +$((pos_err+1)) "$err_tmp" 2>/dev/null || true)"
      [[ -n "$resto_err" ]] && while IFS= read -r l; do [[ -n "$l" ]] && agregar_linea "stderr" "$l"; done <<< "$resto_err"
    fi

    local t_fin_ms duracion_ms
    t_fin_ms="$(ahora_ms)"
    duracion_ms=$((t_fin_ms - t_inicio_ms))
    [[ "$duracion_ms" -lt 0 ]] && duracion_ms=0
    local est_final
    if [[ "$codigo_salida" -eq 0 ]]; then est_final="exitosa"; else est_final="fallida"; fi
    complete_orden "$id" "$est_final" "$codigo_salida" "" "$duracion_ms"
  fi

  rm -f "$script_tmp" "$out_tmp" "$err_tmp" "$BUFFER_FILE"
}

# ---------- ciclo principal ----------
log "Agente Bitlab v$VERSION_AGENTE iniciado (datos en $DIR_DATOS)"

# Bloqueo de instancia única con archivo PID
LOCK_FILE="$DIR_DATOS/agente.pid"
if [[ -f "$LOCK_FILE" ]]; then
  OLD_PID="$(cat "$LOCK_FILE")"
  if kill -0 "$OLD_PID" 2>/dev/null; then
    log "Ya hay un agente corriendo (PID $OLD_PID); se cierra esta copia."
    exit 0
  fi
fi
echo "$$" > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

leer_credencial
FALLOS=0
ULTIMO_LATIDO=0

while true; do
  AHORA="$(date +%s)"
  if [[ -z "$DISPOSITIVO_ID" ]]; then
    if registrar_equipo; then
      ULTIMO_LATIDO=0
    else
      log "No se pudo registrar el equipo. Reintento en 10s." WARN
      sleep 10; continue
    fi
  fi

  # latido cada 30s
  if [[ $((AHORA - ULTIMO_LATIDO)) -ge 30 ]]; then
    if send_latido 2>/dev/null; then
      ULTIMO_LATIDO="$AHORA"
      FALLOS=0
    fi
  fi

  # reclamar orden
  RESP_RECLAMAR="$(invoke_agente 'reclamar' '{}' 2>&1)" || {
    MSG_ERR="$RESP_RECLAMAR"
    log "Error al reclamar: $MSG_ERR" WARN
    if echo "$MSG_ERR" | grep -q 'no registrado\|Firma no v'; then
      log "La credencial ya no es válida; se registrará de nuevo." WARN
      rm -f "$RUTA_CREDENCIAL"; DISPOSITIVO_ID=""; TOKEN=""; LLAVE_FIRMA=""
    fi
    if echo "$MSG_ERR" | grep -q 'revocado'; then
      log "El administrador revocó este equipo. Esperando 10 minutos." WARN
      sleep 600; continue
    fi
    FALLOS=$((FALLOS+1))
    ESPERA=$((2**FALLOS < 60 ? 2**FALLOS : 60))
    sleep "$ESPERA"; continue
  }

  TIENE_ORDEN="$(python3 -c "import json,sys; d=json.loads(sys.argv[1]); print('true' if d.get('ejecucion') else 'false')" "$RESP_RECLAMAR" 2>/dev/null || echo 'false')"
  if [[ "$TIENE_ORDEN" == "true" ]]; then
    ORDEN_JSON="$(python3 -c "import json,sys; print(json.dumps(json.loads(sys.argv[1])['ejecucion']))" "$RESP_RECLAMAR")"
    invoke_orden "$ORDEN_JSON"
  fi

  FALLOS=0
  sleep 2
done

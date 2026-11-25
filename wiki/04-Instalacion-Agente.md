# Guía de instalación del agente

## 1. Generar la clave de registro (una vez por equipo nuevo)

La genera un administrador desde el **SQL Editor de Supabase** (no hay UI en el
panel para esto todavía). Función real, con sus parámetros por nombre:

```sql
select public.crear_clave_registro(
  p_organizacion   := (select id from organizaciones limit 1),
  p_descripcion    := 'Instalador Mac',   -- o 'Instalador Windows', libre
  p_usos_maximos   := 50,                 -- null = sin límite de usos
  p_dias_vigencia  := 90                  -- null = no vence
);
```

Devuelve un texto `BTL-<32 caracteres hexadecimales>`. **Se muestra una sola
vez**: en la base solo queda guardado su hash (`clave_hash`), no se puede volver
a consultar. Cada equipo nuevo necesita su propia clave (o una con varios usos
si vas a instalar varios equipos seguidos); un equipo ya instalado y en línea no
necesita que se le genere otra.

## 2. Archivo de configuración

Cada paquete (`instaladores/BitlabAgente` para Windows,
`instaladores/BitlabAgente_Mac` para macOS) trae un `config.json` con:

```json
{
  "supabase_url": "https://<proyecto>.supabase.co",
  "publishable_key": "sb_publishable_...",
  "clave_registro": ""
}
```

`supabase_url` y `publishable_key` ya vienen cargados en el paquete del
proyecto. Si `clave_registro` se deja vacía, el instalador la pide por
pantalla al momento de instalar y la guarda él mismo en el `config.json` que
queda instalado en el equipo.

## 3. Instalar en Windows

Paquete: `instaladores/BitlabAgente/` (o el `.zip`). Pasos:

1. Descomprimir el `.zip` completo (agente, config, instalador deben quedar
   juntos).
2. Doble clic en `INSTALAR.bat` (ejecuta `instalar.ps1`).
3. Si `config.json` no trae clave, el instalador la pide: pegar la `BTL-...`
   generada en el paso 1.
4. El instalador copia el agente, registra el inicio automático y espera a que
   el equipo se registre contra Supabase.

## 4. Instalar en macOS

Paquete: `instaladores/BitlabAgente_Mac/` (o el `.zip`). Flujo real, tal cual lo
hace `instalar.command` (visto también en las capturas del equipo piloto
MacBook-Pro-de-gr):

1. Doble clic en `instalar.command` (macOS abre una Terminal sola).
2. **1/6 Comprobando el equipo** — valida macOS, `python3`, `curl` y que el
   paquete esté completo.
3. **2/6 Revisando la configuración** — lee `supabase_url` y
   `publishable_key`; si falta `clave_registro`, la pide por pantalla
   (`BTL-...`); hace una prueba de conectividad contra el proyecto (si falla,
   avisa pero no detiene la instalación).
4. **3/6 Instalando** en
   `~/Library/Application Support/BitlabAgente/` — copia `agente.sh` y
   `config.json` (con la clave ya puesta).
5. **4/6 Asegurando permisos** — deja la carpeta en `chmod 700`, solo el
   usuario actual tiene acceso.
6. **5/6 Configurando arranque automático con launchd** — crea
   `~/Library/LaunchAgents/com.bitlabit.agente.plist` y lo activa
   (`launchctl load`/`bootstrap`), así el agente arranca con el inicio de
   sesión y se reinicia solo si se cae (`KeepAlive`).
7. **6/6 Esperando a que el equipo se registre** — espera hasta 60 segundos a
   que aparezca `credencial.json` (el agente ya llamó a `agente_registrar` y
   recibió su token). Si aparece, muestra el nombre del equipo y el
   identificador (`dispositivo_id`) y confirma: *"El equipo ya aparece en el
   panel y acepta comandos"*.

### Evidencia real de instalación (equipo piloto, 24 nov 2026)

En la prueba de reinstalación hecha para el E7: inicio del paso 1/6 a las
**18:05**, equipo registrado y visible en el panel a las **18:06** — menos de 2
minutos en total (medido al minuto que marca el reloj del sistema). Detalle
completo en [Resultados de KPIs](05-Resultados-KPIs-E7.md).

### Si falla el registro

El propio instalador imprime las causas más comunes: la clave ya se usó el
máximo de veces o venció, no hay salida a internet hacia `supabase_url`, o el
reloj del equipo está desfasado (la firma HMAC se rechaza si
`|ahora − ts| > 300 s`). El detalle queda en
`~/Library/Application Support/BitlabAgente/logs/agente.log` (Mac) o el
equivalente en Windows.

## 5. Desinstalar

Windows: `DESINSTALAR.bat`. macOS: `DESINSTALAR.command` o `DESINSTALAR.sh`
(descarga el LaunchAgent y borra la carpeta de la aplicación).

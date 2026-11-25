# Bitlab IT · Manual de Despliegue y Entrega Rápida

Solución completa multiplataforma de monitoreo, terminal interactiva en vivo, ejecución remota masiva y catálogo inteligente de comandos para **macOS**, **Windows** y **Linux**.

---

## 📁 Estructura del Paquete

Al descomprimir este paquete encontrarás:

```text
bit-lab/
├── desplegar.py                     <- Script maestro de instalación y despliegue universal
├── INICIAR_PANEL.command            <- Lanzador rápido de 1-clic para macOS
├── INICIAR_PANEL.bat                <- Lanzador rápido de 1-clic para Windows
├── LEEME_ENTREGA.md                 <- Este documento de instrucciones
│
├── panel/                           <- Panel web desacoplado y modular
│   ├── index.html                   <- Enrutador inteligente de sesión
│   ├── login.html                   <- Pantalla de inicio de sesión dedicada
│   ├── equipos.html                 <- Monitoreo de equipos en tiempo real
│   ├── catalogo.html                <- Catálogo inteligente de comandos con caché local
│   ├── terminal.html                <- Terminal interactiva con pestañas por equipo
│   ├── historial.html               <- Historial de ejecuciones y auditoría
│   ├── masiva.html                  <- Ejecución masiva por grupos y SO
│   ├── usuarios.html                <- Gestión de usuarios y actualización de contraseñas
│   ├── config.js                    <- Credenciales del proyecto Supabase
│   ├── servidor.py                  <- Servidor web local en puerto 8000
│   └── modulos/                     <- Componentes, estilos y lógica modular desacoplada
│
├── instaladores/                    <- Paquetes de instalación de agentes
│   ├── BitlabAgente_Mac/            <- Agente para macOS (LaunchAgent / bash / zsh)
│   │   ├── instalar.command         <- Instalador de 1-clic para Mac
│   │   ├── DESINSTALAR.command      <- Desinstalador completo sin residuos
│   │   └── agente.sh                <- Motor del agente con firma HMAC
│   └── BitlabAgente/                <- Agente para Windows (PowerShell / Servicio)
│       ├── INSTALAR.bat             <- Instalador para Windows
│       └── DESINSTALAR.bat          <- Desinstalador de Windows
│
└── supabase/                        <- Base de datos y backend serverless
    └── MIGRACION_COMPLETA_UNIFICADA.sql <- Migración SQL unificada lista para ejecutar
```

---

## 🚀 Despliegue en 3 Pasos Rápidos

### Paso 1: Base de Datos (Supabase)
1. Inicia sesión en [Supabase](https://supabase.com/dashboard) y crea un proyecto nuevo (o usa uno existente).
2. Ve a la pestaña **SQL Editor** en la barra lateral izquierda.
3. Abre el archivo `supabase/MIGRACION_COMPLETA_UNIFICADA.sql`, copia todo su contenido, pégalo en el editor y haz clic en **Run**.
4. ¡Listo! Se habrán creado todas las tablas, índices, funciones RPC firmadas con HMAC, la clave maestra de instalación (`BTL-DEMO-2026-KEY`) y el catálogo completo de comandos multi-SO.

### Paso 2: Iniciar el Panel y Configurar
* En **macOS**: Haz doble clic en `INICIAR_PANEL.command` (o ejecuta `python3 desplegar.py` en la terminal).
* En **Windows**: Haz doble clic en `INICIAR_PANEL.bat` (o ejecuta `python desplegar.py`).

El asistente interactivo te permitirá:
* Opción `3`: Configurar tu URL de Supabase y Llave Pública (se sincronizan automáticamente con el panel y los agentes).
* Opción `1`: Abrir el panel web en tu navegador (`http://localhost:8000`).

### Paso 3: Desplegar el Agente en cualquier máquina
* **Desde el asistente:** Elige la Opción `2` (*Desplegar e Instalar Agente en este equipo*). Detecta el sistema operativo automáticamente, instala el servicio en segundo plano y conecta el equipo de inmediato.
* **Manualmente en Mac:** Entra a `instaladores/BitlabAgente_Mac/` y haz doble clic en `instalar.command`.
* **Manualmente en Windows:** Entra a `instaladores/BitlabAgente/` y haz doble clic en `INSTALAR.bat`.

---

## 🛠️ Características Principales Implementadas

1. **Terminal en Vivo Multi-SO y Pestañas Aisladas:**
   * Soporte en tiempo real para `zsh` / `bash` (macOS y Linux) y `PowerShell` (Windows).
   * **Cambio en caliente entre equipos:** al cambiar de Mac a Windows (o viceversa), la barra de comando sincroniza el intérprete predeterminado, el prompt y el placeholder de forma inmediata.
   * **Aislamiento de sesiones:** los comandos en ejecución en un equipo no se interrumpen si abres o cambias a otra máquina; cada equipo mantiene su pestaña con su propio buffer de salida xterm.
   * **Filtrado reactivo del catálogo lateral:** los comandos mostrados en el lateral se recalculan instantáneamente según el sistema operativo del equipo activo, evitando incompatibilidades.

2. **Catálogo Inteligente con Caché Local:**
   * Carga instantánea (0ms) mediante respaldo de caché local (`localStorage`), asegurando que la interfaz nunca quede en blanco incluso ante fluctuaciones de red o latencia de Supabase.
   * Botón de reintento automático y auto-resolución de comandos multi-plataforma.

3. **Gestión de Usuarios y Actualización de Contraseñas:**
   * Interfaz completa en `usuarios.html` para administradores.
   * Los administradores pueden cambiar la contraseña de cualquier usuario directamente con confirmación segura, validación de longitud (mínimo 8 caracteres) y opción de exigir cambio en el próximo inicio de sesión.
   * RPC `admin_cambiar_password_usuario` con cifrado criptográfico bcrypt (`pgcrypto`) y verificación de privilegios en el servidor.

4. **Generador y Gestión de Claves de Registro BTL (`claves.html`):**
   * Creación interactiva de claves con formato estándar `BTL-XXXX-XXXX-XXXX`.
   * Selección visual de límite de equipos (ilimitado, 1 solo equipo, 5, 25 o personalizado) y vigencia (30 días, 90 días, 1 año, permanente o personalizado).
   * Guardado persistente híbrido (Supabase + LocalStorage) para que todas las claves pasadas y activas se visualicen siempre.
   * Generación y copia de comandos de instalación de 1-clic para macOS y Windows.
   * Botón de **Eliminación Definitiva de Claves**: purga permanentemente cualquier clave del sistema y de la base de datos Supabase con confirmación segura.

5. **Eliminación Completa de Dispositivos de la Base de Datos:**
   * Permite a los administradores borrar definitivamente cualquier equipo desde la tarjeta de monitoreo o desde el menú contextual.
   * Elimina en cascada el dispositivo, credenciales criptográficas, sesiones y todo su historial de ejecuciones de Supabase (`admin_eliminar_dispositivo_completo`).

6. **Seguridad Robusta:**
   * Comunicación firmada mediante HMAC SHA-256 con protección anti-reenvío (nonces de uso único).
   * Tolerancia segura de reloj y protección de base numérica en sistemas Unix/BSD.
   * Políticas RLS (Row Level Security) activadas en todas las entidades.

7. **Desinstalación Limpia:**
   * Desinstaladores nativos que detienen servicios activos (`launchctl` / servicios Windows), limpian archivos PID, credenciales y carpetas de datos por completo.


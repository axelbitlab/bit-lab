# Resultados de KPIs — E7 (BTL-119)

Prueba piloto de integración extremo a extremo, 24 de noviembre de 2026, con 2
equipos: **MacBook-Pro-de-gr** (macOS) y **DESKTOP-J2USA7B** (Windows). Es una
prueba piloto con una muestra de 32 ejecuciones observadas en el historial, no
una medición estadística a gran escala. El reporte completo con las capturas
anotadas está en `Resultados_KPIs_E7_BTL-119.docx` (entregado en el chat; súbelo
tal cual al adjunto del ticket). Aquí va el resumen para la wiki.

| KPI | Criterio | Resultado obtenido | ¿Cumple? |
|---|---|---|---|
| Tasa de ejecución exitosa | ≥ 95% | 32/32 ejecuciones visibles en estado Exitoso (16 Mac + 16 Windows) = 100% | Sí |
| Tasa de entrega de reportes | ≥ 99% | 32/32 ejecuciones con duración y código de salida guardados en el historial = 100% | Sí |
| Latencia de ingesta | ≤ 60 s | Aproximada con la columna "Duración" del historial: entre 1.1 s y 15.3 s | Sí, como aproximación (ver limitación abajo) |
| Impacto en CPU | < 5% | Proceso del agente (bash, PID 44479) en reposo: 0.0% · ejecutando un comando: 0.5% | Sí |
| Tiempo de instalación | ≤ 10 min | Instalador iniciado a las 18:05, equipo registrado y visible en el panel a las 18:06 (< 2 min) | Sí |

## Cómo se midió cada uno

- **Ejecución exitosa y entrega de reportes**: historial del panel filtrado por
  equipo (`MacBook-Pro-de-gr` y `DESKTOP-J2USA7B` por separado), contando filas
  en estado `Exitoso` con código de salida `0` contra el total visible.
- **Latencia**: el sistema no expone por separado el timestamp de generación
  del dato en el agente contra el de recepción en el panel (eso implicaría
  instrumentar un timestamp específico en el protocolo, que hoy no existe). Se
  usó como aproximación la columna "Duración" del historial, que cubre desde
  que se despacha el comando hasta que el resultado queda visible en el panel.
  **Limitación documentada**: no es una medición aislada de la latencia de
  Supabase Realtime.
- **CPU**: en la Mac, comando `top` identificando el proceso del agente (`bash`,
  PID 44479, lanzado por `launchd`), comparando su `%CPU` en reposo contra
  mientras ejecutaba un comando.
- **Instalación**: desinstalación y reinstalación del agente en la Mac,
  cronometrada con el reloj del sistema visible en las capturas (inicio del
  paso 1/6 vs. equipo registrado en el panel).

## Pendiente

4 de 5 KPIs quedan demostrados de forma directa. El de latencia queda como
aproximación razonable, con su limitación explícita — si se necesita el dato
exacto, hay que agregar un campo de timestamp de generación en
`agente_rpc`/`fragmentos_salida_comandos` y comparar contra la hora de
recepción del canal Realtime; no se hizo en esta prueba piloto.

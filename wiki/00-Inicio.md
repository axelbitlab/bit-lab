# Wiki técnica — Bitlab Terminal

Documentación técnica del módulo de terminal remota, catálogo de comandos y menú
contextual (Épica 3/4, entregables E4–E7). Generada a partir del código real del
repositorio al 24 de noviembre de 2026 — no es el plan original, es lo que está
implementado hoy.

## Índice

1. [Arquitectura](01-Arquitectura.md) — cómo se conectan el panel, Supabase (Postgres,
   RLS, Realtime, RPC) y los agentes de Windows/Mac.
2. [Modelo de datos](02-Modelo-de-Datos.md) — tablas reales, columnas, relaciones y
   políticas de seguridad por fila (RLS).
3. [API y eventos en tiempo real](03-API-y-Eventos.md) — funciones RPC que usa el
   panel y canales de Supabase Realtime.
4. [Guía de instalación del agente](04-Instalacion-Agente.md) — clave de registro,
   `config.json`, instalación en Windows y en Mac.
5. [Resultados de KPIs (E7)](05-Resultados-KPIs-E7.md) — resumen de la prueba piloto
   de integración con los 5 KPIs del protocolo.

## Nota sobre el alcance real vs. el plan original

El planteamiento inicial del proyecto describía un backend en NestJS, colas con
Redis/BullMQ y un servidor Socket.IO propio. Lo que está construido y corriendo hoy
es más simple: el panel (HTML/JS estático) habla directo con Supabase usando
`supabase-js`, la seguridad vive en RLS y en funciones `SECURITY DEFINER`, el tiempo
real del panel lo da Supabase Realtime (WebSocket sobre `postgres_changes`), y los
agentes de Windows/Mac no mantienen un socket abierto: hacen sondeo (polling) cada
~2 segundos contra un endpoint RPC de Supabase, firmado con HMAC. Esta wiki
documenta ese sistema real, no el plan original.

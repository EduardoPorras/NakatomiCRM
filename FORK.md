# LAIROT Maestro · fork de Nakatomi

Este repositorio es el fork de desarrollo de **EduardoPorras/NakatomiCRM**, basado en `mrdulasolutions/NakatomiCRM`. Conserva el código completo, la licencia MIT, los créditos, las etiquetas y el historial del proyecto original. La base de esta integración es `b0132e67e2d758da57f1db750c5ebbfa9b6daf26` (v1.0.10).

La rama `codex/lairot-maestro` desarrolla la integración local con LAIROT Pulse y el ARM previo. `origin` apunta al fork propio; `upstream` conserva la referencia al original. No se suben cambios al proyecto original.

## Arquitectura de la fusión

- Nakatomi conserva PostgreSQL, las entidades comerciales, los permisos, la auditoría y su servidor MCP nativo.
- El proyecto local hermano `lairot-arm-local` presenta la interfaz maestra y conserva los eventos de navegación, la atribución, las reservas locales, los cobros y las propuestas de trabajo.
- La sincronización mantiene una correspondencia persistente entre IDs. Las altas y cambios hechos por MCP aparecen en la interfaz. Los cambios de la interfaz se guardan en las mismas entidades nativas.
- Cinco herramientas `pulse_*` añaden contexto, recorridos, métricas y propuestas al mismo `/mcp`; no requieren un segundo servidor MCP para el agente.
- Un adaptador stdio permite conectar clientes locales. Las conexiones de ChatGPT desde la nube requieren configurar un transporte externo autenticado o Secure MCP Tunnel; no están activadas por este fork.

## Archivos propios

- `app/pulse_tools.py`: herramientas Pulse con scopes e identidad de workspace.
- `compose.local.yml`: entorno Docker local, PostgreSQL persistente y puerto 4330 limitado a loopback.
- `scripts/local-init.mjs`: preparación local de propietario y credenciales privadas.
- `scripts/setup-mcp.mjs`: clave restringida para agentes y configuración del bridge.
- `LOCAL.md`: ejecución y rutas del entorno.

Las bases, archivos `.local/`, copias de respaldo y claves quedan fuera de Git y de la imagen Docker. No se activan proveedores de correo, calendarios, Meta ni servicios comerciales externos.

## Desarrollo

Desde el proyecto maestro hermano: `npm run start:master`. Desde este repositorio: `docker compose -f compose.local.yml up -d --build`. La preparación inicial de credenciales se realiza con `scripts/local-init.mjs` y `scripts/setup-mcp.mjs`, según `LOCAL.md`.

Las instrucciones y la documentación originales siguen disponibles para desarrollar cualquier componente del CRM. Un fork permite mantener una versión propia bajo la licencia incluida; no reemplaza los créditos de sus autores.

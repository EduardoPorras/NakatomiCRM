# LAIROT Maestro · Nakatomi fork

Trabajar en español. Este es el fork propio autorizado por Eduardo Porras para la fusión con LAIROT Pulse/ARM. `origin` es `EduardoPorras/NakatomiCRM`; `upstream` es el proyecto original, solo referencia. Conservar licencia, atribución e historial. Desarrollar en `codex/lairot-maestro` o nuevas ramas `codex/`.

La implementación actual es local. No desplegar, abrir túneles ni conectar proveedores externos sin una petición concreta. El frontend hermano `lairot-arm-local` usa 4320, sus páginas copiadas 4322 y esta API/MCP 4330. Mantener loopback. No detener otros proyectos Docker ni modificar producción, Google o Meta.

Nunca versionar `.local/`, `.env`, claves, bases, respaldos o archivos de clientes. La clave de agente tiene permisos restringidos; no sustituirla por la de administrador para eludir scopes. Mantener la autorización del workspace antes de acceder a Pulse. Las propuestas MCP requieren revisión humana y no envían mensajes.

Verificar pruebas nativas y protocolo MCP para cambios funcionales. Pruebas que escriben registros deben usar un workspace o una subcuenta de QA claramente identificados. Una etapa ganada no prueba un cobro; una visita no prueba identidad ni motivo de abandono. Documentar evidencia y límites.

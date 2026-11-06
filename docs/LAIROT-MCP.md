# Extensión local LAIROT Maestro

Este fork conserva el CRM y el MCP nativos de Nakatomi. `app/pulse_tools.py` registra cinco herramientas adicionales en el mismo transporte autenticado `/mcp`. No reemplaza las herramientas originales y no contiene claves de usuarios.

## Arquitectura y permisos

- Interfaz, recorridos y propuestas locales: proyecto hermano `../lairot-arm-local`, servidor 127.0.0.1:4320.
- Nakatomi: `compose.local.yml`, API y MCP en 127.0.0.1:4330; PostgreSQL queda en la red interna de su stack.
- El contenedor lee `/run/secrets/pulse-key`, un montaje de solo lectura de la clave privada del bridge. Llama a `host.docker.internal:4320` con el Host local fijo, Bearer e identidad de la API key. No se abre otro puerto.
- `PULSE_WORKSPACE_ID` autoriza exactamente un workspace. Otra clave, incluso de administrador en otro workspace, no permite consultar Pulse.
- Los scopes nativos se comprueban por operación: contacts/tasks para contexto y propuestas; contacts/activities/deals/notes para recorridos; contacts/deals para campañas.
- La clave `.local/agent-api-key` tiene permisos comerciales explícitos, sin administración de claves, eliminación, email, calendario, conectores ni aprobación. La clave de administrador solo se utiliza en la preparación local.
- `pulse_propose_followup` exige un request ID idempotente y crea una propuesta pendiente. Repetir el mismo contenido conserva el mismo ID; cambiar el contenido con el mismo request ID devuelve conflicto. Solo la interfaz humana puede aprobarla.

La autorización del bridge no sustituye a la de Nakatomi: se comprueban ambas. Los endpoints `/api/agent/*` de Pulse no se confunden con una API pública. Los datos se limitan a lo registrado localmente; atribución no significa causalidad y un último evento no explica el motivo de abandono.

## Arranque y clientes

Después de iniciar la instancia local existente:

```sh
node scripts/setup-mcp.mjs
docker compose -f compose.local.yml up -d --no-deps app
```

El script prepara una clave de agente, el secreto del bridge y las variables `PULSE_*`. Es idempotente y no imprime secretos. `.local`, los archivos `.env` y los datos quedan fuera de Git y del contexto de Docker.

El adaptador stdio está en `../lairot-arm-local/scripts/mcp-local.mjs` y usa el SDK oficial de MCP para reenviar herramientas, recursos y prompts cuando el servidor los anuncia. Lee la clave privada; no la incluye en los JSON/TOML de configuración. Las instrucciones exactas de Claude Desktop y Codex están en `../lairot-arm-local/docs/mcp-clients.md`.

ChatGPT requiere conexión remota autenticada o Secure MCP Tunnel compatible con la cuenta. Esta implementación no publica un endpoint ni abre un túnel, y no modifica las configuraciones globales de los clientes. No se afirma una conexión ChatGPT/Claude/Codex instalada por el hecho de que el servidor esté preparado.

## Pruebas reproducibles

Con Nakatomi y el maestro activos, y las dependencias del proyecto hermano instaladas:

```sh
node scripts/test-mcp-local.mjs
```

El script crea, solo si hace falta, un workspace **QA MCP · aislado** con datos ficticios. La clave se guarda en `.local/qa-api-key` (0600). Usa el protocolo MCP real y verifica:

1. `initialize` sin credencial: HTTP 401.
2. `initialize` y `tools/list` autenticados: 73 herramientas en la revisión probada, incluidas cinco Pulse.
3. Contacto nativo: creación, lectura e idempotencia; tarea nativa: creación y lectura; recurso `crm://contact/{id}`.
4. Una clave administradora de otro workspace no lee Pulse. Una clave de solo lectura no puede crear propuestas.
5. El adaptador stdio responde a initialize/list/call, plantillas de recursos, lectura de recursos y listado de prompts (cero prompts en la revisión probada).
6. Las herramientas Pulse leen contexto, recorrido, campañas con atribución last y propuestas del bridge real.

Estos seis grupos pasaron contra las instancias locales. Las escrituras nativas quedan en el workspace QA, no en el workspace de negocio. No se envían correos ni se crean citas externas.

Para probar también una escritura de propuesta a través del bridge:

```sh
node scripts/test-mcp-local.mjs --bridge-write-test
```

Este modo necesita la subcuenta **qa-fusion** con un contacto ficticio abierto. Crea una propuesta pendiente por ejecución, verifica el replay idempotente, conflicto HTTP 409 mediante MCP, persistencia visible por la API de la interfaz y auditoría. No la aprueba. La prueba inicial equivalente pasó y dejó la propuesta «Preparar revisión de Lucía · QA» para revisión en la interfaz.

Además, la revisión del bridge en el proyecto hermano cuenta con pruebas aisladas sobre autenticación, cuenta/contacto y propuestas. El cambio Python pasa Ruff; el proyecto TypeScript pasa typecheck. La validación anterior describe lo observado, no una garantía sobre clientes remotos, integraciones de producción ni todos los módulos originales de Nakatomi.


## Recorrido humano verificado

La prueba mostrable usa la subcuenta **qa-fusion**, separada de LAIROT y de las muestras de referencia. MCP creó el contacto ficticio «Lucía QA Fusión · ficticia» y la tarea «QA Fusión · revisar recorrido de Lucía». La interfaz guardó la empresa «Empresa QA · creada desde la interfaz», el estado «En conversación» y marcó aquella tarea como terminada. Después se editó y aprobó la propuesta «Preparar revisión de Lucía · QA» desde la interfaz.

El readback posterior por MCP confirmó los valores guardados, la tarea nativa con estado `done`, la propuesta `Aprobada`, el texto exacto editado por la persona y una nueva tarea compartida entre Pulse y Nakatomi. `pulse_journey` devolvió la misma empresa y estado que `get_contact`/`get_company`. No se envió correo ni se creó cita externa.

Mientras se conserven esos registros y valores de QA, se puede repetir esta comprobación:

```sh
node scripts/test-mcp-local.mjs --human-readback
```

La comprobación lee los cambios; no sustituye la interacción humana ni aprueba propuestas. Si la persona vuelve a editar la muestra, los valores esperados deben actualizarse deliberadamente.

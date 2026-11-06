# Nakatomi CRM · evaluación local

Instancia independiente del CRM y las páginas de LAIROT.

- Panel: http://127.0.0.1:4330/dashboard
- API: http://127.0.0.1:4330/docs
- MCP: http://127.0.0.1:4330/mcp
- Contenedores y volúmenes propios del proyecto Docker `nakatomi-local`.
- PostgreSQL no publica un puerto del host; la aplicación escucha únicamente en loopback.
- No se configuran correo, calendarios, modelos ni servicios externos.
- Configuración privada y acceso local en `.local/`, excluidos de Git y de la imagen Docker.

## Iniciar

Con Docker Desktop iniciado, desde esta carpeta:

```sh
docker compose -f compose.local.yml up -d --build
```

La primera inicialización se realiza con `node scripts/local-init.mjs`. Crea el
espacio `evaluacion-local`, un propietario local y el pipeline Sales de seis etapas.
El panel utiliza la clave de solo lectura de `.local/dashboard-key`. Las credenciales
del propietario quedan en `.local/owner.json`; no se imprimen ni publican.

## Detener sin borrar datos

```sh
docker compose -f compose.local.yml stop
```

## Verificar

```sh
docker compose -f compose.local.yml ps
curl http://127.0.0.1:4330/health
```

# Integracion n8n en wa-test

Esta integracion permite gestionar workflows de n8n desde este repositorio de manera transversal (no solo campanas).

## Requisitos

Variables en `.env`:

```env
N8N_API_URL=https://tu-instancia-n8n/api/v1
N8N_API_KEY=tu_public_api_key
```

Si falta alguna variable, la app sigue funcionando pero la capa n8n queda deshabilitada.

## CLI local

Comandos disponibles:

```bash
npm run n8n:list
npm run n8n:get -- <id>
npm run n8n:create -- <file.json>
npm run n8n:update -- <id> <file.json>
npm run n8n:delete -- <id>
npm run n8n:activate -- <id>
npm run n8n:deactivate -- <id>
npm run n8n:duplicate -- <id> [new-name]
```

Script: `scripts/n8n/workflow-manager.js`

## API admin para integracion programatica

Todas protegidas por `adminAuth`:

- `GET /admin/api/n8n/status`
- `GET /admin/api/n8n/workflows`
- `GET /admin/api/n8n/workflows/:id`
- `POST /admin/api/n8n/workflows`
- `PUT /admin/api/n8n/workflows/:id`
- `DELETE /admin/api/n8n/workflows/:id`
- `POST /admin/api/n8n/workflows/:id/activate`
- `POST /admin/api/n8n/workflows/:id/deactivate`
- `POST /admin/api/n8n/workflows/:id/duplicate`

### Payload create/update

Acepta workflow en dos formatos:

```json
{
  "workflow": {
    "name": "Mi flujo",
    "nodes": [],
    "connections": {},
    "settings": {
      "executionOrder": "v1"
    }
  }
}
```

o directamente el objeto workflow en el body.

## Estructura recomendada de archivos

Guardar JSON de flujos del proyecto en `n8n/workflows/` para versionarlos junto al codigo de `wa-test`.

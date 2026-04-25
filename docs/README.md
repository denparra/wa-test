# Documentación — WA-Test (Queirolo Autos)

Índice de navegación para la documentación del proyecto. La referencia de código y setup vive en el [README.md](../README.md) del root.

---

## Archivo fuente de verdad del roadmap

**`docs/roadmap/mejoras-campañas-operacion-2026.md`** es el único archivo activo con el backlog completo de features implementados y pendientes. Fue unificado el 2026-04-25 consolidando `mejoras-propuestas.md` y `next-features-spec.md`.

Cualquier feature listing, estado o análisis de viabilidad futuro debe partir de ese archivo.

---

## Estructura

```
docs/
├── lab-chat.md              Guía de referencia de Lab Chat (QA aislado)
├── n8n-integration.md       CLI + API admin para workflows n8n
├── logdocs.md               Traza operativa del bot y workflows
├── ops/
│   ├── current-workflow.md  Workflow n8n activo (puntero runtime)
│   └── db.md                Schema, migraciones, backups
├── roadmap/
│   ├── mejoras-campañas-operacion-2026.md   ← FUENTE DE VERDAD (backlog completo)
│   ├── mejoras-propuestas.md                ← OBSOLETO (tombstoned)
│   ├── next-features-spec.md                ← OBSOLETO (tombstoned)
│   ├── quick-wins-and-roadmap.md           ← Histórico
│   ├── n8n-twilio-conversation-adaptation.md ← Histórico
│   └── whatsapp-bot-improvements-2026-04-24.md ← Histórico
├── campaigns/             Features de campañas (follow-up, scheduling)
├── imports/               Importación CSV de contactos + vehículos
├── reference/             Material de referencia histórico
├── qa/                    Reportes del runner de escenarios Lab Chat
└── _schema_snapshots/     Snapshots de esquema SQLite
```

---

## Índice por tema

### Bot y conversaciones

- [Lab Chat: entorno de QA aislado](lab-chat.md) — diferencias con WhatsApp real, respuestas equivalentes, runner de escenarios
- [Integración n8n: CLI + API admin](n8n-integration.md)
- [Workflow n8n activo](ops/current-workflow.md)
- [Traza operativa](logdocs.md)

### Roadmap y estado de features

- [Backlog completo 2026](roadmap/mejoras-campañas-operacion-2026.md) ← **FUENTE ÚNICA DE VERDAD**

### Campañas
- [Follow-up: tracking de respuestas](campaigns/follow-up/phase1-implementation-summary.md)
- [Scheduling y preview](campaigns/scheduling/campaigns-scheduling-and-preview-analysis.md)

### Importación CSV
- [Guía de uso](imports/CSV-IMPORT-GUIDE.md)

### Operación
- [Base de datos](ops/db.md)

---

## Convenciones

- `.md` con prefijo `phase<n>-` documentan una fase específica del roadmap.
- `_schema_snapshots/` usa prefijo `_` para indicar que es auto-generado.
- Archivos tombstoned (OBSOLETO): se mantienen en el árbol por trazabilidad pero no se editan.
- Cualquier análisis nuevo va a `roadmap/` con fecha en el nombre.
# Documentación — WA-Test (Queirolo Autos)

Índice de navegación para la documentación del proyecto. La documentación principal del código y setup vive en el [README.md](../README.md) del root.

## Estructura

```
docs/
├── _schema_snapshots/   Snapshots de esquema SQLite (local / VPS / actual)
├── campaigns/           Features de campañas
│   ├── follow-up/       Tracking de respuestas y seguimiento
│   └── scheduling/      Programación de envíos y preview
├── imports/             Importación CSV de contactos + vehículos
├── ops/                 Operación del sistema (DB, timezone, snapshots)
├── reference/           Material de referencia (modelos de costos, read-me histórico)
└── roadmap/             Planificación y mejoras pendientes
```

## Índice por tema

### Campañas
- [Follow-up: viabilidad de tracking](campaigns/follow-up/campaign-recipient-follow-up-viability.md)
- [Fix: tracking de respuestas](campaigns/follow-up/fix-campaign-reply-tracking.md)
- [Phase 1: resumen de implementación](campaigns/follow-up/phase1-implementation-summary.md)
- [Phase 1: troubleshooting](campaigns/follow-up/phase1-troubleshooting-report.md)
- [Scheduling y preview: análisis](campaigns/scheduling/campaigns-scheduling-and-preview-analysis.md)

### Importación CSV
- [Guía de uso](imports/CSV-IMPORT-GUIDE.md)
- [Feature spec](imports/csv-import-feature.md)

### Operación
- [Base de datos (schema, migraciones, backups)](ops/db.md)
- [Zona horaria: opciones de fix](ops/timezone_fix_options.md)
- [Resultados SQLite en VPS](ops/resultadosqliteVPS.txt)
- [Integración n8n: CLI + API admin](n8n-integration.md)

### Roadmap y mejoras
- [Mejoras propuestas (2026-04-21)](roadmap/mejoras-propuestas.md) — último análisis
- [Quick wins y roadmap inicial](roadmap/quick-wins-and-roadmap.md)
- [Adaptación n8n + Twilio para conversación IA](roadmap/n8n-twilio-conversation-adaptation.md)

### Referencia
- [Proyecto WA-Test: visión general histórica](reference/ProyectoWatest.md)
- Modelos de costos WhatsApp Chile (`.xlsx`)

### Schema snapshots
Los snapshots JSON del esquema SQLite viven en `_schema_snapshots/`. Regenerar con `npm run db:schema`.

---

**Convenciones:**
- Los `.md` con prefijo `phase<n>-` documentan una fase específica del roadmap.
- `_schema_snapshots/` usa prefijo `_` para indicar que es auto-generado.
- Cualquier análisis nuevo va a `roadmap/` con fecha en el nombre.

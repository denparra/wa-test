## Implementation Progress

**Change**: generic-segments-single-source
**Mode**: Strict TDD

### Completed Tasks
- [x] 1.1 RED `tests/segment-campaign-flow.test.js`: cubrir segmentos/campañas `vehicles` legacy sin `source`, para fijar backward compatibility.
- [x] 1.2 RED `tests/segment-campaign-flow.test.js`: agregar rechazo de mezcla (`contacts` + filtros de auto, `vehicles` + `query`, año inválido) al crear segmento.
- [x] 1.3 GREEN `server.js`: extraer/enduracer `normalizeAudienceFilters()` + `validateSegmentDefinition()` con default legacy `vehicles` y errores 400 explícitos.
- [x] 1.4 REFACTOR `server.js`: reutilizar el validador en preview, create segment y resolución de audiencia sin tocar el happy path actual.
- [x] 2.1 RED `tests/segment-campaign-flow.test.js`: manual `contacts` acepta contacto sin vehículo; manual `vehicles` no acepta contacto puro ni mezcla en `segment_members`.
- [x] 2.2 GREEN `db/index.js`: hacer que `addMembersToSegment()` consulte `getSegmentById()`, derive `filters.source` y valide `contact_id`/`vehicle_id` por fuente.
- [x] 2.3 GREEN `db/index.js`: endurecer `listSegmentsWithCount()` y helpers manuales para contar/listar siempre según `source` normalizado.
- [x] 2.4 REFACTOR `db/schema.sql` y comentarios: documentar el contrato single-source de `segments.filters`/`segment_members` sin migración disruptiva.
- [x] 3.1 RED `tests/segment-campaign-flow.test.js`: campaña con segmento `contacts` resuelve destinatarios por contactos solamente; campaña `vehicles` conserva totales actuales.
- [x] 3.2 GREEN `server.js`: hacer que `getSegmentDescriptor()` y `resolveAudienceCandidates()` usen `segment.source` como verdad única para manual/dynamic/preview.
- [x] 3.3 GREEN `server.js`: devolver 400 en `/admin/api/segments`, `/members/preview` y `/members/bulk-add` cuando el payload contradiga la fuente del segmento.
- [x] 3.4 REFACTOR `server.js`: centralizar mensajes de error/guardrails para evitar forks entre flujo campaign y flujo segments.
- [x] 4.1 RED `tests/segment-campaign-flow.test.js`: crear segmento dinámico `contacts` con `query` y mantener default `vehicles` intacto.
- [x] 4.2 GREEN `admin/pages.js`: habilitar creación mínima de segmentos dinámicos `contacts` en `renderSegmentsPage()` usando `query`, sin alterar UX principal de `vehicles`.
- [x] 4.3 GREEN `admin/pages.js`: mantener el wizard de campañas vehicle-first; solo reflejar `contacts` donde ya existe selector/carga de segmento.
- [x] 4.4 REFACTOR `admin/pages.js`: aislar toggles/source hints para no mezclar este cambio con el bug visual de preview.
- [x] 5.1 GREEN `tests/segment-campaign-flow.test.js`: cerrar matriz de regresión final (`vehicles` legacy, `contacts` dynamic/manual, reject mixed-source, campaign assignment).
- [x] 5.2 REFACTOR `docs/logdocs.md`: registrar implementación, validación TDD y rollback de `generic-segments-single-source`.

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `lib/segment-audience.js` | Created | Added shared normalization, validation, and audience-resolution helpers for single-source segments. |
| `server.js` | Modified | Reused shared validation/resolution, preserved vehicle defaults, added PATCH edit support, exported `app` for HTTP tests, and returned 400s for source contradictions. |
| `db/index.js` | Modified | Enforced manual membership by segment source, normalized segment counting logic, and added segment update persistence. |
| `db/schema.sql` | Modified | Documented `segments.filters` and `segment_members` single-source contract comments. |
| `admin/pages.js` | Modified | Enabled dynamic contact segment creation by query, plus a minimal dynamic-segment edit form in detail view, while keeping vehicle-first UI behavior. |
| `tests/segment-campaign-flow.test.js` | Modified | Added regression and contact-source coverage for normalization, validation, manual membership, campaigns, UI, and HTTP routes. |
| `docs/logdocs.md` | Modified | Added implementation trace, second-pass validation, and rollback notes. |

### Test Summary

- **Total tests passing**: 13
- **Command**: `node --test tests/segment-campaign-flow.test.js`
- **Syntax checks**:
  - `node --check server.js`
  - `node --check db/index.js`
  - `node --check admin/pages.js`
  - `node --check tests/segment-campaign-flow.test.js`

### Status

18/18 tasks complete. Ready for verify.

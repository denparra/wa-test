# Design — Generic Segments Single Source

## Technical Approach

Formalizar `Segment` como audiencia reusable de fuente única usando el contrato ya insinuado en `filters.source`, sin tocar el happy path vehicle-first. La implementación mantiene `segments.filters` como payload canónico de reglas, endurece validaciones por fuente en API/DB, y hace que la resolución de audiencia tome `segment.source` como source of truth para preview, detalle, asignación de campaña y export.

## Architecture Decisions

| Decision | Options | Choice / Rationale |
|---|---|---|
| Persistencia de `source` | columna nueva en `segments` vs seguir en `filters` | **Seguir en `filters` en V1**. Menor migración, compatibilidad total con segmentos existentes; `normalizeAudienceFilters()` ya impone default `vehicles`. |
| Miembros manuales | una tabla por fuente vs `segment_members` polimórfica | **Mantener `segment_members`** con guardrails por segmento. Ya soporta `contact_id` o `vehicle_id`; solo falta validar coherencia con `filters.source`. |
| Lógica vehicle-first | rediseñar wizard vs encapsular cambio | **Cambio mínimo**: el flujo actual de campañas/segmentos por vehículos queda igual; `contacts` entra solo donde ya existe selector o panel separado. |
| Testing | cubrir solo DB vs agregar capa pura testeable | **Extraer/aislar validaciones puras mínimas** (si hace falta) para TDD estricto, pero sin refactor amplio del UI. |

## Data Flow

`POST /admin/api/segments` → `normalizeAudienceFilters()` → `validateSegmentDefinition()` → `createSegment()`

`campaign/segment uses segmentId` → `getSegmentDescriptor()` → `normalizeAudienceFilters(stored)` → `resolveAudienceCandidates()` →
- `vehicles` ⇒ `listVehicleContactsByFilters()` / `countVehicleAudienceByFilters()`
- `contacts` ⇒ `listContactsForCampaign()` / `countContactsForCampaign()`
- `manual` ⇒ `listSegmentRecipientTargets()` / `countSegmentMembers()`

Guardrail clave: si `mode=manual`, la fuente efectiva sale SIEMPRE del segmento almacenado; los filtros entrantes solo pueden aportar criterios compatibles con esa fuente.

## File Changes

| File | Action | Description |
|---|---|---|
| `server.js` | Modify | Agregar validaciones explícitas de contrato (`source`, `mode`, filtros permitidos), endurecer rutas de segmentos y campañas para rechazar mezcla de criterios. |
| `db/index.js` | Modify | Validar inserción/listado de miembros según fuente del segmento; mantener conteos/resolución separados por `vehicles` y `contacts`. |
| `db/schema.sql` | Modify | Sin cambio estructural grande; opcionalmente documentar CHECKs/migración mínima solo si hace falta reforzar consistencia. |
| `admin/pages.js` | Modify | Reducir UI a cambio mínimo: `vehicles` sigue default/oculto en dinámicos; `contacts` solo aparece en manual/contact filters y en campañas cuando corresponde. |
| `tests/segment-campaign-flow.test.js` | Modify | No regresión de vehicles + casos nuevos de contacts y rechazo de mezcla. |
| `docs/logdocs.md` | Modify | Traza obligatoria al implementar. |

## Interfaces / Contracts

```js
// filters JSON persistido en segments
{
  mode: 'dynamic' | 'manual',
  source: 'vehicles' | 'contacts',
  segmentId?: number | null,
  // vehicles only
  make?: string | null,
  model?: string | null,
  yearMin?: number | null,
  yearMax?: number | null,
  // contacts only
  query?: string
}
```

Reglas:
- `dynamic + vehicles`: puede usar `make/model/yearMin/yearMax`; NO `query`.
- `dynamic + contacts`: puede usar `query`; NO criterios de vehículo.
- `manual + vehicles|contacts`: NO reglas mixtas; miembros explícitos del mismo source.
- Segmentos legacy sin `source` se leen como `{ source: 'vehicles' }`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | normalización/validación de filtros | Red-Green sobre `normalizeAudienceFilters()` y nuevo validador: defaults legacy, rechazo de mezcla, rango inválido. |
| DB integration | segmentos manuales y dinámicos por fuente | `node:test` con `DB_PATH=:memory:`: manual contacts acepta contacto sin vehículo; manual vehicles no acepta contactos puros; conteos correctos. |
| Route integration | `POST /admin/api/segments`, `members/bulk-add`, preview | Casos 201/400 según fuente y payload. Si hace falta, exponer app factory mínima para testear sin boot completo. |
| Regression | happy path vehicles | Repetir tests actuales intactos y comparar resultados de audiencia/campaign assignment. |

## Migration / Rollout

No migration funcional obligatoria. Compatibilidad hacia atrás por lectura: ausencia de `source` => `vehicles`. No tocar campañas existentes ni recalcular segmentos legacy.

## Open Questions

- [x] V1 permite crear segmentos dinámicos `contacts` desde la pantalla de segmentos con una UI mínima y separada.

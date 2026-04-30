# Proposal — Generic Segments Single Source

## Intent

Desacoplar `Segment` de la idea actual “segmento de vehículos” para que represente una audiencia reusable con fuente explícita por segmento. La V1 debe abrir el camino a campañas sobre contactos sin autos, **sin romper ni alterar** el flujo actual de campañas/segmentos basados en vehículos, que hoy ya funciona bien.

## Scope

### In Scope
- Definir `Segment` como audiencia reusable con `source` única: `vehicles` o `contacts`.
- Preservar intacta la lógica actual de segmentos/campañas por vehículos y su UX/UI.
- Separar el bug de preview/UI (“campaña sin contactos”) como issue independiente.

### Out of Scope
- Mezclar `vehicles` y `contacts` dentro del mismo segmento.
- Rediseñar la UX actual del flujo vehicle-first.
- Corregir en este cambio el bug visual de preview/conteo.

## Capabilities

### New Capabilities
- `segment-audiences`: segmentos reutilizables con fuente declarada y reglas de membresía/resolución por fuente única.
- `contact-source-segments`: segmentos cuyo universo son contactos, habilitando campañas futuras sin dependencia de autos.

### Modified Capabilities
- None.

## Approach

Partir desde la idea 2 y el estado auditado: mantener el modelo actual como baseline operativa y encapsularlo detrás de una semántica más general de audiencia. La V1 introduce una distinción conceptual y de contrato (`source`) sin permitir mezcla; el flujo `vehicles` sigue siendo el camino por defecto y no debe degradarse. El bug de mensaje falso en preview se documenta aparte para no contaminar alcance ni validación.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `db/schema.sql` | Modified | Evolución del modelo `segments`/`segment_members` para fuente única explícita. |
| `db/index.js` | Modified | Resolución de audiencia y membresía separada por `vehicles` vs `contacts`. |
| `server.js` | Modified | Contratos API para crear/cargar segmentos respetando `source`. |
| `admin/pages.js` | Modified | UX conservadora: agregar semántica de fuente sin romper el flujo actual de vehículos. |
| `tests/segment-campaign-flow.test.js` | Modified | Cobertura de no regresión para segmentos vehicle-first y base para contact-source. |
| `docs/logdocs.md` | Modified | Traza de implementación cuando se ejecute el cambio. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Regresión en segmentos por vehículos | Med | Tratar `vehicles` como baseline inmutable y exigir pruebas de no regresión. |
| Filtrado/conteo ambiguo entre fuentes | Med | Contrato explícito `one segment = one source`. |
| Mezclar bug UI con refactor conceptual | High | Crear issue separado y excluirlo del acceptance scope. |

## Rollback Plan

Revertir cualquier cambio de schema/API/UI asociado a `source` y volver al comportamiento actual vehicle-first.

## Dependencies

- Estado auditado actual del sistema.
- Idea 2 de `docs/campaigns/ideas/ideas.md`.

## Success Criteria

- [x] Existe propuesta/spec para segmentos reutilizables con `source = vehicles|contacts`.
- [x] El flujo actual de segmentos/campañas por vehículos queda explícitamente preservado.
- [x] El bug de preview/UI queda separado como issue fuera de este cambio.

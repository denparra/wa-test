# Change Log Docs

This file is the operational trace of changes applied to the WhatsApp bot and related flows.

## Logging Rule

- Every non-trivial implementation must add one entry here.
- Keep entries practical: what changed, why, where, how validated, and rollback hint.

## Entry Template

### YYYY-MM-DD HH:MM - Short title

- Scope:
- Why:
- Files:
- Runtime impact:
- Validation:
- Rollback:

---

### 2026-04-29 11:40 - clearer segment list actions

- Scope: aclarar la acción principal en `/admin/segments` para que el listado comunique mejor cuándo se va a editar un segmento dinámico y cuándo se va a gestionar un segmento manual.
- Why: después de sumar edición y carga CSV dentro del detalle, la etiqueta genérica `Ver` quedaba ambigua y escondía capacidad operativa real.
- Files:
  - `admin/pages.js`: CTA del listado cambia a `Editar` para segmentos dinámicos y `Gestionar` para manuales.
  - `tests/segment-campaign-flow.test.js`: prueba de render para validar ambas etiquetas.
- Runtime impact: Muy bajo. Cambio puramente UX/UI en el listado de segmentos.
- Validation: `node --check admin/pages.js`, `node --check tests/segment-campaign-flow.test.js`, `node --test tests/segment-campaign-flow.test.js`.
- Rollback: revertir `admin/pages.js`, `tests/segment-campaign-flow.test.js` y esta entrada.

---

### 2026-04-29 11:25 - csv import inside manual contact segments

- Scope: habilitar importación CSV desde el detalle de segmentos manuales de contactos para crear/reutilizar contactos por teléfono y agregarlos al segmento sin duplicar miembros.
- Why: el flujo operativo necesitaba cargar leads sin autos asociados directamente dentro del segmento, aceptando CSV mínimo con teléfono y aprovechando el `upsert` actual de contactos.
- Files:
  - `server.js`: rutas de preview/confirm para importación CSV en `/admin/segments/:id`, parser case-insensitive para `phone|telefono`, y proceso de import seguro con `upsertContact()` + `addMembersToSegment()`.
  - `admin/pages.js`: panel de importación en detalle de segmentos manuales de contactos, preview de válidos/inválidos, confirmación de import y columna `Agregado al segmento` usando `segment_members.created_at`.
  - `tests/segment-campaign-flow.test.js`: cobertura UI del panel y prueba HTTP de importación sin duplicar contacto base ni miembro del segmento.
- Runtime impact: Bajo-medio. Solo agrega capacidad operativa en detalle de segmentos manuales de contactos; no altera campañas ni la importación CSV vehicle-first existente.
- Validation: `node --check server.js`, `node --check admin/pages.js`, `node --check tests/segment-campaign-flow.test.js`, `node --test tests/segment-campaign-flow.test.js`.
- Rollback: revertir `server.js`, `admin/pages.js`, `tests/segment-campaign-flow.test.js` y esta entrada.

---

### 2026-04-29 10:40 - campaign wizard false empty-audience warning

- Scope: corregir el falso warning de “audiencia vacía” al programar campañas después de usar `Cargar segmento` en `/admin/campaigns/new`.
- Why: el botón cargaba filtros del segmento pero no resolvía la audiencia en UI; el backend guardaba bien, pero el wizard seguía creyendo que la audiencia era `0` y disparaba una confirmación engañosa.
- Files:
  - `admin/pages.js`: `Cargar segmento` ahora también dispara `loadProdRecipients()` para sincronizar preview, total y feedback antes del guardado.
  - `tests/segment-campaign-flow.test.js`: regresión para asegurar que el botón de carga de segmento resuelva audiencia desde el propio wizard.
- Runtime impact: Bajo. No cambia la lógica backend de campañas; solo alinea el estado local del wizard con la audiencia real antes de programar.
- Validation: `node --check admin/pages.js`, `node --check tests/segment-campaign-flow.test.js`, `node --test tests/segment-campaign-flow.test.js`.
- Rollback: revertir `admin/pages.js`, `tests/segment-campaign-flow.test.js` y esta entrada.

---

### 2026-04-29 10:20 - campaign wizard source-safe segment selector

- Scope: corregir el wizard `/admin/campaigns/new` para que el selector de segmentos funcione con `contacts` y `vehicles` sin mezclar fuentes en Producción.
- Why: la UI mostraba el selector solo dentro del panel de vehículos y cargaba todos los segmentos sin filtrar, por lo que los segmentos de contactos no aparecían al elegir `Por contactos` y además se colaban donde no correspondían.
- Files:
  - `admin/pages.js`: selector de segmentos compartido para Producción, recarga source-aware al cambiar `recipientSource`, y limpieza del preview al cambiar de fuente.
  - `server.js`: `GET /admin/api/segments` acepta `?source=contacts|vehicles` para que el wizard pida solo segmentos compatibles.
  - `db/index.js`: `listSegments()` soporta filtro opcional por `source` manteniendo compatibilidad con el listado completo.
  - `tests/segment-campaign-flow.test.js`: cobertura del selector compartido y del filtrado HTTP por fuente para el wizard.
- Runtime impact: Bajo. No cambia la resolución real de audiencias; solo ordena la UX y acota el contrato del listado de segmentos para evitar mezclas inválidas.
- Validation: `node --check admin/pages.js`, `node --check server.js`, `node --check db/index.js`, `node --check tests/segment-campaign-flow.test.js`, `node --test tests/segment-campaign-flow.test.js`.
- Rollback: revertir `admin/pages.js`, `server.js`, `db/index.js`, `tests/segment-campaign-flow.test.js` y esta entrada.

---

### 2026-04-29 01:55 - generic-segments-single-source verify hardening

- Scope: segunda pasada para cerrar hallazgos críticos del verify de segmentos single-source, agregando evidencia HTTP/runtime y edición mínima segura para segmentos dinámicos `contacts`.
- Why: el verify había marcado incompleto el escenario `Edit dynamic contact segment`, faltaba cobertura runtime de rutas clave y el artifact de tasks estaba desincronizado respecto del estado real.
- Files:
  - `server.js`: export de `app` para tests HTTP, guard de boot en test, ruta `PATCH /admin/api/segments/:id` y reuse del contrato single-source en edición.
  - `db/index.js`: helper `updateSegment()` para persistir cambios de segmentos sin tocar el baseline `vehicles`.
  - `admin/pages.js`: formulario mínimo `segmentEditForm` en detalle de segmentos dinámicos para editar nombre y reglas sin permitir cambio de fuente.
  - `tests/segment-campaign-flow.test.js`: pruebas HTTP para create/reject mixed-source, vehicle campaign baseline con `segmentId`, y edición de segmento dinámico `contacts`.
  - `sdd/generic-segments-single-source/tasks`: checklist sincronizado a `[x]`.
  - `sdd/generic-segments-single-source/apply-progress`: artifact merged con evidencia TDD de la segunda pasada.
- Runtime impact: Bajo. No cambia el flujo exitoso `vehicles`; agrega capacidad explícita de edición para segmentos dinámicos y deja las validaciones de fuente también probadas a nivel HTTP.
- Validation: `node --test tests/segment-campaign-flow.test.js`, `node --check server.js`, `node --check db/index.js`, `node --check admin/pages.js`, `node --check tests/segment-campaign-flow.test.js`.
- Rollback: revertir `server.js`, `db/index.js`, `admin/pages.js`, `tests/segment-campaign-flow.test.js`, `sdd/generic-segments-single-source/tasks`, `sdd/generic-segments-single-source/apply-progress` y esta entrada.

---

### 2026-04-28 23:35 - generic-segments-single-source

- Scope: habilitar segmentos single-source `contacts|vehicles` sin romper el flujo exitoso actual de campañas/segmentos por vehículos.
- Why: el sistema necesitaba soportar segmentos y campañas basados en contactos, incluyendo contactos sin vehículo, pero sin mezclar esta entrega con el bug visual de preview ni degradar la UX vehicle-first existente.
- Files:
  - `lib/segment-audience.js`: helper compartido para normalizar, validar y resolver audiencias single-source.
  - `server.js`: validación 400 para mezcla de fuentes, resolución de audiencia basada en `segment.source` y reuse del helper compartido.
  - `db/index.js`: guardrails de membresía manual por fuente y conteo de segmentos usando normalización única.
  - `db/schema.sql`: comentarios del contrato single-source para `segments.filters` y `segment_members`.
  - `admin/pages.js`: creación mínima de segmentos dinámicos `contacts` por `query` sin tocar el happy path de `vehicles`.
  - `tests/segment-campaign-flow.test.js`: regresión de vehículos legacy, rechazo mixed-source, manual/dynamic contacts y uso en campañas.
  - `sdd/generic-segments-single-source/apply-progress`: evidencia TDD y estado de implementación.
- Runtime impact: Medio-bajo. Se agrega validación compartida y soporte `contacts` para segmentos/campañas; el baseline de vehículos conserva defaults legacy (`source = vehicles`) y el wizard principal sigue vehicle-first.
- Validation: `node --test tests/segment-campaign-flow.test.js`, `node --check server.js`, `node --check db/index.js`, `node --check admin/pages.js`, `node --check lib/segment-audience.js`, `node --check tests/segment-campaign-flow.test.js`.
- Rollback: revertir `lib/segment-audience.js`, `server.js`, `db/index.js`, `db/schema.sql`, `admin/pages.js`, `tests/segment-campaign-flow.test.js`, `sdd/generic-segments-single-source/apply-progress` y esta entrada.

---

### 2026-04-29 01:15 - Spec de segmentos genéricos con fuente única

- Scope: documentación/spec para desacoplar el concepto de segmento de autos sin romper el flujo actual basado en vehículos.
- Why: el proyecto necesita seguir operando campañas por autos como hoy, pero habilitar a futuro segmentos de contactos sin vehículo asociado y evitar quedar amarrado solo a marcas/autos.
- Files:
  - `docs/design/generic-segments-single-source-spec.md`: spec funcional para implementación con contrato `source = vehicles|contacts`, compatibilidad hacia atrás y no-objetivos.
  - `docs/logdocs.md`: traza operativa de esta definición.
- Runtime impact: Ninguno. Es documentación de diseño previa a implementación.
- Validation: revisión contra la idea 2 de `docs/campaigns/ideas/ideas.md` y contra el comportamiento actual auditado de segmentos/campañas.
- Rollback: eliminar `docs/design/generic-segments-single-source-spec.md` y esta entrada si se descarta la línea de trabajo.

---

### 2026-04-26 - Segmentos manuales + resolución real de audiencia en campañas

- Scope: corregir el wizard de campañas para que deje de guardar solo una muestra de 5 destinatarios, resolver la audiencia completa en backend desde filtros/segmentos, habilitar segmentos manuales con carga de miembros desde contactos o vehículos, y mejorar la UX de segmentos con selects de marca/año y vista de detalle por segmento.
- Why: el flujo de producción usaba el endpoint de preview como si fuera asignación real, por eso al cargar un segmento aparecían 5 destinatarios y la campaña podía guardarse incompleta. Además faltaba la posibilidad de crear segmentos vacíos y cargarles miembros manualmente, y la UI tenía demasiada fricción con textboxes libres para marca/año y sin forma de inspeccionar el contenido del segmento.
- Files:
  - `db/schema.sql`: nueva tabla `segment_members` para segmentos manuales.
  - `db/index.js`: conteo real de audiencias (`countVehicleAudienceByFilters`, `countContactsForCampaign`), listas paginadas de audiencia, años disponibles (`listVehicleYears()`), helpers para limpiar/reasignar recipients de campaña, y funciones para agregar/listar miembros de segmentos manuales.
  - `server.js`: helpers de resolución de audiencia, creación/edición de campañas asignando el total real desde filtros o segmentos, preview devolviendo `samples + total`, endpoints para previsualizar/cargar/eliminar miembros en segmentos manuales, exportación CSV del segmento, y nueva vista `GET /admin/segments/:id`.
  - `admin/pages.js`: campaña de producción mostrando conteo real y usando backend para la carga total; página de segmentos con creación `dinámico/manual`, selects de marca y rango `desde/hasta`, panel para cargar miembros por vehículos/contactos, y pantalla detalle de segmento para inspeccionar miembros guardados o coincidencias vivas, buscar dentro de la tabla, quitar miembros manuales y exportar.
  - `tests/segment-campaign-flow.test.js`: pruebas automáticas del flujo base segmentos/campañas, incluyendo borrado individual de miembros.
  - `docs/logdocs.md`: traza operativa del cambio.
- Runtime impact: Medio-bajo. No toca n8n ni la lógica inbound. Sí agrega tabla nueva y cambia el comportamiento del wizard de campañas para que el backend resuelva la audiencia completa y los segmentos manuales queden disponibles operativamente.
- Validation: `node --check server.js`, `node --check admin/pages.js`, `node --check db/index.js`, `node --check tests/segment-campaign-flow.test.js`, `node --test tests/segment-campaign-flow.test.js`.
- Rollback: revertir `db/schema.sql`, `db/index.js`, `server.js`, `admin/pages.js`, `tests/segment-campaign-flow.test.js` y esta entrada. La migración es aditiva (`CREATE TABLE IF NOT EXISTS segment_members`).

---

### 2026-04-26 - Lab Chat suite for vehicle/publication suppression

- Scope: QA conversacional no persistente para la nueva lógica de supresión puntual por vehículo/publicación.
- Why: Validar rápido en Lab Chat que frases como `ya lo vendí` y `ya no está disponible` respondan con supresión puntual y NO disparen BAJA global, sin tocar persistencia ni WhatsApp real.
- Files:
  - `server.js`: nueva suite `vehicle-suppression` en `LAB_SCENARIOS` con cinco escenarios (vendido, no disponible, ese auto ya salió, BAJA global, no me contacten más global).
  - `admin/pages.js`: nuevo botón `Run vehicle suppression` en Lab Chat + contador de suite en el panel lateral.
- Runtime impact: Bajo. Solo amplía el catálogo de pruebas del Lab Chat y su UI; no cambia el flujo productivo ni la persistencia.
- Validation: `node --check server.js` y `node --check admin/pages.js`.
- Rollback: revertir los cambios en `server.js` y `admin/pages.js` para eliminar la suite y el botón.

---

### 2026-04-25 - Implement 6 (real metrics dashboard), J (segments with live count), 4 (unified inbox)

- Scope: Tres features completando la iteración planificada. Dos requieren migración de schema (segments + conversation_status). Sin dependencias externas nuevas.
- Why: Segunda mitad de la iteración de mejoras priorizadas (H+1+3 completados previamente). Cierra la iteración con las features de mayor impacto operacional en visibilidad de datos y gestión de conversaciones.
- Files:
  - `db/schema.sql`: Columnas `last_used_at TEXT` y `last_campaign_id INTEGER` en `segments`. Nueva tabla `conversation_status` (phone PK, status, updated_at).
  - `db/index.js`: Migración inline con `PRAGMA table_info` en bloque startup. Siete funciones nuevas: `getDashboardMetrics()` (tasas de respuesta 30/60d, top 5 campañas, envíos semanales 4 semanas, top marcas), `listSegmentsWithCount()` (COUNT vivo por segmento), `updateSegmentLastUsed()`, `listInboxConversations()`, `countUnreadConversations()`, `markConversationRead()`, `getConversationMessagesByPhone()`.
  - `server.js`: Imports de 7 funciones db nuevas + `renderSegmentsPage`, `renderInboxPage`. Dashboard route pasa `metrics`. Nuevas rutas: `GET /admin/segments`, `POST /admin/api/segments`, `DELETE /admin/api/segments/:id`, `GET /admin/inbox`, `POST /admin/api/inbox/:phone/read`, `GET /admin/api/inbox/unread-count`.
  - `admin/pages.js`: `renderDashboardPage` acepta `metrics` y añade sección con tarjetas de tasa de respuesta (con delta vs período anterior), top campañas por engagement, gráfico ASCII de envíos semanales, barras de marcas frecuentes. Nuevas exportaciones: `renderSegmentsPage` (tabla con live count, filtros, delete) y `renderInboxPage` (layout dos paneles, lista de conversaciones filtrable, burbuja de mensajes, auto-scroll a fondo).
  - `admin/render.js`: `NAV_ITEMS` añade `inbox` (con `badge: true`) y `segmentos`. CSS de `.nav-badge`. JS inline en `renderLayout` que hace fetch a `/admin/api/inbox/unread-count` y muestra el badge si hay no leídos.
  - `docs/roadmap/mejoras-campañas-operacion-2026.md`: Features 4, 6, J marcados `✅ DONE 2026-04-25`. Iteración completa.
- Runtime impact: Bajo en rutas existentes. Las 7 queries nuevas corren solo en las rutas nuevas o en el dashboard. Dashboard añade ~6 queries ligeras en cada carga de `/admin`. El badge hace 1 fetch al cargar cualquier página del admin.
- Validation: `node --check` en server.js, admin/pages.js, admin/render.js — sin errores.
- Rollback: `git revert HEAD` o revertir los cinco archivos. La migración de schema es aditiva (ADD COLUMN / CREATE TABLE IF NOT EXISTS) — no destructiva en la DB existente.

---

### 2026-04-25 - Implement H (engagement profile), 1 (clone campaign), 3 (bulk opt-out import)

- Scope: Tres features del roadmap implementados. Sin nuevas tablas, sin dependencias externas.
- Why: Primera iteración de mejoras priorizadas por bajo esfuerzo y alto impacto operacional.
- Files:
  - `db/index.js`: `bulkInsertOptOuts(phones[])` (transacción con INSERT OR IGNORE + UPDATE contacts), `getContactEngagementStats(contactId)` (4 queries simples: campaigns_received, campaigns_responded, last_campaign, last_reply).
  - `server.js`: Imports de `bulkInsertOptOuts` y `getContactEngagementStats`. GET `/admin/contacts/:id/edit` ahora pasa `engagement` a la página. POST `/admin/api/campaigns/:id/duplicate` (copia name + message_template + type + content_sid + template_id + filters, sin destinatarios, status=draft). POST `/admin/import/optouts` (parse CSV, normaliza teléfonos, llama bulkInsertOptOuts).
  - `admin/pages.js`: `renderContactEditPage` acepta `engagement` y muestra sección "Historial de engagement" debajo de vehículos. `renderCampaignsPage` agrega botón ⧉ (Duplicar) a todos los estados de campaña + función `duplicateCampaign()` en script inline. `renderImportPage` acepta `optOutResult` y muestra sección de importación de opt-outs siempre visible.
- Runtime impact: Bajo. Las queries de engagement se ejecutan solo al abrir la edición de un contacto (4 lightweight SELECTs). Duplicate y opt-out import son nuevas rutas sin impacto en flujos existentes.
- Validation: Syntax check con `node --check` en los tres archivos — sin errores. `node -e import()` en db/index.js y admin/pages.js — OK.
- Rollback: `git revert HEAD` o revertir los tres archivos al estado previo al commit.

---

### 2026-04-25 - Roadmap unification + viability analysis

- Scope: Documentación. Consolidación del roadmap de features en un solo archivo fuente de verdad.
- Why: Existían dos documentos con solapamiento: `next-features-spec.md` (specs técnicas 1–8) y `mejoras-campañas-operacion-2026.md` (A–K basadas en investigación de mercado). Generaban confusión sobre qué era canónico.
- Files: `docs/roadmap/mejoras-campañas-operacion-2026.md` (reescrito, ahora fuente única), `docs/roadmap/next-features-spec.md` (tombstoned con pointer), `docs/logdocs.md` (este registro).
- Features seleccionados para próxima implementación: **1** (Clonar campaña, ~2h), **3** (Import masivo opt-outs, ~2h), **4** (Inbox unificado, ~5h), **6** (Dashboard métricas reales, ~5h), **H** (Engagement profile, ~2h), **J** (Segmentos dinámicos, ~5h). Total estimado: 16–21h.
- Viabilidad actualizada con inspección real del código: CSS del inbox ya existe en render.js; queries de follow-up ya existen; tabla segments ya existe; infraestructura CSV import ya existe.
- Runtime impact: Ninguno. Solo documentación.
- Validation: N/A.
- Rollback: N/A.

---

### 2026-04-24 14:05 - Handoff loop and opt-out hardening

- Scope: n8n handoff loop reduction, opt-out propagation, semantic opt-out in wa-test.
- Why: repeated CTA loops after acceptance and need stronger low-friction opt-out detection.
- Files: `server.js`, `scripts/n8n/tune-meta-agent-handoff.js`, `n8n/workflows/META-CONSIGNACION-V1.json`, `docs/roadmap/whatsapp-bot-improvements-2026-04-24.md`.
- Runtime impact: improved handoff confirmation and reduced repeated re-offers.
- Validation: syntax checks, workflow update, manual conversational cases.
- Rollback: use previous workflow backup JSON and revert commit if required.

### 2026-04-24 14:35 - Campaign-first context fix (server + n8n)

- Scope: align server fallback CTA context with n8n handoff detector.
- Why: if first turn uses local fallback, n8n could miss pending CTA context and loop after informal confirmations.
- Files: `server.js`, `scripts/n8n/tune-meta-agent-handoff.js`, `n8n/workflows/META-CONSIGNACION-V1.json`.
- n8n workflow: id `PI8uZo5omcN3576y`, name `META-CONSIGNACION-V1`.
- Backup artifact: `n8n/workflows/META-CONSIGNACION-V1.remote-backup-20260424-pre-server-context-fix.json`.
- Runtime impact:
  - server tracks recent CTA-offer context (`handoff_offer_pending`) for short window.
  - n8n `Detectar Handoff` consumes `raw_input.context.handoff_offer_pending`.
  - confirmations like informal short replies are interpreted with better context.
- Validation: run n8n tune script, update remote workflow, verify no syntax errors.
- Rollback: restore `n8n/workflows/META-CONSIGNACION-V1.remote-backup-20260424-pre-intent-context.json` and remove handoff-offer map logic in `server.js`.

### 2026-04-24 15:10 - Persistent post-handoff lock to prevent CTA re-open

- Scope: harden post-derivation behavior so phatic replies never reopen executive CTA.
- Why: real conversation showed `Ok gracias` after confirmed handoff could still trigger a new CTA.
- Files: `scripts/n8n/tune-meta-agent-handoff.js`, `n8n/workflows/META-CONSIGNACION-V1.json`, `server.js`.
- n8n workflow: id `PI8uZo5omcN3576y`, name `META-CONSIGNACION-V1`.
- Runtime impact:
  - new persistent flags in memory: `handoff_status`, `suppress_executive_offer_until`.
  - output guard in fusion: if already derived, force concise closure and block CTA reopen.
  - `Detectar Handoff` now treats `handoff_status`/suppression window as derived context.
  - server forwards `handoff_active` context and broadens short phatic ack recognition.
- Validation: `node --check` for modified files, regenerate workflow from tune script, update remote n8n workflow.
- Rollback: restore `n8n/workflows/META-CONSIGNACION-V1.remote-backup-20260424-pre-server-context-fix.json` and revert commit.

### 2026-04-24 18:40 - Stability fix for fallback quality and informal handoff confirmations

- Scope: reduce n8n fallback frequency and improve confirmation detection for phrases like `ok enviame`.
- Why: production flow still showed fallback at first turn and CTA loops after informal acceptance.
- Files: `server.js`, `scripts/n8n/tune-meta-agent-handoff.js`, `n8n/workflows/META-CONSIGNACION-V1.json`.
- n8n workflow: id `PI8uZo5omcN3576y`, name `META-CONSIGNACION-V1`.
- Backup artifact: `n8n/workflows/META-CONSIGNACION-V1.remote-backup-20260424-pre-stability-fix.json`.
- Runtime impact:
  - n8n bridge timeout increased to 8s with one retry for transient failures.
  - enriched n8n bridge logs (`timeout`, `non-2xx`, `invalid json`, `empty reply`).
  - fallback copy for initial consignation changed to value + CTA (avoids cold data-collection prompt).
  - `Detectar Handoff` now treats action-style confirmations (`ok enviame`, `mandame`, `si espero`, etc.) as handoff confirmation in CTA context.
- Validation: syntax checks, workflow regenerate, remote workflow update.
- Rollback: restore remote backup above and revert this change set in `server.js` and tune script.

### 2026-04-24 18:48 - Coherence fix for direct contact requests and post-acceptance behavior

- Scope: strengthen handoff intent detection so direct contact phrases derive immediately and avoid incoherent CTA/email loops.
- Why: real chat showed `si por favor que me contacten` and `ok enviame` did not reliably trigger derivation, causing repeated CTA prompts.
- Files: `scripts/n8n/tune-meta-agent-handoff.js`, `n8n/workflows/META-CONSIGNACION-V1.json`.
- n8n workflow: id `PI8uZo5omcN3576y`, name `META-CONSIGNACION-V1`.
- Backup artifact: `n8n/workflows/META-CONSIGNACION-V1.remote-backup-20260424-pre-coherence-fix.json`.
- Runtime impact:
  - `Detectar Handoff` now derives on explicit direct-contact requests even without prior CTA context.
  - CTA-context detector expanded to include conjugations like `contacte/contacten` in prior assistant output.
  - Fusion now treats affirmative non-question statements like `te contacto un ejecutivo...` as effective handoff confirmation state.
  - Prompt guardrail updated to avoid asking for email before confirming derivation once contact intent is accepted.
- Validation: syntax check on tune script, regenerate workflow JSON, update remote workflow.
- Rollback: restore remote backup above and re-run update.

### 2026-04-24 18:58 - Chat regression harness for faster QA

- Scope: add local scripted conversation testing harness to validate WhatsApp bot behavior without real WhatsApp sends.
- Why: repeated conversational regressions required faster deterministic testing before production validation.
- Files: `scripts/harness/chat-regression.js`, `scenarios/harness/chat-regression.default.json`, `docs/ops/chat-harness.md`, `package.json`.
- Runtime impact: new command `npm run harness:chat` executes multi-turn conversation checks with assertions and conversation-level anti-loop rules.
- Validation: script syntax check and dry-run invocation documented.
- Rollback: remove harness files and npm script entry.

### 2026-04-24 19:00 - Harness-driven hardening for post-handoff email turn

- Scope: fix incoherent follow-up after confirmed handoff when user sends email in next turn.
- Why: harness exposed loop where assistant re-opened executive CTA after already derived.
- Files: `server.js`, `scripts/n8n/tune-meta-agent-handoff.js`, `n8n/workflows/META-CONSIGNACION-V1.json`, `scenarios/harness/chat-regression.n8n.json`.
- n8n workflow: id `PI8uZo5omcN3576y`, name `META-CONSIGNACION-V1`.
- Backup artifact: `n8n/workflows/META-CONSIGNACION-V1.remote-backup-20260424-pre-harness-hardening.json`.
- Runtime impact:
  - server applies a deterministic post-handoff guard: if handoff is active and user provides email, closes with derived confirmation instead of reopening CTA.
  - server blocks CTA re-open when handoff is active and AI outputs another executive offer.
  - fusion logic now treats `handoff_active` context and persistent handoff flags as derived state source.
- Validation:
  - `npm run harness:chat` (twilio_inbound) -> `PASSED`.
  - direct n8n scenario available in `scenarios/harness/chat-regression.n8n.json`.
- Rollback: restore remote backup above and revert server/tune changes.

### 2026-04-24 19:18 - Admin Lab Chat mirror for rapid conversational QA

- Scope: add admin chat playground to simulate WhatsApp conversation behavior in a browser UI.
- Why: run faster iterative testing and evaluate response coherence without sending real WhatsApp messages.
- Files: `server.js`, `admin/pages.js`, `admin/render.js`.
- Runtime impact:
  - new page `GET /admin/lab/chat` with chat-style interface and quick scenarios.
  - new API `POST /admin/api/lab/chat/send` (non-persistent mirror of inbound logic).
  - new API `POST /admin/api/lab/chat/reset` to isolate sessions and clear handoff transient state.
  - shared inbound processor now powers both Twilio webhook and lab mirror path.
- Validation:
  - syntax checks for `server.js`, `admin/pages.js`, `admin/render.js`.
  - `npm run harness:chat` with local server -> `PASSED`.
- Rollback: remove lab routes/page/nav item and revert to direct `/twilio/inbound` handler block.

### 2026-04-24 19:26 - Lab Chat default phone fixed and editable

- Scope: set deterministic Lab Chat default phone with UI edit support.
- Why: keep repeatable context for QA while still allowing quick number switches during tests.
- Files: `server.js`, `admin/pages.js`.
- Runtime impact:
  - default lab phone is now `+56935229766` (or `LAB_CHAT_DEFAULT_PHONE` env override).
  - lab phone can be edited directly in UI and is used immediately by send/reset actions.
- Validation: syntax checks on modified files.
- Rollback: revert to random lab phone generator behavior.

### 2026-04-24 19:40 - Expanded Lab scenarios and markdown pass/fail reports

- Scope: broaden QA scenario coverage and add report/export workflow directly from `/admin/lab/chat`.
- Why: enable iterative bot tuning with reproducible scenario execution and documented fail/pass trace.
- Files: `server.js`, `admin/pages.js`, `docs/ops/chat-harness.md`.
- Runtime impact:
  - added multi-scenario catalog (`smoke` + `regression`) for lab execution.
  - added APIs:
    - `GET /admin/api/lab/chat/scenarios`
    - `POST /admin/api/lab/chat/run-scenarios`
    - `POST /admin/api/lab/chat/save-session`
  - lab UI now supports running suites, running specific scenario, and saving markdown outputs.
  - markdown artifacts are generated in `docs/qa/` with per-step pass/fail details.
- Validation:
  - `node --check server.js`
  - `node --check admin/pages.js`
  - `npm run harness:chat` (local) -> `PASSED`.
- Rollback: remove new lab endpoints and restore previous single-scenario UI behavior.

### 2026-04-24 19:45 - Targeted regression fix for informal/action affirmatives

- Scope: fix persistent failures in `informal_affirmative` and `action_affirmative` without changing stable passing flows.
- Why: repeated regression runs showed deterministic failures (`oka porfa`, `ok enviame`) after executive CTA offer.
- Files: `server.js`, `scripts/n8n/tune-meta-agent-handoff.js`, `n8n/workflows/META-CONSIGNACION-V1.json`.
- n8n workflow: id `PI8uZo5omcN3576y`, name `META-CONSIGNACION-V1`.
- Backup artifact: `n8n/workflows/META-CONSIGNACION-V1.remote-backup-20260424-pre-targeted-regression-fix.json`.
- Runtime impact:
  - expanded CTA-offer detection patterns in server and n8n (contactar/contacten/llamen/agendar variants).
  - broadened affirmative intent matching (`me contacte`, `que me contacte`, `ok porfa`, `oka porfa`, `dale porfa`).
  - added deterministic server guard: if offer is pending and reply is short affirmative, confirm handoff directly.
- Validation:
  - targeted inbound simulation with fresh phones shows handoff confirmation for both failing cases.
  - `npm run harness:chat` -> `PASSED`.
- Rollback: restore backup artifact above and revert the server/tune changes.

### 2026-04-24 19:55 - Session close snapshot and workflow pointer hardening

- Scope: document final session state, active workflow pointer, and synced JSON source.
- Why: ensure future sessions start with clear operational context and avoid ambiguity about active workflow/version.
- Files: `docs/ops/current-workflow.md`, `AGENTS.md`, `C:\Users\denny\.claude\CLAUDE.md`, `docs/logdocs.md`, `n8n/workflows/META-CONSIGNACION-V1.json`.
- Runtime impact:
  - local workflow JSON was re-synced from remote active workflow (`active=true`).
  - new operational pointer file established as single reference for active workflow metadata and backup chain.
  - repo/agent instructions now explicitly require maintaining that pointer.
- Validation:
  - remote fetch + sync command output confirmed: `active: true`, `updatedAt: 2026-04-24T23:38:20.158Z`.
  - pointer doc includes workflow id/name/path/status and current JSON location.
- Rollback: restore previous workflow JSON from backup and remove pointer policy additions if needed.

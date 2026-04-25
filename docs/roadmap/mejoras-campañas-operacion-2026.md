# Roadmap de Mejoras — WA-Test (Queirolo Autos)
> **Fuente única de verdad** · Unificado 2026-04-25 desde `mejoras-campañas-operacion-2026.md` + `next-features-spec.md`

**Proyecto**: WhatsApp Campaign System — Queirolo Autos  
**Stack**: Node.js ES Modules, Express, better-sqlite3, Twilio API  
**Deployment**: Docker / Easypanel / Hostinger VPS

---

## Changelog del documento

| Fecha | Cambio | Por |
|-------|--------|-----|
| 2026-04-22 | Creación inicial de `next-features-spec.md` (features 1–8 con specs técnicas) | denparra |
| 2026-04-24 | Creación de `mejoras-campañas-operacion-2026.md` (A–K basadas en investigación de mercado) | denparra |
| 2026-04-25 | **Unificación**: ambos documentos consolidados aquí. `next-features-spec.md` tombstoned (ver ese archivo). Viabilidad actualizada con inspección real del código. Features 1, 3, 4, 6, H, J marcados como seleccionados para próxima iteración. | denparra |

---

## Foco del sistema

Este sistema gestiona **campañas y mensajes WhatsApp** hacia posibles consignadores de autos. No es un CRM. El objetivo es:

- Contactar masivamente a dueños de autos con mensajes relevantes
- Medir qué campañas funcionan mejor
- Operar el canal WhatsApp desde un solo panel (inbox, replies, opt-outs)
- Automatizar seguimientos sin intervención manual

Cualquier mejora debe justificarse en términos de **eficiencia operacional de campañas** o **mejor alcance/conversión de mensajes**.

---

## Estado rápido del backlog completo

| # | Feature | Origen | Esfuerzo | Estado |
|---|---------|--------|---------|--------|
| **1** | **Clonar campaña** | next-features-spec | 🟢 1–2h | ✅ **DONE 2026-04-25** |
| 2 | Export CSV (contactos + resultados) | next-features-spec | 🟢 2–3h | Pendiente |
| **3** | **Import masivo de opt-outs vía CSV** | next-features-spec | 🟢 1–2h | ✅ **DONE 2026-04-25** |
| **4** | **Bandeja de Conversaciones Unificada (Inbox)** | next-features-spec | 🟡 4–5h | ✅ **DONE 2026-04-25** |
| 5 | Tags de contacto | next-features-spec | 🟡 4–5h | Pendiente |
| **6** | **Dashboard con métricas reales** | next-features-spec | 🟡 4–5h | ✅ **DONE 2026-04-25** |
| 7 | Estado de conversación (mini-CRM) | next-features-spec | 🔴 6–8h | Pendiente |
| 8 | Responder desde el admin | next-features-spec | 🟡 3–4h | Pendiente |
| A | Secuencias drip (follow-up post-campaña) | investigación mercado | 🟡 5–7h | Pendiente |
| B | Control de ventana de envío (blackout hours) | investigación mercado | 🟢 2–3h | Pendiente |
| C | Anti-spam guard (frecuencia por contacto) | investigación mercado | 🟢 2–3h | Pendiente |
| D | Detección de solapamiento de destinatarios | investigación mercado | 🟢 2–3h | Pendiente |
| E | Comparador de campañas | investigación mercado | 🟡 4–5h | Pendiente |
| F | A/B testing de templates | investigación mercado | 🔴 6–8h | Pendiente |
| G | Badge de calidad del template | investigación mercado | 🟢 1–4h | Pendiente |
| **H** | **Perfil de engagement por contacto** | investigación mercado | 🟢 2h | ✅ **DONE 2026-04-25** |
| I | Test send mejorado con datos reales | investigación mercado | 🟢 2–3h | Pendiente |
| **J** | **Segmentos dinámicos con conteo en vivo** | investigación mercado | 🟡 4–5h | ✅ **DONE 2026-04-25** |
| K | Campañas recurrentes programadas | investigación mercado | 🔴 6–8h | Pendiente |

---

## Features seleccionados para próxima iteración

> Inspección de código realizada 2026-04-25. Viabilidad basada en estado real del repo.

---

### 🎯 1. Clonar Campaña

**Qué hace**: Botón "Duplicar" en la lista de campañas. Crea borrador nuevo con mismo nombre (sufijo " — Copia"), mensaje, contentSid y filtros. Los destinatarios NO se copian.

**Por qué importa**: Las campañas mensuales por marca son casi idénticas. Hoy hay que recrear todo desde cero.

**Viabilidad actualizada** (inspeccionado 2026-04-25):
- `getCampaignById()` ✅ existe en `db/index.js:473`
- `createCampaign()` ✅ existe en `db/index.js:481`
- Endpoint `/admin/api/campaigns/:id/duplicate` ❌ no existe — crear
- Botón en `renderCampaignsPage` ❌ no existe — agregar
- **Sin nuevas tablas, sin migración. Zero bloqueadores.**

**Esfuerzo real**: 🟢 **1–2 horas**

**Archivos**:

| Archivo | Cambio |
|---------|--------|
| `server.js` | `POST /admin/api/campaigns/:id/duplicate` (nuevo endpoint, ~20 líneas) |
| `admin/pages.js` | Botón ⧉ en `renderCampaignsPage` para todos los estados |

**Implementación**:

```javascript
// server.js — POST /admin/api/campaigns/:id/duplicate
app.post('/admin/api/campaigns/:id/duplicate', adminAuth, (req, res) => {
    const original = getCampaignById(Number(req.params.id));
    if (!original) return res.status(404).json({ error: 'Not found' });
    const copy = createCampaign({
        name: original.name + ' — Copia',
        messageTemplate: original.message_template,
        type: original.type,
        contentSid: original.content_sid,
        filters: original.filters ? JSON.parse(original.filters) : null,
        status: 'draft',
        isTest: Boolean(original.is_test)
    });
    res.status(201).json(copy);
});
```

```javascript
// admin/pages.js — en renderCampaignsPage, columna acciones
'<button onclick="duplicateCampaign(' + row.id + ')" class="action-btn" title="Duplicar">⧉</button>'

// Script inline:
async function duplicateCampaign(id) {
    const r = await fetch('/admin/api/campaigns/' + id + '/duplicate', { method: 'POST' });
    if (r.ok) window.location.href = '/admin/campaigns';
    else alert('Error al duplicar');
}
```

---

### 🎯 3. Importación masiva de Opt-outs

**Qué hace**: Subir CSV con columna `Telefono`. Todos esos números quedan registrados en `opt_outs` en lote, con `reason = 'bulk_import'`.

**Por qué importa**: Cuando recibes listas externas de números a excluir, hoy tienes que ingresarlos uno por uno.

**Viabilidad actualizada** (inspeccionado 2026-04-25):
- Tabla `opt_outs` ✅ existe con `phone`, `reason`, `opted_out_at`
- `insertOptOut()` ✅ existe en `db/index.js:432`
- Página `/admin/import` ✅ existe con infraestructura de upload CSV (multer, parsing)
- `renderImportPage` ✅ existe en `admin/pages.js:2281`
- `bulkInsertOptOuts()` ❌ no existe — crear función
- Endpoint `POST /admin/import/optouts` ❌ no existe — crear
- Sección en UI de import ❌ no existe — agregar
- **Sin nuevas tablas, reutiliza toda la infraestructura CSV existente.**

**Esfuerzo real**: 🟢 **1–2 horas**

**Archivos**:

| Archivo | Cambio |
|---------|--------|
| `db/index.js` | `bulkInsertOptOuts(phones[])` con transaction |
| `server.js` | `POST /admin/import/optouts` nuevo endpoint |
| `admin/pages.js` | Sección nueva en `renderImportPage` |

**Implementación**:

```javascript
// db/index.js
export function bulkInsertOptOuts(phones) {
    const stmt = db.prepare(`
        INSERT OR IGNORE INTO opt_outs (phone, reason, opted_out_at)
        VALUES (?, 'bulk_import', datetime('now', 'localtime'))
    `);
    const transaction = db.transaction(ps => {
        let inserted = 0;
        for (const p of ps) { stmt.run(p); inserted++; }
        return inserted;
    });
    return transaction(phones);
}
```

```javascript
// server.js — POST /admin/import/optouts
// Reutiliza multer upload y csv-parse que ya están configurados
app.post('/admin/import/optouts', adminAuth, upload.single('csvFile'), (req, res) => {
    // Parsear columna Telefono del CSV
    // Normalizar con normalizePhone()
    // Llamar bulkInsertOptOuts(phones)
    // Devolver count de insertados vs ignorados (ya existían)
});
```

**Formato CSV de entrada**:
```csv
Telefono
+56944114154
+56912345678
```

---

### 🎯 4. Bandeja de Conversaciones Unificada (Inbox)

**Qué hace**: Nueva sección `/admin/inbox` que muestra todos los mensajes inbound recientes, agrupados por contacto, con último mensaje visible y estado "no leído / leído".

**Por qué importa**: Hoy ves respuestas POR campaña en `/admin/campaigns/:id/conversation/:phone`. Con 5+ campañas activas hay que revisar una por una. El inbox centraliza todo.

**Viabilidad actualizada** (inspeccionado 2026-04-25):
- Tabla `messages` ✅ existe con `direction`, `phone`, `body`, `created_at`, `contact_id`
- Index `idx_messages_phone_direction_created` ✅ existe (optimizado para queries de inbox)
- Ruta `/admin/campaigns/:id/conversation/:phone` ✅ existe — lógica a reutilizar
- CSS del inbox ✅ **YA EXISTE completamente en `admin/render.js:622-760`** — `.inbox`, `.inbox-list`, `.inbox-item`, `.inbox-name`, `.inbox-preview`, etc.
- `renderImportPage` ya tiene el patron de renderizado — base para inbox page
- Tabla `conversation_status` ❌ no existe — crear con migración
- `listInboxConversations()` ❌ no existe — crear en db/index.js
- `markConversationRead()` ❌ no existe — crear
- Ruta `GET /admin/inbox` ❌ no existe — agregar
- Nav item "Inbox" ❌ no está en `admin/render.js:1-10` — agregar
- **El CSS pre-existente elimina ~2h de trabajo estimado. Esfuerzo real menor que el spec original.**

**Esfuerzo real**: 🟡 **4–5 horas** (spec decía 4–6h; CSS ya hecho lo reduce)

**Archivos**:

| Archivo | Cambio |
|---------|--------|
| `db/schema.sql` | Tabla `conversation_status` |
| `db/index.js` | `listInboxConversations({status, limit, offset})`, `markConversationRead(phone)`, `getUnreadConversationCount()` |
| `server.js` | `GET /admin/inbox`, `POST /admin/api/inbox/:phone/read` |
| `admin/pages.js` | `renderInboxPage({ conversations, unread, ... })` |
| `admin/render.js` | Agregar "Inbox" al navItems (línea ~2) + badge de unread |

**Schema**:

```sql
CREATE TABLE IF NOT EXISTS conversation_status (
    phone TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'unread', -- unread | read | archived
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
```

**Query principal**:

```sql
SELECT 
    m.phone,
    c.name AS contact_name,
    MAX(m.created_at) AS last_message_at,
    (SELECT body FROM messages 
     WHERE phone = m.phone AND direction = 'inbound'
     ORDER BY created_at DESC LIMIT 1) AS last_message,
    COALESCE(cs.status, 'unread') AS conv_status,
    COUNT(DISTINCT CASE WHEN m.direction = 'inbound' THEN m.id END) AS inbound_count
FROM messages m
LEFT JOIN contacts c ON c.phone = m.phone
LEFT JOIN conversation_status cs ON cs.phone = m.phone
WHERE m.direction = 'inbound'
GROUP BY m.phone
ORDER BY last_message_at DESC
LIMIT ? OFFSET ?
```

**Nota de diseño**: La tabla `conversation_status` sirve también como base para el feature #7 (Estado de conversación / mini-CRM). No duplicar lógica: que ese feature extienda esta tabla en lugar de crear otra.

**Layout**:
```
┌──────────────────────────────────────────────────────────┐
│  Bandeja de entrada              [Pendientes ●] [Todos]  │
├──────────────────────────────────────────────────────────┤
│  +569****1234  Juan Pérez                      hace 5m   │
│  "Si me interesa, ¿cuánto sale el..."         🔴 NUEVO   │
├──────────────────────────────────────────────────────────┤
│  +569****5678  María García                    hace 2h   │
│  "Gracias, ya compré en otro lado"            ✅ VISTO   │
└──────────────────────────────────────────────────────────┘
```

---

### 🎯 6. Dashboard con Métricas Reales

**Qué hace**: Reemplaza el dashboard de 6 tarjetas de conteo simples por uno con métricas accionables: tasa de respuesta global, top campañas por engagement, opt-outs recientes, contactos nuevos por semana, envíos por semana.

**Por qué importa**: Los números brutos (1234 contactos, 8 campañas) no dicen qué funciona. Las métricas permiten saber qué template/segmento/horario convierte mejor.

**Viabilidad actualizada** (inspeccionado 2026-04-25):
- `getAdminStats()` ✅ existe en `db/index.js:539` — devuelve counts básicos
- `getCampaignFollowUpStats(campaignId)` ✅ existe en `db/index.js:918` — queries de engagement ya escritas
- `renderDashboardPage({ stats })` ✅ existe en `admin/pages.js:72` — reemplazar UI
- Datos para tasa de respuesta ✅ en `messages` + `campaign_recipients`
- `getDashboardMetrics()` extendida ❌ no existe — crear
- Chart.js CDN o ASCII bars — elegir en implementación (ASCII recomendado para no añadir deps)
- **Sin nuevas tablas. Toda la data ya existe. Trabajo es query agregación + UI.**

**Esfuerzo real**: 🟡 **4–5 horas**

**Archivos**:

| Archivo | Cambio |
|---------|--------|
| `db/index.js` | `getDashboardMetrics()` query agregada extendida |
| `server.js` | Actualizar `GET /admin` para pasar `metrics` extendidas |
| `admin/pages.js` | Redesign de `renderDashboardPage` con nuevas tarjetas y mini-charts |

**Métricas a mostrar**:

```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│  Contactos  │  Campañas   │  Tasa resp. │  Opt-outs   │
│   1,234     │   8 activas │   23.4%     │   45 total  │
│  +12 hoy    │  3 en cola  │  vs 18% ant │  +2 hoy     │
└─────────────┴─────────────┴─────────────┴─────────────┘

Contactos por marca:          Campañas últimas 30 días:
■ Toyota    847 (68%)         ████░░░  Sem 1: 1,200 env
■ Ford      234 (19%)         ██░░░░░  Sem 2:   800 env
■ Chevrolet 153 (13%)         ████████ Sem 3: 1,800 env

Top campañas por engagement:
1. Toyota Abril  → 31% resp  (847 env → 262 resp)
2. Ford Marzo    → 24% resp  (234 env →  56 resp)
3. Chevrolet Feb → 18% resp  (153 env →  28 resp)
```

**Query getDashboardMetrics (estructura)**:

```javascript
export function getDashboardMetrics() {
    // 1. Counts básicos (ya tiene getAdminStats)
    // 2. Tasa de respuesta global (inbound post-campaign / total sent)
    // 3. Tasa respuesta periodo anterior (para comparación delta)
    // 4. Top 5 campañas por tasa respuesta (usa lógica de getCampaignFollowUpStats)
    // 5. Contactos nuevos últimos 7 días vs 7 días anteriores
    // 6. Opt-outs últimos 7 días
    // 7. Envíos por semana últimas 4 semanas
    // 8. Distribución de contactos por marca (ya tiene getVehicleStats)
}
```

**Opción de charts**: ASCII con `█` calculado en servidor (sin npm, sin CDN, zero deps). Chart.js CDN opcional si el usuario lo prefiere más adelante.

---

### 🎯 H. Perfil de Engagement por Contacto

**Qué hace**: En la ficha de cada contacto (`/admin/contacts/:id/edit`), mostrar su historial de interacción con campañas:

```
Campañas recibidas: 4
Campañas respondidas: 1  (25%)
Opt-out: No
Última campaña: Toyota Abril (hace 3 días)
Última respuesta: "Me interesa, ¿cuánto cobran?" (hace 15 días)
```

**Por qué importa**: Permite tomar decisiones informadas al crear segmentos. Filtrar "contactos que recibieron 3+ campañas y nunca respondieron" (fríos a descartar) vs "respondieron al menos una vez" (calientes para follow-up).

**Viabilidad actualizada** (inspeccionado 2026-04-25):
- `campaign_recipients` ✅ tiene `contact_id`, `status`, `sent_at`, `campaign_id`
- `messages` ✅ tiene `contact_id`, `direction`, `body`, `created_at`
- `campaigns` ✅ tiene `name` para join
- Página de edición de contacto ✅ existe en `admin/pages.js` con sección de vehículos — agregar sección engagement debajo
- `getContactEngagementStats(contactId)` ❌ no existe — crear (query pura, sin nuevas tablas)
- **Sin nuevas tablas, sin migración. Solo nueva query + sección de UI.**

**Esfuerzo real**: 🟢 **1.5–2 horas**

**Archivos**:

| Archivo | Cambio |
|---------|--------|
| `db/index.js` | `getContactEngagementStats(contactId)` nueva función |
| `admin/pages.js` | Sección "Historial de engagement" en `renderContactEditPage` |
| `server.js` | Pasar `engagement` a la página de edición (actualizar GET handler) |

**Query**:

```javascript
export function getContactEngagementStats(contactId) {
    return db.prepare(`
        SELECT
            COUNT(DISTINCT cr.campaign_id) AS campaigns_received,
            COUNT(DISTINCT CASE WHEN EXISTS(
                SELECT 1 FROM messages m 
                WHERE m.phone = cr.phone AND m.direction = 'inbound'
                  AND m.created_at > cr.sent_at
            ) THEN cr.campaign_id END) AS campaigns_responded,
            MAX(cr.sent_at) AS last_campaign_sent_at,
            (SELECT c.name FROM campaigns c 
             JOIN campaign_recipients cr2 ON cr2.campaign_id = c.id
             WHERE cr2.contact_id = ? ORDER BY cr2.sent_at DESC LIMIT 1) AS last_campaign_name,
            (SELECT m.body FROM messages m
             WHERE m.contact_id = ? AND m.direction = 'inbound'
             ORDER BY m.created_at DESC LIMIT 1) AS last_reply_body,
            (SELECT m.created_at FROM messages m
             WHERE m.contact_id = ? AND m.direction = 'inbound'
             ORDER BY m.created_at DESC LIMIT 1) AS last_reply_at
        FROM campaign_recipients cr
        WHERE cr.contact_id = ?
    `).get(contactId, contactId, contactId, contactId);
}
```

**Uso futuro**: Este perfil puede alimentar el feature **J (segmentos dinámicos)** como filtro `engagement_level IN ('warm','cold','new')`.

---

### 🎯 J. Segmentos Dinámicos con Conteo en Vivo

**Qué hace**: Construir la UI para la tabla `segments` que ya existe. Lista de segmentos guardados con conteo en tiempo real de cuántos contactos matchean, cuándo fue usado por última vez y en qué campaña.

```
Segmento Toyota 2015-2020 activos: 847 contactos
Última vez usado: hace 12 días — últ. campaña: Toyota Abril
```

**Por qué importa**: Hoy para saber cuántos contactos tiene un segmento hay que crear una campaña completa, cargar los filtros y contar. Con segmentos guardados y visibles, planificar campañas es mucho más rápido.

**Viabilidad actualizada** (inspeccionado 2026-04-25):
- Tabla `segments` ✅ existe en `db/schema.sql:187` con `name`, `filters`, `created_at`
- `listSegments()` ✅ existe en `db/index.js:1240` (básica, sin conteo)
- `createSegment()` ✅ existe en `db/index.js:1234`
- `listVehicleContactsByFilters()` ✅ existe — reutilizar para live count
- Tabla `segments` necesita `last_used_at TEXT`, `last_campaign_id INTEGER` — ALTER TABLE
- Ruta `GET /admin/segments` ❌ no existe — crear
- `renderSegmentsPage` ❌ no existe — crear
- Nav item "Segmentos" ❌ no está en el menú — agregar
- **Tabla existe, funciones básicas existen. Necesita extensión de schema + UI nueva.**

**Esfuerzo real**: 🟡 **4–5 horas**

**Archivos**:

| Archivo | Cambio |
|---------|--------|
| `db/schema.sql` | Comentar nueva migración con ALTER TABLE segments |
| `db/index.js` | Migración inline en init, `listSegmentsWithCount()`, `updateSegmentLastUsed(id, campaignId)` |
| `server.js` | `GET /admin/segments`, `DELETE /admin/api/segments/:id` |
| `admin/pages.js` | `renderSegmentsPage({ segments })` |
| `admin/render.js` | Agregar "Segmentos" al navItems |

**Migración**:

```javascript
// db/index.js — en la función de init/migrate
db.exec(`ALTER TABLE segments ADD COLUMN last_used_at TEXT`);
db.exec(`ALTER TABLE segments ADD COLUMN last_campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL`);
```

**Query listSegmentsWithCount**:

```javascript
export function listSegmentsWithCount() {
    const segments = listSegments(); // función existente
    return segments.map(seg => {
        const filters = JSON.parse(seg.filters);
        const contacts = listVehicleContactsByFilters({ ...filters, limit: 99999 });
        return { ...seg, contact_count: contacts.length };
    });
}
```

**Nota**: Para segmentos con >10k contactos, el count en vivo puede ser lento. Si el catálogo crece, cachear el count con TTL 5min.

---

## Orden de implementación recomendado (iteración actual)

Los 6 features seleccionados se pueden implementar en este orden — cada uno es independiente:

```
✅ H. Engagement profile   →  DONE 2026-04-25  (db/index.js + server.js + admin/pages.js)
✅ 1. Clonar campaña       →  DONE 2026-04-25  (endpoint + botón UI + script)
✅ 3. Import opt-outs      →  DONE 2026-04-25  (bulkInsertOptOuts + endpoint + sección import)
✅ 6. Dashboard métricas   →  DONE 2026-04-25  (getDashboardMetrics + dashboard redesign)
✅ J. Segmentos dinámicos  →  DONE 2026-04-25  (listSegmentsWithCount + renderSegmentsPage + nav)
✅ 4. Inbox unificado      →  DONE 2026-04-25  (conversation_status + renderInboxPage + nav badge)
```

**Total estimado**: 16–21 horas | **Completado**: ~16h (H + 1 + 3 + 6 + J + 4) ✅ Iteración completa

**Criterio de orden**: primero los sin riesgo (no migran schema), luego los que agregan tablas.

---

## Dependencias entre features

```
H. Engagement profile  →  alimenta  →  J. Segmentos (filtros engagement_level)
J. Segmentos dinámicos →  habilita  →  K. Campañas recurrentes (features futuras)
4. Inbox unificado     →  base para →  8. Responder desde admin
4. Inbox unificado     →  base para →  7. Estado de conversación (mini-CRM)
conversation_status    →  comparte  →  7. Mini-CRM (extender misma tabla, no duplicar)

1. Clonar campaña      →  (independiente)
3. Import opt-outs     →  (independiente)
6. Dashboard           →  enriquece con  →  E. Comparador campañas (futuro)
```

---

## Features pendientes (no seleccionados en esta iteración)

### 2. Exportar a CSV
Botones de descarga en contacts y campaign detail. Helper `toCsv()` reutilizable. Esfuerzo: 🟢 2–3h.

### 5. Tags de Contacto
Tabla `contact_tags`, UI en edición de contacto, filtro en creación de campaña. Esfuerzo: 🟡 4–5h.

### 7. Estado de Conversación (mini-CRM)
Campo `sales_stage` en contacts + etapas: nuevo → contactado → respondió → interesado → cerrado. **Requiere inbox (#4) primero.** Esfuerzo: 🔴 6–8h.

### 8. Responder desde el Admin
Endpoint `POST /admin/api/contacts/:id/send-message` + UI en conversación. Reutiliza `sendOneRecipient()` de `lib/twilio-sender.js`. **Requiere inbox (#4) primero.** Esfuerzo: 🟡 3–4h.

### A. Secuencias drip (follow-up automático)
Nueva tabla `campaign_sequences`. Scheduler evalúa secuencias junto con campañas. **Requiere inbox (#4) para ver respuestas.** Esfuerzo: 🟡 5–7h.

### B. Control de ventana de envío (blackout hours)
Variables de entorno `SEND_WINDOW_START/END`. Modificar `processCampaignQueue()`. Esfuerzo: 🟢 2–3h. **Debe ir antes de A y K.**

### C. Anti-spam guard (frecuencia por contacto)
Toggle en formulario: excluir contactos contactados en últimos N días. Query LEFT JOIN sobre `campaign_recipients`. Esfuerzo: 🟢 2–3h.

### D. Solapamiento de destinatarios
Warning en preview: "247 de estos destinatarios están en campaña activa [X]". Query cruzada. Esfuerzo: 🟢 2–3h.

### E. Comparador de campañas
Vista `GET /admin/campaigns/compare?ids=1,2,3` con métricas en columnas paralelas. Esfuerzo: 🟡 4–5h.

### F. A/B testing de templates
Columnas `content_sid_b`, `ab_split_pct` en campaigns + `ab_variant` en campaign_recipients. Esfuerzo: 🔴 6–8h.

### G. Badge de calidad del template
Campo `quality_status` en `message_templates`. Manual: dropdown en formulario (1–2h). Automático: fetch Twilio API periódico (3–4h).

### I. Test send mejorado
Endpoint `POST /admin/api/campaigns/test-send` con datos de contacto real. Reutiliza preview endpoint existente. Esfuerzo: 🟢 2–3h.

### K. Campañas recurrentes
Campos `is_recurring`, `recurrence_rule` en campaigns. Scheduler crea ejecuciones periódicas. **Requiere J (segmentos) primero.** Esfuerzo: 🔴 6–8h.

---

## Notas de implementación (stack)

- **Sin dependencias npm nuevas**: todos los features de esta iteración usan Node.js, Express, better-sqlite3, Twilio ya instalados. Chart.js opcionalmente por CDN.
- **Migraciones incrementales**: usar `try { db.exec('ALTER TABLE...') } catch(e) {}` pattern ya establecido en `db/index.js`.
- **Import CSV**: multer + csv-parse ya configurados en `server.js`. Los nuevos endpoints de import los reutilizan.
- **CSS del inbox**: ya está completo en `admin/render.js:622`. No añadir CSS nuevo — usar clases existentes.

---

## Referencias de investigación

- [Best Bulk WhatsApp Marketing Software 2026 — Respond.io](https://respond.io/blog/best-bulk-whatsapp-marketing-software)
- [Wati Review 2026: Features, Pros and Cons — Chatimize](https://chatimize.com/reviews/wati/)
- [WhatsApp Drip Marketing Campaigns 2026 — Zoko](https://www.zoko.io/post/mastering-whatsapp-drip-marketing-campaigns)
- [Per-User Marketing Template Message Limits — Meta Developers](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/per-user-limits/)
- [WhatsApp Rate Limits for Developers — Fyno](https://www.fyno.io/blog/whatsapp-rate-limits-for-developers-a-guide-to-smooth-sailing-clycvmek2006zuj1oof8uiktv)
- [10 Best WhatsApp Marketing Software 2026 — Brevo](https://www.brevo.com/blog/whatsapp-marketing-software/)
- [WhatsApp Marketing Guide 2026 — ActiveCampaign](https://www.activecampaign.com/blog/whatsapp-guide)
- [WhatsApp Business API Providers 2026 — Webmaxy](https://www.webmaxy.co/blog/whatsapp-broadcast/top-10-whatsapp-business-api-providers-bsps-in-2026-the-ultimate-comparison-guide/)

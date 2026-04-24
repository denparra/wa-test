# Spec: Próximas Funcionalidades
**Proyecto**: WhatsApp Campaign System — Queirolo Autos  
**Fecha**: 2026-04-22  
**Estado**: Backlog priorizado — pendiente implementación  

---

## Mapa de prioridades

```
              VALOR PARA EL NEGOCIO
              Bajo ◄────────────────────► Alto
         ┌─────────────────────────────────────────┐
  Alto   │                  │  1. Clonar campaña   │
         │                  │  2. Export CSV        │
E        │                  │  3. Import opt-outs   │
S        │──────────────────┼─────────────────────-│
F  Medio │  8. Reply desde  │  4. Inbox unificado   │
U        │     admin        │  5. Tags de contacto  │
E        │                  │  6. Dashboard métricas│
R  ──────┼──────────────────┼──────────────────────-┤
Z  Alto  │                  │  7. Estado conversac. │
O        │                  │  (mini-CRM)           │
         └─────────────────────────────────────────┘
```

**Orden de implementación recomendado**: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

---

## 1. Clonar Campaña

**Qué hace**: Un botón "Duplicar" en la lista de campañas crea un borrador nuevo con el mismo nombre (sufijo " — Copia"), mensaje, contentSid y filtros. Los destinatarios NO se copian.

**Por qué importa**: Las campañas mensuales por marca son casi idénticas. Hoy hay que recrear todo desde cero cada vez.

**Esfuerzo**: 🟢 Bajo (1–2 horas)

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `server.js` | Nuevo endpoint `POST /admin/api/campaigns/:id/duplicate` |
| `admin/pages.js` | Botón "Duplicar" en `renderCampaignsPage` para campañas en cualquier estado |

### Endpoint

```javascript
// POST /admin/api/campaigns/:id/duplicate
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

### UI

```javascript
// En renderCampaignsPage — columna acciones, agregar para TODOS los estados:
'<button onclick="duplicateCampaign(' + row.id + ')" class="action-btn" title="Duplicar">⧉</button>'

// Script:
async function duplicateCampaign(id) {
    const r = await fetch('/admin/api/campaigns/' + id + '/duplicate', { method: 'POST' });
    if (r.ok) window.location.href = '/admin/campaigns';
    else alert('Error al duplicar');
}
```

---

## 2. Exportar a CSV

**Qué hace**: Botones de descarga en distintas páginas del admin que generan CSVs descargables directamente desde el browser.

**Por qué importa**: Permite reportes, compartir datos con el equipo comercial, y análisis en Excel.

**Esfuerzo**: 🟢 Bajo (2–3 horas)

### Endpoints nuevos

```
GET /admin/export/contacts          → contacts.csv (filtrable por ?make=)
GET /admin/export/campaigns/:id     → campaign_results_{id}.csv (recipients + status)
GET /admin/export/opt-outs          → opt_outs.csv (ya existe, confirmar)
```

### Formato contacts.csv

```csv
Telefono,Nombre,Estado,Marca,Modelo,Año,Origen,ID_Origen,Creado
+56944114154,Juan Perez,active,Toyota,Corolla,2020,barb,barbara:8339,2026-04-01
```

### Formato campaign_results_{id}.csv

```csv
Telefono,Nombre,Estado_Envio,Enviado_En,Error,Replies
+56944114154,Juan Perez,delivered,2026-04-22 10:30,—,2
+56912345678,María García,failed,—,Error 21211,0
```

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `server.js` | 2 endpoints nuevos + helper `toCsvRow()` |
| `db/index.js` | `exportContacts({ make })` con join vehicles, `exportCampaignRecipients(id)` |
| `admin/pages.js` | Botón "Exportar CSV" en contacts page y campaign detail |

### Helper CSV (server.js)

```javascript
function toCsv(headers, rows) {
    const escape = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const lines = [headers.map(escape).join(',')];
    for (const row of rows) lines.push(headers.map(h => escape(row[h])).join(','));
    return lines.join('\r\n');
}

app.get('/admin/export/contacts', adminAuth, (req, res) => {
    const make = String(req.query.make || '').trim() || null;
    const rows = exportContacts({ make });       // nueva función en db/index.js
    const csv = toCsv(['phone','name','status','make','model','year','origin','external_id','created_at'], rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="contacts.csv"');
    res.send('﻿' + csv); // BOM para que Excel abra bien en UTF-8
});
```

---

## 3. Importación masiva de Opt-outs

**Qué hace**: Subir un CSV con una columna `Telefono` y todos esos números quedan registrados en `opt_outs` en lote. La UI reutiliza la misma página de importación existente.

**Por qué importa**: Cuando recibes listas externas de números que ya no quieren ser contactados (ej: base de datos de otra campaña), hoy tienes que ingresarlos uno por uno.

**Esfuerzo**: 🟢 Bajo (1–2 horas)

### Formato CSV de entrada

```csv
Telefono
+56944114154
+56912345678
+56987654321
```

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `server.js` | Nuevo endpoint `POST /admin/import/optouts` |
| `db/index.js` | `bulkInsertOptOuts(phones[])` con transaction |
| `admin/pages.js` | Sección nueva en `renderImportPage` o página separada `/admin/opt-outs/import` |

### Lógica backend

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

---

## 4. Bandeja de Conversaciones Unificada (Inbox)

**Qué hace**: Una nueva sección `/admin/inbox` que muestra todos los mensajes inbound recientes, agrupados por contacto, con el último mensaje visible y un estado "pendiente / atendido".

**Por qué importa**: Hoy ves respuestas POR campaña. Si tienes 5 campañas activas, hay que revisarlas una por una para ver quién respondió. El inbox centraliza todo.

**Esfuerzo**: 🟡 Medio (4–6 horas)

### Layout

```
┌──────────────────────────────────────────────────────────┐
│  Bandeja de entrada              [Pendientes ●] [Todos]  │
├──────────────────────────────────────────────────────────┤
│  +569****1234  Juan Pérez                      hace 5m   │
│  "Si me interesa, ¿cuánto sale el..."         🔴 NUEVO   │
├──────────────────────────────────────────────────────────┤
│  +569****5678  María García                    hace 2h   │
│  "Gracias, ya compré en otro lado"            ✅ VISTO   │
├──────────────────────────────────────────────────────────┤
│  +569****9012  (sin nombre)                    hace 1d   │
│  "BAJA"                                       ✅ VISTO   │
└──────────────────────────────────────────────────────────┘
```

### DB — nueva tabla

```sql
-- En schema.sql
CREATE TABLE IF NOT EXISTS conversation_status (
    phone TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'unread', -- unread | read | archived
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
```

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `db/schema.sql` | Tabla `conversation_status` |
| `db/index.js` | `listInboxConversations({ status, limit, offset })`, `markConversationRead(phone)` |
| `server.js` | `GET /admin/inbox`, `POST /admin/api/inbox/:phone/read` |
| `admin/pages.js` | `renderInboxPage({ conversations, ... })` |
| `admin/render.js` | Agregar "Inbox" al menú de navegación |

### Query principal

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

### Badge en navegación

Mostrar conteo de conversaciones `unread` en el menú lateral junto a "Inbox".

---

## 5. Tags de Contacto

**Qué hace**: Etiquetas manuales que puedes asignar a contactos: "interesado", "compró", "no contestó", "seguimiento", etc. Las campañas pueden filtrar por tag. Permite segmentar más allá de marca/modelo/año.

**Por qué importa**: En ventas de autos hay etapas del funnel que no se reflejan en los datos del vehículo. Un contacto puede ser "Toyota 2020" pero también "ya compró" o "quiere financiamiento".

**Esfuerzo**: 🟡 Medio (4–5 horas)

### DB

```sql
-- En schema.sql
CREATE TABLE IF NOT EXISTS contact_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER NOT NULL,
    tag TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    UNIQUE(contact_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_contact_tags_contact ON contact_tags(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_tags_tag ON contact_tags(tag);
```

### Flujo de uso

1. En `/admin/contacts/:id/edit` → sección de tags con input + chips existentes
2. Click en "× interesado" elimina el tag
3. Input "Agregar tag..." + Enter lo crea
4. En `/admin/campaigns/new` paso 3 → filtro adicional "Tags: [interesado] [seguimiento]"

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `db/schema.sql` | Tabla `contact_tags` |
| `db/index.js` | `getTagsByContactId`, `addTag`, `removeTag`, `listAllTags`, `listContactsByTag` |
| `server.js` | `POST /admin/api/contacts/:id/tags`, `DELETE /admin/api/contacts/:id/tags/:tag` |
| `admin/pages.js` | Sección tags en `renderContactEditPage` (ya tiene vehículos, agregar tags debajo) |

---

## 6. Dashboard con Métricas Reales

**Qué hace**: Reemplazar el dashboard de conteos simples por uno con métricas accionables: tasa de respuesta, mejores horarios de envío, campañas por estado, contactos nuevos por semana.

**Por qué importa**: Con muchas campañas activas, los números brutos no dicen nada. Las métricas permiten saber qué funciona y cuándo enviar.

**Esfuerzo**: 🟡 Medio (4–6 horas)

### Métricas propuestas

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
                              ██████░░ Sem 4: 1,400 env

Top campañas por engagement:
1. Toyota Abril    → 31% resp  (847 env → 262 resp)
2. Ford Marzo      → 24% resp  (234 env →  56 resp)
3. Chevrolet Feb.  → 18% resp  (153 env →  28 resp)
```

### Implementación

- Gráficos con **Chart.js CDN** (sin dependencias npm extras) — barras simples
- O versión sin JS: barras ASCII con `█` calculadas en el servidor
- Las queries ya existen parcialmente en `getCampaignFollowUpStats`

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `db/index.js` | `getDashboardMetrics()` — query agregada con todas las métricas |
| `server.js` | Actualizar `GET /admin` para pasar métricas extendidas |
| `admin/pages.js` | Rediseñar `renderDashboardPage` con nueva UI |

---

## 7. Estado de Conversación por Contacto (Mini-CRM)

**Qué hace**: Agrega un campo de "etapa de venta" a cada contacto: `nuevo → contactado → respondió → interesado → cerrado_ganado → cerrado_perdido`. Se puede actualizar manualmente desde el perfil del contacto o desde el inbox.

**Por qué importa**: Permite hacer follow-up inteligente. Filtrar "solo los que respondieron pero no cerramos" para la próxima campaña.

**Esfuerzo**: 🔴 Alto (6–8 horas)

### DB

```sql
-- Agregar a contacts table via migration
ALTER TABLE contacts ADD COLUMN sales_stage TEXT DEFAULT 'nuevo';
-- nuevo | contactado | respondio | interesado | cerrado_ganado | cerrado_perdido
ALTER TABLE contacts ADD COLUMN stage_note TEXT;
ALTER TABLE contacts ADD COLUMN stage_updated_at TEXT;
```

### UI

- En `/admin/contacts/:id/edit`: dropdown de etapa + campo de nota libre
- En `/admin/inbox`: badge de etapa en cada conversación + click para cambiar
- En `/admin/campaigns/new` paso 3: filtro adicional por etapa

### Integración automática

Cuando un contacto responde por primera vez a una campaña → auto-cambiar etapa de `nuevo` a `respondio` (en el webhook inbound).

---

## 8. Responder desde el Admin

**Qué hace**: En la vista de conversación de un contacto, un campo de texto + botón "Enviar" que manda un WhatsApp individual sin crear campaña.

**Por qué importa**: Follow-up rápido uno a uno. Hoy hay que salir del admin, abrir WhatsApp manualmente, buscar el número.

**Esfuerzo**: 🟡 Medio (3–4 horas)

### Endpoint

```javascript
// POST /admin/api/contacts/:id/send-message
app.post('/admin/api/contacts/:id/send-message', adminAuth, express.json(), async (req, res) => {
    const contact = getContactById(Number(req.params.id));
    if (!contact) return res.status(404).json({ error: 'Not found' });
    if (isOptedOut(contact.phone)) return res.status(400).json({ error: 'Contacto con opt-out' });

    const { body } = req.body;
    if (!body?.trim()) return res.status(400).json({ error: 'Mensaje vacío' });

    try {
        await sendOneRecipient({ phone: 'whatsapp:' + contact.phone, body: body.trim() });
        insertMessage({ contactId: contact.id, direction: 'outbound', phone: contact.phone, body: body.trim() });
        res.json({ ok: true });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});
```

### UI

Agregar al final de la conversación en `/admin/conversations/:phone`:

```
┌────────────────────────────────────────────┐
│ [Escribe tu mensaje...                   ] │
│                          [Enviar WhatsApp] │
└────────────────────────────────────────────┘
```

---

## Checklist de implementación

```
🟢 BAJO ESFUERZO (hacer primero)
- [ ] 1. Clonar campaña — endpoint + botón UI
- [ ] 2. Exportar contactos a CSV (/admin/export/contacts)
- [ ] 2. Exportar resultados de campaña a CSV
- [ ] 3. Importar opt-outs masivamente vía CSV

🟡 ESFUERZO MEDIO
- [ ] 4. Inbox unificado — tabla conversation_status + página /admin/inbox
- [ ] 5. Tags de contacto — tabla contact_tags + UI en edición
- [ ] 6. Dashboard con métricas — Chart.js + query agregada
- [ ] 8. Responder desde admin — endpoint send-message + UI conversación

🔴 ALTO ESFUERZO
- [ ] 7. Estado de conversación (mini-CRM) — sales_stage + integración inbound
```

---

## Dependencias entre features

```
Inbox (4) ──────────────────┐
                            ▼
Tags (5) ──────► Estado conversación (7) ──► Reply desde admin (8)
                            ▲
Dashboard (6) ──────────────┘
```

- El **inbox** es el prereq natural para **responder desde admin**
- Los **tags** alimentan el **estado de conversación** para filtros más ricos
- El **dashboard** se enriquece con los datos de **etapas de venta**

---

## Notas técnicas

- Todos los features usan el stack existente: Node.js ES Modules, better-sqlite3, Express, sin dependencias nuevas (excepto Chart.js CDN opcional para el dashboard)
- La tabla `conversation_status` del Inbox puede ser también el punto de partida para el estado de conversación (feature 7), evitando duplicar lógica
- El endpoint de reply (feature 8) reutiliza `sendOneRecipient` que ya existe en `lib/twilio-sender.js`
- Para exports CSV, el helper `toCsv()` se escribe una vez en `server.js` y se reutiliza en todos los endpoints de export

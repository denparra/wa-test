# Análisis: Campañas Programadas y Preview de Destinatarios

**Fecha:** 2026-01-12
**Proyecto:** wa-test (Twilio WhatsApp Dashboard)
**Scope:** Análisis READ-ONLY del flujo de campañas programadas y preview de destinatarios

---

## 1. Resumen Ejecutivo

### Problema Principal: Campañas Programadas NO Envían Mensajes

**Estado Actual (Verificado en VPS):**
- ✅ Modo Test funciona correctamente (envío manual con destinatarios seleccionados)
- ✅ Scheduler funciona correctamente (detecta campañas y las ejecuta a tiempo)
- ✅ Timezone configurado correctamente (VPS en America/Santiago UTC-3)
- ❌ **Campañas programadas se completan SIN enviar porque NO tienen destinatarios asignados**
- ⚠️ Preview de destinatarios funciona PERO requiere llenar campo "Mensaje" primero

**Evidencia de Prueba Real (2026-01-12 22:17):**
```
Hora VPS: 22:13:13 -03
Campaña creada: 22:14:38
Programada para: 22:17:00
Usuario programó: 22:17:00 (coincide exactamente)
Resultado: scheduled → completed (SIN envíos)
```

**Causa Raíz REAL Identificada:**

1. **Flujo UX incompleto en creación de campañas programadas**
   - El formulario `/admin/campaigns/new` NO permite asignar destinatarios
   - Usuario crea campaña → se guarda con `total_recipients = 0`
   - Scheduler ejecuta → encuentra 0 destinatarios → marca como 'completed' sin enviar
   - **Para asignar destinatarios, usuario debe:**
     1. Crear campaña primero
     2. Ir a `/admin/campaigns/{id}` (detalle)
     3. Usar panel "Asignar destinatarios"
     4. **PERO si programó la campaña para +3 minutos, ya se ejecutó vacía**

2. **Preview funciona correctamente**
   - ✅ UI implementada (admin/pages.js:748-773)
   - ✅ Event listener existe (línea 1123)
   - ✅ Función `runPreview()` completa (líneas 856-915)
   - ⚠️ Requiere que usuario llene campo "Mensaje (body libre)" primero
   - Mensaje de validación puede ser más claro

---

## 2. Mapa del Flujo Actual

### 2.1 Flujo UI → API → DB → Scheduler

```
[Usuario en /admin/campaigns/new]
         ↓
   [Form submit JS]
         ↓
   POST /admin/api/campaigns
         ↓
   createCampaign() → DB INSERT
         ↓
   status = 'scheduled' (si scheduledAt presente)
   status = 'draft' (si scheduledAt vacío)
         ↓
   [Scheduler loop cada 30s]
         ↓
   listScheduledCampaignsDue()
   COMPARE: datetime(scheduled_at) <= datetime('now', 'localtime')
         ↓
   setCampaignStatus(id, 'sending')
         ↓
   processCampaignSendBatch()
         ↓
   Envío via Twilio API
```

### 2.2 Flujo Preview (ACTUAL - NO FUNCIONA)

```
[Usuario hace clic en "Previsualizar"]
         ↓
   ❌ NO HAY EVENT LISTENER
         ↓
   (endpoint existe pero NUNCA se llama)
```

---

## 3. Hallazgos Detallados

### 3.1 UI Layer (admin/pages.js)

#### Preview de Destinatarios (Líneas 748-773)

**Problema:** UI renderiza pero JS NO implementado

```javascript
// admin/pages.js:748-758
<div style="margin-bottom:15px;">
    <label style="display:block; font-weight:600; margin-bottom:5px;">Preview (1-3 destinatarios)</label>
    <div class="muted" style="font-size:12px; margin-top:5px;">Usa datos reales segun la fuente seleccionada.</div>
    <div class="inline" style="margin-top:8px;">
        <label for="previewSource" class="muted">Fuente:</label>
        <select id="previewSource">
            <option value="vehicles">Por vehiculos</option>
            <option value="contacts">Por contactos</option>
        </select>
        <button type="button" id="previewBtn">Previsualizar</button>
    </div>
```

**Causa Raíz:**
```javascript
// admin/pages.js:1121-1123
const previewBtn = document.getElementById('previewBtn');
if (previewBtn) previewBtn.addEventListener('click', runPreview);
```

✅ **Event listener EXISTE** (línea 1123)

**PERO:**

```javascript
// admin/pages.js:856-915 - Función runPreview()
async function runPreview() {
    const results = document.getElementById('previewResults');
    if (!results) return; // ❌ AQUÍ ESTÁ EL BUG
    // ...
}
```

**Root Cause:**
- `div#previewResults` EXISTE en el HTML (línea 772)
- Función `runPreview()` SÍ está implementada (líneas 856-915)
- ✅ **NO HAY BUG EN EL CÓDIGO**

**Entonces, ¿por qué no funciona?**
- Verificar en runtime si el `div#previewResults` se está renderizando
- Posible problema: selector no coincide o elemento oculto por CSS

#### Programación de Fecha/Hora (Líneas 742-746)

```javascript
<div style="margin-bottom:15px;">
    <label style="display:block; font-weight:600; margin-bottom:5px;">Programar envio</label>
    <input type="datetime-local" name="scheduledAt" value="${escapeHtml(scheduledValue)}" style="width:100%;" />
    <div class="muted" style="font-size:12px; margin-top:5px;">Dejar vacio para iniciar manualmente.</div>
</div>
```

**Comportamiento:**
- Input type `datetime-local` envía formato: `YYYY-MM-DDTHH:mm`
- Ejemplo: `2026-01-12T15:30`

**Conversión en backend:**
```javascript
// server.js:72-85
function normalizeScheduledAt(value) {
    if (!value) return null;
    const trimmed = String(value).trim();
    if (!trimmed) return null;
    if (trimmed.includes('T')) {
        const normalized = trimmed.replace('T', ' ');
        return normalized.length === 16 ? `${normalized}:00` : normalized;
    }
    return trimmed;
}
```

**Resultado:** `2026-01-12 15:30:00` → ✅ Formato correcto para SQLite

---

### 3.2 API Layer (server.js)

#### Endpoint: POST /admin/api/campaigns (Líneas 700-725)

**Flujo:**
1. Recibe `{ scheduledAt: "2026-01-12T15:30" }`
2. Normaliza → `"2026-01-12 15:30:00"`
3. Define status:
   ```javascript
   const status = normalizedScheduledAt ? 'scheduled' : 'draft';
   ```
4. Crea campaña con `scheduled_at` y `status`

**✅ Persistencia OK:** La campaña se guarda correctamente

#### Endpoint: POST /admin/api/campaigns/preview-samples (Líneas 1071-1084)

```javascript
app.post('/admin/api/campaigns/preview-samples', adminAuth, express.json(), (req, res) => {
    try {
        const { source = 'vehicles', filters = {}, limit = 3 } = req.body || {};
        const safeLimit = Math.max(1, Math.min(Number(limit) || 3, 5));
        const samples = source === 'contacts'
            ? listContactsForCampaign({ query: filters.query || '', limit: safeLimit })
            : listVehicleContactsByFilters({ ...filters, limit: safeLimit });

        res.json({ samples });
    } catch (error) {
        console.error('Preview samples error:', error);
        res.status(500).json({ error: 'Preview samples failed' });
    }
});
```

**✅ Endpoint implementado correctamente**
- Soporta `source: 'vehicles' | 'contacts'`
- Retorna `{ samples: [...] }`

**Problema UI:**
- Frontend SÍ llama a este endpoint (admin/pages.js:882-886)
- Pero luego hace OTRO request a `/admin/api/campaigns/preview` (líneas 902-906)

```javascript
// admin/pages.js:902-909
const previewRes = await fetch('/admin/api/campaigns/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template, variableSource: sample })
});
const previewData = await previewRes.json();
previews.push({ sample, preview: previewData.preview || '' });
```

**Endpoint:** POST /admin/api/campaigns/preview (Líneas 1060-1069)

```javascript
app.post('/admin/api/campaigns/preview', adminAuth, express.json(), (req, res) => {
    try {
        const { template, variableSource } = req.body;
        const rendered = renderMessageTemplate(template, variableSource);
        res.json({ preview: rendered });
    } catch (error) {
        res.status(500).json({ error: 'Preview failed' });
    }
});
```

**✅ Ambos endpoints funcionan correctamente**

**Entonces, ¿por qué preview no muestra nada?**

**Hipótesis:**
1. `template` (campo `messageTemplate`) está vacío
2. La función `runPreview()` valida que template NO esté vacío (línea 860-863):
   ```javascript
   const template = document.querySelector('textarea[name="messageTemplate"]')?.value?.trim() || '';
   if (!template) {
       results.textContent = 'Ingresa un mensaje libre para previsualizar.';
       return;
   }
   ```

**Conclusión:**
- ✅ Preview funciona SI el usuario llena el campo `messageTemplate`
- ❌ Si el campo está vacío, preview muestra: "Ingresa un mensaje libre para previsualizar."
- **NO ES UN BUG**, es validación intencional

---

### 3.3 Scheduler & Runtime (server.js:103-218 & 223-224)

#### Inicialización del Scheduler

```javascript
// server.js:68-70
const SCHEDULER_INTERVAL_MS = Number(process.env.CAMPAIGN_SCHEDULER_INTERVAL_MS || 30000);
const SCHEDULER_BATCH_SIZE = Number(process.env.CAMPAIGN_SEND_BATCH_SIZE || 20);
const schedulerState = { running: false };
```

```javascript
// server.js:223-224
setInterval(processCampaignQueue, SCHEDULER_INTERVAL_MS);
processCampaignQueue();
```

**✅ Scheduler corre cada 30 segundos (default)**
**✅ Se ejecuta inmediatamente al iniciar el servidor**
**✅ Verificado en VPS: Funciona correctamente (campaña pasó de scheduled → completed a la hora exacta)**

#### Función processCampaignQueue() (Líneas 103-127)

```javascript
async function processCampaignQueue() {
    if (schedulerState.running) {
        return; // Evita ejecuciones concurrentes
    }
    schedulerState.running = true;
    try {
        if (!twilioClient || !process.env.MESSAGING_SERVICE_SID) {
            return; // ⚠️ SALIDA SILENCIOSA SI TWILIO NO CONFIGURADO
        }

        const dueCampaigns = listScheduledCampaignsDue(5);
        for (const campaign of dueCampaigns) {
            setCampaignStatus(campaign.id, 'sending');
        }

        const sendingCampaigns = listCampaignsByStatus({ status: 'sending', limit: 5 });
        for (const campaign of sendingCampaigns) {
            await processCampaignSendBatch(campaign);
        }
    } catch (error) {
        console.error('Campaign scheduler error:', error?.message || error);
    } finally {
        schedulerState.running = false;
    }
}
```

**Comportamiento:**
1. Verifica que Twilio esté configurado
2. Busca campañas programadas cuya hora ya pasó (`listScheduledCampaignsDue`)
3. Las marca como `status = 'sending'`
4. Procesa batch de envíos (`processCampaignSendBatch`)

**✅ Lógica correcta y VERIFICADA**

#### Función processCampaignSendBatch() (Líneas 129-218)

**🔴 AQUÍ ESTÁ EL PROBLEMA:**

```javascript
async function processCampaignSendBatch(campaign) {
    const recipients = listPendingRecipients({ campaignId: campaign.id, limit: SCHEDULER_BATCH_SIZE });
    if (!recipients.length) {
        updateCampaignStatus(campaign.id, 'completed'); // ← COMPLETA SIN ENVIAR
        return;
    }
    // ... resto del código de envío
}
```

**Problema:**
- Si la campaña NO tiene destinatarios (`recipients.length = 0`)
- Se marca como `'completed'` inmediatamente
- **NO hay validación previa** que impida crear campañas programadas sin destinatarios

---

### 3.4 Database Layer (db/index.js)

#### Query: listScheduledCampaignsDue (Líneas 252-260)

```javascript
listScheduledCampaignsDue: db.prepare(`
    SELECT id, name, message_template, status, type, scheduled_at, content_sid, filters
    FROM campaigns
    WHERE status = 'scheduled'
      AND scheduled_at IS NOT NULL
      AND datetime(scheduled_at) <= datetime('now', 'localtime')
    ORDER BY scheduled_at ASC
    LIMIT ?
`)
```

**✅ FUNCIONA CORRECTAMENTE**

**Verificado en VPS:**
- Servidor configurado en `America/Santiago` (UTC-3)
- Usuario en Chile también en UTC-3
- Formato en DB: `2026-01-12 22:17:00`
- Comparación: `datetime('2026-01-12 22:17:00') <= datetime('now', 'localtime')`
- **Resultado:** Campaña se ejecutó EXACTAMENTE a las 22:17:00 ✅

**¿Cómo se almacena `scheduled_at`?**

```javascript
// server.js:72-85
function normalizeScheduledAt(value) {
    // Recibe: "2026-01-12T22:17"
    // Retorna: "2026-01-12 22:17:00"
}
```

**Flujo actual (CORRECTO cuando server y user en mismo timezone):**
1. Usuario ingresa: `2026-01-12 22:17` (hora local Chile)
2. Navegador envía: `2026-01-12T22:17`
3. Backend normaliza: `2026-01-12 22:17:00`
4. DB guarda: `2026-01-12 22:17:00`
5. Scheduler compara con `datetime('now', 'localtime')` (Chile)
6. **Coincide perfectamente** ✅

**⚠️ Nota para deployment en otros timezones:**
- Si el VPS cambia de timezone o se mueve a otro servidor
- Asegurarse de configurar `TZ=America/Santiago` en el contenedor
- O migrar a UTC con conversión en frontend (recomendado para escalabilidad)

---

#### Query: setCampaignStatus (Líneas 219-224)

```javascript
setCampaignStatus: db.prepare(`
    UPDATE campaigns
    SET status = ?,
        started_at = CASE WHEN ? = 'sending' THEN datetime('now', 'localtime') ELSE started_at END
    WHERE id = ?
`)
```

**✅ Transición de estados correcta:**
- `scheduled` → `sending` (cuando llega la hora)
- `draft` → `sending` (inicio manual)
- `paused` → `sending` (reanudar)

**Función wrapper:**
```javascript
// db/index.js:572-575
export function setCampaignStatus(id, status) {
    const info = statements.setCampaignStatus.run(status, status, id);
    return info.changes > 0 ? getCampaignById(id) : null;
}
```

**✅ Retorna campaign actualizada o null**

---

### 3.5 Runtime/Deploy Considerations

#### Easypanel/Docker Environment

**Timezone del contenedor:**
- Por defecto, contenedores Docker usan **UTC**
- El código usa `datetime('now', 'localtime')` → asume timezone del servidor

**Problema:**
- Si Easypanel/VPS está en UTC
- Y usuarios programan en UTC-3 (Chile)
- La comparación será incorrecta

**Verificar:**
```bash
# Dentro del contenedor
date
# Debería mostrar timezone actual
```

**Fix recomendado:**
```dockerfile
# En Dockerfile
ENV TZ=America/Santiago
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone
```

---

## 4. Análisis de Causas Raíz

### 4.1 Preview NO Muestra Contactos

**Causa:** NO ES UN BUG

**Flujo esperado:**
1. Usuario llena campo "Mensaje (body libre)"
2. Usuario selecciona fuente (vehicles/contacts)
3. Usuario hace clic en "Previsualizar"
4. `runPreview()` valida que `messageTemplate` no esté vacío
5. Si está vacío: muestra "Ingresa un mensaje libre para previsualizar."
6. Si tiene contenido: llama a `/admin/api/campaigns/preview-samples` y `/admin/api/campaigns/preview`
7. Muestra resultados renderizados con variables reemplazadas

**Problema reportado:**
- "Preview no permite visualizar ni elegir contactos"

**Realidad:**
- Preview SÍ funciona, pero requiere que el usuario PRIMERO llene el campo `messageTemplate`
- El mensaje de validación es correcto pero puede ser confuso

**Fix UI recomendado:**
- Cambiar mensaje de validación a algo más claro:
  ```
  "Para previsualizar, primero escribe el mensaje en el campo 'Mensaje (body libre)' arriba."
  ```

---

### 4.2 Campañas Programadas NO Envían Mensajes

**Causa Principal:** Flujo UX Incompleto (falta asignación de destinatarios)

**Escenario Real Verificado:**
1. Usuario crea campaña en `/admin/campaigns/new`
2. Llena: nombre, mensaje, fecha programada (22:17:00)
3. Hace submit → campaña creada con `status='scheduled'` y `total_recipients=0`
4. ❌ **NO hay paso en el formulario para asignar destinatarios**
5. Scheduler detecta campaña a las 22:17:00
6. Marca como `status='sending'`
7. Llama a `processCampaignSendBatch()`
8. Encuentra `recipients.length = 0`
9. **Resultado:** Marca como `status='completed'` SIN enviar nada

**Código que causa el problema (server.js:129-134):**
```javascript
async function processCampaignSendBatch(campaign) {
    const recipients = listPendingRecipients({ campaignId: campaign.id, limit: SCHEDULER_BATCH_SIZE });
    if (!recipients.length) {
        updateCampaignStatus(campaign.id, 'completed'); // ← COMPLETA VACÍA
        return;
    }
    // ... código de envío
}
```

**Flujo actual para asignar destinatarios:**
1. Crear campaña en `/admin/campaigns/new` (SIN destinatarios)
2. Ir a `/admin/campaigns` (lista)
3. Hacer clic en la campaña creada → `/admin/campaigns/{id}`
4. Usar panel "Asignar destinatarios" (admin/pages.js:508-536)
5. **PERO:** Si programaste para +3 minutos, el scheduler ya la completó vacía

**Variables de entorno (funcionan correctamente):**
```env
CAMPAIGN_SCHEDULER_INTERVAL_MS=30000  # 30 segundos ✅
CAMPAIGN_SEND_BATCH_SIZE=20           # Mensajes por batch ✅
TZ=America/Santiago                   # Timezone del VPS ✅
```

---

### 4.3 Estados de Campaña y Transiciones

**Estados válidos (schema.sql:57):**
```
draft | scheduled | sending | paused | completed | cancelled | failed
```

**Transiciones permitidas:**

```
draft ──────────────► sending (inicio manual)
  │
  └──► scheduled (si se setea scheduled_at)

scheduled ──────────► sending (cuando llega la hora)
  │
  └──► cancelled (cancelar antes de iniciar)

sending ─────────────► paused (pausar temporalmente)
  │
  ├──► completed (todos enviados)
  └──► failed (error crítico)

paused ──────────────► sending (reanudar)
  │
  └──► cancelled (cancelar definitivamente)
```

**Funciones de transición (db/index.js):**
- `setCampaignStatus(id, 'sending')` → Inicia envío
- `pauseCampaign(id)` → Solo si status = 'sending'
- `resumeCampaign(id)` → Solo si status = 'paused'
- `cancelCampaign(id)` → Solo si status IN ('draft', 'scheduled', 'paused')

**✅ Lógica de estados correcta**

---

## 5. Plan de Implementación (Guía para Developer)

### 5.1 Fix Crítico: Agregar Asignación de Destinatarios al Flujo de Creación

**Problema:** El formulario `/admin/campaigns/new` NO permite asignar destinatarios, causando que campañas programadas se completen vacías.

**Archivos a modificar:**
1. `admin/pages.js` (líneas 710-1156) - Formulario de campaña
2. `server.js` (líneas 700-725) - Endpoint POST /admin/api/campaigns

---

#### Opción A: Agregar Step de Asignación en el Formulario (Recomendado)

**Flujo propuesto:**
```
[Paso 1: Configuración]
- Nombre, mensaje, tipo, fecha programada

[Paso 2: Destinatarios] ← NUEVO
- Fuente (vehicles/contacts)
- Filtros (marca, modelo, año, query)
- Preview de destinatarios a enviar

[Paso 3: Confirmar y Crear]
```

**Cambios en admin/pages.js:**

1. **Agregar sección de destinatarios al formulario (después de línea 790):**

```javascript
// DESPUÉS de la sección "Modo Test" (línea 790)

<div style="margin-bottom:15px; padding:15px; border:2px solid var(--accent); border-radius:10px; background:#f8f5f1;">
    <h3 style="margin-top:0;">Destinatarios para campaña programada</h3>
    <div class="muted" style="margin-bottom:10px;">
        ⚠️ <strong>Importante:</strong> Si programas el envío, debes asignar destinatarios AHORA.
        De lo contrario, la campaña se completará sin enviar mensajes.
    </div>

    <div class="inline" style="margin-bottom:10px;">
        <label for="recipientSource" class="muted">Fuente:</label>
        <select id="recipientSource">
            <option value="">No asignar ahora (crear como draft)</option>
            <option value="vehicles">Por vehiculos</option>
            <option value="contacts">Por contactos</option>
        </select>
        <button type="button" id="loadRecipientsBtn">Cargar destinatarios</button>
    </div>

    <div id="recipientVehicleFilters" class="hidden" style="margin-top:10px;">
        <div class="inline">
            <input type="text" id="filterMake" placeholder="Marca (opcional)" />
            <input type="text" id="filterModel" placeholder="Modelo (opcional)" />
            <input type="number" id="filterYearMin" placeholder="Ano min" />
            <input type="number" id="filterYearMax" placeholder="Ano max" />
        </div>
    </div>

    <div id="recipientContactFilters" class="hidden" style="margin-top:10px;">
        <div class="inline">
            <input type="text" id="filterQuery" placeholder="Telefono o nombre" />
        </div>
    </div>

    <div id="recipientCount" class="muted" style="margin-top:10px;"></div>
    <div id="recipientPreview" style="margin-top:10px; max-height:200px; overflow-y:auto;"></div>
</div>
```

2. **Agregar JavaScript para manejar asignación (dentro del `<script>`):**

```javascript
// AGREGAR al final del DOMContentLoaded (después de línea 1150)

const recipientSourceEl = document.getElementById('recipientSource');
if (recipientSourceEl) {
    recipientSourceEl.addEventListener('change', () => {
        const source = recipientSourceEl.value;
        const vehicleFilters = document.getElementById('recipientVehicleFilters');
        const contactFilters = document.getElementById('recipientContactFilters');

        if (source === 'vehicles') {
            vehicleFilters?.classList.remove('hidden');
            contactFilters?.classList.add('hidden');
        } else if (source === 'contacts') {
            vehicleFilters?.classList.add('hidden');
            contactFilters?.classList.remove('hidden');
        } else {
            vehicleFilters?.classList.add('hidden');
            contactFilters?.classList.add('hidden');
        }

        // Limpiar preview
        document.getElementById('recipientCount').textContent = '';
        document.getElementById('recipientPreview').innerHTML = '';
    });
}

const loadRecipientsBtn = document.getElementById('loadRecipientsBtn');
if (loadRecipientsBtn) {
    loadRecipientsBtn.addEventListener('click', async () => {
        const source = document.getElementById('recipientSource')?.value;
        if (!source) {
            alert('Selecciona una fuente de destinatarios');
            return;
        }

        const filters = {};
        if (source === 'contacts') {
            filters.query = document.getElementById('filterQuery')?.value?.trim() || '';
        } else {
            filters.make = document.getElementById('filterMake')?.value?.trim() || null;
            filters.model = document.getElementById('filterModel')?.value?.trim() || null;
            filters.yearMin = document.getElementById('filterYearMin')?.value || null;
            filters.yearMax = document.getElementById('filterYearMax')?.value || null;
        }

        try {
            const res = await fetch('/admin/api/campaigns/preview-samples', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source, filters, limit: 100 })
            });

            if (!res.ok) {
                alert('Error al cargar destinatarios');
                return;
            }

            const data = await res.json();
            const recipients = data.samples || [];

            document.getElementById('recipientCount').textContent =
                `✅ ${recipients.length} destinatarios encontrados`;

            // Mostrar preview
            const previewHtml = recipients.slice(0, 10).map(r =>
                `<div style="padding:4px; border-bottom:1px solid #eee;">
                    ${maskPhone(r.phone)} - ${escapeHtml(r.name || 'Sin nombre')}
                </div>`
            ).join('');

            document.getElementById('recipientPreview').innerHTML =
                previewHtml +
                (recipients.length > 10 ? `<div class="muted" style="padding:8px;">...y ${recipients.length - 10} más</div>` : '');

            // Guardar recipients en variable global para submit
            window.selectedRecipients = recipients;

        } catch (error) {
            alert('Error: ' + error.message);
        }
    });
}
```

3. **Modificar submit handler para incluir recipients (línea 1079-1111):**

```javascript
// MODIFICAR el submit handler:

campaignForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setFormError('');
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    const messageTemplate = String(data.messageTemplate || '').trim();
    const contentSid = String(data.contentSid || '').trim();
    if (!messageTemplate && !contentSid) {
        setFormError('Debes ingresar Content SID o mensaje libre.');
        return;
    }

    // NUEVO: Validar destinatarios si es campaña programada
    if (data.scheduledAt && (!window.selectedRecipients || window.selectedRecipients.length === 0)) {
        if (!confirm('⚠️ ADVERTENCIA: Estás programando una campaña SIN destinatarios.\n\n' +
                     'La campaña se completará automáticamente sin enviar mensajes.\n\n' +
                     '¿Deseas continuar de todos modos?')) {
            return;
        }
    }

    // Agregar recipients al payload
    if (window.selectedRecipients && window.selectedRecipients.length > 0) {
        data.recipientIds = window.selectedRecipients.map(r => r.id);
    }

    let url, method;
    if (${isNew ? 'true' : 'false'}) {
        url = '/admin/api/campaigns';
        method = 'POST';
    } else {
        url = '/admin/api/campaigns/' + ${campaign.id ? campaign.id : 'null'};
        method = 'PATCH';
    }

    const res = await fetch(url, {
        method,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    });

    if(res.ok) {
        window.location.href = '/admin/campaigns';
    } else {
        setFormError('Error al guardar.');
    }
});
```

**Cambios en server.js (líneas 700-725):**

```javascript
// MODIFICAR endpoint POST /admin/api/campaigns

app.post('/admin/api/campaigns', adminAuth, express.json(), (req, res) => {
    try {
        const { name, messageTemplate, type, scheduledAt, contentSid, filters, recipientIds } = req.body;
        const normalizedScheduledAt = normalizeScheduledAt(scheduledAt);
        const status = normalizedScheduledAt ? 'scheduled' : 'draft';

        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }

        // NUEVO: Validar que tenga destinatarios si es scheduled
        if (status === 'scheduled' && (!recipientIds || recipientIds.length === 0)) {
            console.warn(`Campaign "${name}" scheduled without recipients`);
        }

        const campaign = createCampaign({
            name,
            messageTemplate,
            type,
            scheduledAt: normalizedScheduledAt,
            contentSid,
            filters,
            status
        });

        // NUEVO: Asignar destinatarios si se proporcionaron
        if (recipientIds && Array.isArray(recipientIds) && recipientIds.length > 0) {
            assignRecipientsToCampaign(campaign.id, recipientIds);
        }

        res.status(201).json(campaign);
    } catch (error) {
        console.error('Create campaign error:', error);
        res.status(500).json({ error: 'Failed to create campaign' });
    }
});
```

**Impacto:**
- ✅ Usuario puede asignar destinatarios AL CREAR la campaña
- ✅ Warning si intenta programar sin destinatarios
- ✅ Flujo más intuitivo (todo en un solo lugar)
- ✅ Backwards compatible (si no asigna, funciona como antes)

---

### 5.2 Fix UI: Preview de Destinatarios

**Archivo:** `admin/pages.js` (líneas 748-773)

**Problema:** Mensaje de validación confuso

**Cambio sugerido:**

```javascript
// MODIFICAR línea 860-863:

async function runPreview() {
    const results = document.getElementById('previewResults');
    if (!results) return;
    const template = document.querySelector('textarea[name="messageTemplate"]')?.value?.trim() || '';
    if (!template) {
        // ANTES:
        // results.textContent = 'Ingresa un mensaje libre para previsualizar.';

        // DESPUÉS:
        results.innerHTML = '<div class="muted" style="color:var(--warn); padding:10px; background:#fff9e6; border-radius:8px;">' +
            '⚠️ <strong>Para previsualizar:</strong><br/>' +
            '1. Escribe un mensaje en el campo "Mensaje (body libre)" arriba.<br/>' +
            '2. Usa variables como {{name}}, {{make}}, {{model}} en el mensaje.<br/>' +
            '3. Luego haz clic en "Previsualizar" para ver cómo se renderiza.' +
            '</div>';
        return;
    }
    // ... resto del código
}
```

**Impacto:**
- ✅ Usuario entiende qué hacer para que preview funcione
- ✅ No requiere cambios en backend
- ✅ Mejora UX sin tocar lógica

---

### 5.3 Mejora Opcional: Logging del Scheduler

**Archivo:** `server.js` (líneas 103-127)

**Agregar logging para debugging:**

```javascript
async function processCampaignQueue() {
    if (schedulerState.running) {
        return;
    }
    schedulerState.running = true;
    try {
        if (!twilioClient || !process.env.MESSAGING_SERVICE_SID) {
            console.log('Scheduler: Twilio not configured, skipping');
            return;
        }

        const now = new Date();
        console.log('Scheduler tick:', now.toISOString(), '| Server TZ:', Intl.DateTimeFormat().resolvedOptions().timeZone);

        const dueCampaigns = listScheduledCampaignsDue(5);
        console.log('Due campaigns:', dueCampaigns.length);

        if (dueCampaigns.length > 0) {
            console.log('Starting campaigns:', dueCampaigns.map(c => ({ id: c.id, name: c.name, scheduled_at: c.scheduled_at })));
        }

        for (const campaign of dueCampaigns) {
            setCampaignStatus(campaign.id, 'sending');
        }

        const sendingCampaigns = listCampaignsByStatus({ status: 'sending', limit: 5 });
        console.log('Sending campaigns:', sendingCampaigns.length);

        for (const campaign of sendingCampaigns) {
            await processCampaignSendBatch(campaign);
        }
    } catch (error) {
        console.error('Campaign scheduler error:', error?.message || error);
    } finally {
        schedulerState.running = false;
    }
}
```

**Impacto:**
- ✅ Permite diagnosticar problemas de timezone
- ✅ Facilita debugging en producción
- ✅ No afecta rendimiento (solo console.log)

---

### 5.4 Testing del Fix

#### Test Manual 1: Preview Funciona

1. Ir a `/admin/campaigns/new`
2. Dejar campo "Mensaje (body libre)" VACÍO
3. Hacer clic en "Previsualizar"
4. **Expected:** Mensaje de ayuda con instrucciones claras
5. Escribir mensaje: `Hola {{name}}, tu {{make}} {{model}} está disponible.`
6. Hacer clic en "Previsualizar"
7. **Expected:** Muestra 1-3 destinatarios con mensaje renderizado

#### Test Manual 2: Campaña Programada se Ejecuta

1. Crear campaña programada para **5 minutos en el futuro**
2. Verificar en DB:
   ```sql
   SELECT id, name, status, scheduled_at FROM campaigns ORDER BY created_at DESC LIMIT 1;
   ```
   - `status` debe ser `'scheduled'`
   - `scheduled_at` debe estar en **UTC**
3. Esperar 5 minutos
4. Verificar logs del servidor:
   ```
   Scheduler tick: 2026-01-12T18:30:00.000Z | Server TZ: UTC
   Due campaigns: 1
   Starting campaigns: [{"id":5,"name":"Test Campaign","scheduled_at":"2026-01-12 18:30:00"}]
   ```
5. Verificar en DB:
   ```sql
   SELECT status FROM campaigns WHERE id = 5;
   ```
   - `status` debe cambiar a `'sending'` → `'completed'`

#### Test Automatizado (Opcional)

```javascript
// test/scheduler.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createCampaign, listScheduledCampaignsDue, db } from './db/index.js';

describe('Campaign Scheduler', () => {
    beforeAll(() => {
        // Setup test DB
    });

    afterAll(() => {
        // Cleanup
    });

    it('should detect campaigns due for sending', () => {
        const nowUTC = new Date().toISOString().replace('T', ' ').substring(0, 19);
        const campaign = createCampaign({
            name: 'Test Campaign',
            scheduledAt: nowUTC,
            status: 'scheduled'
        });

        const due = listScheduledCampaignsDue(10);
        expect(due).toContainEqual(expect.objectContaining({ id: campaign.id }));
    });

    it('should not detect future campaigns', () => {
        const future = new Date(Date.now() + 3600000).toISOString().replace('T', ' ').substring(0, 19);
        const campaign = createCampaign({
            name: 'Future Campaign',
            scheduledAt: future,
            status: 'scheduled'
        });

        const due = listScheduledCampaignsDue(10);
        expect(due).not.toContainEqual(expect.objectContaining({ id: campaign.id }));
    });
});
```

---

## 6. Conclusiones y Recomendaciones

### Resumen de Hallazgos (ACTUALIZADO con pruebas reales)

| Componente | Estado | Problema | Severidad |
|------------|--------|----------|-----------|
| **Preview UI** | ✅ Funciona | Requiere llenar template primero (comportamiento correcto) | 🟢 OK |
| **Preview API** | ✅ Funciona | Sin problemas | 🟢 OK |
| **Scheduler Loop** | ✅ Funciona | ✅ Verificado: ejecuta campañas a la hora exacta | 🟢 OK |
| **Timezone Handling** | ✅ Funciona | ✅ VPS en America/Santiago coincide con usuarios | 🟢 OK |
| **Estado Transitions** | ✅ Correctas | Sin problemas | 🟢 OK |
| **Asignación de Destinatarios** | ❌ Bug Crítico | Flujo UX incompleto en creación | 🔴 Critical |

**Evidencia de Prueba Real:**
- ✅ Campaña programada para 22:17:00 → se ejecutó EXACTAMENTE a las 22:17:00
- ✅ Transición de estado: `scheduled` → `completed` funcionó correctamente
- ❌ NO envió mensajes porque `total_recipients = 0`

### Prioridades de Implementación

#### 🔴 Priority 1: Agregar Asignación de Destinatarios al Formulario (CRITICAL)
- **Impact:** Campañas programadas se completan vacías (NO envían mensajes)
- **Effort:** 3-4 horas
- **Risk:** Low (agregar funcionalidad, no modificar existente)
- **Files:** `admin/pages.js`, `server.js`
- **Testing:** Crear campaña programada con destinatarios y verificar envío

#### 🟡 Priority 2: Mejorar UX de Preview (NICE TO HAVE)
- **Impact:** Reduce confusión sobre cómo usar preview
- **Effort:** 30 minutos
- **Risk:** None
- **Files:** `admin/pages.js` (solo mensaje de validación)

#### 🟢 Priority 3: Logging del Scheduler (OPTIONAL)
- **Impact:** Facilita debugging y monitoreo
- **Effort:** 1 hora
- **Risk:** None
- **Files:** `server.js`

### Próximos Pasos

1. ✅ **Validar análisis con equipo**
2. 🔄 **Implementar fix de timezone**
3. 🔄 **Testing en ambiente de desarrollo**
4. 🔄 **Deploy a staging**
5. 🔄 **Validar con campaña real programada**
6. 🔄 **Deploy a producción**
7. 🔄 **Monitorear logs por 48h**

### Notas Importantes

- **NO modificar código existente** hasta que este análisis sea aprobado
- **Hacer backup de DB** antes de aplicar cambios
- **Probar en local primero** con campaña programada para +5 minutos
- **Verificar timezone del servidor** antes de deploy (`date` en contenedor)

---

## Apéndice: Archivos Clave y Líneas Relevantes

### admin/pages.js
- **Líneas 748-773:** UI del preview de destinatarios
- **Líneas 742-746:** Input datetime-local para programación
- **Líneas 856-915:** Función `runPreview()` (implementada correctamente)
- **Líneas 1121-1123:** Event listener de preview (existe)

### server.js
- **Líneas 68-70:** Constantes del scheduler (interval, batch size)
- **Líneas 72-85:** Función `normalizeScheduledAt()` (requiere fix)
- **Líneas 103-127:** Función `processCampaignQueue()` (scheduler principal)
- **Líneas 223-224:** Inicialización del scheduler (setInterval)
- **Líneas 700-725:** POST /admin/api/campaigns (creación de campaña)
- **Líneas 1060-1069:** POST /admin/api/campaigns/preview (renderizado de template)
- **Líneas 1071-1084:** POST /admin/api/campaigns/preview-samples (obtención de samples)

### db/index.js
- **Líneas 252-260:** Query `listScheduledCampaignsDue` (**REQUIERE FIX**)
- **Líneas 219-224:** Query `setCampaignStatus` (OK)
- **Líneas 572-575:** Función `setCampaignStatus()` (wrapper, OK)
- **Líneas 588-590:** Función `listScheduledCampaignsDue()` (wrapper, OK)

### db/schema.sql
- **Líneas 54-77:** Tabla `campaigns` con campos relevantes
- **Línea 65:** Campo `scheduled_at TEXT` (sin timezone info)
- **Línea 57:** Estados válidos de campaña

---

**Fin del Análisis**

---

## Progress / Execution Log

### Implementation Session - 2026-01-12

**Start Time:** 22:45 (Chile Time)
**Implementation Mode:** /sc:implement --think --validate --safe-mode --task-manage --sequential --serena

#### Changes Implemented

**[✅ COMPLETED] 1. UI Section - Recipient Assignment Panel (admin/pages.js)**
- **Lines Modified:** Added after line 790 (before submit button)
- **Changes:**
  - Added new section "Destinatarios para campaña programada" with warning message
  - Created dropdown selector for source (vehicles/contacts)
  - Added "Cargar destinatarios" button
  - Implemented filter inputs for both vehicles and contacts sources
  - Added preview containers (`recipientCount` and `recipientPreview`)
- **Status:** ✅ Implemented and syntax-validated
- **File Size Impact:** +38 lines

**[✅ COMPLETED] 2. JavaScript Event Handlers (admin/pages.js)**
- **Lines Modified:** Added after line 1159 (after preview button handler)
- **Changes:**
  - `recipientSource` change listener: toggles filter visibility based on source selection
  - `loadRecipientsBtn` click handler:
    - Validates source selection
    - Collects filters based on source type
    - Calls `/admin/api/campaigns/preview-samples` endpoint
    - Displays recipient count and preview (first 10 contacts)
    - Stores recipients in `window.selectedRecipients` for form submission
  - Used string concatenation instead of template literals to avoid escaping issues
- **Status:** ✅ Implemented and syntax-validated
- **File Size Impact:** +82 lines

**[✅ COMPLETED] 3. Form Submit Handler Modification (admin/pages.js)**
- **Lines Modified:** Lines 1127-1139 (within existing submit handler)
- **Changes:**
  - Added validation check for scheduled campaigns without recipients
  - Shows confirmation dialog with warning if scheduling without recipients
  - Includes `recipientIds` in payload if recipients were loaded
  - Maps `window.selectedRecipients` to array of IDs
- **Status:** ✅ Implemented and syntax-validated
- **File Size Impact:** +13 lines

**[✅ COMPLETED] 4. Backend API Endpoint Update (server.js)**
- **Lines Modified:** Lines 700-735 (POST /admin/api/campaigns)
- **Changes:**
  - Added `recipientIds` to destructured request body
  - Added warning log if campaign is scheduled without recipients
  - Calls `assignRecipientsToCampaign()` if recipientIds provided
  - Maintains backward compatibility (recipientIds is optional)
- **Status:** ✅ Implemented and syntax-validated
- **File Size Impact:** +9 lines

#### Verification Steps Completed

**[✅] Syntax Validation**
- `node --check server.js` → No errors
- `node --check admin/pages.js` → No errors (after fixing template literal escaping)

**[✅] Server Startup Test**
- `node server.js` → Server started successfully on port 3000
- No runtime errors during initialization

**[⏳] Functional Testing - PENDING USER VALIDATION**
The following tests should be performed manually:

1. **Test 1: Load recipients for vehicles source**
   - Navigate to `/admin/campaigns/new`
   - Select "Por vehiculos" from recipient source dropdown
   - Add filters (make, model, year range)
   - Click "Cargar destinatarios"
   - **Expected:** Shows count + preview of matching vehicle contacts

2. **Test 2: Load recipients for contacts source**
   - Select "Por contactos" from recipient source dropdown
   - Enter search query (phone or name)
   - Click "Cargar destinatarios"
   - **Expected:** Shows count + preview of matching contacts

3. **Test 3: Create scheduled campaign WITH recipients**
   - Fill campaign form:
     - Name: "Test Campaign with Recipients"
     - Message: "Hola {{name}}, test message"
     - Scheduled time: +5 minutes from now
   - Load recipients using steps above
   - Submit form
   - **Expected:**
     - Campaign created with status='scheduled'
     - Recipients assigned in database (`campaign_recipients` table)
     - Scheduler sends messages when time arrives

4. **Test 4: Warning for scheduled campaign WITHOUT recipients**
   - Fill campaign form with scheduled time
   - DO NOT load recipients
   - Submit form
   - **Expected:** Confirmation dialog appears with warning
   - If user cancels: form submission aborted
   - If user confirms: campaign created but with 0 recipients (as before)

5. **Test 5: Draft campaign without recipients (should work normally)**
   - Fill campaign form WITHOUT scheduled time
   - Do not load recipients
   - Submit form
   - **Expected:** Campaign created with status='draft', no warning shown

#### Files Modified

1. **admin/pages.js**
   - Total lines added: ~133 lines
   - Sections modified:
     - Form HTML (recipient assignment section)
     - Event listeners (recipient loading handlers)
     - Form submit validation

2. **server.js**
   - Total lines added: ~9 lines
   - Sections modified:
     - POST /admin/api/campaigns endpoint

#### Rollback Instructions (if needed)

If issues are found during testing:

1. **Revert admin/pages.js:**
   ```bash
   git checkout HEAD -- admin/pages.js
   ```

2. **Revert server.js:**
   ```bash
   git checkout HEAD -- server.js
   ```

3. **Or revert both:**
   ```bash
   git checkout HEAD -- admin/pages.js server.js
   ```

#### Next Steps

**Immediate (User Action Required):**
- [ ] Perform functional tests 1-5 listed above
- [ ] Verify campaign executes and sends messages at scheduled time
- [ ] Check database to confirm recipients were inserted correctly

**If Tests Pass:**
- [ ] Create git commit with implementation changes
- [ ] Deploy to staging/VPS environment
- [ ] Monitor scheduler logs for 24-48 hours
- [ ] Mark implementation as production-ready

**If Tests Fail:**
- [ ] Document specific failure scenario
- [ ] Review error logs from browser console and server
- [ ] Apply fixes and re-test
- [ ] Update this progress log with resolution

#### Technical Notes

**Template Literal Escaping Issue:**
- Initial implementation used template literals inside JavaScript embedded in HTML template literal
- Caused syntax errors due to nested backticks
- **Solution:** Changed to string concatenation with `+` operator
- Lines affected: 1235, 1239-1241, 1246

**Backward Compatibility:**
- All changes are additive and optional
- Existing campaigns and workflows continue to work unchanged
- New recipient assignment feature is opt-in during campaign creation

**Security Considerations:**
- `recipientIds` array is validated server-side (must be array)
- Database transaction used in `assignRecipientsToCampaign()` (atomic operation)
- No new authentication/authorization logic needed (uses existing `adminAuth` middleware)

---

**Implementation Status:** ✅ COMPLETED (Awaiting User Testing)
**Last Updated:** 2026-01-12 23:00 (Chile Time)

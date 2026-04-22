# Mejoras Propuestas — WA-Test (Queirolo Autos)

> Análisis completo realizado el 2026-04-21.
> **Criterio:** solo mejoras que NO rompen funcionalidad existente. Sin reescrituras masivas; refactors incrementales.

---

## Resumen ejecutivo

El proyecto tiene una base sólida: esquema SQL bien diseñado, WAL mode activado, manejo de opt-outs, exportación CSV, scheduler de campañas, y una UI admin funcional. Los problemas principales son **deuda de organización** (server.js monolítico de 1 600 líneas), **duplicación de lógica de envío**, **una vulnerabilidad de seguridad real** (sin validación de firma Twilio), y pequeños bugs de UX. Todo lo que se lista abajo se puede aplicar de forma independiente y sin riesgo de regresión.

---

## 🔴 Crítico (seguridad / bugs reales)

### 1. Validar firma de Twilio en el webhook inbound

**Archivo:** `server.js:1465`  
**Problema:** El endpoint `/twilio/inbound` acepta cualquier POST. Un atacante podría enviar peticiones falsas, simular opt-outs de otros usuarios, o inundar el sistema con mensajes falsos.  
**Solución:** Usar el middleware oficial de Twilio para validar la firma `X-Twilio-Signature`.

```js
import twilio from 'twilio';
// Agregar como middleware solo en la ruta inbound:
app.post('/twilio/inbound',
  twilio.webhook({ authToken: process.env.TWILIO_AUTH_TOKEN }),
  (req, res) => { /* handler existente sin cambios */ }
);
```

> **Nota:** Requiere que `PUBLIC_BASE_URL` esté definido en `.env` para que Twilio pueda construir la URL canónica para validar.

---

### 2. Conflicto de ruta: `/admin/contacts` duplicado

**Archivos:** `server.js:257` y `server.js:1237`  
**Problema:** Hay **dos rutas `GET /admin/contacts`**. Express ejecuta siempre la primera (línea 257, que renderiza HTML). La segunda (línea 1237, que devuelve JSON para el selector de la campaña) **nunca se ejecuta**.

```
server.js:257   app.get('/admin/contacts', ...)  → HTML (sí funciona)
server.js:1237  app.get('/admin/contacts', ...)  → JSON (MUERTO, nunca alcanzado)
```

**Solución:** Renombrar la segunda a `/admin/api/contacts/all` o similar, y actualizar el frontend que la consuma (buscar en `admin/pages.js` el fetch correspondiente).

---

### 3. Comparación de credenciales no segura ante timing attacks

**Archivo:** `server.js:1557`  
```js
if (providedUser !== user || providedPass !== pass)  // vulnerable
```
**Solución:**
```js
import { timingSafeEqual } from 'crypto';
const safe = (a, b) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
if (!safe(providedUser, user) || !safe(providedPass, pass)) { ... }
```

---

## 🟡 Importante (robustez / mantenibilidad)

### 4. Extraer lógica de envío duplicada

**Archivos:** `server.js:149-242` y `server.js:1268-1434`  
**Problema:** `processCampaignSendBatch` y el handler de `/test-send` contienen **exactamente el mismo bloque de 80+ líneas** para construir el payload, llamar a Twilio, actualizar el estado y registrar el mensaje.

**Solución:** Extraer una función `sendMessageToRecipient(recipient, campaign, contact)` compartida. Los dos callers la invocan. Sin cambio de comportamiento, pero el código pasa de ~160 líneas duplicadas a ~80 + 2 llamadas.

```js
// lib/twilio-sender.js (archivo nuevo)
export async function sendMessageToRecipient({ recipient, campaign, contact, twilioClient, messagingServiceSid, statusCallbackUrl }) {
  // bloque único con toda la lógica de envío
}
```

---

### 5. Fragmentar server.js en routers Express

`server.js` tiene **1 614 líneas** combinando: rutas de contactos, campañas, templates, segmentos, importación, exportación, webhooks, scheduler, middleware y utilidades. Esto hace muy difícil mantener o extender cualquier parte.

**Reorganización propuesta (sin cambiar ninguna URL ni comportamiento):**

```
routes/
  webhooks.js        — /twilio/inbound, /twilio/status-callback
  admin/
    contacts.js      — CRUD contactos
    campaigns.js     — CRUD + acciones campaigns
    templates.js     — CRUD templates
    segments.js      — CRUD segments
    import.js        — CSV import
    export.js        — CSV export
    opt-outs.js      — CRUD opt-outs
lib/
  scheduler.js       — processCampaignQueue, processCampaignSendBatch
  twilio-sender.js   — función sendMessageToRecipient
  utils.js           — normalizeScheduledAt, toTwilioRecipient, buildTemplateVariables
middleware/
  auth.js            — adminAuth, getPaging
```

`server.js` quedaría con ~60 líneas: solo imports, setup de Express y montaje de routers.

---

### 6. Sistema de migraciones formal

**Archivo:** `db/index.js:28-92`  
**Problema:** Las migraciones están implementadas como `if (!hasColumn) { ALTER TABLE }` inline en la inicialización. A medida que el esquema crece esto se vuelve frágil y difícil de auditar.

**Solución:** Implementar un sistema simple de migraciones versionadas:

```
db/migrations/
  001_initial.sql
  002_add_campaigns_type.sql
  003_add_templates.sql
  ...
```

Con una tabla `schema_migrations(version, applied_at)` y un runner que aplica solo las pendientes en orden. No requiere librería externa — unas 30 líneas de código.

---

### 7. Validación de variables de entorno al arrancar

**Problema:** Si falta `TWILIO_ACCOUNT_SID`, el servidor arranca y procesa peticiones, pero cualquier intento de enviar mensajes falla silenciosamente o con errores crípticos.

**Solución:** Agregar al inicio de `server.js`:
```js
const REQUIRED_ENV = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'MESSAGING_SERVICE_SID'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error('Missing required env vars:', missing.join(', '));
  process.exit(1);
}
```

---

### 8. Exportación CSV por streaming (evitar OOM)

**Archivo:** `server.js:528-606`  
**Problema:** Los 4 endpoints de exportación cargan hasta 10 000 registros en memoria y construyen una string gigante antes de responder. Con bases grandes esto puede agotar RAM.

**Solución:** Usar `res.write()` row a row y paginación interna, o usar la función `Transform` de Node.js streams. No cambia la interfaz del usuario.

---

### 9. Rate limiting en webhook inbound

**Problema:** Sin límite de peticiones, un actor malicioso puede saturar el servidor o la base de datos enviando miles de POST a `/twilio/inbound`.

**Solución:** Agregar `express-rate-limit` (no agrega dependencias pesadas):

```js
import rateLimit from 'express-rate-limit';
const webhookLimiter = rateLimit({ windowMs: 60_000, max: 100 });
app.post('/twilio/inbound', webhookLimiter, twilioWebhookValidator, handler);
```

---

### 10. Logging estructurado

**Problema:** El código usa `console.log/error` con mensajes ad-hoc. No hay correlación entre peticiones, ni niveles de log configurables. En producción esto dificulta el diagnóstico.

**Solución mínima** (sin librería): Crear `lib/logger.js` con un wrapper que añade timestamp e incluye un `request_id` cuando está disponible. Reemplazar todos los `console.log/error` por `logger.info/error`.

**Solución recomendada:** Agregar `pino` (3KB, muy rápido) o `winston`. Ambos producen JSON estructurado compatible con herramientas de observabilidad.

---

## 🟢 Mejoras de UX/Admin (sin cambio de backend)

### 11. Confirmación antes de acciones destructivas

**Archivo:** `admin/pages.js` (botones de eliminar)  
Los botones de eliminar contacto/template/campaña llaman directamente a `deleteContact(id)` via `onclick`. No hay confirmación del tipo "¿Estás seguro?".

**Solución:** Cambiar a un modal de confirmación nativo (`confirm()` o un `<dialog>`) antes de ejecutar el DELETE. Una línea por botón.

---

### 12. Indicador de progreso de campaña en tiempo real

**Endpoint existente:** `GET /admin/api/campaigns/:id/progress`  
Ya existe la API. Solo falta conectarla al frontend con un `setInterval` en la página de detalle de campaña para auto-refrescar el progreso mientras `status === 'sending'`.

---

### 13. Feedback de éxito tras acciones (flash messages)

Actualmente tras crear/editar/importar, la app redirige sin ningún mensaje de confirmación. Implementar un sistema de "flash" simple basado en query param (`?success=1`) que renderice un banner verde en el destino de la redirección.

```js
// En el redirect de éxito:
res.redirect('/admin/contacts?success=created');
// En el renderizado:
const success = req.query.success;  // "created" → "✅ Contacto creado"
```

---

### 14. Paginación mejorada: mostrar total de registros

Las páginas de contactos, mensajes y campañas muestran el paginador pero no dicen "Mostrando 1-50 de 1 247 contactos". Agregar un COUNT query en cada listado y mostrarlo en el header de la tabla.

---

### 15. Preview de template antes de enviar

**Endpoint existente:** `POST /admin/api/campaigns/preview`  
La API de preview ya existe. Agregar un botón "Ver preview" en el formulario de campaña que llame a este endpoint con los datos actuales y muestre el mensaje renderizado con variables de ejemplo.

---

### 16. Estado visual del scheduler en el dashboard

El scheduler corre cada 30 segundos pero no hay forma de saber desde la UI si está corriendo, cuándo fue la última ejecución, o si hay errores.

**Solución:** Agregar `schedulerState.lastRun` y `schedulerState.lastError` al objeto de estado, y exponer esa info en `/health` y en el dashboard.

---

## 🔧 Limpieza (deuda técnica menor)

### 17. Eliminar archivos de debug del root

Los siguientes archivos parecen ser artefactos de desarrollo que no deberían estar en el repositorio:

```
fix_pages.js          → script de corrección puntual (ejecutado, ya no necesario)
test_import.js        → test manual
tmp_check_scheduled.mjs → debug temporal
error.txt             → log de error antiguo
server.log            → log de producción (no versionar)
data/watest.db.db     → duplicado de base de datos
```

Agregar al `.gitignore`:
```
*.log
data/*.db
data/*.db-shm
data/*.db-wal
tmp_*.mjs
```

---

### 18. Estandarizar manejo de errores en routes

Algunos routes devuelven HTML de error (`res.status(400).send('texto')`), otros devuelven JSON, y algunos mezclan ambos en el mismo handler. Definir una convención:

- Rutas que renderizan HTML → errores como HTML (ya en páginas)
- Rutas `/admin/api/*` → siempre JSON con `{ error: string, code?: string }`

---

### 19. Agregar `.dockerignore`

El `Dockerfile` copia todo el directorio. Sin `.dockerignore`, la imagen incluye `node_modules` locales (si existen), `*.log`, `.env`, y los archivos de debug. Agregar:

```
.env
node_modules
*.log
data/*.db
docs/
scripts/
*.md
```

---

### 20. Actualizar `package.json` con scripts útiles

```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js",
    "db:migrate": "node scripts/migrate.js",
    "db:schema": "node scripts/dump-schema.js",
    "import": "node scripts/import-csv.js",
    "verify": "node scripts/verify-db.js"
  }
}
```

---

## Priorización sugerida

| Prioridad | Item | Esfuerzo | Impacto |
|-----------|------|----------|---------|
| 1 | Validar firma Twilio (#1) | 2h | Alto — seguridad |
| 2 | Corregir ruta duplicada (#2) | 30min | Alto — bug real |
| 3 | Extraer lógica de envío (#4) | 3h | Alto — mantenibilidad |
| 4 | Comparación timing-safe (#3) | 15min | Medio — seguridad |
| 5 | Validar env al arrancar (#7) | 30min | Medio — robustez |
| 6 | Flash messages (#13) | 2h | Alto — UX |
| 7 | Confirmación destructiva (#11) | 1h | Alto — UX |
| 8 | Rate limiting webhook (#9) | 1h | Medio — robustez |
| 9 | Fragmentar server.js (#5) | 1 día | Alto — mantenibilidad |
| 10 | Migraciones formales (#6) | 4h | Medio — robustez |
| 11 | Limpieza archivos debug (#17) | 30min | Bajo — higiene |
| 12 | .dockerignore (#19) | 15min | Bajo — build |
| 13 | Scripts npm (#20) | 15min | Bajo — DX |
| 14 | Streaming CSV export (#8) | 3h | Bajo (dataset actual pequeño) |
| 15 | Logging estructurado (#10) | 4h | Medio — observabilidad |

---

## Lo que funciona bien (no tocar)

- Esquema SQLite bien diseñado con índices correctos y FK con CASCADE
- WAL mode + synchronous NORMAL — correcta configuración para VPS single-node
- Manejo de opt-outs robusto con keywords múltiples y persistencia
- Scheduler con guard `schedulerState.running` para evitar ejecuciones concurrentes
- `Promise.allSettled` para envíos paralelos sin fail-fast
- `escapeXml` en respuestas TwiML — previene XSS en el webhook
- `maskPhone` en logs — privacidad por diseño
- `adminAuth` global via `app.use('/admin', adminAuth)` — buena cobertura
- Export CSV con charset UTF-8 y escaping correcto
- `normalizePhone` centralizado para evitar inconsistencias de formato

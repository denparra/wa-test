# Quick Wins & Roadmap - WA-Test

**Proyecto**: WhatsApp Campaign System (Queirolo Autos)
**Versión**: v0.2 (Dashboard + SQLite + Inbound + Outbound)
**Fecha**: 2026-01-10
**Estado**: MVP en producción (VPS Hostinger + Easypanel)

---

## 🎯 Quick Wins (Alto Impacto, Bajo Riesgo)

Mejoras inmediatas que aportan valor significativo con esfuerzo mínimo y sin romper funcionalidad existente.

### ⏱️ 1-2 Horas (Urgente)

#### 1. Backups Automáticos de SQLite
**Impacto**: 🔴 CRÍTICO - Previene pérdida de datos
**Esfuerzo**: ⚡ Bajo (script + cron)

**Implementación:**
```bash
# 1. Crear script de backup en VPS
cat > /app/scripts/backup-db.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/app/data/backups"
DB_PATH="/app/data/watest.db"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR
sqlite3 $DB_PATH ".backup $BACKUP_DIR/watest-$DATE.db"
# Retener últimos 7 días
find $BACKUP_DIR -name "watest-*.db" -mtime +7 -delete
EOF
chmod +x /app/scripts/backup-db.sh

# 2. Configurar cron diario (3 AM)
echo "0 3 * * * /app/scripts/backup-db.sh" | crontab -
```

**Verificación:** Revisar `/ /app/data/backups/` después de 24h

---

#### 2. Monitoring Básico (Health Check Mejorado) ✅ COMPLETADO
**Impacto**: 🟡 Alto - Detección temprana de fallos
**Esfuerzo**: ⚡ Bajo (modificar endpoint existente)
**Estado**: Implementado en v0.2.0 (Quick Win implementado)

**Implementación:**
```javascript
// En server.js, reemplazar GET /health
app.get('/health', async (_, res) => {
  const checks = {
    server: 'ok',
    database: 'unknown',
    twilio: 'unknown',
    timestamp: new Date().toISOString()
  };

  try {
    // Check DB
    const stats = getAdminStats();
    checks.database = stats ? 'ok' : 'error';
  } catch (error) {
    checks.database = 'error';
  }

  // Check Twilio (opcional, solo si hay credenciales)
  if (process.env.TWILIO_ACCOUNT_SID) {
    checks.twilio = 'configured';
  }

  const allOk = checks.server === 'ok' && checks.database === 'ok';
  res.status(allOk ? 200 : 503).json(checks);
});
```

**Uso:** Configure Uptime Monitor (UptimeRobot, Pingdom, etc.) apuntando a `/health`
**Verification / Evidence:**
- `server.js` implements `/health` with metrics payload (`app.get('/health', ...)`).
- `server.js` uses `getAdminStats()` plus uptime/memory in the health JSON.


---

#### 3. Logging Estructurado
**Impacto**: 🟡 Alto - Facilita debugging
**Esfuerzo**: ⚡ Bajo (reemplazar console.log)

**Implementación:**
```bash
# Instalar winston
npm install winston

# Crear logger.js
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({ format: winston.format.simple() })
  ]
});

# Reemplazar console.log en server.js:
import { logger } from './logger.js';
logger.info('INBOUND', { from: maskPhone(phone), bodyLength: body.length });
logger.error('DB error (inbound)', { error: error.message });
```

---

### 📅 1 Día (Importante)

#### 4. Rate Limiting (Webhook Inbound)
**Impacto**: 🟡 Alto - Previene abuso/spam
**Esfuerzo**: 🔧 Moderado (middleware)

**Implementación:**
```bash
npm install express-rate-limit

# En server.js (antes de app.post('/twilio/inbound'))
import rateLimit from 'express-rate-limit';

const inboundLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 10, // 10 requests por minuto por IP
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

app.post('/twilio/inbound', inboundLimiter, (req, res) => {
  // ... lógica existente
});
```

**Ajustar límites** según volumen real de tráfico (monitorear logs después de implementar).

---

#### 5. Validación de Webhook de Twilio
**Impacto**: 🟡 Alto - Seguridad (evitar requests falsos)
**Esfuerzo**: 🔧 Moderado (middleware con firma)

**Implementación:**
```javascript
import twilio from 'twilio';

function validateTwilioRequest(req, res, next) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioSignature = req.headers['x-twilio-signature'];
  const url = `https://${req.headers.host}${req.originalUrl}`;

  const isValid = twilio.validateRequest(authToken, twilioSignature, url, req.body);

  if (!isValid) {
    logger.warn('Invalid Twilio signature', { url, signature: twilioSignature });
    return res.status(403).send('Forbidden');
  }
  next();
}

// Aplicar middleware
app.post('/twilio/inbound', validateTwilioRequest, (req, res) => {
  // ... lógica existente
});
```

**Nota:** Desactivar temporalmente durante debug con ngrok (ngrok cambia la URL).

---

#### 6. WAL Mode para SQLite ✅ COMPLETADO
**Impacto**: 🟡 Alto - Mejora concurrencia y previene locks
**Esfuerzo**: ⚡ Bajo (1 línea en db/index.js)
**Estado**: Implementado en v0.2.0 (Quick Win implementado)

**Implementación:**
```javascript
// En db/index.js, después de abrir la DB
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL'); // Opcional: mejora performance
```

**Beneficio:** Permite lecturas concurrentes durante escrituras (mejor performance del Dashboard).
**Verification / Evidence:**
- `db/index.js` enables WAL via `db.pragma('journal_mode = WAL')` and `db.pragma('synchronous = NORMAL')`.


---

### 🗓️ 1 Semana (Refuerzo)

#### 7. Dashboard: Exportación de Datos ✅ PARCIAL
**Impacto**: 🟢 Medio - Análisis externo
**Esfuerzo**: 🔧 Moderado (nuevo endpoint)
**Estado**: Parcial (endpoints listos; UI export incompleta)

**Implementación:**
```javascript
// En server.js
app.get('/admin/export/contacts', adminAuth, (req, res) => {
  const contacts = listContacts({ limit: 10000, offset: 0 });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=contacts.csv');

  const csv = [
    'phone,name,status,created_at',
    ...contacts.map(c => `${c.phone},${c.name || ''},${c.status},${c.created_at}`)
  ].join('\n');

  res.send(csv);
});

// Similar para messages, campaigns, opt-outs
```

**UI:** Agregar botón "Exportar CSV" en cada sección del Dashboard.
**Verification / Evidence:**
- `server.js` exposes `/admin/export/contacts`, `/admin/export/messages`, `/admin/export/campaigns`, `/admin/export/opt-outs`.
- UI export button is only present for opt-outs (`admin/pages.js`), so UI coverage is partial.


---

#### 8. Opt-Out Automático por Keyword ✅ COMPLETADO
**Impacto**: 🟡 Alto - Compliance (TCPA, GDPR-like)
**Esfuerzo**: ⚡ Bajo (ya implementado parcialmente)
**Estado**: Implementado en v0.2.0 (Quick Win implementado)

**Mejora:**
```javascript
// En server.js, ampliar keywords de opt-out
const OPTOUT_KEYWORDS = ['BAJA', '3', 'STOP', 'UNSUBSCRIBE', 'CANCELAR', 'REMOVER'];
const isBaja = OPTOUT_KEYWORDS.some(kw => upper.includes(kw));

// Respuesta más clara
if (isBaja) {
  reply = '✅ Confirmado: Tu número ha sido dado de baja. No recibirás más mensajes de Queirolo Autos.';
  // ... resto lógica existente
}
```
**Verification / Evidence:**
- `server.js` `/twilio/inbound` expands `OPTOUT_KEYWORDS` and persists opt-outs + contact status updates.


---

#### 9. UI Polish (Dashboard)
**Impacto**: 🟢 Medio - Experiencia de usuario
**Esfuerzo**: 🔧 Moderado (CSS/JS)

**Mejoras implementadas:**
- ✅ Búsqueda client-side en todas las tablas
- ✅ Ordenamiento por columnas (client-side)
- ✅ Copy buttons para teléfonos y mensajes
- ✅ Empty states con CTAs
- ✅ Help text contextual en cada vista
- ✅ Badges de estado con colores semánticos
**Verification / Evidence:**
- Client-side search/sort: `admin/render.js` `renderTable()` scripts; enabled in `admin/pages.js` tables.
- Copy buttons: `admin/render.js` `renderCopyButton()` used in contacts/messages tables.
- Empty states + CTAs: `admin/render.js` `renderEmptyState()` used across admin pages.
- Help text: `admin/render.js` `renderHelpText()` used in dashboard views.
- Status badges: `admin/render.js` `renderBadge()` + `.badge-*` styles used in tables.


**Pendientes (opcional):**
- Filtros avanzados (rango de fechas, múltiples estados)
- Paginación client-side (para datasets grandes)
- Gráficos de estadísticas (Chart.js)

---

## 🗺️ Roadmap por Etapas

### Fase 1: MVP Estable ✅ (Completada)

**Objetivo**: Sistema funcional con inbound, dashboard y persistencia.

**Logros:**
- ✅ Webhook inbound con TwiML responses
- ✅ Dashboard admin con 5 vistas (Resumen, Contactos, Mensajes, Campañas, Opt-outs)
- ✅ SQLite con volumen persistente en VPS (PARCIAL - no verificable en repo)
- ✅ Opt-out básico (BAJA/3)
- ✅ Script outbound (send-test.js)
- ✅ Deployment en Easypanel (PARCIAL - no verificable en repo)
**Verification / Evidence:**
- Inbound TwiML: `server.js` `/twilio/inbound` returns `text/xml` and uses `escapeXml()`.
- Admin views: `server.js` routes `/admin`, `/admin/contacts`, `/admin/messages`, `/admin/campaigns`, `/admin/opt-outs`; `admin/render.js` `NAV_ITEMS`.
- Opt-out basico (BAJA/3): `server.js` inbound uses `OPTOUT_KEYWORDS` with `BAJA` and `3`.
- Outbound script: `send-test.js` exists and uses Twilio client.
- SQLite path is configurable via `DB_PATH` in `db/index.js`; VPS volume/Easypanel deployment is not verifiable in repo.


---

### Fase 2: Campañas Profesionales 🚧 (En Progreso)

**Objetivo**: Sistema robusto de campañas outbound con gestión completa.

**Features:**

#### 2.1 Gestión de Campañas (3-5 días) ✅ COMPLETADO
- [x] Estado: COMPLETADO (verificado)
- [x] CRUD de campañas desde Dashboard (crear, editar, cancelar)
- [x] Preview de mensajes con variables (nombre, marca, modelo, etc.)
- [x] Programación de envío (fecha/hora específica)
- [x] Asignación automática de recipients por filtros
- [x] Asignacion de destinatarios en formulario de creacion (panel + filtros + preview)
- [x] Advertencia al programar sin destinatarios y envio de recipientIds
- [x] Progress bar de envío en tiempo real (SSE o polling)
**Verification / Evidence:**
- CRUD: `server.js` `/admin/api/campaigns` POST/PATCH/DELETE + `admin/pages.js` actions.
- Preview with variables: `server.js` `/admin/api/campaigns/preview` + `/preview-samples`; `db/index.js` `renderMessageTemplate()`; `admin/pages.js` `runPreview()`.
- Scheduling: `server.js` `normalizeScheduledAt()` + `processCampaignQueue()`; `db/index.js` `listScheduledCampaignsDue()`.
- Auto-assign by filters: `server.js` `/admin/api/campaigns/:id/assign-recipients` uses `listContactsForCampaign()`/`listVehicleContactsByFilters()`.
- Assign on create: `admin/pages.js` recipient panel + `loadRecipientsBtn`; `server.js` accepts `recipientIds` + `assignRecipientsToCampaign()`.
- Warning for scheduled without recipients: `admin/pages.js` submit confirmation.
- Progress bar polling: `admin/pages.js` `refreshProgress()` polls `/admin/api/campaigns/:id/progress`; `server.js` `getCampaignProgress()`.


#### 2.2 Templates de Mensajes (2-3 días)
- [ ] Gestor de templates en Dashboard
- [ ] Variables dinámicas: `{{nombre}}`, `{{marca}}`, `{{modelo}}`, etc.
- [ ] Preview en vivo antes de enviar
- [ ] Integración con Twilio Content API

#### 2.3 Segmentación Avanzada (3-4 días)
- [ ] Filtros combinados (marca AND modelo AND año >=2015)
- [ ] Segmentos guardados (ej: "Toyota 2015+", "Leads activos mes pasado")
- [ ] Exclusión de opt-outs automática (ya implementado parcialmente)
- [ ] Test envíos (mandar a 5 números de prueba antes de campaña completa)

#### 2.4 Tracking Mejorado (2-3 días)
- [ ] Status callbacks de Twilio (delivered, failed, undelivered)
- [ ] Dashboard de campaña en tiempo real
- [ ] Métricas: tasa de entrega, tasa de apertura (si usa links), conversiones
- [ ] Alertas automáticas si tasa de fallo >10%

**Estimación total Fase 2**: 10-15 días de desarrollo

---

### Fase 3: Compliance y Opt-Out 🔜 (Próxima)

**Objetivo**: Cumplimiento legal y gestión profesional de consentimiento.

**Features:**

#### 3.1 Gestión de Consentimiento (3-4 días)
- [ ] Registro de fuente de consentimiento (web, formulario, inbound)
- [ ] Campo `consented_at` en tabla `contacts`
- [ ] Doble opt-in (enviar confirmación antes de agregar a campañas)
- [ ] Renovación de consentimiento (cada 6 meses o 1 año)

#### 3.2 Opt-Out Completo (2-3 días)
- [ ] Keywords múltiples: STOP, BAJA, UNSUBSCRIBE, CANCELAR (ya implementado parcialmente)
- [ ] Confirmación inmediata (ya implementado)
- [ ] Opt-in reverso (permitir re-suscripción con keyword START o REANUDAR)
- [ ] Dashboard de opt-outs con filtro por motivo y fecha

#### 3.3 Audit Trail (3-4 días)
- [ ] Tabla `audit_log` para rastrear cambios críticos
- [ ] Quién cambió qué y cuándo (requiere autenticación por usuario en admin)
- [ ] Registro de opt-out/opt-in con timestamp y origen
- [ ] Exportación de audit log para compliance

#### 3.4 Compliance Automático (2-3 días)
- [ ] Límite de mensajes por contacto/día (ej: max 2 mensajes/día)
- [ ] Horario permitido (no enviar fuera de 9 AM - 8 PM)
- [ ] Quiet hours (no enviar fines de semana si el contacto no ha respondido)
- [ ] Auto-throttling si tasa de opt-out >5%

**Estimación total Fase 3**: 10-14 días de desarrollo

---

### Fase 4: Analítica y Reportes 📊 (Futuro)

**Objetivo**: Insights accionables para optimizar campañas.

**Features:**

#### 4.1 Dashboard de Métricas (5-7 días)
- [ ] Gráficos de actividad diaria (Chart.js o similar)
- [ ] Tasa de respuesta por campaña
- [ ] Funnel de conversión (inbound → lead → venta)
- [ ] Análisis de keywords más usados en inbound
- [ ] Heatmap de actividad por hora/día

#### 4.2 Reportes Automáticos (3-4 días)
- [ ] Reporte semanal de actividad (email o WhatsApp)
- [ ] Alertas de anomalías (spike de opt-outs, drop en tasa de entrega)
- [ ] Exportación de reportes en PDF o Excel

#### 4.3 A/B Testing (5-7 días)
- [ ] Enviar 2 variantes de mensaje a subsets
- [ ] Medir tasa de respuesta por variante
- [ ] Auto-seleccionar ganador para resto de campaña
- [ ] Aprendizaje continuo (guardar templates ganadores)

**Estimación total Fase 4**: 13-18 días de desarrollo

---

### Fase 5: Escalabilidad y Performance 🚀 (Largo Plazo)

**Objetivo**: Soportar 10K+ contactos y múltiples campañas concurrentes.

**Features:**

#### 5.1 Migración a PostgreSQL (Opcional) (5-7 días)
**Cuándo:** Si se alcanzan >50K contactos o >10 campañas simultáneas
- [ ] Schema migration de SQLite → PostgreSQL
- [ ] Configurar conexión pool
- [ ] Actualizar queries (PostgreSQL-specific syntax)
- [ ] Backups automáticos con pg_dump

#### 5.2 Queue System (3-5 días)
**Cuándo:** Si se envían >1K mensajes por campaña
- [ ] Bull Queue (Redis) para procesar envíos asíncronos
- [ ] Workers paralelos (2-5 workers)
- [ ] Retry automático con exponential backoff
- [ ] Dashboard de queue (pending, active, failed)

#### 5.3 Caching (2-3 días)
- [ ] Redis cache para queries frecuentes (stats, contactos activos)
- [ ] Invalidación inteligente (al crear/actualizar contactos)
- [ ] Performance target: Dashboard load <300ms

#### 5.4 Rate Limiting de Twilio (2-3 días)
- [ ] Respetar límites de Twilio (ej: 80 msg/s para WhatsApp)
- [ ] Distribuir envíos en el tiempo (no burst de 1000 mensajes en 1 segundo)
- [ ] Monitoring de cuota de Twilio

**Estimación total Fase 5**: 12-18 días de desarrollo (opcional, solo si se alcanza escala)

---

## ⚠️ Riesgos y Mitigaciones

### 1. **Pérdida de Datos (SQLite)**
**Riesgo**: 🔴 CRÍTICO
**Probabilidad**: 🟡 Media (sin backups automáticos)

**Mitigaciones:**
- ✅ **Implementado**: Volumen persistente `/app/data` en Easypanel (PARCIAL - no verificable en repo)
- 🚧 **Pendiente**: Backups automáticos diarios (Quick Win #1)
- 🔜 **Futuro**: Replicación a S3 o Google Drive

---

### 2. **Concurrencia en SQLite**
**Riesgo**: 🟡 Medio (locks durante escrituras)
**Probabilidad**: 🟡 Media (múltiples campañas + inbound)

**Mitigaciones:**
- ✅ **Implementado**: SQLite WAL mode (Quick Win #6)
- 🔜 **Futuro**: Migrar a PostgreSQL si se alcanzan >10K contactos

---

### 3. **Secretos Expuestos**
**Riesgo**: 🔴 CRÍTICO
**Probabilidad**: 🟢 Baja (con buenas prácticas)

**Mitigaciones:**
- ✅ **Implementado**: `.env` en `.gitignore`, credenciales solo en Easypanel (PARCIAL - solo .gitignore verificable)
- 🔜 **Refuerzo**: Rotar credenciales Twilio cada 6 meses
- 🔜 **Futuro**: Vault (HashiCorp) o Secrets Manager (AWS/GCP)

---

### 4. **Spam / Abuso de Webhook**
**Riesgo**: 🟡 Medio (requests falsos/maliciosos)
**Probabilidad**: 🟡 Media (sin validación de firma)

**Mitigaciones:**
- 🚧 **Pendiente**: Validación de firma de Twilio (Quick Win #5)
- 🚧 **Pendiente**: Rate limiting en webhook (Quick Win #4)
- 🔜 **Futuro**: IP whitelist de Twilio

---

### 5. **Compliance (Opt-Out No Respetado)**
**Riesgo**: 🔴 CRÍTICO (legal/reputación)
**Probabilidad**: 🟢 Baja (ya implementado parcialmente)

**Mitigaciones:**
- ✅ **Implementado**: Opt-out básico (BAJA/3) con persistencia
- ✅ **Implementado**: Filtrado automático de `opted_out` en queries
- 🔜 **Refuerzo**: Keywords adicionales (Quick Win #8)
- 🔜 **Futuro**: Audit trail completo (Fase 3)
**Verification / Evidence (Riesgos implementados):**
- WAL mode: `db/index.js` pragmas for `journal_mode = WAL` and `synchronous = NORMAL`.
- `.env` ignored: `.gitignore` includes `.env` (Easypanel credential handling is not verifiable in repo).
- Opt-out basico + filtering: `server.js` `/twilio/inbound` inserts opt-outs; `db/index.js` filters `contacts` with `status = 'active'` and `phone NOT IN (SELECT phone FROM opt_outs)`.
- VPS volume persistence is a deploy setting and is not verifiable in repo.
- Runtime checks not executed (static code inspection only to avoid local DB writes).


---

### 6. **Fallo de Twilio API**
**Riesgo**: 🟡 Medio (downtime externo)
**Probabilidad**: 🟢 Baja (SLA de Twilio >99.9%)

**Mitigaciones:**
- 🔜 **Futuro**: Retry automático con exponential backoff
- 🔜 **Futuro**: Queue system para reintentos (Fase 5)
- 🔜 **Futuro**: Alertas si fallo >5% de mensajes

---

## ✅ Checklist de Despliegue Seguro (VPS/Easypanel)

Antes de desplegar cambios a producción:

### Pre-Deploy
- [ ] Todas las pruebas pasaron en local (`npm test` si hay tests)
- [ ] Variables de entorno actualizadas en Easypanel (si aplica)
- [ ] Backup manual de `/app/data/watest.db` realizado
- [ ] Revisión de código (self-review o pair programming)
- [ ] Changelog actualizado con cambios principales

### Deploy
- [ ] Push a branch `main` (Easypanel auto-deploys)
- [ ] Monitorear logs en Easypanel durante 5 minutos
- [ ] Verificar health check: `curl https://tu-dominio/health`
- [ ] Probar manualmente flujos críticos:
  - [ ] Inbound: Enviar mensaje de prueba al WhatsApp
  - [ ] Dashboard: Verificar que carga correctamente
  - [ ] Opt-out: Probar BAJA con número de test

### Post-Deploy
- [ ] Verificar que no hay errores en logs (30 min de monitoreo)
- [ ] Confirmar que DB persiste (`ls /app/data/watest.db`)
- [ ] Notificar al equipo del deploy exitoso

### Rollback (si algo sale mal)
1. Revertir commit en GitHub
2. Easypanel auto-redeploy desde commit anterior
3. Verificar que sistema vuelve al estado previo
4. Analizar causa del fallo antes de reintentar

---

## 📋 Próximos Pasos Recomendados (Orden de Prioridad)

### 🔴 Urgente (Esta Semana)
1. **Backups automáticos** (Quick Win #1) - CRÍTICO
2. **Monitoring mejorado** (Quick Win #2)
3. **Logging estructurado** (Quick Win #3)

### 🟡 Importante (Este Mes)
4. **Rate limiting** (Quick Win #4)
5. **Validación de webhooks** (Quick Win #5)
6. **WAL mode SQLite** (Quick Win #6)
7. **Opt-out keywords adicionales** (Quick Win #8)

### 🟢 Planificado (Próximos 2-3 Meses)
8. **Gestión de campañas desde Dashboard** (Fase 2.1)
9. **Templates de mensajes** (Fase 2.2)
10. **Tracking mejorado con callbacks** (Fase 2.4)

---

**Última actualización**: 2026-01-10
**Responsable**: Equipo de Desarrollo
**Revisión**: Mensual (primer viernes de cada mes)



# Database Schema - Minimal Version
## ProyectoWatest: WhatsApp Campaign System

**Version**: v0 (Minimal)
**Created**: 2026-01-10
**Status**: Design Phase
**Database**: SQLite 3.x

---

## Objetivo

Esquema SQLite **mínimo funcional** para gestionar:
- Contactos con vehículos asociados
- Campañas outbound con tracking por destinatario
- Mensajes inbound/outbound
- Opt-out (BAJA) compliance

**Filosofía**: Lo mínimo necesario para operar. Sin complejidad innecesaria.

---

## Schema Overview (6 Tablas)

```
┌─────────────┐
│  contacts   │─────┐
│             │     │
│ phone*      │     │ 1:N
│ name        │     │
│ status      │◄────┼───── synced with opt_outs
└─────────────┘     │
                    ▼
              ┌─────────────┐
              │  vehicles   │
              │             │
              │ contact_id  │
              │ make/model  │
              │ year/price  │
              │ link        │
              └─────────────┘

┌─────────────┐
│  opt_outs   │───► contacts.status = 'opted_out'
│             │
│ phone*      │
└─────────────┘

┌─────────────┐         ┌──────────────────┐
│  campaigns  │────1:N──│ campaign_        │
│             │         │ recipients       │
│ name        │         │                  │
│ status      │         │ contact_id       │
└─────────────┘         │ status           │
                        │ message_sid      │
                        └──────────────────┘

┌─────────────┐
│  messages   │
│             │
│ direction   │ (inbound/outbound)
│ contact_id  │
│ body        │
│ twilio_sid  │
└─────────────┘
```

---

## Complete DDL (SQLite)

```sql
-- ============================================================
-- CONTACTS: Master data (teléfono + nombre + status)
-- ============================================================
CREATE TABLE contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL UNIQUE, -- E.164: +56975400946
    name TEXT,
    status TEXT NOT NULL DEFAULT 'active', -- active|opted_out|invalid
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_contacts_phone ON contacts(phone);
CREATE INDEX idx_contacts_status ON contacts(status);
CREATE INDEX idx_contacts_created_at ON contacts(created_at);

-- ============================================================
-- VEHICLES: Vehículo asociado a contacto
-- ============================================================
CREATE TABLE vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER NOT NULL,
    make TEXT NOT NULL,   -- Marca: "Toyota"
    model TEXT NOT NULL,  -- Modelo: "Corolla"
    year INTEGER NOT NULL, -- Año: 2015
    price REAL,           -- Precio (CLP)
    link TEXT,            -- URL publicación
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);

CREATE INDEX idx_vehicles_contact_id ON vehicles(contact_id);
CREATE INDEX idx_vehicles_make ON vehicles(make);
CREATE INDEX idx_vehicles_year ON vehicles(year);

-- ============================================================
-- OPT_OUTS: BAJA compliance
-- ============================================================
CREATE TABLE opt_outs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL UNIQUE, -- E.164
    opted_out_at TEXT NOT NULL DEFAULT (datetime('now')),
    reason TEXT -- "user_request" | "manual"
);

CREATE INDEX idx_opt_outs_phone ON opt_outs(phone);

-- ============================================================
-- CAMPAIGNS: Definición de campaña
-- ============================================================
CREATE TABLE campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft', -- draft|active|completed|cancelled
    message_template TEXT, -- Plantilla del mensaje
    started_at TEXT,
    completed_at TEXT,
    total_recipients INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_campaigns_created_at ON campaigns(created_at);

-- ============================================================
-- CAMPAIGN_RECIPIENTS: Tracking por destinatario
-- ============================================================
CREATE TABLE campaign_recipients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    contact_id INTEGER NOT NULL,
    phone TEXT NOT NULL, -- Redundante pero útil
    status TEXT NOT NULL DEFAULT 'pending', -- pending|sent|delivered|failed|skipped
    message_sid TEXT, -- Twilio message SID
    sent_at TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);

CREATE INDEX idx_campaign_recipients_campaign_id ON campaign_recipients(campaign_id);
CREATE INDEX idx_campaign_recipients_status ON campaign_recipients(status);
CREATE INDEX idx_campaign_recipients_contact_id ON campaign_recipients(contact_id);

-- ============================================================
-- MESSAGES: Log unificado inbound/outbound
-- ============================================================
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    direction TEXT NOT NULL, -- "inbound" | "outbound"
    contact_id INTEGER,
    campaign_id INTEGER,
    phone TEXT NOT NULL,
    body TEXT,
    message_sid TEXT UNIQUE, -- Twilio SID
    status TEXT, -- queued|sent|delivered|failed
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL
);

CREATE INDEX idx_messages_direction ON messages(direction);
CREATE INDEX idx_messages_contact_id ON messages(contact_id);
CREATE INDEX idx_messages_campaign_id ON messages(campaign_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
CREATE INDEX idx_messages_message_sid ON messages(message_sid);

-- ============================================================
-- TRIGGERS: Auto-update timestamps
-- ============================================================
CREATE TRIGGER update_contacts_timestamp
AFTER UPDATE ON contacts
FOR EACH ROW BEGIN
    UPDATE contacts SET updated_at = datetime('now') WHERE id = NEW.id;
END;
```

---

## Flujo Operativo

### 1. CSV Import → Database

```
┌─────────────────────────────────────────────────┐
│ CSV: telefono,nombre,marca,modelo,año,precio   │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
         [Normalizar teléfono]
         +56975400946 (E.164)
                  │
                  ▼
         [Check opt-out table]
         ¿Está en BAJA? → Skip
                  │ No
                  ▼
         [Upsert contact by phone]
         INSERT OR REPLACE
                  │
                  ▼
         [Create vehicle record]
         INSERT vehicles
                  │
                  ▼
              [Success]
```

**Pseudo-código**:
```javascript
for each row in CSV:
    phone = normalizePhone(row.telefono) // +56975400946

    // Check opt-out (puede estar en opt_outs o contacts.status)
    if (existsInOptOuts(phone)):
        skip row
        continue

    // Upsert contact (si ya existe opted-out, mantener status)
    contact = UPSERT contacts (phone, name)
    // Default status='active' en INSERT, no cambiar si UPDATE

    if (row.marca && row.modelo && row.año):
        INSERT vehicles (contact_id, make, model, year, price, link)
```

---

### 2. Crear Campaña → Generar Recipients

```
┌──────────────────────────┐
│ User crea campaña        │
│ - name: "Promo Enero"    │
│ - message_template       │
└────────────┬─────────────┘
             │
             ▼
   [Filtrar contactos target]
   SELECT contacts WHERE NOT IN opt_outs
   + filtros opcionales (marca/modelo/año)
             │
             ▼
   [Generar campaign_recipients]
   INSERT INTO campaign_recipients
   (campaign_id, contact_id, phone, status='pending')
             │
             ▼
   UPDATE campaigns SET total_recipients = COUNT(*)
             │
             ▼
   [Campaign status = 'active']
```

**SQL Ejemplo**:
```sql
-- Generar recipients para campaña ID=1
-- Target: Contactos con Toyota (activos, no opted-out)
INSERT INTO campaign_recipients (campaign_id, contact_id, phone, status)
SELECT
    1 AS campaign_id,
    c.id,
    c.phone,
    'pending'
FROM contacts c
INNER JOIN vehicles v ON c.id = v.contact_id
WHERE c.status = 'active' -- Solo contactos activos
  AND v.make = 'Toyota'
  AND v.year >= 2015;

-- Actualizar contador
UPDATE campaigns
SET total_recipients = (
    SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = 1
)
WHERE id = 1;
```

---

### 3. Enviar Campaña → Twilio API

```
┌────────────────────────────┐
│ Start Campaign             │
│ UPDATE status = 'active'   │
└──────────┬─────────────────┘
           │
           ▼
  [For each recipient WHERE status='pending']
           │
           ▼
  [Call Twilio API]
  twilio.messages.create({
    to: 'whatsapp:' + phone,
    messagingServiceSid: MG...,
    body: message_template
  })
           │
           ├─ Success ──────────┐
           │                    │
           ▼                    ▼
  [Record in messages]  [Update recipient]
  INSERT messages       status='sent'
  (outbound,            message_sid=SM...
   campaign_id,         sent_at=NOW()
   contact_id,
   message_sid)
           │
           ▼
  [All recipients processed?]
           │ Yes
           ▼
  UPDATE campaigns
  status='completed'
  sent_count=COUNT(status='sent')
```

---

### 4. Recibir Inbound → Procesar BAJA

```
┌────────────────────────────┐
│ Twilio POST /twilio/inbound│
│ From: whatsapp:+56...      │
│ Body: "BAJA"               │
└──────────┬─────────────────┘
           │
           ▼
  [Normalizar phone]
  +56975400946
           │
           ▼
  [Find/Create contact]
  SELECT * FROM contacts WHERE phone = ...
  (or INSERT if not exists)
           │
           ▼
  [Log mensaje inbound]
  INSERT messages (direction='inbound', contact_id, body)
           │
           ▼
  [Analizar contenido]
  ¿Body contiene "BAJA" o "3"?
           │ Yes
           ▼
  [Registrar opt-out]
  1. INSERT INTO opt_outs (phone, reason='user_request')
  2. UPDATE contacts SET status='opted_out' WHERE phone=...
           │
           ▼
  [Responder TwiML]
  <Response>
    <Message>Listo. No volveremos a contactarte.</Message>
  </Response>
```

---

## Queries Útiles

### 1. Resultados de Campaña
```sql
-- Stats generales de una campaña
SELECT
    c.id,
    c.name,
    c.status,
    c.total_recipients,
    COUNT(CASE WHEN cr.status = 'sent' THEN 1 END) AS sent,
    COUNT(CASE WHEN cr.status = 'delivered' THEN 1 END) AS delivered,
    COUNT(CASE WHEN cr.status = 'failed' THEN 1 END) AS failed,
    COUNT(CASE WHEN cr.status = 'skipped' THEN 1 END) AS skipped,
    ROUND(100.0 * COUNT(CASE WHEN cr.status = 'sent' THEN 1 END) /
          NULLIF(c.total_recipients, 0), 2) AS delivery_rate_pct
FROM campaigns c
LEFT JOIN campaign_recipients cr ON c.id = cr.campaign_id
WHERE c.id = 1 -- Campaign ID
GROUP BY c.id, c.name, c.status, c.total_recipients;
```

### 2. Contactos que Respondieron
```sql
-- Contactos que enviaron mensaje después de recibir campaña
SELECT
    c.phone,
    c.name,
    c.status,
    v.make || ' ' || v.model || ' ' || v.year AS vehicle,
    COUNT(m.id) AS inbound_count,
    MAX(m.created_at) AS last_message_at
FROM contacts c
LEFT JOIN vehicles v ON c.id = v.contact_id
INNER JOIN messages m ON c.id = m.contact_id
WHERE c.status = 'active' -- Solo contactos activos
  AND m.direction = 'inbound'
  AND m.created_at >= date('now', '-7 days')
GROUP BY c.phone, c.name, c.status, vehicle
ORDER BY inbound_count DESC
LIMIT 20;
```

### 3. Lista de Opt-Outs (BAJA)
```sql
-- Contactos que han solicitado BAJA
SELECT
    o.phone,
    c.name,
    c.status, -- Debe ser 'opted_out'
    o.opted_out_at,
    o.reason
FROM opt_outs o
LEFT JOIN contacts c ON o.phone = c.phone
ORDER BY o.opted_out_at DESC;
```

### 4. Leads por Marca/Modelo
```sql
-- Distribución de vehículos por marca y modelo (solo activos)
SELECT
    v.make,
    v.model,
    COUNT(DISTINCT v.id) AS vehicle_count,
    COUNT(DISTINCT c.id) AS contact_count,
    ROUND(AVG(v.price), 0) AS avg_price,
    MIN(v.year) AS oldest_year,
    MAX(v.year) AS newest_year
FROM vehicles v
INNER JOIN contacts c ON v.contact_id = c.id
WHERE c.status = 'active' -- Solo contactos activos
  AND v.created_at >= date('now', '-90 days')
GROUP BY v.make, v.model
ORDER BY vehicle_count DESC
LIMIT 15;
```

### 5. Actividad Diaria (Mensajes)
```sql
-- Volumen de mensajes por día (últimos 30 días)
SELECT
    date(created_at) AS date,
    direction,
    COUNT(*) AS message_count
FROM messages
WHERE created_at >= date('now', '-30 days')
GROUP BY date(created_at), direction
ORDER BY date DESC;
```

---

## Ejemplo de Uso Completo

### Paso 1: Importar CSV
```sql
-- Contact 1
INSERT INTO contacts (phone, name) VALUES ('+56975400946', 'Juan Pérez');
INSERT INTO vehicles (contact_id, make, model, year, price, link)
VALUES (1, 'Toyota', 'Corolla', 2015, 8500000, 'https://example.com/1');

-- Contact 2
INSERT INTO contacts (phone, name) VALUES ('+56990080338', 'María González');
INSERT INTO vehicles (contact_id, make, model, year, price, link)
VALUES (2, 'Honda', 'Civic', 2018, 12000000, 'https://example.com/2');
```

### Paso 2: Crear Campaña
```sql
INSERT INTO campaigns (name, status, message_template)
VALUES (
    'Promo Enero 2026',
    'draft',
    'Hola {{nombre}}, tenemos ofertas para tu {{marca}} {{modelo}}. Responde INFO.'
);

-- Generar recipients (Toyota owners, solo activos)
INSERT INTO campaign_recipients (campaign_id, contact_id, phone, status)
SELECT 1, c.id, c.phone, 'pending'
FROM contacts c
INNER JOIN vehicles v ON c.id = v.contact_id
WHERE c.status = 'active' -- Solo contactos activos
  AND v.make = 'Toyota';

-- Actualizar total
UPDATE campaigns SET total_recipients = 1 WHERE id = 1;
```

### Paso 3: "Enviar" (Simular)
```sql
-- Marcar como enviado
UPDATE campaign_recipients
SET status = 'sent',
    message_sid = 'SM123456',
    sent_at = datetime('now')
WHERE campaign_id = 1 AND status = 'pending';

-- Registrar en messages
INSERT INTO messages (direction, contact_id, campaign_id, phone, body, message_sid, status)
VALUES (
    'outbound',
    1,
    1,
    '+56975400946',
    'Hola Juan, tenemos ofertas para tu Toyota Corolla. Responde INFO.',
    'SM123456',
    'sent'
);

-- Actualizar stats
UPDATE campaigns
SET status = 'completed',
    sent_count = 1,
    completed_at = datetime('now')
WHERE id = 1;
```

### Paso 4: Recibir Inbound (BAJA)
```sql
-- Usuario responde "BAJA"
INSERT INTO messages (direction, contact_id, phone, body)
VALUES ('inbound', 1, '+56975400946', 'BAJA');

-- Registrar opt-out (2 pasos)
-- 1. Insertar en opt_outs
INSERT INTO opt_outs (phone, reason)
VALUES ('+56975400946', 'user_request');

-- 2. Actualizar status del contacto
UPDATE contacts
SET status = 'opted_out'
WHERE phone = '+56975400946';
```

### Paso 5: Verificar Resultados
```sql
-- Ver stats de campaña
SELECT * FROM campaigns WHERE id = 1;

-- Ver recipients
SELECT cr.*, c.name
FROM campaign_recipients cr
LEFT JOIN contacts c ON cr.contact_id = c.id
WHERE cr.campaign_id = 1;

-- Ver opt-outs
SELECT * FROM opt_outs;
```

---

## Ventajas de este Schema Mínimo

✅ **Simple**: Solo 6 tablas, fácil de entender
✅ **Funcional**: Cubre todos los casos de uso core
✅ **Rápido**: Queries sencillos, pocas JOINs
✅ **Extensible**: Agregar campos/tablas después sin romper lo existente
✅ **SQLite-friendly**: No usa features avanzadas de Postgres/MySQL
✅ **Status Unificado**: `contacts.status` se sincroniza con `opt_outs`, permitiendo filtrar por `status='active'` sin JOIN

### Status Management
- **`contacts.status = 'active'`**: Contacto normal, puede recibir campañas
- **`contacts.status = 'opted_out'`**: Usuario pidió BAJA, existe en `opt_outs` table
- **`contacts.status = 'invalid'`**: Teléfono inválido o delivery failures (futuro)

**Flujo BAJA**:
1. INSERT into `opt_outs` (phone, reason)
2. UPDATE `contacts` SET status='opted_out'
3. Futuras campañas filtran `WHERE status='active'` → No envía a opted-out

---

## Limitaciones (Aceptables para MVP)

⚠️ **No hay status callbacks detallados**: Solo registramos sent/delivered/failed básico
⚠️ **No hay audit trail**: No rastreamos quién cambió qué
⚠️ **No hay conversation state**: Menú inbound manejado en código, no DB
⚠️ **No hay CSV import tracking**: No rastreamos errores por fila del CSV

**Solución**: Agregar estas tablas cuando la complejidad lo justifique (v1, v2, etc.)

---

## Next Steps

1. **Crear base de datos**: `sqlite3 db/wa-test.db`
2. **Ejecutar DDL**: Copiar SQL arriba y ejecutar en SQLite
3. **Test manual**: Insertar datos de prueba (ejemplo arriba)
4. **Implementar CSV import**: Script Node.js que lee CSV y ejecuta INSERTs
5. **Implementar campaign sender**: Script que lee `campaign_recipients` y llama Twilio API
6. **Implementar inbound handler**: Endpoint Express `/twilio/inbound` que inserta en `messages` y detecta BAJA

---

**Fin del Schema Mínimo v0**
**Listo para implementación**

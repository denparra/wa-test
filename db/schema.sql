PRAGMA foreign_keys = ON;

-- ============================================================
-- CONTACTS: Master data (teléfono + nombre + status)
-- ============================================================
CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL UNIQUE, -- E.164: +56975400946
    name TEXT,
    status TEXT NOT NULL DEFAULT 'active', -- active|opted_out|invalid
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON contacts(created_at);

-- ============================================================
-- VEHICLES: Vehículo asociado a contacto
-- ============================================================
CREATE TABLE IF NOT EXISTS vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER NOT NULL,
    make TEXT NOT NULL,   -- Marca: "Toyota"
    model TEXT NOT NULL,  -- Modelo: "Corolla"
    year INTEGER NOT NULL, -- Año: 2015
    price REAL,           -- Precio (CLP)
    link TEXT,            -- URL publicación
    origin TEXT,          -- Origen de datos (ej: "barb")
    external_id TEXT,     -- ID externo (ej: "barbara:8339")
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vehicles_contact_id ON vehicles(contact_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_make ON vehicles(make);
CREATE INDEX IF NOT EXISTS idx_vehicles_year ON vehicles(year);
CREATE INDEX IF NOT EXISTS idx_vehicles_external_id ON vehicles(external_id);

-- ============================================================
-- OPT_OUTS: BAJA compliance
-- ============================================================
CREATE TABLE IF NOT EXISTS opt_outs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL UNIQUE, -- E.164
    opted_out_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    reason TEXT, -- legacy / backward compatibility
    reason_code TEXT NOT NULL DEFAULT 'global_user_request',
    reason_detail TEXT,
    source TEXT NOT NULL DEFAULT 'keyword',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    released_at TEXT,
    created_by TEXT,
    released_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_opt_outs_phone ON opt_outs(phone);
CREATE INDEX IF NOT EXISTS idx_opt_outs_active ON opt_outs(released_at);

DROP TRIGGER IF EXISTS trg_opt_outs_updated_at;
CREATE TRIGGER IF NOT EXISTS trg_opt_outs_updated_at
AFTER UPDATE ON opt_outs
FOR EACH ROW
BEGIN
    UPDATE opt_outs SET updated_at = datetime('now', 'localtime') WHERE id = NEW.id;
END;

-- ============================================================
-- VEHICLE_SUPPRESSIONS: exclusión puntual por vehículo/publicación
-- ============================================================
CREATE TABLE IF NOT EXISTS vehicle_suppressions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL,
    phone TEXT NOT NULL,
    origin TEXT,
    external_id TEXT,
    link TEXT,
    reason_code TEXT NOT NULL DEFAULT 'vehicle_unavailable',
    reason_detail TEXT,
    source TEXT NOT NULL DEFAULT 'rule',
    campaign_id INTEGER,
    message_sid TEXT,
    suppressed_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    released_at TEXT,
    created_by TEXT,
    released_by TEXT,
    notes TEXT,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_vehicle_suppressions_vehicle_id ON vehicle_suppressions(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_suppressions_phone ON vehicle_suppressions(phone);
CREATE INDEX IF NOT EXISTS idx_vehicle_suppressions_released_at ON vehicle_suppressions(released_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_suppressions_vehicle_active
ON vehicle_suppressions(vehicle_id)
WHERE released_at IS NULL;

DROP TRIGGER IF EXISTS trg_vehicle_suppressions_updated_at;
CREATE TRIGGER IF NOT EXISTS trg_vehicle_suppressions_updated_at
AFTER UPDATE ON vehicle_suppressions
FOR EACH ROW
BEGIN
    UPDATE vehicle_suppressions SET updated_at = datetime('now', 'localtime') WHERE id = NEW.id;
END;

-- ============================================================
-- CAMPAIGNS: Definición de campaña
-- ============================================================
CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft', -- draft|scheduled|sending|paused|completed|cancelled|failed
    message_template TEXT, -- Plantilla del mensaje
    started_at TEXT,
    completed_at TEXT,
    total_recipients INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    type TEXT NOT NULL DEFAULT 'twilio_template', -- twilio_template|custom_message
    scheduled_at TEXT, -- ISO timestamp para envio programado
    updated_at TEXT NOT NULL DEFAULT '2026-01-11 00:01:16',
    template_id INTEGER, -- Referencia a message_templates (catalogo)
    content_sid TEXT, -- Twilio Content Template SID (HX...)
    filters TEXT, -- JSON con filtros: {"make":"Toyota","year_min":2015}
    paused_at TEXT,
    failed_at TEXT,
    error_message TEXT, -- Error a nivel campana
    is_test INTEGER NOT NULL DEFAULT 0 -- 1 = campaña de prueba (badge 🧪)
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at);
CREATE INDEX IF NOT EXISTS idx_campaigns_type ON campaigns(type);
CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled_at ON campaigns(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_campaigns_template_id ON campaigns(template_id);

-- ============================================================
-- CAMPAIGN_RECIPIENTS: Tracking por destinatario
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_recipients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    contact_id INTEGER NOT NULL,
    phone TEXT NOT NULL, -- Redundante pero útil
    vehicle_id INTEGER,
    status TEXT NOT NULL DEFAULT 'pending', -- pending|sent|delivered|failed|skipped
    message_sid TEXT, -- Twilio message SID
    sent_at TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_id ON campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_status ON campaign_recipients(status);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_contact_id ON campaign_recipients(contact_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_vehicle_id ON campaign_recipients(vehicle_id);

-- ============================================================
-- MESSAGES: Log unificado inbound/outbound
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    direction TEXT NOT NULL, -- "inbound" | "outbound"
    contact_id INTEGER,
    campaign_id INTEGER,
    phone TEXT NOT NULL,
    body TEXT,
    message_sid TEXT UNIQUE, -- Twilio SID
    status TEXT, -- queued|sent|delivered|failed
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_direction ON messages(direction);
CREATE INDEX IF NOT EXISTS idx_messages_contact_id ON messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_messages_campaign_id ON messages(campaign_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_message_sid ON messages(message_sid);
-- Phase 1: Composite index for inbound message association
CREATE INDEX IF NOT EXISTS idx_messages_phone_direction_created ON messages(phone, direction, created_at);

-- ============================================================
-- TRIGGERS: Auto-update timestamps
-- ============================================================
DROP TRIGGER IF EXISTS trg_contacts_updated_at;
CREATE TRIGGER IF NOT EXISTS trg_contacts_updated_at
AFTER UPDATE ON contacts
FOR EACH ROW
BEGIN
    UPDATE contacts SET updated_at = datetime('now', 'localtime') WHERE id = NEW.id;
END;

DROP TRIGGER IF EXISTS trg_vehicles_updated_at;
CREATE TRIGGER IF NOT EXISTS trg_vehicles_updated_at
AFTER UPDATE ON vehicles
FOR EACH ROW
BEGIN
    UPDATE vehicles SET updated_at = datetime('now', 'localtime') WHERE id = NEW.id;
END;

DROP TRIGGER IF EXISTS trg_campaigns_updated_at;
CREATE TRIGGER IF NOT EXISTS trg_campaigns_updated_at
AFTER UPDATE ON campaigns
FOR EACH ROW
BEGIN
    UPDATE campaigns SET updated_at = datetime('now', 'localtime') WHERE id = NEW.id;
END;

-- ============================================================
-- MESSAGE_TEMPLATES: Plantillas reutilizables de mensajes
-- Phase 2.2: Templates de Mensajes
-- ============================================================
CREATE TABLE IF NOT EXISTS message_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    body TEXT NOT NULL,              -- Texto con variables {{nombre}}, {{marca}}, etc.
    content_sid TEXT,                -- Twilio Content API SID (opcional)
    is_active INTEGER DEFAULT 1,     -- 1=activo, 0=archivado
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_message_templates_name ON message_templates(name);
CREATE INDEX IF NOT EXISTS idx_message_templates_is_active ON message_templates(is_active);

DROP TRIGGER IF EXISTS trg_message_templates_updated_at;
CREATE TRIGGER IF NOT EXISTS trg_message_templates_updated_at
AFTER UPDATE ON message_templates
FOR EACH ROW
BEGIN
    UPDATE message_templates SET updated_at = datetime('now', 'localtime') WHERE id = NEW.id;
END;

-- ============================================================
-- SEGMENTS: Filtros guardados para campañas
-- Phase 2.3: Segmentación Avanzada
-- ============================================================
CREATE TABLE IF NOT EXISTS segments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    filters TEXT NOT NULL,           -- JSON single-source: {"mode":"dynamic|manual","source":"vehicles|contacts", ...}
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    last_used_at TEXT,               -- Feature J: cuándo fue usada por última vez
    last_campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL
);

-- ============================================================
-- SEGMENT_MEMBERS: miembros explícitos para segmentos manuales
-- ============================================================
CREATE TABLE IF NOT EXISTS segment_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    segment_id INTEGER NOT NULL,
    contact_id INTEGER,              -- contacts/manual => required, vehicles/manual => owner contact redundante
    vehicle_id INTEGER,              -- vehicles/manual => required, contacts/manual => must remain NULL
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    CHECK (contact_id IS NOT NULL OR vehicle_id IS NOT NULL),
    FOREIGN KEY (segment_id) REFERENCES segments(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_segment_members_segment_id ON segment_members(segment_id);
CREATE INDEX IF NOT EXISTS idx_segment_members_contact_id ON segment_members(contact_id);
CREATE INDEX IF NOT EXISTS idx_segment_members_vehicle_id ON segment_members(vehicle_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_segment_members_segment_contact_unique
ON segment_members(segment_id, contact_id)
WHERE vehicle_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_segment_members_segment_vehicle_unique
ON segment_members(segment_id, vehicle_id)
WHERE vehicle_id IS NOT NULL;

-- ============================================================
-- CONVERSATION_STATUS: Estado de lectura de conversaciones
-- Feature 4: Inbox unificado
-- ============================================================
CREATE TABLE IF NOT EXISTS conversation_status (
    phone TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'unread', -- unread | read | archived
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

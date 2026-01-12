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
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vehicles_contact_id ON vehicles(contact_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_make ON vehicles(make);
CREATE INDEX IF NOT EXISTS idx_vehicles_year ON vehicles(year);

-- ============================================================
-- OPT_OUTS: BAJA compliance
-- ============================================================
CREATE TABLE IF NOT EXISTS opt_outs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL UNIQUE, -- E.164
    opted_out_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    reason TEXT -- "user_request" | "manual"
);

CREATE INDEX IF NOT EXISTS idx_opt_outs_phone ON opt_outs(phone);

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
    content_sid TEXT, -- Twilio Content Template SID (HX...)
    filters TEXT, -- JSON con filtros: {"make":"Toyota","year_min":2015}
    paused_at TEXT,
    failed_at TEXT,
    error_message TEXT -- Error a nivel campana
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at);
CREATE INDEX IF NOT EXISTS idx_campaigns_type ON campaigns(type);
CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled_at ON campaigns(scheduled_at);

-- ============================================================
-- CAMPAIGN_RECIPIENTS: Tracking por destinatario
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_recipients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    contact_id INTEGER NOT NULL,
    phone TEXT NOT NULL, -- Redundante pero útil
    status TEXT NOT NULL DEFAULT 'pending', -- pending|sent|delivered|failed|skipped
    message_sid TEXT, -- Twilio message SID
    sent_at TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_id ON campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_status ON campaign_recipients(status);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_contact_id ON campaign_recipients(contact_id);

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


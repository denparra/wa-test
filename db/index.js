import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, 'schema.sql');

const defaultDbPath = process.env.DB_PATH || './data/watest.db';
const dbPath = defaultDbPath === ':memory:'
    ? defaultDbPath
    : (path.isAbsolute(defaultDbPath)
        ? defaultDbPath
        : path.resolve(process.cwd(), defaultDbPath));

if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

// Quick Win #6: WAL Mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// Check for old schema state (migration hack)
const tableInfo = db.prepare("PRAGMA table_info(contacts)").all();
const hasPhone = tableInfo.some(col => col.name === 'phone');
const hasPhoneE164 = tableInfo.some(col => col.name === 'phone_e164');

// If contacts exists but has old column name, this is a breaking schema change.
// Since we don't have a real migration system yet, we wipe and recreate.
if (tableInfo.length > 0 && !hasPhone && hasPhoneE164) {
    console.warn('Old schema detected (phone_e164). Dropping all tables to migrate to new schema (phone).');
    db.exec(`
        PRAGMA foreign_keys = OFF;
        DROP TABLE IF EXISTS messages;
        DROP TABLE IF EXISTS campaign_recipients;
        DROP TABLE IF EXISTS campaigns;
        DROP TABLE IF EXISTS opt_outs;
        DROP TABLE IF EXISTS vehicles;
        DROP TABLE IF EXISTS contacts;
        PRAGMA foreign_keys = ON;
    `);
}

// Read and execute schema
const schemaSql = fs.readFileSync(schemaPath, 'utf8');
db.exec(schemaSql);

// Phase 2.1 Migration: Add new columns to campaigns table if they don't exist
const campaignsInfo = db.prepare("PRAGMA table_info(campaigns)").all();
const hasType = campaignsInfo.some(col => col.name === 'type');
const hasScheduledAt = campaignsInfo.some(col => col.name === 'scheduled_at');
const hasUpdatedAt = campaignsInfo.some(col => col.name === 'updated_at');

if (campaignsInfo.length > 0) {
    // Add missing columns (backward compatible - existing data preserved)
    if (!hasType) {
        console.log('Migrating campaigns: adding type column');
        db.exec(`ALTER TABLE campaigns ADD COLUMN type TEXT NOT NULL DEFAULT 'twilio_template'`);
    }
    if (!hasScheduledAt) {
        console.log('Migrating campaigns: adding scheduled_at column');
        db.exec(`ALTER TABLE campaigns ADD COLUMN scheduled_at TEXT`);
    }
    if (!hasUpdatedAt) {
        console.log('Migrating campaigns: adding updated_at column');
        db.exec(`ALTER TABLE campaigns ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))`);
    }
    // Add other new columns silently (they won't cause errors if already exist in schema.sql)
    const newColumns = [
        ['content_sid', 'TEXT'],
        ['filters', 'TEXT'],
        ['paused_at', 'TEXT'],
        ['failed_at', 'TEXT'],
        ['error_message', 'TEXT']
    ];
    for (const [colName, colType] of newColumns) {
        const hasColumn = campaignsInfo.some(col => col.name === colName);
        if (!hasColumn) {
            db.exec(`ALTER TABLE campaigns ADD COLUMN ${colName} ${colType}`);
        }
    }
}

const statements = {
    upsertContact: db.prepare(`
        INSERT INTO contacts (phone, name)
        VALUES (?, ?)
        ON CONFLICT(phone) DO UPDATE SET
            name = COALESCE(NULLIF(excluded.name, ''), contacts.name),
            updated_at = datetime('now')
    `),
    getContactByPhone: db.prepare(`
        SELECT id, phone, name, status
        FROM contacts
        WHERE phone = ?
    `),
    updateContactStatus: db.prepare(`
        UPDATE contacts
        SET status = ?, updated_at = datetime('now')
        WHERE phone = ?
    `),
    insertOptOut: db.prepare(`
        INSERT OR IGNORE INTO opt_outs (phone, reason)
        VALUES (?, ?)
    `),
    isOptedOut: db.prepare(`
        SELECT 1
        FROM opt_outs
        WHERE phone = ?
        LIMIT 1
    `),
    insertMessage: db.prepare(`
        INSERT INTO messages (
            contact_id,
            campaign_id,
            direction,
            phone,
            body,
            message_sid,
            status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    insertVehicle: db.prepare(`
        INSERT INTO vehicles (contact_id, make, model, year, price, link)
        VALUES (?, ?, ?, ?, ?, ?)
    `),
    getCampaignById: db.prepare(`
        SELECT id, name, message_template, status, total_recipients, sent_count, created_at
        FROM campaigns
        WHERE id = ?
    `),
    getCampaignByName: db.prepare(`
        SELECT id, name, message_template, status, total_recipients, sent_count, created_at
        FROM campaigns
        WHERE name = ?
    `),
    insertCampaign: db.prepare(`
        INSERT INTO campaigns (name, message_template, status, type, scheduled_at, content_sid, filters)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    updateCampaignMessage: db.prepare(`
        UPDATE campaigns
        SET message_template = ?
        WHERE id = ?
    `),
    updateCampaignStatus: db.prepare(`
        UPDATE campaigns
        SET status = ?, completed_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE completed_at END
        WHERE id = ?
    `),
    insertCampaignRecipient: db.prepare(`
        INSERT INTO campaign_recipients (
            campaign_id,
            contact_id,
            phone,
            status,
            message_sid,
            sent_at,
            error_message
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    incrementCampaignSentCount: db.prepare(`
        UPDATE campaigns
        SET sent_count = sent_count + 1
        WHERE id = ?
    `),
    // Phase 2.1: New campaign management statements
    updateCampaign: db.prepare(`
        UPDATE campaigns
        SET name = ?, message_template = ?, type = ?, scheduled_at = ?, content_sid = ?, filters = ?
        WHERE id = ?
    `),
    pauseCampaign: db.prepare(`
        UPDATE campaigns
        SET status = 'paused', paused_at = datetime('now')
        WHERE id = ? AND status = 'sending'
    `),
    cancelCampaign: db.prepare(`
        UPDATE campaigns
        SET status = 'cancelled', completed_at = datetime('now')
        WHERE id = ? AND status IN ('draft', 'scheduled', 'paused')
    `),
    getCampaignProgress: db.prepare(`
        SELECT
            (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = ?) AS total,
            (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = ? AND status = 'sent') AS sent,
            (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = ? AND status = 'delivered') AS delivered,
            (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = ? AND status = 'failed') AS failed,
            (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = ? AND status LIKE 'skipped%') AS skipped
    `)
};

export function normalizePhone(value) {
    const raw = String(value || '').trim();
    if (!raw) {
        return '';
    }
    let cleaned = raw.replace(/^whatsapp:/i, '').trim();
    cleaned = cleaned.replace(/[^\d+]/g, '');
    if (!cleaned) {
        return '';
    }
    if (!cleaned.startsWith('+')) {
        cleaned = `+${cleaned}`;
    }
    return cleaned;
}

export function upsertContact(phone, name = null) {
    statements.upsertContact.run(phone, name);
    return statements.getContactByPhone.get(phone) || null;
}

export function updateContactStatus(phone, status) {
    statements.updateContactStatus.run(status, phone);
}

export function insertOptOut(phone, reason = null) {
    statements.insertOptOut.run(phone, reason);
}

export function isOptedOut(phone) {
    return Boolean(statements.isOptedOut.get(phone));
}

export function insertMessage({
    contactId = null,
    campaignId = null,
    direction,
    phone, // NEW: required
    body = null,
    messageSid = null,
    status = null
}) {
    statements.insertMessage.run(
        contactId,
        campaignId,
        direction,
        phone,
        body,
        messageSid,
        status
    );
}

export function insertVehicle({
    contactId,
    make, // RENAMED from brand
    model,
    year,
    price = null,
    link = null
}) {
    statements.insertVehicle.run(contactId, make, model, year, price, link);
}

export function getCampaignById(id) {
    return statements.getCampaignById.get(id) || null;
}

export function getCampaignByName(name) {
    return statements.getCampaignByName.get(name) || null;
}

export function createCampaign({
    name,
    messageTemplate = null,
    status = 'draft',
    type = 'twilio_template', // Phase 2.1
    scheduledAt = null, // Phase 2.1
    contentSid = null, // Phase 2.1
    filters = null // Phase 2.1
}) {
    const filtersJson = filters ? JSON.stringify(filters) : null;
    const result = statements.insertCampaign.run(
        name,
        messageTemplate,
        status,
        type,
        scheduledAt,
        contentSid,
        filtersJson
    );
    return getCampaignById(result.lastInsertRowid);
}

export function updateCampaignMessage(campaignId, messageTemplate) {
    statements.updateCampaignMessage.run(messageTemplate, campaignId);
}

export function updateCampaignStatus(campaignId, status) {
    statements.updateCampaignStatus.run(status, status, campaignId);
}

export function incrementCampaignSentCount(campaignId) {
    statements.incrementCampaignSentCount.run(campaignId);
}

export function insertCampaignRecipient({
    campaignId,
    contactId,
    phone,
    status = 'pending',
    messageSid = null, // RENAMED
    sentAt = null,
    errorMessage = null
}) {
    statements.insertCampaignRecipient.run(
        campaignId,
        contactId,
        phone,
        status,
        messageSid,
        sentAt,
        errorMessage
    );
}

export function getAdminStats() {
    const getCount = (table) => db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
    // Special handling for vehicles make (was brand)
    return {
        contacts: getCount('contacts'),
        vehicles: getCount('vehicles'),
        optOuts: getCount('opt_outs'),
        campaigns: getCount('campaigns'),
        campaignRecipients: getCount('campaign_recipients'),
        messages: getCount('messages')
    };
}

export function listContacts({ limit = 50, offset = 0, query = '' }) {
    if (query) {
        const like = `%${query}%`;
        return db.prepare(`
            SELECT id, phone, name, status, created_at, updated_at
            FROM contacts
            WHERE phone LIKE ? OR name LIKE ?
            ORDER BY updated_at DESC
            LIMIT ? OFFSET ?
        `).all(like, like, limit, offset);
    }
    return db.prepare(`
        SELECT id, phone, name, status, created_at, updated_at
        FROM contacts
        ORDER BY updated_at DESC
        LIMIT ? OFFSET ?
    `).all(limit, offset);
}

export function listMessages({ limit = 50, offset = 0, direction = '' }) {
    if (direction) {
        return db.prepare(`
            SELECT m.id, m.direction, m.body, m.status, m.message_sid, m.created_at,
                   m.phone AS contact_phone, -- Use message phone directly
                   c.name AS contact_name,
                   cp.name AS campaign_name
            FROM messages m
            LEFT JOIN contacts c ON m.contact_id = c.id
            LEFT JOIN campaigns cp ON m.campaign_id = cp.id
            WHERE m.direction = ?
            ORDER BY m.created_at DESC
            LIMIT ? OFFSET ?
        `).all(direction, limit, offset);
    }
    return db.prepare(`
        SELECT m.id, m.direction, m.body, m.status, m.message_sid, m.created_at,
               m.phone AS contact_phone,
               c.name AS contact_name,
               cp.name AS campaign_name
        FROM messages m
        LEFT JOIN contacts c ON m.contact_id = c.id
        LEFT JOIN campaigns cp ON m.campaign_id = cp.id
        ORDER BY m.created_at DESC
        LIMIT ? OFFSET ?
    `).all(limit, offset);
}

export function listCampaigns({ limit = 50, offset = 0 }) {
    return db.prepare(`
        SELECT c.id, c.name, c.status, c.message_template, c.created_at,
               c.total_recipients,
               c.sent_count,
               (SELECT COUNT(*) FROM campaign_recipients cr WHERE cr.campaign_id = c.id AND cr.status = 'failed') AS recipients_failed,
               (SELECT COUNT(*) FROM campaign_recipients cr WHERE cr.campaign_id = c.id AND cr.status LIKE 'skipped%') AS recipients_skipped
        FROM campaigns c
        ORDER BY c.created_at DESC
        LIMIT ? OFFSET ?
    `).all(limit, offset);
}

export function listCampaignRecipients({ campaignId, limit = 50, offset = 0 }) {
    return db.prepare(`
        SELECT cr.id, cr.phone, cr.status, cr.message_sid, cr.sent_at, cr.error_message, cr.created_at,
               c.name AS contact_name
        FROM campaign_recipients cr
        LEFT JOIN contacts c ON cr.contact_id = c.id
        WHERE cr.campaign_id = ?
        ORDER BY cr.created_at DESC
        LIMIT ? OFFSET ?
    `).all(campaignId, limit, offset);
}

export function listOptOuts({ limit = 50, offset = 0 }) {
    return db.prepare(`
        SELECT o.id, o.phone, o.reason, o.opted_out_at AS created_at, c.name AS contact_name
        FROM opt_outs o
        LEFT JOIN contacts c ON o.phone = c.phone
        ORDER BY o.opted_out_at DESC
        LIMIT ? OFFSET ?
    `).all(limit, offset);
}

// ============================================================
// Phase 2.1: Campaign Management Functions
// ============================================================

export function updateCampaignFull(id, { name, messageTemplate, type, scheduledAt, contentSid, filters }) {
    const filtersJson = filters ? JSON.stringify(filters) : null;
    statements.updateCampaign.run(name, messageTemplate, type, scheduledAt, contentSid, filtersJson, id);
    return getCampaignById(id);
}

export function pauseCampaign(id) {
    const info = statements.pauseCampaign.run(id);
    return info.changes > 0 ? getCampaignById(id) : null;
}

export function cancelCampaign(id) {
    const info = statements.cancelCampaign.run(id);
    return info.changes > 0 ? getCampaignById(id) : null;
}

export function getCampaignProgress(campaignId) {
    return statements.getCampaignProgress.get(
        campaignId, campaignId, campaignId, campaignId, campaignId
    );
}

export function listContactsByFilters({ make = null, model = null, yearMin = null, yearMax = null, limit = 1000 }) {
    const sql = `
        SELECT DISTINCT c.id, c.phone, c.name, c.status
        FROM contacts c
        INNER JOIN vehicles v ON v.contact_id = c.id
        WHERE c.status = 'active'
            AND (? IS NULL OR v.make = ?)
            AND (? IS NULL OR v.model = ?)
            AND (? IS NULL OR v.year >= ?)
            AND (? IS NULL OR v.year <= ?)
            AND c.phone NOT IN (SELECT phone FROM opt_outs)
        LIMIT ?
    `;
    return db.prepare(sql).all(
        make, make,
        model, model,
        yearMin, yearMin,
        yearMax, yearMax,
        limit
    );
}

export function assignRecipientsToCampaign(campaignId, contactIds) {
    // Use transaction for batch insert
    const insert = db.prepare(`
        INSERT OR IGNORE INTO campaign_recipients (campaign_id, contact_id, phone, status)
        SELECT ?, c.id, c.phone, 'pending'
        FROM contacts c
        WHERE c.id = ?
    `);

    const transaction = db.transaction((ids) => {
        for (const contactId of ids) {
            insert.run(campaignId, contactId);
        }
    });

    transaction(contactIds);

    // Update total_recipients count
    const count = db.prepare(`
        SELECT COUNT(*) AS count FROM campaign_recipients WHERE campaign_id = ?
    `).get(campaignId).count;

    db.prepare(`UPDATE campaigns SET total_recipients = ? WHERE id = ?`).run(count, campaignId);

    return count;
}

export function renderMessageTemplate(template, variables = {}) {
    // Safe variable substitution without eval()
    // Only allows alphanumeric variable names: {{nombre}}, {{marca}}, {{modelo}}
    if (!template) {
        return '';
    }
    return String(template).replace(/\{\{(\w+)\}\}/g, (match, varName) => {
        const value = variables[varName];
        return value !== undefined && value !== null ? String(value) : match;
    });
}

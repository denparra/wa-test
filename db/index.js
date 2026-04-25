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

// Phase 2.1 Migration: Add new columns to campaigns table if they don't exist
// IMPORTANT: This must run BEFORE schema.sql is executed to prevent CREATE INDEX errors
// if the columns are missing in the existing table.

const campaignsTableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='campaigns'").get();

if (campaignsTableExists) {
    const campaignsInfo = db.prepare("PRAGMA table_info(campaigns)").all();
    const hasType = campaignsInfo.some(col => col.name === 'type');
    const hasScheduledAt = campaignsInfo.some(col => col.name === 'scheduled_at');
    const hasUpdatedAt = campaignsInfo.some(col => col.name === 'updated_at');

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
        const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
        db.exec(`ALTER TABLE campaigns ADD COLUMN updated_at TEXT NOT NULL DEFAULT '${now}'`);
    }
    // Add other new columns silently (they won't cause errors if already exist in schema.sql)
    const newColumns = [
        ['template_id', 'INTEGER'],
        ['content_sid', 'TEXT'],
        ['filters', 'TEXT'],
        ['paused_at', 'TEXT'],
        ['failed_at', 'TEXT'],
        ['error_message', 'TEXT'],
        ['is_test', 'INTEGER NOT NULL DEFAULT 0']
    ];
    for (const [colName, colType] of newColumns) {
        const hasColumn = campaignsInfo.some(col => col.name === colName);
        if (!hasColumn) {
            db.exec(`ALTER TABLE campaigns ADD COLUMN ${colName} ${colType}`);
        }
    }
}

// Fase 1 Migration: Add origin/external_id to vehicles if they don't exist
const vehiclesTableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='vehicles'").get();
if (vehiclesTableExists) {
    const vehiclesInfo = db.prepare("PRAGMA table_info(vehicles)").all();
    if (!vehiclesInfo.some(col => col.name === 'origin')) {
        db.exec(`ALTER TABLE vehicles ADD COLUMN origin TEXT`);
    }
    if (!vehiclesInfo.some(col => col.name === 'external_id')) {
        db.exec(`ALTER TABLE vehicles ADD COLUMN external_id TEXT`);
    }
}

// Feature J Migration: Add last_used_at, last_campaign_id to segments
const segmentsMigrateCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='segments'").get();
if (segmentsMigrateCheck) {
    const segsInfo = db.prepare("PRAGMA table_info(segments)").all();
    if (!segsInfo.some(col => col.name === 'last_used_at')) {
        db.exec(`ALTER TABLE segments ADD COLUMN last_used_at TEXT`);
    }
    if (!segsInfo.some(col => col.name === 'last_campaign_id')) {
        db.exec(`ALTER TABLE segments ADD COLUMN last_campaign_id INTEGER`);
    }
}

// Read and execute schema
const schemaSql = fs.readFileSync(schemaPath, 'utf8');
db.exec(schemaSql);

const statements = {
    upsertContact: db.prepare(`
        INSERT INTO contacts (phone, name, created_at, updated_at)
        VALUES (?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
        ON CONFLICT(phone) DO UPDATE SET
            name = COALESCE(NULLIF(excluded.name, ''), contacts.name),
            updated_at = datetime('now', 'localtime')
    `),
    getContactByPhone: db.prepare(`
        SELECT id, phone, name, status
        FROM contacts
        WHERE phone = ?
    `),
    getContactById: db.prepare(`
        SELECT id, phone, name, status, created_at, updated_at
        FROM contacts
        WHERE id = ?
    `),
    updateContact: db.prepare(`
        UPDATE contacts
        SET phone = ?, name = ?, status = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
    `),
    updateContactStatus: db.prepare(`
        UPDATE contacts
        SET status = ?, updated_at = datetime('now', 'localtime')
        WHERE phone = ?
    `),
    deleteContact: db.prepare(`
        DELETE FROM contacts
        WHERE id = ?
    `),
    insertOptOut: db.prepare(`
        INSERT OR IGNORE INTO opt_outs (phone, reason, opted_out_at)
        VALUES (?, ?, datetime('now', 'localtime'))
    `),
    updateOptOut: db.prepare(`
        UPDATE opt_outs
        SET reason = ?
        WHERE phone = ?
    `),
    deleteOptOut: db.prepare(`
        DELETE FROM opt_outs
        WHERE phone = ?
    `),
    getOptOutByPhone: db.prepare(`
        SELECT phone, reason, opted_out_at
        FROM opt_outs
        WHERE phone = ?
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
            status,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    `),
    insertVehicle: db.prepare(`
        INSERT INTO vehicles (contact_id, make, model, year, price, link, origin, external_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `),
    getCampaignById: db.prepare(`
        SELECT id, name, message_template, status, total_recipients, sent_count, created_at,
               type, scheduled_at, template_id, content_sid, filters, started_at, completed_at, paused_at,
               failed_at, error_message, updated_at, is_test
        FROM campaigns
        WHERE id = ?
    `),
    getCampaignByName: db.prepare(`
        SELECT id, name, message_template, status, total_recipients, sent_count, created_at,
               type, scheduled_at, template_id, content_sid, filters, started_at, completed_at, paused_at,
               failed_at, error_message, updated_at, is_test
        FROM campaigns
        WHERE name = ?
    `),
    insertCampaign: db.prepare(`
        INSERT INTO campaigns (name, message_template, status, type, scheduled_at, template_id, content_sid, filters, is_test, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `),
    updateCampaignMessage: db.prepare(`
        UPDATE campaigns
        SET message_template = ?
        WHERE id = ?
    `),
    updateCampaignStatus: db.prepare(`
        UPDATE campaigns
        SET status = ?, completed_at = CASE WHEN ? = 'completed' THEN datetime('now', 'localtime') ELSE completed_at END
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
            error_message,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    `),
    incrementCampaignSentCount: db.prepare(`
        UPDATE campaigns
        SET sent_count = sent_count + 1
        WHERE id = ?
    `),
    // Phase 2.1: New campaign management statements
    updateCampaign: db.prepare(`
        UPDATE campaigns
        SET name = ?, message_template = ?, type = ?, scheduled_at = ?, template_id = ?, content_sid = ?, filters = ?
        WHERE id = ?
    `),
    setCampaignStatus: db.prepare(`
        UPDATE campaigns
        SET status = ?,
            started_at = CASE WHEN ? = 'sending' THEN datetime('now', 'localtime') ELSE started_at END
        WHERE id = ?
    `),
    pauseCampaign: db.prepare(`
        UPDATE campaigns
        SET status = 'paused', paused_at = datetime('now', 'localtime')
        WHERE id = ? AND status = 'sending'
    `),
    resumeCampaign: db.prepare(`
        UPDATE campaigns
        SET status = 'sending'
        WHERE id = ? AND status = 'paused'
    `),
    cancelCampaign: db.prepare(`
        UPDATE campaigns
        SET status = 'cancelled', completed_at = datetime('now', 'localtime')
        WHERE id = ? AND status IN ('draft', 'scheduled', 'paused')
    `),
    deleteCampaign: db.prepare(`
        DELETE FROM campaigns
        WHERE id = ?
    `),
    getCampaignProgress: db.prepare(`
        SELECT
            (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = ?) AS total,
            (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = ? AND status IN ('sent', 'delivered', 'read')) AS sent,
            (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = ? AND status = 'delivered') AS delivered,
            (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = ? AND status = 'failed') AS failed,
            (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = ? AND status LIKE 'skipped%') AS skipped
    `),
    listScheduledCampaignsDue: db.prepare(`
        SELECT id, name, message_template, status, type, scheduled_at, template_id, content_sid, filters
        FROM campaigns
        WHERE status = 'scheduled'
          AND scheduled_at IS NOT NULL
          AND datetime(scheduled_at) <= datetime('now', 'localtime')
        ORDER BY scheduled_at ASC
        LIMIT ?
    `),
    listCampaignsByStatus: db.prepare(`
        SELECT id, name, message_template, status, type, scheduled_at, template_id, content_sid, filters
        FROM campaigns
        WHERE status = ?
        ORDER BY created_at ASC
        LIMIT ?
    `),
    listPendingRecipients: db.prepare(`
        SELECT id, contact_id, phone
        FROM campaign_recipients
        WHERE campaign_id = ? AND status = 'pending'
        ORDER BY id ASC
        LIMIT ?
    `),
    updateCampaignRecipientStatus: db.prepare(`
        UPDATE campaign_recipients
        SET status = ?, message_sid = ?, sent_at = ?, error_message = ?
        WHERE id = ?
    `),
    getContactWithVehicle: db.prepare(`
        SELECT c.id, c.phone, c.name, v.make, v.model, v.year
        FROM contacts c
        LEFT JOIN vehicles v ON v.contact_id = c.id
        WHERE c.id = ?
        ORDER BY v.created_at DESC
        LIMIT 1
    `),
    listContactsForCampaign: db.prepare(`
        SELECT c.id, c.phone, c.name, c.status
        FROM contacts c
        WHERE c.status = 'active'
          AND c.phone NOT IN (SELECT phone FROM opt_outs)
          AND (? IS NULL OR c.phone LIKE ? OR c.name LIKE ?)
        ORDER BY c.updated_at DESC
        LIMIT ?
    `),
    listVehicleContactsByFilters: db.prepare(`
        SELECT DISTINCT c.id, c.phone, c.name, v.make, v.model, v.year
        FROM contacts c
        INNER JOIN vehicles v ON v.contact_id = c.id
        WHERE c.status = 'active'
            AND (? IS NULL OR v.make = ?)
            AND (? IS NULL OR v.model = ?)
            AND (? IS NULL OR v.year >= ?)
            AND (? IS NULL OR v.year <= ?)
            AND c.phone NOT IN (SELECT phone FROM opt_outs)
        ORDER BY c.updated_at DESC
        LIMIT ?
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

export function getContactByPhone(phone) {
    return statements.getContactByPhone.get(phone) || null;
}

export function getContactById(id) {
    return statements.getContactById.get(id) || null;
}

export function updateContact(id, { phone, name, status }) {
    const info = statements.updateContact.run(phone, name, status, id);
    return info.changes > 0 ? getContactById(id) : null;
}

export function deleteContact(id) {
    const info = statements.deleteContact.run(id);
    return info.changes > 0;
}

/**
 * Create a new contact with optional vehicle
 * @param {Object} contactData - Contact data {phone, name, status}
 * @param {Object|null} vehicleData - Optional vehicle data {make, model, year, price, link}
 * @returns {Object} Created contact with id
 */
export function createContactWithVehicle(contactData, vehicleData = null) {
    const { phone, name = null, status = 'active' } = contactData;

    // Validate phone format
    if (!phone || !phone.match(/^\+[1-9]\d{1,14}$/)) {
        throw new Error('Invalid phone format. Must be E.164 format (e.g., +56975400946)');
    }

    // Validate status
    if (!['active', 'opted_out', 'invalid'].includes(status)) {
        throw new Error('Invalid status. Must be: active, opted_out, or invalid');
    }

    // Check if phone already exists
    const existing = statements.getContactByPhone.get(phone);
    if (existing) {
        throw new Error('Phone number already exists');
    }

    // Validate vehicle data if provided
    if (vehicleData) {
        const { make, model, year } = vehicleData;
        if (!make || !model || !year) {
            throw new Error('Vehicle requires make, model, and year');
        }
        if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear() + 1) {
            throw new Error('Invalid vehicle year');
        }
    }

    // Transaction: insert contact and vehicle
    const transaction = db.transaction((contactData, vehicleData) => {
        // Insert contact
        statements.upsertContact.run(phone, name);
        const contact = statements.getContactByPhone.get(phone);

        if (!contact) {
            throw new Error('Failed to create contact');
        }

        // Update status if not active (upsertContact always sets active)
        if (status !== 'active') {
            statements.updateContactStatus.run(status, phone);
        }

        // Insert vehicle if provided
        if (vehicleData) {
            const { make, model, year, price = null, link = null } = vehicleData;
            statements.insertVehicle.run(contact.id, make, model, year, price, link);
        }

        return statements.getContactById.get(contact.id);
    });

    return transaction(contactData, vehicleData);
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

export function bulkInsertOptOuts(phones) {
    const insertStmt = db.prepare(`
        INSERT OR IGNORE INTO opt_outs (phone, reason, opted_out_at)
        VALUES (?, 'bulk_import', datetime('now', 'localtime'))
    `);
    const updateContactStmt = db.prepare(`
        UPDATE contacts SET status = 'opted_out', updated_at = datetime('now', 'localtime')
        WHERE phone = ? AND status != 'opted_out'
    `);
    const transaction = db.transaction(ps => {
        let inserted = 0;
        for (const p of ps) {
            const r = insertStmt.run(p);
            if (r.changes > 0) inserted++;
            updateContactStmt.run(p);
        }
        return inserted;
    });
    return transaction(phones);
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
    make,
    model,
    year,
    price = null,
    link = null,
    origin = null,
    external_id = null
}) {
    statements.insertVehicle.run(contactId, make, model, year, price, link, origin, external_id);
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
    type = 'twilio_template',
    scheduledAt = null,
    templateId = null,
    contentSid = null,
    filters = null,
    isTest = false
}) {
    const filtersJson = filters ? JSON.stringify(filters) : null;
    const result = statements.insertCampaign.run(
        name,
        messageTemplate,
        status,
        type,
        scheduledAt,
        templateId,
        contentSid,
        filtersJson,
        isTest ? 1 : 0
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
        SELECT c.id, c.name, c.status, c.message_template, c.created_at, c.type, c.scheduled_at,
               c.template_id,
               c.total_recipients,
               c.sent_count,
               c.is_test,
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

export function updateCampaignFull(id, { name, messageTemplate, type, scheduledAt, templateId = null, contentSid, filters }) {
    const filtersJson = filters ? JSON.stringify(filters) : null;
    statements.updateCampaign.run(name, messageTemplate, type, scheduledAt, templateId, contentSid, filtersJson, id);
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

export function resumeCampaign(id) {
    const info = statements.resumeCampaign.run(id);
    return info.changes > 0 ? getCampaignById(id) : null;
}

export function setCampaignStatus(id, status) {
    const info = statements.setCampaignStatus.run(status, status, id);
    return info.changes > 0 ? getCampaignById(id) : null;
}

export function deleteCampaign(id) {
    const info = statements.deleteCampaign.run(id);
    return info.changes > 0;
}

export function getCampaignProgress(campaignId) {
    return statements.getCampaignProgress.get(
        campaignId, campaignId, campaignId, campaignId, campaignId
    );
}

export function listScheduledCampaignsDue(limit = 10) {
    return statements.listScheduledCampaignsDue.all(limit);
}

export function listCampaignsByStatus({ status, limit = 10 }) {
    return statements.listCampaignsByStatus.all(status, limit);
}

export function listPendingRecipients({ campaignId, limit = 50 }) {
    return statements.listPendingRecipients.all(campaignId, limit);
}

export function updateCampaignRecipientStatus({ id, status, messageSid = null, sentAt = null, errorMessage = null }) {
    statements.updateCampaignRecipientStatus.run(status, messageSid, sentAt, errorMessage, id);
}

export function getContactWithVehicle(contactId) {
    return statements.getContactWithVehicle.get(contactId) || null;
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

export function listVehicleContactsByFilters({ make = null, model = null, yearMin = null, yearMax = null, limit = 1000 }) {
    return statements.listVehicleContactsByFilters.all(
        make, make,
        model, model,
        yearMin, yearMin,
        yearMax, yearMax,
        limit
    );
}

export function listContactsForCampaign({ query = '', limit = 1000 }) {
    const like = query ? `%${query}%` : null;
    return statements.listContactsForCampaign.all(like, like, like, limit);
}

export function listCampaignRecipientsByContacts(campaignId, contactIds = []) {
    const ids = Array.isArray(contactIds) ? contactIds.filter(Boolean) : [];
    if (!ids.length) {
        return [];
    }
    const placeholders = ids.map(() => '?').join(', ');
    const sql = `
        SELECT id, contact_id, phone, status
        FROM campaign_recipients
        WHERE campaign_id = ?
          AND contact_id IN (${placeholders})
    `;
    return db.prepare(sql).all(campaignId, ...ids);
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
    const normalized = {
        ...variables,
        nombre: variables.nombre ?? variables.name,
        name: variables.name ?? variables.nombre,
        marca: variables.marca ?? variables.make,
        make: variables.make ?? variables.marca,
        modelo: variables.modelo ?? variables.model,
        model: variables.model ?? variables.modelo,
        anio: variables.anio ?? variables.año ?? variables.year,
        año: variables.año ?? variables.anio ?? variables.year,
        year: variables.year ?? variables.anio ?? variables.año
    };
    return String(template).replace(/\{\{([^}]+)\}\}/g, (match, rawVarName) => {
        const varName = String(rawVarName || '').trim();
        const value = normalized[varName];
        return value !== undefined && value !== null ? String(value) : match;
    });
}

export function updateOptOut(phone, reason) {
    return statements.updateOptOut.run(reason || 'user_request', normalizePhone(phone));
}

export function deleteOptOut(phone) {
    return statements.deleteOptOut.run(normalizePhone(phone));
}

export function getOptOutByPhone(phone) {
    return statements.getOptOutByPhone.get(normalizePhone(phone));
}

// ============================================================
// CSV Import Functions
// ============================================================

export function bulkImportContactsAndVehicles(records) {
    const transaction = db.transaction((items) => {
        const stats = {
            processed: 0,
            contactsInserted: 0,
            contactsUpdated: 0,
            vehiclesInserted: 0,
            vehiclesUpdated: 0,
            errors: []
        };

        const getContactStmt = db.prepare('SELECT id FROM contacts WHERE phone = ?');
        const insertContactStmt = db.prepare(`
            INSERT INTO contacts (phone, name, status, created_at, updated_at)
            VALUES (?, ?, 'active', datetime('now', 'localtime'), datetime('now', 'localtime'))
            ON CONFLICT(phone) DO UPDATE SET
                name = COALESCE(NULLIF(excluded.name, ''), contacts.name),
                updated_at = datetime('now', 'localtime')
        `);
        const getVehicleStmt = db.prepare(`
            SELECT id FROM vehicles
            WHERE contact_id = ? AND make = ? AND model = ? AND year = ?
        `);
        const insertVehicleStmt = db.prepare(`
            INSERT INTO vehicles (contact_id, make, model, year, price, link, origin, external_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
        `);
        const updateVehicleStmt = db.prepare(`
            UPDATE vehicles
            SET price = ?, link = ?, origin = ?, external_id = ?, updated_at = datetime('now', 'localtime')
            WHERE contact_id = ? AND make = ? AND model = ? AND year = ?
        `);

        for (const record of items) {
            stats.processed++;
            try {
                const existingContact = getContactStmt.get(record.phone);
                const wasExisting = Boolean(existingContact);

                const contactResult = insertContactStmt.run(record.phone, record.name || null);

                if (!wasExisting && contactResult.changes > 0) {
                    stats.contactsInserted++;
                } else if (wasExisting) {
                    stats.contactsUpdated++;
                }

                const contact = getContactStmt.get(record.phone);
                if (!contact) {
                    throw new Error('Failed to retrieve contact after insert');
                }

                const existingVehicle = getVehicleStmt.get(contact.id, record.make, record.model, record.year);

                if (existingVehicle) {
                    updateVehicleStmt.run(
                        record.price || null,
                        record.link || null,
                        record.origin || null,
                        record.external_id || null,
                        contact.id, record.make, record.model, record.year
                    );
                    stats.vehiclesUpdated++;
                } else {
                    insertVehicleStmt.run(
                        contact.id,
                        record.make,
                        record.model,
                        record.year,
                        record.price || null,
                        record.link || null,
                        record.origin || null,
                        record.external_id || null
                    );
                    stats.vehiclesInserted++;
                }

            } catch (error) {
                stats.errors.push({
                    row: record.row || stats.processed,
                    phone: record.phone,
                    error: error.message || 'Unknown error'
                });
            }
        }

        return stats;
    });

    return transaction(records);
}

// ============================================================
// Phase 1: Campaign Follow-Up Tracking Functions
// ============================================================

/**
 * Get aggregated KPIs for campaign follow-up tracking
 * @param {number} campaignId - Campaign ID
 * @returns {object} Stats including sent_ok, failed, recipients_with_replies, total_replies, etc.
 */
export function getCampaignFollowUpStats(campaignId) {
    const stats = db.prepare(`
        SELECT 
            c.id AS campaign_id,
            c.name AS campaign_name,
            c.total_recipients,
            c.sent_count,
            
            -- Enviados exitosos (sent + delivered + read)
            (SELECT COUNT(*)
             FROM campaign_recipients
             WHERE campaign_id = c.id
               AND status IN ('sent', 'delivered', 'read')) AS sent_ok,

            -- Entregados
            (SELECT COUNT(*)
             FROM campaign_recipients
             WHERE campaign_id = c.id
               AND status = 'delivered') AS delivered,

            -- Leidos (WhatsApp read)
            (SELECT COUNT(*)
             FROM campaign_recipients
             WHERE campaign_id = c.id
               AND status = 'read') AS read,
            
            -- Fallidos
            (SELECT COUNT(*) 
             FROM campaign_recipients 
             WHERE campaign_id = c.id 
               AND status = 'failed') AS failed,
            
            -- Recipients con al menos 1 reply (7 días)
            (SELECT COUNT(DISTINCT cr.id)
             FROM campaign_recipients cr
             INNER JOIN messages m ON (
                 REPLACE(LOWER(m.phone), 'whatsapp:', '') = REPLACE(LOWER(cr.phone), 'whatsapp:', '')
                 AND m.direction = 'inbound'
                 AND datetime(m.created_at) >= datetime(cr.sent_at, 'localtime')
                 AND datetime(m.created_at) <= datetime(cr.sent_at, 'localtime', '+7 days')
             )
             WHERE cr.campaign_id = c.id
               AND cr.status IN ('sent', 'delivered', 'read')) AS recipients_with_replies,

            -- Total de replies recibidos (7 días)
            (SELECT COUNT(m.id)
             FROM campaign_recipients cr
             INNER JOIN messages m ON (
                 REPLACE(LOWER(m.phone), 'whatsapp:', '') = REPLACE(LOWER(cr.phone), 'whatsapp:', '')
                 AND m.direction = 'inbound'
                 AND datetime(m.created_at) >= datetime(cr.sent_at, 'localtime')
                 AND datetime(m.created_at) <= datetime(cr.sent_at, 'localtime', '+7 days')
             )
             WHERE cr.campaign_id = c.id
               AND cr.status IN ('sent', 'delivered', 'read')) AS total_replies,

            -- Tasa de respuesta 24h
            (SELECT COUNT(DISTINCT cr.id)
             FROM campaign_recipients cr
             INNER JOIN messages m ON (
                 REPLACE(LOWER(m.phone), 'whatsapp:', '') = REPLACE(LOWER(cr.phone), 'whatsapp:', '')
                 AND m.direction = 'inbound'
                 AND datetime(m.created_at) BETWEEN datetime(cr.sent_at, 'localtime') AND datetime(cr.sent_at, 'localtime', '+1 day')
             )
             WHERE cr.campaign_id = c.id
               AND cr.status IN ('sent', 'delivered', 'read')) AS replies_24h,

            -- Último reply recibido
            (SELECT MAX(m.created_at)
             FROM campaign_recipients cr
             INNER JOIN messages m ON (
                 REPLACE(LOWER(m.phone), 'whatsapp:', '') = REPLACE(LOWER(cr.phone), 'whatsapp:', '')
                 AND m.direction = 'inbound'
                 AND datetime(m.created_at) >= datetime(cr.sent_at, 'localtime')
             )
             WHERE cr.campaign_id = c.id) AS last_reply_at
            
        FROM campaigns c
        WHERE c.id = ?
    `).get(campaignId);

    return stats || null;
}

/**
 * List campaign recipients with reply counts and details
 * @param {number} campaignId - Campaign ID
 * @param {object} options - { limit, offset, filters }
 * @returns {array} Recipients with reply counts
 */
export function listCampaignRecipientsWithReplies(campaignId, { limit = 50, offset = 0, filters = {} } = {}) {
    const recipients = db.prepare(`
        SELECT 
            cr.id AS recipient_id,
            cr.phone,
            c.name AS contact_name,
            cr.status AS send_status,
            cr.sent_at,
            cr.error_message,
            COUNT(DISTINCT m.id) AS total_replies,
            COUNT(DISTINCT CASE 
                WHEN datetime(m.created_at) <= datetime(cr.sent_at, 'localtime', '+1 day') 
                THEN m.id 
            END) AS replies_24h,
            COUNT(DISTINCT CASE 
                WHEN datetime(m.created_at) <= datetime(cr.sent_at, 'localtime', '+7 days') 
                THEN m.id 
            END) AS replies_7d,
            MAX(m.created_at) AS last_reply_at,
            (
                SELECT body
                FROM messages
                WHERE REPLACE(LOWER(phone), 'whatsapp:', '') = REPLACE(LOWER(cr.phone), 'whatsapp:', '')
                  AND direction = 'inbound'
                  AND datetime(created_at) >= datetime(cr.sent_at, 'localtime')
                ORDER BY created_at DESC
                LIMIT 1
            ) AS last_reply_preview
        FROM campaign_recipients cr
        LEFT JOIN contacts c ON c.id = cr.contact_id
        LEFT JOIN messages m ON (
            REPLACE(LOWER(m.phone), 'whatsapp:', '') = REPLACE(LOWER(cr.phone), 'whatsapp:', '')
            AND m.direction = 'inbound'
            AND datetime(m.created_at) >= datetime(cr.sent_at, 'localtime')
            AND datetime(m.created_at) <= datetime(cr.sent_at, 'localtime', '+7 days')
        )
        WHERE cr.campaign_id = ?
        GROUP BY cr.id, cr.phone, c.name, cr.status, cr.sent_at, cr.error_message
        ORDER BY cr.sent_at DESC
        LIMIT ? OFFSET ?
    `).all(campaignId, limit, offset);

    return recipients;
}

/**
 * Get full conversation history for a phone number
 * @param {string} phone - Phone number (E.164)
 * @param {number} campaignId - Campaign ID (kept for caller compatibility)
 * @returns {array} All messages (outbound + inbound) in chronological order
 */
export function getRecipientConversationHistory(phone, campaignId) {
    const normalizedPhone = normalizePhone(phone);
    const rawPhone = String(phone || '').trim();
    const lookupPhone = normalizedPhone || rawPhone;
    if (!lookupPhone) {
        return [];
    }
    const whatsappPhone = normalizedPhone ? `whatsapp:${normalizedPhone}` : null;
    const query = whatsappPhone
        ? `
        SELECT 
            m.id,
            m.direction,
            m.body,
            m.status,
            m.created_at,
            m.message_sid,
            CASE 
                WHEN m.direction = 'outbound' THEN 'Sistema'
                WHEN m.direction = 'inbound' THEN 'Contacto'
            END AS sender
        FROM messages m
        WHERE m.phone IN (?, ?)
        ORDER BY m.created_at ASC
    `
        : `
        SELECT 
            m.id,
            m.direction,
            m.body,
            m.status,
            m.created_at,
            m.message_sid,
            CASE 
                WHEN m.direction = 'outbound' THEN 'Sistema'
                WHEN m.direction = 'inbound' THEN 'Contacto'
            END AS sender
        FROM messages m
        WHERE m.phone = ?
        ORDER BY m.created_at ASC
    `;

    const params = whatsappPhone ? [lookupPhone, whatsappPhone] : [lookupPhone];
    const messages = db.prepare(query).all(...params);

    return messages;
}

// ============================================================
// Phase 2.2: Message Templates CRUD Functions
// ============================================================

const templateStatements = {
    insert: db.prepare(`
        INSERT INTO message_templates (name, body, content_sid, is_active, created_at, updated_at)
        VALUES (?, ?, ?, 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `),
    getById: db.prepare(`
        SELECT id, name, body, content_sid, is_active, created_at, updated_at
        FROM message_templates
        WHERE id = ?
    `),
    update: db.prepare(`
        UPDATE message_templates
        SET name = ?, body = ?, content_sid = ?, is_active = ?
        WHERE id = ?
    `),
    delete: db.prepare(`
        DELETE FROM message_templates
        WHERE id = ?
    `)
};

export function createTemplate({ name, body, contentSid = null }) {
    const result = templateStatements.insert.run(name, body, contentSid);
    return templateStatements.getById.get(result.lastInsertRowid);
}

export function listTemplates({ limit = 50, offset = 0, includeArchived = false } = {}) {
    const whereClause = includeArchived ? '' : 'WHERE is_active = 1';
    return db.prepare(`
        SELECT id, name, body, content_sid, is_active, created_at, updated_at
        FROM message_templates
        ${whereClause}
        ORDER BY updated_at DESC
        LIMIT ? OFFSET ?
    `).all(limit, offset);
}

export function getTemplateById(id) {
    return templateStatements.getById.get(id) || null;
}

export function updateTemplate(id, { name, body, contentSid = null, isActive = 1 }) {
    const info = templateStatements.update.run(name, body, contentSid, isActive ? 1 : 0, id);
    return info.changes > 0 ? templateStatements.getById.get(id) : null;
}

export function deleteTemplate(id) {
    const info = templateStatements.delete.run(id);
    return info.changes > 0;
}

// Phase 2.4: Update Message Status from Callback
export function updateMessageStatus(messageSid, status, errorCode = null) {
    if (!messageSid) return false;

    const normalizedStatus = String(status || '').trim().toLowerCase();
    if (!normalizedStatus) {
        return false;
    }

    // 1. Update messages table
    // We only update if status is 'newer' roughly, but here we just blindly update to latest callback
    const sqlMsg = `
    UPDATE messages 
    SET status = ?, 
        updated_at = datetime('now', 'localtime')
    WHERE message_sid = ?`;

    db.prepare(sqlMsg).run(normalizedStatus, messageSid);

    // 2. Update campaign_recipients table
    // Map Twilio status to our status: delivered -> delivered, undelivered/failed -> failed
    let recipientStatus = normalizedStatus;
    let errorMessage = null;

    if (['failed', 'undelivered'].includes(normalizedStatus)) {
        recipientStatus = 'failed';
        errorMessage = errorCode ? `Twilio Error: ${errorCode}` : 'Delivery failed';
    } else if (normalizedStatus === 'read') {
        recipientStatus = 'read';
    } else if (normalizedStatus === 'delivered') {
        recipientStatus = 'delivered';
    } else if (['sent', 'queued', 'accepted', 'sending'].includes(normalizedStatus)) {
        recipientStatus = 'sent';
    }

    const sqlRecipient = `
    UPDATE campaign_recipients 
    SET status = ?,
        error_message = ?, 
        updated_at = datetime('now', 'localtime')
    WHERE message_sid = ?`;

    const result = db.prepare(sqlRecipient).run(recipientStatus, errorMessage, messageSid);
    return result.changes > 0;
}


// ============================================================
// Phase 2.3: Segments CRUD Functions
// ============================================================

const segmentStatements = {
    insert: db.prepare(`
        INSERT INTO segments (name, filters, created_at)
        VALUES (?, ?, datetime('now', 'localtime'))
    `),
    list: db.prepare(`
        SELECT id, name, filters, created_at
        FROM segments
        ORDER BY created_at DESC
    `),
    getById: db.prepare(`
        SELECT id, name, filters, created_at
        FROM segments
        WHERE id = ?
    `),
    delete: db.prepare(`
        DELETE FROM segments
        WHERE id = ?
    `)
};

export function createSegment(name, filters) {
    const filtersJson = JSON.stringify(filters || {});
    const result = segmentStatements.insert.run(name, filtersJson);
    return segmentStatements.getById.get(result.lastInsertRowid);
}

export function listSegments() {
    return segmentStatements.list.all();
}

export function getSegmentById(id) {
    return segmentStatements.getById.get(id);
}

export function deleteSegment(id) {
    const info = segmentStatements.delete.run(id);
    return info.changes > 0;
}

// ============================================================
// Fase 3: Vehicle Make Filtering Functions
// ============================================================

export function listVehicleMakes() {
    return db.prepare(`
        SELECT make,
               COUNT(DISTINCT contact_id) AS contacts,
               COUNT(*) AS vehicles
        FROM vehicles
        GROUP BY make
        ORDER BY make
    `).all();
}

export function listContactsByMake(make, { limit = 50, offset = 0 } = {}) {
    return db.prepare(`
        SELECT c.id, c.phone, c.name, c.status, c.created_at, c.updated_at
        FROM contacts c
        JOIN vehicles v ON v.contact_id = c.id
        WHERE v.make = ?
        GROUP BY c.id
        ORDER BY c.updated_at DESC
        LIMIT ? OFFSET ?
    `).all(make, limit, offset);
}

// ============================================================
// Fase 4: Vehicles by Contact
// ============================================================

export function getVehiclesByContactId(contactId) {
    return db.prepare(`
        SELECT id, make, model, year, price, link, origin, external_id, created_at, updated_at
        FROM vehicles
        WHERE contact_id = ?
        ORDER BY updated_at DESC
    `).all(contactId);
}

// ============================================================
// Fase 5: Vehicle CRUD
// ============================================================

export function listVehicles({ make = null, model = null, yearMin = null, yearMax = null, search = null, limit = 50, offset = 0 } = {}) {
    const conditions = [];
    const params = [];

    if (make) { conditions.push('v.make = ?'); params.push(make); }
    if (model) { conditions.push('v.model LIKE ?'); params.push(`%${model}%`); }
    if (yearMin) { conditions.push('v.year >= ?'); params.push(Number(yearMin)); }
    if (yearMax) { conditions.push('v.year <= ?'); params.push(Number(yearMax)); }
    if (search) {
        conditions.push('(v.make LIKE ? OR v.model LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)');
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    return db.prepare(`
        SELECT v.id, v.make, v.model, v.year, v.price, v.link, v.origin, v.external_id,
               v.created_at, v.contact_id,
               c.name AS contact_name, c.phone AS contact_phone, c.status AS contact_status
        FROM vehicles v
        JOIN contacts c ON c.id = v.contact_id
        ${where}
        ORDER BY v.created_at DESC
        LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
}

export function countVehicles({ make = null, model = null, yearMin = null, yearMax = null, search = null } = {}) {
    const conditions = [];
    const params = [];

    if (make) { conditions.push('v.make = ?'); params.push(make); }
    if (model) { conditions.push('v.model LIKE ?'); params.push(`%${model}%`); }
    if (yearMin) { conditions.push('v.year >= ?'); params.push(Number(yearMin)); }
    if (yearMax) { conditions.push('v.year <= ?'); params.push(Number(yearMax)); }
    if (search) {
        conditions.push('(v.make LIKE ? OR v.model LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)');
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    return (db.prepare(`
        SELECT COUNT(*) AS total
        FROM vehicles v
        JOIN contacts c ON c.id = v.contact_id
        ${where}
    `).get(...params))?.total ?? 0;
}

export function getVehicleStats() {
    return db.prepare(`
        SELECT
            COUNT(*) AS total,
            COUNT(DISTINCT make) AS makes,
            COUNT(DISTINCT contact_id) AS contacts_with_vehicles,
            ROUND(AVG(CASE WHEN price > 0 THEN price END)) AS avg_price,
            COUNT(CASE WHEN link IS NOT NULL AND link != '' THEN 1 END) AS with_link
        FROM vehicles
    `).get();
}

export function getVehicleById(id) {
    return db.prepare(`
        SELECT v.id, v.make, v.model, v.year, v.price, v.link, v.origin, v.external_id,
               v.created_at, v.updated_at, v.contact_id,
               c.name AS contact_name, c.phone AS contact_phone
        FROM vehicles v
        JOIN contacts c ON c.id = v.contact_id
        WHERE v.id = ?
    `).get(id);
}

export function createVehicle({ contact_id, make, model, year, price = null, link = null }) {
    const result = db.prepare(`
        INSERT INTO vehicles (contact_id, make, model, year, price, link, origin, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'manual', datetime('now','localtime'), datetime('now','localtime'))
    `).run(contact_id, make, model, year, price ?? null, link ?? null);
    return result.lastInsertRowid;
}

export function updateVehicle(id, { contact_id, make, model, year, price = null, link = null }) {
    const result = db.prepare(`
        UPDATE vehicles
        SET contact_id = ?, make = ?, model = ?, year = ?, price = ?, link = ?
        WHERE id = ?
    `).run(contact_id, make, model, year, price ?? null, link ?? null, id);
    return result.changes > 0;
}

export function deleteVehicle(id) {
    return db.prepare('DELETE FROM vehicles WHERE id = ?').run(id).changes > 0;
}

// ============================================================
// Feature 6: Dashboard Metrics
// ============================================================

export function getDashboardMetrics() {
    const now = new Date();
    const pad = (d) => d.toISOString().slice(0, 10);
    const today = pad(now);
    const d7  = pad(new Date(now - 7  * 86400000));
    const d14 = pad(new Date(now - 14 * 86400000));
    const d30 = pad(new Date(now - 30 * 86400000));
    const d60 = pad(new Date(now - 60 * 86400000));
    const d28 = pad(new Date(now - 28 * 86400000));

    const q = (sql, ...p) => db.prepare(sql).get(...p);
    const qa = (sql, ...p) => db.prepare(sql).all(...p);

    const contactsTotal   = q(`SELECT COUNT(*) AS c FROM contacts`).c;
    const contactsToday   = q(`SELECT COUNT(*) AS c FROM contacts WHERE DATE(created_at) = ?`, today).c;
    const contacts7d      = q(`SELECT COUNT(*) AS c FROM contacts WHERE created_at >= ?`, d7 + ' 00:00:00').c;
    const contacts7dPrev  = q(`SELECT COUNT(*) AS c FROM contacts WHERE created_at >= ? AND created_at < ?`, d14 + ' 00:00:00', d7 + ' 00:00:00').c;
    const campaignsTotal  = q(`SELECT COUNT(*) AS c FROM campaigns`).c;
    const campaignsActive = q(`SELECT COUNT(*) AS c FROM campaigns WHERE status IN ('sending','scheduled')`).c;
    const optOutsTotal    = q(`SELECT COUNT(*) AS c FROM opt_outs`).c;
    const optOutsToday    = q(`SELECT COUNT(*) AS c FROM opt_outs WHERE DATE(opted_out_at) = ?`, today).c;

    const rr30 = q(`
        SELECT COUNT(DISTINCT cr.id) AS sent,
               SUM(CASE WHEN EXISTS(
                   SELECT 1 FROM messages m
                   WHERE m.phone = cr.phone AND m.direction = 'inbound' AND m.created_at > cr.sent_at
               ) THEN 1 ELSE 0 END) AS responded
        FROM campaign_recipients cr
        WHERE cr.sent_at >= ? AND cr.status IN ('sent','delivered','read')
    `, d30 + ' 00:00:00');

    const rr60 = q(`
        SELECT COUNT(DISTINCT cr.id) AS sent,
               SUM(CASE WHEN EXISTS(
                   SELECT 1 FROM messages m
                   WHERE m.phone = cr.phone AND m.direction = 'inbound' AND m.created_at > cr.sent_at
               ) THEN 1 ELSE 0 END) AS responded
        FROM campaign_recipients cr
        WHERE cr.sent_at >= ? AND cr.sent_at < ? AND cr.status IN ('sent','delivered','read')
    `, d60 + ' 00:00:00', d30 + ' 00:00:00');

    const topCampaigns = qa(`
        SELECT c.id, c.name,
               COUNT(cr.id) AS sent,
               SUM(CASE WHEN EXISTS(
                   SELECT 1 FROM messages m
                   WHERE m.phone = cr.phone AND m.direction = 'inbound' AND m.created_at > cr.sent_at
               ) THEN 1 ELSE 0 END) AS responded
        FROM campaigns c
        JOIN campaign_recipients cr ON cr.campaign_id = c.id
        WHERE cr.status IN ('sent','delivered','read')
        GROUP BY c.id
        HAVING sent >= 1
        ORDER BY (CAST(responded AS REAL) / sent) DESC
        LIMIT 5
    `);

    const weeklySends = qa(`
        SELECT strftime('%Y-%W', sent_at) AS week_key,
               MIN(DATE(sent_at)) AS week_start,
               COUNT(*) AS sent
        FROM campaign_recipients
        WHERE sent_at >= ? AND status IN ('sent','delivered','read')
        GROUP BY week_key
        ORDER BY week_start ASC
    `, d28 + ' 00:00:00');

    const brandDist = qa(`
        SELECT make, COUNT(*) AS cnt
        FROM vehicles
        GROUP BY make
        ORDER BY cnt DESC
        LIMIT 5
    `);

    return {
        contactsTotal, contactsToday, contacts7d, contacts7dPrev,
        campaignsTotal, campaignsActive,
        optOutsTotal, optOutsToday,
        rr30, rr60,
        topCampaigns,
        weeklySends,
        brandDist
    };
}

// ============================================================
// Feature J: Segments with Live Count
// ============================================================

export function listSegmentsWithCount() {
    const segs = db.prepare(`
        SELECT id, name, filters, created_at, last_used_at, last_campaign_id
        FROM segments ORDER BY created_at DESC
    `).all();

    return segs.map(seg => {
        let contact_count = 0;
        try {
            const f = JSON.parse(seg.filters || '{}');
            const make    = f.make    || null;
            const model   = f.model   || null;
            const yearMin = f.yearMin || null;
            const yearMax = f.yearMax || null;
            contact_count = db.prepare(`
                SELECT COUNT(DISTINCT c.id) AS cnt
                FROM contacts c
                JOIN vehicles v ON v.contact_id = c.id
                WHERE c.status = 'active'
                  AND (? IS NULL OR v.make = ?)
                  AND (? IS NULL OR v.model = ?)
                  AND (? IS NULL OR v.year >= ?)
                  AND (? IS NULL OR v.year <= ?)
                  AND c.phone NOT IN (SELECT phone FROM opt_outs)
            `).get(make, make, model, model, yearMin, yearMin, yearMax, yearMax)?.cnt ?? 0;
        } catch (_) {}
        return { ...seg, contact_count };
    });
}

export function updateSegmentLastUsed(id, campaignId = null) {
    db.prepare(`
        UPDATE segments
        SET last_used_at = datetime('now', 'localtime'), last_campaign_id = ?
        WHERE id = ?
    `).run(campaignId, id);
}

// ============================================================
// Feature 4: Inbox / Conversation Status
// ============================================================

export function listInboxConversations({ limit = 100, offset = 0 } = {}) {
    return db.prepare(`
        SELECT
            m.phone,
            c.name AS contact_name,
            MAX(m.created_at) AS last_message_at,
            (SELECT body FROM messages
             WHERE phone = m.phone AND direction = 'inbound'
             ORDER BY created_at DESC LIMIT 1) AS last_inbound,
            COALESCE(cs.status, 'unread') AS conv_status,
            COUNT(CASE WHEN m.direction = 'inbound' THEN 1 END) AS inbound_count
        FROM messages m
        LEFT JOIN contacts c ON c.phone = m.phone
        LEFT JOIN conversation_status cs ON cs.phone = m.phone
        WHERE m.direction = 'inbound'
        GROUP BY m.phone
        ORDER BY last_message_at DESC
        LIMIT ? OFFSET ?
    `).all(limit, offset);
}

export function countUnreadConversations() {
    return db.prepare(`
        SELECT COUNT(DISTINCT m.phone) AS cnt
        FROM messages m
        LEFT JOIN conversation_status cs ON cs.phone = m.phone
        WHERE m.direction = 'inbound'
          AND (cs.status IS NULL OR cs.status = 'unread')
    `).get()?.cnt ?? 0;
}

export function markConversationRead(phone) {
    db.prepare(`
        INSERT INTO conversation_status (phone, status, updated_at)
        VALUES (?, 'read', datetime('now', 'localtime'))
        ON CONFLICT(phone) DO UPDATE SET
            status = 'read',
            updated_at = datetime('now', 'localtime')
    `).run(phone);
}

export function markConversationUnread(phone) {
    db.prepare(`
        INSERT INTO conversation_status (phone, status, updated_at)
        VALUES (?, 'unread', datetime('now', 'localtime'))
        ON CONFLICT(phone) DO UPDATE SET
            status = 'unread',
            updated_at = datetime('now', 'localtime')
    `).run(phone);
}

export function getConversationMessagesByPhone(phone) {
    return db.prepare(`
        SELECT id, direction, body, message_sid, status, created_at
        FROM messages
        WHERE phone = ?
        ORDER BY created_at ASC
    `).all(phone);
}

// ============================================================
// Feature H: Contact Engagement Stats
// ============================================================

export function getContactEngagementStats(contactId) {
    const summary = db.prepare(`
        SELECT COUNT(DISTINCT cr.campaign_id) AS campaigns_received
        FROM campaign_recipients cr
        WHERE cr.contact_id = ?
    `).get(contactId);

    const responded = db.prepare(`
        SELECT COUNT(DISTINCT cr.campaign_id) AS count
        FROM campaign_recipients cr
        WHERE cr.contact_id = ?
          AND cr.sent_at IS NOT NULL
          AND EXISTS (
              SELECT 1 FROM messages m
              WHERE m.phone = cr.phone
                AND m.direction = 'inbound'
                AND m.created_at > cr.sent_at
          )
    `).get(contactId);

    const lastCampaign = db.prepare(`
        SELECT c.name, cr.sent_at
        FROM campaign_recipients cr
        JOIN campaigns c ON c.id = cr.campaign_id
        WHERE cr.contact_id = ? AND cr.sent_at IS NOT NULL
        ORDER BY cr.sent_at DESC
        LIMIT 1
    `).get(contactId);

    const lastReply = db.prepare(`
        SELECT m.body, m.created_at
        FROM messages m
        JOIN contacts con ON con.phone = m.phone
        WHERE con.id = ? AND m.direction = 'inbound'
        ORDER BY m.created_at DESC
        LIMIT 1
    `).get(contactId);

    return {
        campaigns_received: summary?.campaigns_received ?? 0,
        campaigns_responded: responded?.count ?? 0,
        last_campaign_name: lastCampaign?.name ?? null,
        last_campaign_sent_at: lastCampaign?.sent_at ?? null,
        last_reply_body: lastReply?.body ?? null,
        last_reply_at: lastReply?.created_at ?? null,
    };
}


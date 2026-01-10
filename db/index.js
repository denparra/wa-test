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

// Read and execute schema
const schemaSql = fs.readFileSync(schemaPath, 'utf8');
db.exec(schemaSql);

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
        INSERT INTO campaigns (name, message_template, status)
        VALUES (?, ?, ?)
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
    messageTemplate = null, // RENAMED
    status = 'draft'
}) {
    const result = statements.insertCampaign.run(name, messageTemplate, status);
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

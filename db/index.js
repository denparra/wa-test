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

const schemaSql = fs.readFileSync(schemaPath, 'utf8');
db.exec(schemaSql);

const statements = {
    upsertContact: db.prepare(`
        INSERT INTO contacts (phone_e164, name)
        VALUES (?, ?)
        ON CONFLICT(phone_e164) DO UPDATE SET
            name = COALESCE(NULLIF(excluded.name, ''), contacts.name),
            updated_at = datetime('now')
    `),
    getContactByPhone: db.prepare(`
        SELECT id, phone_e164, name, status
        FROM contacts
        WHERE phone_e164 = ?
    `),
    updateContactStatus: db.prepare(`
        UPDATE contacts
        SET status = ?, updated_at = datetime('now')
        WHERE phone_e164 = ?
    `),
    insertOptOut: db.prepare(`
        INSERT OR IGNORE INTO opt_outs (phone_e164, reason)
        VALUES (?, ?)
    `),
    isOptedOut: db.prepare(`
        SELECT 1
        FROM opt_outs
        WHERE phone_e164 = ?
        LIMIT 1
    `),
    insertMessage: db.prepare(`
        INSERT INTO messages (
            contact_id,
            campaign_id,
            direction,
            body,
            provider_message_id,
            status
        )
        VALUES (?, ?, ?, ?, ?, ?)
    `),
    insertVehicle: db.prepare(`
        INSERT INTO vehicles (contact_id, brand, model, year, price, link)
        VALUES (?, ?, ?, ?, ?, ?)
    `),
    getCampaignById: db.prepare(`
        SELECT id, name, category, message_body, status, created_at
        FROM campaigns
        WHERE id = ?
    `),
    getCampaignByName: db.prepare(`
        SELECT id, name, category, message_body, status, created_at
        FROM campaigns
        WHERE name = ?
    `),
    insertCampaign: db.prepare(`
        INSERT INTO campaigns (name, category, message_body, status)
        VALUES (?, ?, ?, ?)
    `),
    updateCampaignMessage: db.prepare(`
        UPDATE campaigns
        SET message_body = ?
        WHERE id = ?
    `),
    insertCampaignRecipient: db.prepare(`
        INSERT INTO campaign_recipients (
            campaign_id,
            contact_id,
            phone_e164,
            status,
            provider_message_id,
            sent_at,
            error_message
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
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

export function upsertContact(phoneE164, name = null) {
    statements.upsertContact.run(phoneE164, name);
    return statements.getContactByPhone.get(phoneE164) || null;
}

export function updateContactStatus(phoneE164, status) {
    statements.updateContactStatus.run(status, phoneE164);
}

export function insertOptOut(phoneE164, reason = null) {
    statements.insertOptOut.run(phoneE164, reason);
}

export function isOptedOut(phoneE164) {
    return Boolean(statements.isOptedOut.get(phoneE164));
}

export function insertMessage({
    contactId = null,
    campaignId = null,
    direction,
    body = null,
    providerMessageId = null,
    status = null
}) {
    statements.insertMessage.run(
        contactId,
        campaignId,
        direction,
        body,
        providerMessageId,
        status
    );
}

export function insertVehicle({
    contactId,
    brand,
    model,
    year,
    price = null,
    link = null
}) {
    statements.insertVehicle.run(contactId, brand, model, year, price, link);
}

export function getCampaignById(id) {
    return statements.getCampaignById.get(id) || null;
}

export function getCampaignByName(name) {
    return statements.getCampaignByName.get(name) || null;
}

export function createCampaign({
    name,
    category = null,
    messageBody = null,
    status = 'draft'
}) {
    const result = statements.insertCampaign.run(name, category, messageBody, status);
    return getCampaignById(result.lastInsertRowid);
}

export function updateCampaignMessage(campaignId, messageBody) {
    statements.updateCampaignMessage.run(messageBody, campaignId);
}

export function insertCampaignRecipient({
    campaignId,
    contactId,
    phoneE164,
    status = 'pending',
    providerMessageId = null,
    sentAt = null,
    errorMessage = null
}) {
    statements.insertCampaignRecipient.run(
        campaignId,
        contactId,
        phoneE164,
        status,
        providerMessageId,
        sentAt,
        errorMessage
    );
}

export function getAdminStats() {
    const getCount = (table) => db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
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
            SELECT id, phone_e164, name, status, created_at, updated_at
            FROM contacts
            WHERE phone_e164 LIKE ? OR name LIKE ?
            ORDER BY updated_at DESC
            LIMIT ? OFFSET ?
        `).all(like, like, limit, offset);
    }
    return db.prepare(`
        SELECT id, phone_e164, name, status, created_at, updated_at
        FROM contacts
        ORDER BY updated_at DESC
        LIMIT ? OFFSET ?
    `).all(limit, offset);
}

export function listMessages({ limit = 50, offset = 0, direction = '' }) {
    if (direction) {
        return db.prepare(`
            SELECT m.id, m.direction, m.body, m.status, m.provider_message_id, m.created_at,
                   c.phone_e164 AS contact_phone, c.name AS contact_name,
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
        SELECT m.id, m.direction, m.body, m.status, m.provider_message_id, m.created_at,
               c.phone_e164 AS contact_phone, c.name AS contact_name,
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
        SELECT c.id, c.name, c.status, c.category, c.message_body, c.created_at,
               (SELECT COUNT(*) FROM campaign_recipients cr WHERE cr.campaign_id = c.id) AS recipients_total,
               (SELECT COUNT(*) FROM campaign_recipients cr WHERE cr.campaign_id = c.id AND cr.status = 'sent') AS recipients_sent,
               (SELECT COUNT(*) FROM campaign_recipients cr WHERE cr.campaign_id = c.id AND cr.status = 'failed') AS recipients_failed,
               (SELECT COUNT(*) FROM campaign_recipients cr WHERE cr.campaign_id = c.id AND cr.status LIKE 'skipped%') AS recipients_skipped
        FROM campaigns c
        ORDER BY c.created_at DESC
        LIMIT ? OFFSET ?
    `).all(limit, offset);
}

export function listCampaignRecipients({ campaignId, limit = 50, offset = 0 }) {
    return db.prepare(`
        SELECT cr.id, cr.phone_e164, cr.status, cr.provider_message_id, cr.sent_at, cr.error_message, cr.created_at,
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
        SELECT o.id, o.phone_e164, o.reason, o.created_at, c.name AS contact_name
        FROM opt_outs o
        LEFT JOIN contacts c ON o.phone_e164 = c.phone_e164
        ORDER BY o.created_at DESC
        LIMIT ? OFFSET ?
    `).all(limit, offset);
}

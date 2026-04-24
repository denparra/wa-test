import 'dotenv/config';
import { timingSafeEqual } from 'crypto';
import express from 'express';
import twilio from 'twilio';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import {
    createCampaign,
    getAdminStats,
    getCampaignById,
    incrementCampaignSentCount,
    isOptedOut,
    insertMessage,
    insertOptOut,
    listCampaignRecipients,
    listCampaigns,
    listContacts,
    listMessages,
    listOptOuts,
    normalizePhone,
    upsertContact,
    getContactById,
    updateContact,
    deleteContact as dbDeleteContact,
    createContactWithVehicle,
    updateContactStatus,
    updateCampaignFull,
    pauseCampaign,
    cancelCampaign,
    resumeCampaign,
    deleteCampaign,
    updateCampaignStatus,
    setCampaignStatus,
    getCampaignProgress,
    listContactsByFilters,
    listVehicleContactsByFilters,
    listContactsForCampaign,
    listScheduledCampaignsDue,
    listCampaignsByStatus,
    listPendingRecipients,
    updateCampaignRecipientStatus,
    getContactWithVehicle,
    assignRecipientsToCampaign,
    listCampaignRecipientsByContacts,
    renderMessageTemplate,
    bulkImportContactsAndVehicles,
    listVehicleMakes,
    listContactsByMake,
    getVehiclesByContactId,
    updateOptOut,
    deleteOptOut,
    getOptOutByPhone,
    getCampaignFollowUpStats,
    listCampaignRecipientsWithReplies,
    getRecipientConversationHistory,
    createTemplate,
    listTemplates,
    getTemplateById,
    updateTemplate,
    deleteTemplate as dbDeleteTemplate,
    createSegment,
    listSegments,
    deleteSegment as dbDeleteSegment,
    updateMessageStatus
} from './db/index.js';
import {
    renderCampaignDetailPage,
    renderCampaignsPage,
    renderContactsPage,
    renderDashboardPage,
    renderMessagesPage,
    renderOptOutsPage,
    renderCampaignFormPage,
    renderImportPage,
    renderContactEditPage,
    renderContactCreatePage,
    renderOptOutEditPage,
    renderCampaignFollowUpPage,
    renderConversationPage,
    renderTemplatesPage,
    renderTemplateFormPage
} from './admin/pages.js';
import { sendOneRecipient } from './lib/twilio-sender.js';
import {
    activateWorkflowById,
    createWorkflow,
    deactivateWorkflowById,
    deleteWorkflowById,
    duplicateWorkflowById,
    getN8nConfigStatus,
    getWorkflowById,
    listWorkflows,
    updateWorkflowById
} from './lib/n8n-workflows.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Aviso temprano si faltan variables criticas (no aborta: permite levantar la UI
// admin aunque Twilio no este configurado para diagnosticar via /health).
const REQUIRED_ENV = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'MESSAGING_SERVICE_SID'];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length) {
    console.warn('[startup] Missing env vars (outbound messaging disabled):', missingEnv.join(', '));
}
if (!process.env.ADMIN_USER || !process.env.ADMIN_PASS) {
    console.warn('[startup] ADMIN_USER/ADMIN_PASS no configurados: /admin queda SIN autenticacion');
}

const n8nConfigStatus = getN8nConfigStatus();
if (!n8nConfigStatus.enabled) {
    console.warn('[startup] n8n API no configurada (admin n8n disabled):', n8nConfigStatus.missing.join(', '));
}

const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;
const SCHEDULER_INTERVAL_MS = Number(process.env.CAMPAIGN_SCHEDULER_INTERVAL_MS || 30000);
const SCHEDULER_BATCH_SIZE = Number(process.env.CAMPAIGN_SEND_BATCH_SIZE || 20);
const schedulerState = { running: false };
const STATUS_CALLBACK_URL = process.env.STATUS_CALLBACK_URL
    || (process.env.PUBLIC_BASE_URL ? `${process.env.PUBLIC_BASE_URL.replace(/\/$/, '')}/twilio/status-callback` : null);
const N8N_CHAT_WEBHOOK_URL = String(process.env.N8N_CHAT_WEBHOOK_URL || '').trim();
const HANDOFF_ACK_WINDOW_MS = 6 * 60 * 60 * 1000;
const recentHandoffByPhone = new Map();

if (!N8N_CHAT_WEBHOOK_URL) {
    console.warn('[startup] N8N_CHAT_WEBHOOK_URL no configurada: /twilio/inbound usara respuesta local fallback');
}

async function getN8nChatReply(payload) {
    if (!N8N_CHAT_WEBHOOK_URL) {
        return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);

    try {
        const response = await fetch(N8N_CHAT_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        const data = await response.json().catch(() => null);
        if (!response.ok || !data) {
            return null;
        }

        const replyText = String(data.reply_text || '').trim();
        if (!replyText) {
            return null;
        }

        return {
            replyText,
            needsHuman: Boolean(data.needs_human),
            handoffReason: String(data.handoff_reason || '').trim(),
            optoutRequested: Boolean(data.optout_requested)
        };
    } catch (error) {
        console.warn('[n8n-chat] error calling webhook:', error?.message || error);
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

function isPhaticAckMessage(text = '') {
    const normalized = String(text || '').toLowerCase().replace(/[!?.,;:]/g, '').trim();
    return /^(gracias|ok|oki|okey|dale|perfecto|listo|super|genial|buenisimo|de acuerdo)$/.test(normalized);
}

function normalizeIntentText(text = '') {
    return String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function getActiveHandoffState(phone = '') {
    if (!phone) {
        return null;
    }
    const state = recentHandoffByPhone.get(phone);
    if (!state) {
        return null;
    }
    if ((Date.now() - Number(state.handoffAt || 0)) > HANDOFF_ACK_WINDOW_MS) {
        recentHandoffByPhone.delete(phone);
        return null;
    }
    return state;
}

function markHandoffStarted(phone = '') {
    if (!phone) {
        return;
    }
    recentHandoffByPhone.set(phone, {
        handoffAt: Date.now(),
        ackCount: 0,
        lastAckAt: 0
    });
}

function incrementHandoffAck(phone = '') {
    const state = getActiveHandoffState(phone);
    if (!state) {
        return 0;
    }
    state.ackCount = Number(state.ackCount || 0) + 1;
    state.lastAckAt = Date.now();
    recentHandoffByPhone.set(phone, state);
    return state.ackCount;
}

function normalizeScheduledAt(value) {
    if (!value) {
        return null;
    }
    const trimmed = String(value).trim();
    if (!trimmed) {
        return null;
    }
    if (trimmed.includes('T')) {
        const normalized = trimmed.replace('T', ' ');
        return normalized.length === 16 ? `${normalized}:00` : normalized;
    }
    return trimmed;
}

function normalizeTemplateId(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function processCampaignQueue() {
    if (schedulerState.running) {
        return;
    }
    schedulerState.running = true;
    try {
        if (!twilioClient || !process.env.MESSAGING_SERVICE_SID) {
            return;
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

async function processCampaignSendBatch(campaign) {
    const recipients = listPendingRecipients({ campaignId: campaign.id, limit: SCHEDULER_BATCH_SIZE });
    if (!recipients.length) {
        updateCampaignStatus(campaign.id, 'completed');
        return;
    }

    for (const recipient of recipients) {
        await sendOneRecipient({
            recipient,
            campaign,
            twilioClient,
            messagingServiceSid: process.env.MESSAGING_SERVICE_SID,
            statusCallbackUrl: STATUS_CALLBACK_URL,
            contentSidFallback: process.env.CONTENT_SID
        });
    }
}


app.use(express.urlencoded({ extended: false })); // Twilio envia form-urlencoded

setInterval(processCampaignQueue, SCHEDULER_INTERVAL_MS);
processCampaignQueue();

app.use('/admin', adminAuth);

app.get('/admin', (req, res) => {
    const stats = getAdminStats();
    res.status(200).type('text/html').send(renderDashboardPage({ stats }));
});

app.get('/admin/contacts', (req, res) => {
    const { limit, offset } = getPaging(req);
    const query = String(req.query.q || '').trim();
    const make = String(req.query.make || '').trim();

    const makes = listVehicleMakes();
    const contacts = make
        ? listContactsByMake(make, { limit, offset })
        : listContacts({ limit, offset, query });

    res.status(200).type('text/html').send(renderContactsPage({
        contacts,
        makes,
        make,
        query,
        offset,
        limit
    }));
});

// GET /admin/contacts/:id/edit - Show edit form
app.get('/admin/contacts/:id/edit', adminAuth, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
        return res.status(400).send('Invalid contact ID');
    }

    const contact = getContactById(id);
    if (!contact) {
        return res.status(404).send('Contact not found');
    }

    const vehicles = getVehiclesByContactId(id);
    res.status(200).type('text/html').send(renderContactEditPage({ contact, vehicles }));
});

// POST /admin/contacts/:id - Update contact
app.post('/admin/contacts/:id', adminAuth, express.urlencoded({ extended: true }), (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
        return res.status(400).send('Invalid contact ID');
    }

    const { phone, name, status } = req.body;

    // Validate phone format (E.164)
    if (!phone || !phone.match(/^\+[1-9]\d{1,14}$/)) {
        const contact = getContactById(id);
        return res.status(400).type('text/html').send(
            renderContactEditPage({ contact, error: 'Invalid phone format. Must be E.164 format (e.g., +56975400946)' })
        );
    }

    // Validate status
    if (!['active', 'opted_out', 'invalid'].includes(status)) {
        const contact = getContactById(id);
        return res.status(400).type('text/html').send(
            renderContactEditPage({ contact, error: 'Invalid status value' })
        );
    }

    try {
        const updated = updateContact(id, { phone, name: name || null, status });
        if (!updated) {
            return res.status(500).send('Failed to update contact');
        }

        // Redirect back to contacts list
        res.redirect('/admin/contacts');
    } catch (error) {
        console.error('Contact update error:', error);
        const contact = getContactById(id);
        res.status(500).type('text/html').send(
            renderContactEditPage({ contact, error: error.message })
        );
    }
});

// DELETE /admin/api/contacts/:id - Delete contact via API
app.delete('/admin/api/contacts/:id', adminAuth, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
        return res.status(400).send('Invalid contact ID');
    }

    try {
        const deleted = dbDeleteContact(id);
        if (!deleted) {
            return res.status(404).send('Contact not found');
        }

        res.status(200).send('Contact deleted successfully');
    } catch (error) {
        console.error('Contact delete error:', error);
        res.status(500).send('Failed to delete contact: ' + error.message);
    }
});

// GET /admin/contacts/new - Show contact creation form
app.get('/admin/contacts/new', adminAuth, (req, res) => {
    res.status(200).type('text/html').send(renderContactCreatePage({ error: null }));
});

// POST /admin/contacts - Create new contact
app.post('/admin/contacts', adminAuth, express.urlencoded({ extended: true }), (req, res) => {
    const { phone, name, status, has_vehicle, make, model, year, price, link } = req.body;

    // Prepare contact data
    const contactData = {
        phone: phone?.trim(),
        name: name?.trim() || null,
        status: status || 'active'
    };

    // Prepare vehicle data if checkbox is checked
    let vehicleData = null;
    if (has_vehicle === 'on' || has_vehicle === 'true') {
        const trimmedMake = make?.trim();
        const trimmedModel = model?.trim();
        const parsedYear = parseInt(year);

        if (trimmedMake && trimmedModel && parsedYear) {
            vehicleData = {
                make: trimmedMake,
                model: trimmedModel,
                year: parsedYear,
                price: price ? parseFloat(price) : null,
                link: link?.trim() || null
            };
        }
    }

    try {
        const newContact = createContactWithVehicle(contactData, vehicleData);
        console.log('Contact created:', newContact);

        // Redirect to contacts list
        res.redirect('/admin/contacts');
    } catch (error) {
        console.error('Contact creation error:', error);
        res.status(400).type('text/html').send(
            renderContactCreatePage({
                error: error.message,
                formData: { phone, name, status, has_vehicle, make, model, year, price, link }
            })
        );
    }
});

app.get('/admin/messages', (req, res) => {
    const { limit, offset } = getPaging(req);
    const direction = String(req.query.direction || '').trim();
    const messages = listMessages({ limit, offset, direction });
    res.status(200).type('text/html').send(renderMessagesPage({
        messages,
        direction,
        offset,
        limit
    }));
});

app.get('/admin/campaigns', (req, res) => {
    const { limit, offset } = getPaging(req);
    const campaigns = listCampaigns({ limit, offset });
    res.status(200).type('text/html').send(renderCampaignsPage({
        campaigns,
        offset,
        limit
    }));
});

app.get('/admin/campaigns/new', (req, res) => {
    const makes = listVehicleMakes();
    const templates = listTemplates({ limit: 500, offset: 0, includeArchived: true });
    res.status(200).type('text/html').send(renderCampaignFormPage({ makes, templates }));
});

app.get('/admin/campaigns/:id/edit', (req, res) => {
    const id = Number(req.params.id);
    const campaign = getCampaignById(id);
    if (!campaign) {
        return res.status(404).send('Not found');
    }
    const makes = listVehicleMakes();
    const templates = listTemplates({ limit: 500, offset: 0, includeArchived: true });
    res.status(200).type('text/html').send(renderCampaignFormPage({ campaign, makes, templates }));
});

app.get('/admin/campaigns/:id', (req, res) => {
    const campaignId = Number(req.params.id);
    if (!Number.isInteger(campaignId)) {
        res.status(400).send('Invalid campaign id');
        return;
    }
    const campaign = getCampaignById(campaignId);
    if (!campaign) {
        res.status(404).send('Campaign not found');
        return;
    }
    const { limit, offset } = getPaging(req);
    const recipients = listCampaignRecipients({
        campaignId,
        limit,
        offset
    });
    res.status(200).type('text/html').send(renderCampaignDetailPage({
        campaign,
        recipients,
        offset,
        limit
    }));
});

// ============================================================
// Phase 1: Campaign Follow-Up Tracking Routes
// ============================================================

app.get('/admin/campaigns/:id/seguimiento', (req, res) => {
    const campaignId = Number(req.params.id);
    if (!Number.isInteger(campaignId)) {
        return res.status(400).send('Invalid campaign id');
    }

    const campaign = getCampaignById(campaignId);
    if (!campaign) {
        return res.status(404).send('Campaign not found');
    }

    const stats = getCampaignFollowUpStats(campaignId);
    const { limit, offset } = getPaging(req);
    const recipients = listCampaignRecipientsWithReplies(campaignId, { limit, offset });

    res.status(200).type('text/html').send(renderCampaignFollowUpPage({
        campaign,
        stats,
        recipients,
        offset,
        limit
    }));
});

app.get('/admin/campaigns/:id/conversation/:phone', (req, res) => {
    const campaignId = Number(req.params.id);
    const rawPhone = decodeURIComponent(req.params.phone);
    const normalizedPhone = normalizePhone(rawPhone);
    const phone = normalizedPhone || rawPhone;

    if (!Number.isInteger(campaignId)) {
        return res.status(400).send('Invalid campaign id');
    }

    const campaign = getCampaignById(campaignId);
    if (!campaign) {
        return res.status(404).send('Campaign not found');
    }

    const messages = getRecipientConversationHistory(phone, campaignId);
    const contact = normalizedPhone
        ? upsertContact(normalizedPhone, null)
        : upsertContact(phone, null); // Get contact info if exists

    res.status(200).type('text/html').send(renderConversationPage({
        campaign,
        phone,
        contactName: contact?.name || null,
        messages
    }));
});

app.get('/admin/opt-outs', (req, res) => {
    const { limit, offset } = getPaging(req);
    const optOuts = listOptOuts({ limit, offset });
    res.status(200).type('text/html').send(renderOptOutsPage({
        optOuts,
        offset,
        limit
    }));
});

app.get('/admin/import', adminAuth, (req, res) => {
    res.status(200).type('text/html').send(renderImportPage({}));
});

// Quick Win #7: CSV Export endpoints
app.get('/admin/export/contacts', adminAuth, (req, res) => {
    try {
        const contacts = listContacts({ limit: 10000, offset: 0 });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=contacts.csv');

        const csv = [
            'phone,name,status,created_at,updated_at',
            ...contacts.map(c =>
                `"${c.phone}","${(c.name || '').replace(/"/g, '""')}","${c.status}","${c.created_at}","${c.updated_at}"`
            )
        ].join('\n');

        res.send(csv);
    } catch (error) {
        console.error('Export contacts error:', error);
        res.status(500).send('Error exporting contacts');
    }
});

app.get('/admin/export/messages', adminAuth, (req, res) => {
    try {
        const messages = listMessages({ limit: 10000, offset: 0 });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=messages.csv');

        const csv = [
            'created_at,direction,phone,name,campaign,status,body',
            ...messages.map(m =>
                `"${m.created_at}","${m.direction}","${m.contact_phone}","${(m.contact_name || '').replace(/"/g, '""')}","${(m.campaign_name || '').replace(/"/g, '""')}","${m.status || ''}","${(m.body || '').replace(/"/g, '""')}"`
            )
        ].join('\n');

        res.send(csv);
    } catch (error) {
        console.error('Export messages error:', error);
        res.status(500).send('Error exporting messages');
    }
});

app.get('/admin/export/campaigns', adminAuth, (req, res) => {
    try {
        const campaigns = listCampaigns({ limit: 10000, offset: 0 });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=campaigns.csv');

        const csv = [
            'id,name,status,created_at,total_recipients,sent_count,failed_count,skipped_count,message_template',
            ...campaigns.map(c =>
                `"${c.id}","${(c.name || '').replace(/"/g, '""')}","${c.status}","${c.created_at}","${c.total_recipients || 0}","${c.sent_count || 0}","${c.recipients_failed || 0}","${c.recipients_skipped || 0}","${(c.message_template || '').replace(/"/g, '""')}"`
            )
        ].join('\n');

        res.send(csv);
    } catch (error) {
        console.error('Export campaigns error:', error);
        res.status(500).send('Error exporting campaigns');
    }
});

app.get('/admin/export/opt-outs', adminAuth, (req, res) => {
    try {
        const optOuts = listOptOuts({ limit: 10000, offset: 0 });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=opt-outs.csv');

        const csv = [
            'phone,name,reason,opted_out_at',
            ...optOuts.map(o =>
                `"${o.phone}","${(o.contact_name || '').replace(/"/g, '""')}","${o.reason || 'user_request'}","${o.created_at}"`
            )
        ].join('\n');

        res.send(csv);
    } catch (error) {
        console.error('Export opt-outs error:', error);
        res.status(500).send('Error exporting opt-outs');
    }
});

// POST /twilio/status-callback - Twilio status updates
app.post('/twilio/status-callback', express.urlencoded({ extended: true }), validateTwilioSignature, (req, res) => {
    const { MessageSid, MessageStatus, ErrorCode } = req.body;
    console.log(`STATUS-CALLBACK: ${MessageSid} -> ${MessageStatus} (Error: ${ErrorCode || 'none'})`);

    if (MessageSid) {
        updateMessageStatus(MessageSid, MessageStatus, ErrorCode);
    }

    res.status(200).send('OK');
});

// GET /admin/opt-outs/:phone/edit - Edit opt-out reason
app.get('/admin/opt-outs/:phone/edit', adminAuth, (req, res) => {
    const phone = req.params.phone; // Express decodes URL, so +56... comes as +56...
    const optOut = getOptOutByPhone(phone);

    if (!optOut) {
        // Try adding + if missing, sometimes browsers/proxies strip it or user typed without it
        // logic: if it doesn't start with +, try prepending it? 
        // Better: just strict match.
        return res.status(404).send('Opt-out not found');
    }

    res.status(200).type('text/html').send(renderOptOutEditPage({ optOut }));
});

// POST /admin/opt-outs/:phone - Update opt-out
app.post('/admin/opt-outs/:phone', adminAuth, express.urlencoded({ extended: true }), (req, res) => {
    const phone = req.params.phone;
    const { reason } = req.body;

    try {
        updateOptOut(phone, reason);
        res.redirect('/admin/opt-outs');
    } catch (error) {
        console.error('Opt-out update error:', error);
        const optOut = getOptOutByPhone(phone);
        res.status(500).type('text/html').send(renderOptOutEditPage({ optOut, error: error.message }));
    }
});

// DELETE /admin/api/opt-outs/:phone - Delete opt-out (Restores user to active technically if they were only blocked by this table)
// Note: Contacts table also has 'opted_out' status. We might want to ask if we should sync that?
// For now, this just deletes the record from opt_outs table. 
app.delete('/admin/api/opt-outs/:phone', adminAuth, (req, res) => {
    const phone = req.params.phone;
    try {
        deleteOptOut(phone);
        res.status(200).send('Opt-out deleted');
    } catch (error) {
        console.error('Opt-out delete error:', error);
        res.status(500).send('Failed to delete opt-out: ' + error.message);
    }
});

// GET /admin/api/contacts - JSON search
app.get('/admin/api/contacts', adminAuth, (req, res) => {
    try {
        const query = req.query.q || '';
        const limit = Math.min(Number(req.query.limit) || 20, 100);
        const contacts = listContacts({ query, limit });
        res.json({ contacts });
    } catch (error) {
        console.error('API contacts error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// Phase 2.2: Message Templates Routes
// ============================================================

// GET /admin/templates - List templates
app.get('/admin/templates', adminAuth, (req, res) => {
    const { limit, offset } = getPaging(req);
    const templates = listTemplates({ limit, offset });
    res.status(200).type('text/html').send(renderTemplatesPage({ templates, offset, limit }));
});

// GET /admin/templates/new - New template form
app.get('/admin/templates/new', adminAuth, (req, res) => {
    res.status(200).type('text/html').send(renderTemplateFormPage({}));
});

// GET /admin/templates/:id/edit - Edit template form
app.get('/admin/templates/:id/edit', adminAuth, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
        return res.status(400).send('Invalid template ID');
    }
    const template = getTemplateById(id);
    if (!template) {
        return res.status(404).send('Template not found');
    }
    res.status(200).type('text/html').send(renderTemplateFormPage({ template }));
});

// POST /admin/templates - Create template
app.post('/admin/templates', adminAuth, express.urlencoded({ extended: true }), (req, res) => {
    const { name, body, contentSid } = req.body;
    if (!name?.trim() || !body?.trim()) {
        return res.status(400).type('text/html').send(
            renderTemplateFormPage({ error: 'Nombre y mensaje son requeridos' })
        );
    }
    try {
        createTemplate({ name: name.trim(), body: body.trim(), contentSid: contentSid?.trim() || null });
        res.redirect('/admin/templates');
    } catch (error) {
        console.error('Template create error:', error);
        res.status(500).type('text/html').send(
            renderTemplateFormPage({ error: error.message })
        );
    }
});

// POST /admin/templates/:id - Update template
app.post('/admin/templates/:id', adminAuth, express.urlencoded({ extended: true }), (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
        return res.status(400).send('Invalid template ID');
    }
    const { name, body, contentSid, isActive } = req.body;
    if (!name?.trim() || !body?.trim()) {
        const template = getTemplateById(id);
        return res.status(400).type('text/html').send(
            renderTemplateFormPage({ template, error: 'Nombre y mensaje son requeridos' })
        );
    }
    try {
        const updated = updateTemplate(id, {
            name: name.trim(),
            body: body.trim(),
            contentSid: contentSid?.trim() || null,
            isActive: isActive === '1' || isActive === 'on'
        });
        if (!updated) {
            return res.status(404).send('Template not found');
        }
        res.redirect('/admin/templates');
    } catch (error) {
        console.error('Template update error:', error);
        const template = getTemplateById(id);
        res.status(500).type('text/html').send(
            renderTemplateFormPage({ template, error: error.message })
        );
    }
});

// DELETE /admin/api/templates/:id - Delete template
app.delete('/admin/api/templates/:id', adminAuth, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
        return res.status(400).send('Invalid template ID');
    }
    try {
        const deleted = dbDeleteTemplate(id);
        if (!deleted) {
            return res.status(404).send('Template not found');
        }
        res.status(200).send('Template deleted');
    } catch (error) {
        console.error('Template delete error:', error);
        res.status(500).send('Failed to delete template: ' + error.message);
    }
});

// GET /admin/api/templates - JSON list for campaign form dropdown
app.get('/admin/api/templates', adminAuth, (req, res) => {
    try {
        const templates = listTemplates({ limit: 100, offset: 0 });
        res.json({ templates });
    } catch (error) {
        console.error('API templates error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// Phase 2.3: Segments Routes
// ============================================================

// GET /admin/api/segments - JSON list for dropdown
app.get('/admin/api/segments', adminAuth, (req, res) => {
    try {
        const segments = listSegments();
        res.json({ segments });
    } catch (error) {
        console.error('API segments error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /admin/api/segments - Create segment
app.post('/admin/api/segments', adminAuth, express.json(), (req, res) => {
    const { name, filters } = req.body;
    if (!name?.trim()) {
        return res.status(400).json({ error: 'Name is required' });
    }
    try {
        const segment = createSegment(name.trim(), filters);
        res.json({ segment });
    } catch (error) {
        console.error('Segment create error:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /admin/api/segments/:id - Delete segment
app.delete('/admin/api/segments/:id', adminAuth, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
        return res.status(400).json({ error: 'Invalid segment ID' });
    }
    try {
        const deleted = dbDeleteSegment(id);
        if (!deleted) {
            return res.status(404).json({ error: 'Segment not found' });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Segment delete error:', error);
        res.status(500).json({ error: error.message });
    }
});


// ============================================================
// CSV Import Routes
// ============================================================

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

app.post('/admin/import/upload', adminAuth, upload.single('csvFile'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send('No file uploaded');
        }

        // Parse CSV with BOM handling
        const csvContent = req.file.buffer.toString('utf8').replace(/^\uFEFF/, '');

        let records;
        try {
            records = parse(csvContent, {
                columns: true,
                skip_empty_lines: true,
                trim: true,
                bom: true,
                relax_column_count: true
            });
        } catch (parseError) {
            return res.status(400).send(`Error al parsear CSV: ${parseError.message}`);
        }

        if (records.length === 0) {
            return res.status(400).send('El archivo CSV está vacío');
        }

        if (records.length > 5000) {
            return res.status(400).send('Máximo 5000 registros por importación');
        }

        // Validate headers (case-insensitive)
        const firstRecord = records[0];
        const headers = Object.keys(firstRecord).map(h => h.toLowerCase());
        const requiredHeaders = ['telefono', 'nombre', 'marca', 'modelo', 'año', 'precio', 'link'];
        const headerMap = {};

        // Build case-insensitive header mapping
        for (const required of requiredHeaders) {
            const found = headers.find(h => h === required || h === required.replace(/ñ/g, 'n'));
            if (!found) {
                return res.status(400).send(`Falta columna requerida: ${required}`);
            }
            // Find original casing
            headerMap[required] = Object.keys(firstRecord).find(k => k.toLowerCase() === found);
        }

        // Map optional columns (no error if absent)
        for (const opt of ['origen', 'id_origen']) {
            const found = headers.find(h => h === opt);
            headerMap[opt] = found ? Object.keys(firstRecord).find(k => k.toLowerCase() === found) : null;
        }

        const valid = [];
        const invalid = [];

        records.forEach((row, index) => {
            const rowNum = index + 2; // +2 because index is 0-based and row 1 is headers
            const errors = [];

            // Extract values using header mapping
            const phone = String(row[headerMap.telefono] || '').trim();
            const name = String(row[headerMap.nombre] || '').trim();
            const make = String(row[headerMap.marca] || '').trim();
            const model = String(row[headerMap.modelo] || '').trim();
            const yearRaw = String(row[headerMap['año']] || row[headerMap.ano] || '').trim();
            const priceRaw = String(row[headerMap.precio] || '').trim();
            const link = String(row[headerMap.link] || '').trim();
            const origin = headerMap.origen ? String(row[headerMap.origen] || '').trim() : '';
            const externalId = headerMap.id_origen ? String(row[headerMap.id_origen] || '').trim() : '';

            // Validate phone
            if (!phone) {
                errors.push('Teléfono vacío');
            }

            // Normalize phone to E.164
            let normalizedPhone = '';
            if (phone) {
                normalizedPhone = normalizePhone(phone);
                if (!normalizedPhone) {
                    errors.push('Teléfono inválido');
                } else if (!normalizedPhone.match(/^\+\d{8,15}$/)) {
                    errors.push('Formato de teléfono inválido (debe ser E.164)');
                }
            }

            // Validate make, model
            if (!make) {
                errors.push('Marca vacía');
            }
            if (!model) {
                errors.push('Modelo vacío');
            }

            // Validate year
            const year = Number(yearRaw);
            if (!yearRaw || isNaN(year) || year < 1900 || year > new Date().getFullYear() + 2) {
                errors.push('Año inválido');
            }

            // Validate price (optional but must be numeric if present)
            let price = null;
            if (priceRaw) {
                price = Number(priceRaw);
                if (isNaN(price) || price < 0) {
                    errors.push('Precio inválido');
                }
            }

            // Validate link (optional but must be non-empty if present)
            if (link && link.length < 5) {
                errors.push('Link demasiado corto');
            }

            if (errors.length > 0) {
                invalid.push({
                    row: rowNum,
                    phone,
                    name,
                    error: errors.join(', ')
                });
            } else {
                valid.push({
                    row: rowNum,
                    phone: normalizedPhone,
                    name: name || null,
                    make,
                    model,
                    year,
                    price,
                    link: link || null,
                    origin: origin || null,
                    external_id: externalId || null
                });
            }
        });

        res.status(200).type('text/html').send(renderImportPage({
            preview: { valid, invalid }
        }));

    } catch (error) {
        console.error('CSV upload error:', error);
        res.status(500).send(`Error al procesar CSV: ${error.message}`);
    }
});

app.post('/admin/import/confirm', adminAuth, express.urlencoded({ extended: false, limit: '50mb' }), (req, res) => {
    try {
        const csvData = req.body.csvData;
        if (!csvData) {
            return res.status(400).send('No hay datos para importar');
        }

        let records;
        try {
            records = JSON.parse(csvData);
        } catch (parseError) {
            return res.status(400).send('Datos inválidos');
        }

        if (!Array.isArray(records) || records.length === 0) {
            return res.status(400).send('No hay registros válidos');
        }

        // Execute bulk import with transaction
        const result = bulkImportContactsAndVehicles(records);

        res.status(200).type('text/html').send(renderImportPage({ result }));

    } catch (error) {
        console.error('CSV confirm error:', error);
        res.status(500).send(`Error al importar datos: ${error.message}`);
    }
});

// ============================================================
// Campaign Management API
// ============================================================

app.post('/admin/api/campaigns', adminAuth, express.json(), (req, res) => {
    try {
        const { name, messageTemplate, type, scheduledAt, contentSid, templateId, filters, recipientIds, isTest } = req.body;
        const normalizedScheduledAt = normalizeScheduledAt(scheduledAt);
        const status = normalizedScheduledAt ? 'scheduled' : 'draft';
        const normalizedTemplateId = normalizeTemplateId(templateId);

        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }

        let resolvedTemplate = null;
        if (normalizedTemplateId) {
            resolvedTemplate = getTemplateById(normalizedTemplateId);
            if (!resolvedTemplate) {
                return res.status(400).json({ error: 'Template not found' });
            }
        }

        const normalizedType = type || 'twilio_template';
        let resolvedMessageTemplate = messageTemplate || null;
        let resolvedContentSid = contentSid || null;

        if (resolvedTemplate) {
            resolvedMessageTemplate = resolvedTemplate.body || resolvedMessageTemplate;
            resolvedContentSid = resolvedTemplate.content_sid || resolvedContentSid;
        }

        if (normalizedType === 'twilio_template' && !String(resolvedContentSid || '').trim()) {
            return res.status(400).json({ error: 'Twilio template requires content SID or selected template' });
        }

        const campaign = createCampaign({
            name,
            messageTemplate: resolvedMessageTemplate,
            type: normalizedType,
            scheduledAt: normalizedScheduledAt,
            templateId: normalizedTemplateId,
            contentSid: resolvedContentSid,
            filters,
            status,
            isTest: Boolean(isTest)
        });

        // Assign recipients if provided
        if (recipientIds && Array.isArray(recipientIds) && recipientIds.length > 0) {
            assignRecipientsToCampaign(campaign.id, recipientIds);
        }

        res.status(201).json(campaign);
    } catch (error) {
        console.error('Create campaign error:', error);
        res.status(500).json({ error: 'Failed to create campaign' });
    }
});

app.patch('/admin/api/campaigns/:id', adminAuth, express.json(), (req, res) => {
    try {
        const id = Number(req.params.id);
        const updates = req.body || {};
        const current = getCampaignById(id);
        if (!current) {
            return res.status(404).json({ error: 'Campaign not found' });
        }

        const hasScheduledAt = Object.prototype.hasOwnProperty.call(updates, 'scheduledAt')
            || Object.prototype.hasOwnProperty.call(updates, 'scheduled_at');
        const hasTemplateId = Object.prototype.hasOwnProperty.call(updates, 'templateId');
        const normalizedScheduledAt = hasScheduledAt
            ? normalizeScheduledAt(updates.scheduledAt || updates.scheduled_at)
            : current.scheduled_at;

        const normalizedTemplateId = hasTemplateId
            ? normalizeTemplateId(updates.templateId)
            : current.template_id;

        let resolvedTemplate = null;
        if (normalizedTemplateId) {
            resolvedTemplate = getTemplateById(normalizedTemplateId);
            if (!resolvedTemplate) {
                return res.status(400).json({ error: 'Template not found' });
            }
        }

        const nextType = updates.type ?? current.type;
        let resolvedMessageTemplate = updates.messageTemplate ?? current.message_template;
        let resolvedContentSid = updates.contentSid ?? current.content_sid;

        if (resolvedTemplate) {
            resolvedMessageTemplate = resolvedTemplate.body || resolvedMessageTemplate;
            resolvedContentSid = resolvedTemplate.content_sid || resolvedContentSid;
        }

        if (nextType === 'twilio_template' && !String(resolvedContentSid || '').trim()) {
            return res.status(400).json({ error: 'Twilio template requires content SID or selected template' });
        }

        const payload = {
            name: updates.name ?? current.name,
            messageTemplate: resolvedMessageTemplate,
            type: nextType,
            scheduledAt: normalizedScheduledAt,
            templateId: normalizedTemplateId,
            contentSid: resolvedContentSid,
            filters: updates.filters ?? current.filters
        };

        let campaign = updateCampaignFull(id, payload);

        if (hasScheduledAt && normalizedScheduledAt && current.status === 'draft') {
            campaign = setCampaignStatus(id, 'scheduled') || campaign;
        }
        if (hasScheduledAt && !normalizedScheduledAt && current.status === 'scheduled') {
            campaign = setCampaignStatus(id, 'draft') || campaign;
        }

        if (updates.status) {
            if (updates.status === 'sending') {
                campaign = setCampaignStatus(id, 'sending') || campaign;
            } else if (updates.status === 'scheduled') {
                campaign = setCampaignStatus(id, 'scheduled') || campaign;
            } else {
                campaign = updateCampaignStatus(id, updates.status) || campaign;
            }
        }

        res.json(campaign);
    } catch (error) {
        console.error('Update campaign error:', error);
        res.status(500).json({ error: 'Failed to update campaign' });
    }
});

app.post('/admin/api/campaigns/:id/pause', adminAuth, (req, res) => {
    try {
        const id = Number(req.params.id);
        const campaign = pauseCampaign(id);
        if (!campaign) {
            // Could mean not found OR not in 'sending' status
            return res.status(400).json({ error: 'Campaign not found or not in sending state' });
        }
        res.json(campaign);
    } catch (error) {
        console.error('Pause campaign error:', error);
        res.status(500).json({ error: 'Failed to pause campaign' });
    }
});

app.post('/admin/api/campaigns/:id/cancel', adminAuth, (req, res) => {
    try {
        const id = Number(req.params.id);
        const campaign = cancelCampaign(id);
        if (!campaign) {
            return res.status(400).json({ error: 'Campaign not found or cannot be cancelled' });
        }
        res.json(campaign);
    } catch (error) {
        console.error('Cancel campaign error:', error);
        res.status(500).json({ error: 'Failed to cancel campaign' });
    }
});

app.post('/admin/api/campaigns/:id/start', adminAuth, (req, res) => {
    try {
        const id = Number(req.params.id);
        const current = getCampaignById(id);
        if (!current || !['draft', 'scheduled', 'paused'].includes(current.status)) {
            return res.status(400).json({ error: 'Campaign not found or cannot be started' });
        }
        const campaign = setCampaignStatus(id, 'sending');
        processCampaignQueue();
        res.json(campaign);
    } catch (error) {
        console.error('Start campaign error:', error);
        res.status(500).json({ error: 'Failed to start campaign' });
    }
});

app.post('/admin/api/campaigns/:id/resume', adminAuth, (req, res) => {
    try {
        const id = Number(req.params.id);
        const campaign = resumeCampaign(id);
        if (!campaign) {
            return res.status(400).json({ error: 'Campaign not found or cannot be resumed' });
        }
        processCampaignQueue();
        res.json(campaign);
    } catch (error) {
        console.error('Resume campaign error:', error);
        res.status(500).json({ error: 'Failed to resume campaign' });
    }
});

app.delete('/admin/api/campaigns/:id', adminAuth, (req, res) => {
    try {
        const id = Number(req.params.id);
        const deleted = deleteCampaign(id);
        if (!deleted) {
            return res.status(404).json({ error: 'Campaign not found' });
        }
        res.status(204).send();
    } catch (error) {
        console.error('Delete campaign error:', error);
        res.status(500).json({ error: 'Failed to delete campaign' });
    }
});

app.get('/admin/api/campaigns/:id/progress', adminAuth, (req, res) => {
    try {
        const id = Number(req.params.id);
        const progress = getCampaignProgress(id);
        if (!progress) {
            return res.status(404).json({ error: 'Campaign not found' });
        }
        res.json(progress);
    } catch (error) {
        console.error('Progress error:', error);
        res.status(500).json({ error: 'Failed to get progress' });
    }
});

// ============================================================
// Phase 1: Campaign Follow-Up Tracking API Endpoints
// ============================================================

app.get('/admin/api/campaigns/:id/follow-up-stats', adminAuth, (req, res) => {
    try {
        const id = Number(req.params.id);
        const stats = getCampaignFollowUpStats(id);
        if (!stats) {
            return res.status(404).json({ error: 'Campaign not found' });
        }
        res.json(stats);
    } catch (error) {
        console.error('Follow-up stats error:', error);
        res.status(500).json({ error: 'Failed to get follow-up stats' });
    }
});

app.get('/admin/api/campaigns/:id/recipients-with-replies', adminAuth, (req, res) => {
    try {
        const id = Number(req.params.id);
        const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 100));
        const offset = Math.max(0, Number(req.query.offset) || 0);

        const recipients = listCampaignRecipientsWithReplies(id, { limit, offset });
        res.json({ recipients, limit, offset });
    } catch (error) {
        console.error('Recipients with replies error:', error);
        res.status(500).json({ error: 'Failed to get recipients' });
    }
});

app.get('/admin/api/campaigns/:id/conversation/:phone', adminAuth, (req, res) => {
    try {
        const id = Number(req.params.id);
        const rawPhone = decodeURIComponent(req.params.phone);
        const normalizedPhone = normalizePhone(rawPhone);
        const phone = normalizedPhone || rawPhone;

        const messages = getRecipientConversationHistory(phone, id);
        res.json({ messages, phone, campaign_id: id });
    } catch (error) {
        console.error('Conversation history error:', error);
        res.status(500).json({ error: 'Failed to get conversation history' });
    }
});

// JSON endpoint para selector de contactos en formulario de campana.
// Nota: la URL anterior (GET /admin/contacts) colisionaba con la ruta HTML; ningun
// frontend usaba esta respuesta JSON (el selector consume /admin/api/contacts).
// Se mantiene bajo un path dedicado para callers futuros de listContactsForCampaign.
app.get('/admin/api/contacts/for-campaign', adminAuth, (req, res) => {
    try {
        const query = String(req.query.q || '').trim();
        const limitRaw = Number(req.query.limit || 200);
        const limit = Math.max(1, Math.min(limitRaw || 200, 1000));
        const contacts = listContactsForCampaign({ query, limit });
        res.json({ contacts });
    } catch (error) {
        console.error('List contacts error:', error);
        res.status(500).json({ error: 'Failed to list contacts' });
    }
});

app.post('/admin/api/campaigns/:id/assign-recipients', adminAuth, express.json(), (req, res) => {
    try {
        const id = Number(req.params.id);
        const { source = 'vehicles', filters = {}, query = '' } = req.body || {};
        const search = query || filters.query || '';

        const candidates = source === 'contacts'
            ? listContactsForCampaign({ query: search, limit: 10000 })
            : listContactsByFilters({ ...filters, limit: 10000 });
        const count = assignRecipientsToCampaign(id, candidates.map(c => c.id));

        res.json({ assigned: count, totalRecipients: count });
    } catch (error) {
        console.error('Assign recipients error:', error);
        res.status(500).json({ error: 'Failed to assign recipients' });
    }
});

app.post('/admin/api/campaigns/:id/test-send', adminAuth, express.json(), async (req, res) => {
    try {
        if (!twilioClient || !process.env.MESSAGING_SERVICE_SID) {
            return res.status(500).json({ error: 'Twilio not configured' });
        }

        const id = Number(req.params.id);
        if (!Number.isInteger(id)) {
            return res.status(400).json({ error: 'Invalid campaign id' });
        }

        const campaign = getCampaignById(id);
        if (!campaign) {
            return res.status(404).json({ error: 'Campaign not found' });
        }

        const contactIdsRaw = Array.isArray(req.body?.contactIds) ? req.body.contactIds : [];
        const contactIds = [...new Set(contactIdsRaw.map(Number).filter(Number.isInteger))];
        if (!contactIds.length) {
            return res.status(400).json({ error: 'No contacts selected' });
        }

        const hasBody = String(campaign.message_template || '').trim();
        const hasContentSid = String(campaign.content_sid || process.env.CONTENT_SID || '').trim();
        if (!hasBody && !hasContentSid) {
            return res.status(400).json({ error: 'Missing template or content SID' });
        }

        assignRecipientsToCampaign(id, contactIds);
        const recipients = listCampaignRecipientsByContacts(id, contactIds);
        if (!recipients.length) {
            return res.status(400).json({ error: 'No recipients available' });
        }

        const results = { total: recipients.length, sent: 0, skipped: 0, failed: 0 };
        console.log(`TEST-SEND: campaign=${id} recipients=${recipients.length}`);

        for (const recipient of recipients) {
            if (recipient.status && recipient.status !== 'pending') {
                results.skipped += 1;
                continue;
            }

            const result = await sendOneRecipient({
                recipient,
                campaign,
                twilioClient,
                messagingServiceSid: process.env.MESSAGING_SERVICE_SID,
                statusCallbackUrl: STATUS_CALLBACK_URL,
                contentSidFallback: process.env.CONTENT_SID
            });

            if (result.outcome === 'sent') {
                results.sent += 1;
            } else if (result.outcome === 'skipped') {
                results.skipped += 1;
            } else {
                results.failed += 1;
                console.warn(`TEST-SEND: recipient=${recipient.id} failed reason=${result.reason}`);
            }
        }

        console.log('TEST-SEND: completed', results);
        res.json(results);
    } catch (error) {
        console.error('TEST-SEND: Fatal error:', error);
        res.status(500).json({ error: 'Failed to send test messages', details: error.message });
    }
});

app.post('/admin/api/campaigns/preview', adminAuth, express.json(), (req, res) => {
    try {
        const { template, variableSource } = req.body;
        // variableSource could be a contact object or mock data
        const rendered = renderMessageTemplate(template, variableSource);
        res.json({ preview: rendered });
    } catch (error) {
        res.status(500).json({ error: 'Preview failed' });
    }
});

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

// ============================================================
// n8n Workflows API (generic integration)
// ============================================================

function handleN8nApiError(res, error, defaultMessage) {
    const message = error?.message || defaultMessage;
    const statusCodeMatch = String(message).match(/\((\d{3})\)/);
    const statusCode = statusCodeMatch ? Number(statusCodeMatch[1]) : 500;
    const safeStatus = Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599 ? statusCode : 500;
    return res.status(safeStatus).json({ error: message });
}

app.get('/admin/api/n8n/status', adminAuth, (req, res) => {
    const status = getN8nConfigStatus();
    res.json({
        enabled: status.enabled,
        missing: status.missing,
        baseUrl: status.baseUrl || null
    });
});

app.get('/admin/api/n8n/workflows', adminAuth, async (req, res) => {
    try {
        const workflows = await listWorkflows();
        res.json({ workflows, total: workflows.length });
    } catch (error) {
        console.error('N8N list workflows error:', error);
        handleN8nApiError(res, error, 'Failed to list workflows');
    }
});

app.get('/admin/api/n8n/workflows/:id', adminAuth, async (req, res) => {
    try {
        const workflow = await getWorkflowById(req.params.id);
        res.json({ workflow });
    } catch (error) {
        console.error('N8N get workflow error:', error);
        handleN8nApiError(res, error, 'Failed to get workflow');
    }
});

app.post('/admin/api/n8n/workflows', adminAuth, express.json({ limit: '5mb' }), async (req, res) => {
    try {
        const workflow = req.body?.workflow || req.body;
        if (!workflow || typeof workflow !== 'object') {
            return res.status(400).json({ error: 'workflow object is required' });
        }
        const created = await createWorkflow(workflow);
        res.status(201).json({ workflow: created });
    } catch (error) {
        console.error('N8N create workflow error:', error);
        handleN8nApiError(res, error, 'Failed to create workflow');
    }
});

app.put('/admin/api/n8n/workflows/:id', adminAuth, express.json({ limit: '5mb' }), async (req, res) => {
    try {
        const workflow = req.body?.workflow || req.body;
        if (!workflow || typeof workflow !== 'object') {
            return res.status(400).json({ error: 'workflow object is required' });
        }
        const updated = await updateWorkflowById(req.params.id, workflow);
        res.json({ workflow: updated });
    } catch (error) {
        console.error('N8N update workflow error:', error);
        handleN8nApiError(res, error, 'Failed to update workflow');
    }
});

app.delete('/admin/api/n8n/workflows/:id', adminAuth, async (req, res) => {
    try {
        const result = await deleteWorkflowById(req.params.id);
        res.json({ success: true, result: result || null });
    } catch (error) {
        console.error('N8N delete workflow error:', error);
        handleN8nApiError(res, error, 'Failed to delete workflow');
    }
});

app.post('/admin/api/n8n/workflows/:id/activate', adminAuth, async (req, res) => {
    try {
        const workflow = await activateWorkflowById(req.params.id);
        res.json({ workflow: workflow || null, success: true });
    } catch (error) {
        console.error('N8N activate workflow error:', error);
        handleN8nApiError(res, error, 'Failed to activate workflow');
    }
});

app.post('/admin/api/n8n/workflows/:id/deactivate', adminAuth, async (req, res) => {
    try {
        const workflow = await deactivateWorkflowById(req.params.id);
        res.json({ workflow: workflow || null, success: true });
    } catch (error) {
        console.error('N8N deactivate workflow error:', error);
        handleN8nApiError(res, error, 'Failed to deactivate workflow');
    }
});

app.post('/admin/api/n8n/workflows/:id/duplicate', adminAuth, express.json(), async (req, res) => {
    try {
        const duplicated = await duplicateWorkflowById(req.params.id, {
            name: req.body?.name,
            suffix: req.body?.suffix,
            activate: req.body?.activate === true
        });
        res.status(201).json({ workflow: duplicated });
    } catch (error) {
        console.error('N8N duplicate workflow error:', error);
        handleN8nApiError(res, error, 'Failed to duplicate workflow');
    }
});

// ============================================================
// Webhooks
// ============================================================
app.post('/twilio/inbound', validateTwilioSignature, async (req, res) => {
    const from = req.body.From;            // "whatsapp:+569..."
    const body = (req.body.Body || '').trim(); // texto del usuario

    const phone = normalizePhone(from); // Renamed internal var for clarity, though not strictly required
    const normalizedBody = normalizeIntentText(body);
    const upper = body.toUpperCase();

    // Quick Win #8: Expanded opt-out keywords for better compliance
    const OPTOUT_KEYWORDS = ['baja', 'stop', 'unsubscribe', 'cancelar', 'remover', 'salir'];
    const OPTOUT_PHRASES = [
        /\bno me (escriban|escribas|contacten|contactes|llamen|llames)\b/,
        /\b(sacame|saquenme|eliminame|borrame)\b/,
        /\b(sacar|eliminar|borrar)me de (la )?lista\b/,
        /\bno quiero (recibir|mas mensajes|mas whatsapp)\b/,
        /\bdame de baja\b/
    ];
    const isKeywordOptOut = OPTOUT_KEYWORDS.some((kw) => normalizedBody.includes(kw));
    const isPhraseOptOut = OPTOUT_PHRASES.some((pattern) => pattern.test(normalizedBody));
    const isMenuOptOut = normalizedBody === '3';
    const isBaja = isKeywordOptOut || isPhraseOptOut || isMenuOptOut;

    // Respuesta local fallback
    let reply = 'Gracias por escribir a Queirolo Autos. Responde:\n1) Me interesa consignar\n2) Quiero mas info\n3) BAJA';


    if (isBaja) {
        reply = '✅ Confirmado: Tu número ha sido dado de baja. No recibirás más mensajes de Queirolo Autos.';
    } else if (upper === '1' || upper.includes('CONSIGN')) {
        reply = 'Perfecto. Para avanzar, dime: Marca, Modelo, Ano y Comuna.';
    } else if (upper === '2' || upper.includes('INFO')) {
        reply = 'Genial. Te cuento: consignamos, publicamos y gestionamos todo. Quieres que te llame un ejecutivo? (SI/NO)';
    }

    // Si no es BAJA, intentamos respuesta IA via n8n (modo webhook bridge).
    if (!isBaja) {
        const handoffState = phone ? getActiveHandoffState(phone) : null;
        const isPhaticAck = isPhaticAckMessage(body);
        let bypassAiForAck = false;

        if (handoffState && isPhaticAck) {
            const ackCount = incrementHandoffAck(phone);
            if (ackCount === 1) {
                reply = 'Perfecto, quedaste derivado. Te contactamos en 15-30 min.';
            } else if (ackCount === 2) {
                reply = 'Listo 👍';
            } else {
                reply = '';
            }
            bypassAiForAck = true;
        }

        if (!bypassAiForAck) {
            const aiResult = await getN8nChatReply({
                source: 'twilio',
                phone,
                message_text: body,
                message_sid: req.body.MessageSid || null,
                received_at: new Date().toISOString(),
                context: {
                    is_opted_out: phone ? isOptedOut(phone) : false,
                    campaign_id: null
                }
            });

            if (aiResult?.replyText) {
                reply = aiResult.replyText;
            }

            if (aiResult?.optoutRequested && phone) {
                try {
                    insertOptOut(phone, 'user_request_ai');
                    updateContactStatus(phone, 'opted_out');
                    reply = '✅ Confirmado: Tu número ha sido dado de baja. No recibirás más mensajes de Queirolo Autos.';
                } catch (error) {
                    console.warn('Opt-out from AI response failed:', error?.message || error);
                }
            }

            if (aiResult?.needsHuman) {
                markHandoffStarted(phone);
                console.log('INBOUND-HANDOFF:', {
                    from: maskPhone(phone),
                    reason: aiResult.handoffReason || 'unspecified'
                });
            }
        }
    }

    try {
        if (phone) {
            const contact = upsertContact(phone, null);
            insertMessage({
                contactId: contact?.id || null,
                campaignId: null,
                direction: 'inbound',
                phone: phone, // NEW REQUIRED FIELD
                body,
                messageSid: req.body.MessageSid || null, // RENAMED
                status: 'received'
            });

            if (reply) {
                insertMessage({
                    contactId: contact?.id || null,
                    campaignId: null,
                    direction: 'outbound',
                    phone,
                    body: reply,
                    messageSid: null,
                    status: 'sent'
                });
            }

            if (isBaja) {
                insertOptOut(phone, 'user_request');
                updateContactStatus(phone, 'opted_out');
            }
        }
    } catch (error) {
        console.error('DB error (inbound):', error?.message || error);
    }

    console.log('INBOUND:', {
        from: maskPhone(phone),
        bodyLength: body.length,
        isBaja
    });

    const twimlMessage = reply
        ? `<Message>${escapeXml(reply)}</Message>`
        : '';

    res
        .status(200)
        .type('text/xml')
        .send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${twimlMessage}
</Response>`);
});

function escapeXml(str = '') {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function maskPhone(phone = '') { // RENAMED arg
    if (!phone) {
        return '';
    }
    const visible = phone.slice(-4);
    return `${phone.slice(0, Math.max(0, phone.length - 4)).replace(/\d/g, '*')}${visible}`;
}

// Valida la firma X-Twilio-Signature para prevenir POSTs falsificados al webhook.
// OPT-IN: se activa solo con TWILIO_VALIDATE_SIGNATURE=true + PUBLIC_BASE_URL
// definido (ambos requeridos; si faltan se deja pasar para no romper produccion).
function validateTwilioSignature(req, res, next) {
    if (process.env.TWILIO_VALIDATE_SIGNATURE !== 'true') {
        return next();
    }
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const baseUrl = process.env.PUBLIC_BASE_URL;
    if (!authToken || !baseUrl) {
        console.warn('[twilio] signature validation enabled pero falta PUBLIC_BASE_URL o TWILIO_AUTH_TOKEN; skip');
        return next();
    }
    const signature = req.headers['x-twilio-signature'];
    if (!signature) {
        return res.status(403).send('Missing Twilio signature');
    }
    const url = `${baseUrl.replace(/\/$/, '')}${req.originalUrl}`;
    const valid = twilio.validateRequest(authToken, signature, url, req.body || {});
    if (!valid) {
        console.warn('[twilio] Invalid signature for', req.originalUrl, 'from', req.ip);
        return res.status(403).send('Invalid Twilio signature');
    }
    return next();
}

function safeEqual(a, b) {
    const bufA = Buffer.from(String(a), 'utf8');
    const bufB = Buffer.from(String(b), 'utf8');
    if (bufA.length !== bufB.length) {
        return false;
    }
    return timingSafeEqual(bufA, bufB);
}

function adminAuth(req, res, next) {
    const user = process.env.ADMIN_USER;
    const pass = process.env.ADMIN_PASS;
    if (!user || !pass) {
        return next();
    }
    const header = req.headers.authorization || '';
    if (!header.startsWith('Basic ')) {
        res.set('WWW-Authenticate', 'Basic realm="Admin"');
        return res.status(401).send('Auth required');
    }
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    const providedUser = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : decoded;
    const providedPass = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : '';
    if (!safeEqual(providedUser, user) || !safeEqual(providedPass, pass)) {
        res.set('WWW-Authenticate', 'Basic realm="Admin"');
        return res.status(401).send('Invalid credentials');
    }
    return next();
}

function getPaging(req) {
    const limitRaw = Number.parseInt(req.query.limit, 10);
    const offsetRaw = Number.parseInt(req.query.offset, 10);
    const limit = Number.isNaN(limitRaw) ? 50 : Math.min(Math.max(limitRaw, 1), 200);
    const offset = Number.isNaN(offsetRaw) ? 0 : Math.max(offsetRaw, 0);
    return { limit, offset };
}


// Quick Win #2: Enhanced health endpoint with basic metrics
app.get('/health', (req, res) => {
    try {
        const stats = getAdminStats();
        const uptime = process.uptime();
        const memoryUsage = process.memoryUsage();

        const healthData = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: Math.floor(uptime),
            memory: {
                rss: Math.floor(memoryUsage.rss / 1024 / 1024),
                heapUsed: Math.floor(memoryUsage.heapUsed / 1024 / 1024),
                heapTotal: Math.floor(memoryUsage.heapTotal / 1024 / 1024)
            },
            database: {
                contacts: stats.contacts,
                messages: stats.messages,
                campaigns: stats.campaigns,
                optOuts: stats.optOuts
            }
        };

        // Simple text response for basic monitoring (backward compatible)
        if (req.query.format === 'text') {
            return res.status(200).send('ok');
        }

        // JSON response with metrics
        res.status(200).json(healthData);
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

app.listen(PORT, () => console.log('Listening on', PORT));

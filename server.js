import 'dotenv/config';
import express from 'express';
import twilio from 'twilio';
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
    renderMessageTemplate
} from './db/index.js';
import {
    renderCampaignDetailPage,
    renderCampaignsPage,
    renderContactsPage,
    renderDashboardPage,
    renderMessagesPage,
    renderOptOutsPage,
    renderCampaignFormPage
} from './admin/pages.js';

const app = express();
const PORT = process.env.PORT || 3000;

const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;
const SCHEDULER_INTERVAL_MS = Number(process.env.CAMPAIGN_SCHEDULER_INTERVAL_MS || 30000);
const SCHEDULER_BATCH_SIZE = Number(process.env.CAMPAIGN_SEND_BATCH_SIZE || 20);
const schedulerState = { running: false };

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

function toTwilioRecipient(phone) {
    if (!phone) {
        return '';
    }
    return phone.toLowerCase().startsWith('whatsapp:') ? phone : `whatsapp:${phone}`;
}

function buildTemplateVariables(contact = {}) {
    return {
        name: contact.name || '',
        make: contact.make || '',
        model: contact.model || '',
        year: contact.year || ''
    };
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
        const contact = getContactWithVehicle(recipient.contact_id);
        const rawPhone = recipient.phone || contact?.phone || '';
        const phone = normalizePhone(rawPhone);

        if (!phone) {
            updateCampaignRecipientStatus({
                id: recipient.id,
                status: 'failed',
                errorMessage: 'invalid_phone'
            });
            continue;
        }

        if (isOptedOut(phone)) {
            updateContactStatus(phone, 'opted_out');
            updateCampaignRecipientStatus({
                id: recipient.id,
                status: 'skipped_optout',
                errorMessage: 'opted_out'
            });
            continue;
        }

        const variables = buildTemplateVariables(contact || {});
        const rendered = renderMessageTemplate(campaign.message_template || '', variables).trim();
        const contentSid = campaign.content_sid || process.env.CONTENT_SID || null;

        if (!rendered && !contentSid) {
            updateCampaignRecipientStatus({
                id: recipient.id,
                status: 'failed',
                errorMessage: 'missing_template'
            });
            continue;
        }

        try {
            const payload = {
                to: toTwilioRecipient(phone),
                messagingServiceSid: process.env.MESSAGING_SERVICE_SID
            };

            if (rendered) {
                payload.body = rendered;
            } else {
                payload.contentSid = contentSid;
                if (variables.name) {
                    payload.contentVariables = JSON.stringify({ "1": variables.name });
                }
            }

            const msg = await twilioClient.messages.create(payload);
            const rawStatus = msg.status || 'sent';
            const status = ['queued', 'accepted', 'sending'].includes(rawStatus) ? 'sent' : rawStatus;
            const sentAt = new Date().toISOString();

            updateCampaignRecipientStatus({
                id: recipient.id,
                status,
                messageSid: msg.sid,
                sentAt
            });
            incrementCampaignSentCount(campaign.id);

            insertMessage({
                contactId: recipient.contact_id || null,
                campaignId: campaign.id,
                direction: 'outbound',
                phone,
                body: rendered || null,
                messageSid: msg.sid,
                status
            });
        } catch (error) {
            updateCampaignRecipientStatus({
                id: recipient.id,
                status: 'failed',
                errorMessage: error?.message || 'send_failed'
            });
        }
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
    const contacts = listContacts({ limit, offset, query });
    res.status(200).type('text/html').send(renderContactsPage({
        contacts,
        query,
        offset,
        limit
    }));
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
    res.status(200).type('text/html').send(renderCampaignFormPage({}));
});

app.get('/admin/campaigns/:id/edit', (req, res) => {
    const id = Number(req.params.id);
    const campaign = getCampaignById(id);
    if (!campaign) {
        return res.status(404).send('Not found');
    }
    res.status(200).type('text/html').send(renderCampaignFormPage({ campaign }));
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

app.get('/admin/opt-outs', (req, res) => {
    const { limit, offset } = getPaging(req);
    const optOuts = listOptOuts({ limit, offset });
    res.status(200).type('text/html').send(renderOptOutsPage({
        optOuts,
        offset,
        limit
    }));
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

// ============================================================
// Campaign Management API
// ============================================================

app.post('/admin/api/campaigns', adminAuth, express.json(), (req, res) => {
    try {
        const { name, messageTemplate, type, scheduledAt, contentSid, filters } = req.body;
        const normalizedScheduledAt = normalizeScheduledAt(scheduledAt);
        const status = normalizedScheduledAt ? 'scheduled' : 'draft';

        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }

        const campaign = createCampaign({
            name,
            messageTemplate,
            type,
            scheduledAt: normalizedScheduledAt,
            contentSid,
            filters,
            status
        });

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
        const normalizedScheduledAt = hasScheduledAt
            ? normalizeScheduledAt(updates.scheduledAt || updates.scheduled_at)
            : current.scheduled_at;

        const payload = {
            name: updates.name ?? current.name,
            messageTemplate: updates.messageTemplate ?? current.message_template,
            type: updates.type ?? current.type,
            scheduledAt: normalizedScheduledAt,
            contentSid: updates.contentSid ?? current.content_sid,
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

app.get('/admin/api/contacts', adminAuth, (req, res) => {
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

        for (const recipient of recipients) {
            if (recipient.status && recipient.status !== 'pending') {
                results.skipped += 1;
                continue;
            }

            const contact = getContactWithVehicle(recipient.contact_id);
            const rawPhone = recipient.phone || contact?.phone || '';
            const phone = normalizePhone(rawPhone);

            if (!phone) {
                updateCampaignRecipientStatus({
                    id: recipient.id,
                    status: 'failed',
                    errorMessage: 'invalid_phone'
                });
                results.failed += 1;
                continue;
            }

            if (isOptedOut(phone)) {
                updateContactStatus(phone, 'opted_out');
                updateCampaignRecipientStatus({
                    id: recipient.id,
                    status: 'skipped_optout',
                    errorMessage: 'opted_out'
                });
                results.skipped += 1;
                continue;
            }

            const variables = buildTemplateVariables(contact || {});
            const rendered = renderMessageTemplate(campaign.message_template || '', variables).trim();
            const contentSid = campaign.content_sid || process.env.CONTENT_SID || null;

            if (!rendered && !contentSid) {
                updateCampaignRecipientStatus({
                    id: recipient.id,
                    status: 'failed',
                    errorMessage: 'missing_template'
                });
                results.failed += 1;
                continue;
            }

            try {
                const payload = {
                    to: toTwilioRecipient(phone),
                    messagingServiceSid: process.env.MESSAGING_SERVICE_SID
                };

                if (rendered) {
                    payload.body = rendered;
                } else {
                    payload.contentSid = contentSid;
                    if (variables.name) {
                        payload.contentVariables = JSON.stringify({ "1": variables.name });
                    }
                }

                const msg = await twilioClient.messages.create(payload);
                const rawStatus = msg.status || 'sent';
                const status = ['queued', 'accepted', 'sending'].includes(rawStatus) ? 'sent' : rawStatus;
                const sentAt = new Date().toISOString();

                updateCampaignRecipientStatus({
                    id: recipient.id,
                    status,
                    messageSid: msg.sid,
                    sentAt
                });
                incrementCampaignSentCount(campaign.id);

                insertMessage({
                    contactId: recipient.contact_id || null,
                    campaignId: campaign.id,
                    direction: 'outbound',
                    phone,
                    body: rendered || null,
                    messageSid: msg.sid,
                    status
                });

                results.sent += 1;
            } catch (error) {
                updateCampaignRecipientStatus({
                    id: recipient.id,
                    status: 'failed',
                    errorMessage: error?.message || 'send_failed'
                });
                results.failed += 1;
            }
        }

        res.json(results);
    } catch (error) {
        console.error('Test send error:', error);
        res.status(500).json({ error: 'Failed to send test messages' });
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
// Webhooks
// ============================================================
app.post('/twilio/inbound', (req, res) => {
    const from = req.body.From;            // "whatsapp:+569..."
    const body = (req.body.Body || '').trim(); // texto del usuario

    const phone = normalizePhone(from); // Renamed internal var for clarity, though not strictly required
    const upper = body.toUpperCase();

    // Quick Win #8: Expanded opt-out keywords for better compliance
    const OPTOUT_KEYWORDS = ['BAJA', '3', 'STOP', 'UNSUBSCRIBE', 'CANCELAR', 'REMOVER'];
    const isBaja = OPTOUT_KEYWORDS.some(kw => upper.includes(kw));

    // Respuesta simple
    let reply = 'Gracias por escribir a Queirolo Autos. Responde:\n1) Me interesa consignar\n2) Quiero mas info\n3) BAJA';


    if (isBaja) {
        reply = '✅ Confirmado: Tu número ha sido dado de baja. No recibirás más mensajes de Queirolo Autos.';
    } else if (upper === '1' || upper.includes('CONSIGN')) {
        reply = 'Perfecto. Para avanzar, dime: Marca, Modelo, Ano y Comuna.';
    } else if (upper === '2' || upper.includes('INFO')) {
        reply = 'Genial. Te cuento: consignamos, publicamos y gestionamos todo. Quieres que te llame un ejecutivo? (SI/NO)';
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

    res
        .status(200)
        .type('text/xml')
        .send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(reply)}</Message>
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
    if (providedUser !== user || providedPass !== pass) {
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



import 'dotenv/config';
import express from 'express';
import {
    getAdminStats,
    getCampaignById,
    insertMessage,
    insertOptOut,
    listCampaignRecipients,
    listCampaigns,
    listContacts,
    listMessages,
    listOptOuts,
    normalizePhone,
    upsertContact,
    updateContactStatus
} from './db/index.js';
import {
    renderCampaignDetailPage,
    renderCampaignsPage,
    renderContactsPage,
    renderDashboardPage,
    renderMessagesPage,
    renderOptOutsPage
} from './admin/pages.js';

const app = express();
const PORT = process.env.PORT || 3000;


app.use(express.urlencoded({ extended: false })); // Twilio envía form-urlencoded

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

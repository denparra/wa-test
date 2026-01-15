import 'dotenv/config';
import twilio from 'twilio';
import {
    createCampaign,
    getCampaignById,
    getCampaignByName,
    insertCampaignRecipient,
    insertMessage,
    isOptedOut,
    normalizePhone,
    upsertContact,
    updateCampaignMessage,
    updateContactStatus
} from './db/index.js';

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const STATUS_CALLBACK_URL = process.env.STATUS_CALLBACK_URL
    || (process.env.PUBLIC_BASE_URL ? `${process.env.PUBLIC_BASE_URL.replace(/\/$/, '')}/twilio/status-callback` : null);

// Cambia por tu numero de prueba (formato E.164)
// Cambia por tus numeros de prueba (formato E.164)
const RECIPIENTS = [
    'whatsapp:+56975400946'/*,
    'whatsapp:+56990080338', // Agrega aqui el segundo numero
    'whatsapp:+56983785269', // Agrega aqui el segundo numero
    'whatsapp:+56958012294',
    'whatsapp:+56989573774'  // Agrega aqui el tercer numero*/
];

function parseArgs(argv) {
    const args = {
        campaignName: null,
        campaignId: null,
        invalidCampaignId: false,
        body: null,
        help: false
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--help' || arg === '-h') {
            args.help = true;
            continue;
        }
        if (arg === '--campaign' && argv[i + 1]) {
            args.campaignName = argv[i + 1];
            i += 1;
            continue;
        }
        if (arg.startsWith('--campaign=')) {
            args.campaignName = arg.split('=').slice(1).join('=');
            continue;
        }
        if (arg === '--campaign-id' && argv[i + 1]) {
            const parsed = Number(argv[i + 1]);
            if (Number.isNaN(parsed)) {
                args.invalidCampaignId = true;
            } else {
                args.campaignId = parsed;
            }
            i += 1;
            continue;
        }
        if (arg.startsWith('--campaign-id=')) {
            const parsed = Number(arg.split('=').slice(1).join('='));
            if (Number.isNaN(parsed)) {
                args.invalidCampaignId = true;
            } else {
                args.campaignId = parsed;
            }
            continue;
        }
        if (arg === '--body' && argv[i + 1]) {
            args.body = argv[i + 1];
            i += 1;
            continue;
        }
        if (arg.startsWith('--body=')) {
            args.body = arg.split('=').slice(1).join('=');
        }
    }

    return args;
}

function maskPhone(phone = '') {
    if (!phone) {
        return '';
    }
    const visible = phone.slice(-4);
    return `${phone.slice(0, Math.max(0, phone.length - 4)).replace(/\d/g, '*')}${visible}`;
}

function safeDb(label, fn, fallback = null) {
    try {
        return fn();
    } catch (error) {
        console.error(`DB error (${label}):`, error?.message || error);
        return fallback;
    }
}

function resolveCampaign({ campaignName, campaignId, body }) {
    if (campaignName && campaignId) {
        throw new Error('Use solo --campaign o --campaign-id, no ambos.');
    }

    if (campaignId) {
        if (body) {
            safeDb('campaign-update-message', () => updateCampaignMessage(campaignId, body));
        }
        const campaign = safeDb('campaign-by-id', () => getCampaignById(campaignId));
        if (!campaign) {
            throw new Error(`No existe la campana con id ${campaignId}.`);
        }
        return campaign;
    }

    if (campaignName) {
        const existing = safeDb('campaign-by-name', () => getCampaignByName(campaignName));
        if (existing) {
            if (body) {
                safeDb('campaign-update-message', () => updateCampaignMessage(existing.id, body));
                return safeDb('campaign-by-id', () => getCampaignById(existing.id));
            }
            return existing;
        }
        const created = safeDb('campaign-create', () => createCampaign({
            name: campaignName,
            messageTemplate: body || null, // RENAMED
            status: 'active'
        }));
        if (!created) {
            throw new Error('No se pudo crear la campana.');
        }
        return created;
    }

    return null;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        console.log('Uso: node send-test.js [--campaign "Nombre"] [--campaign-id 1] [--body "Texto"]');
        return;
    }
    if (args.invalidCampaignId) {
        console.error('El valor de --campaign-id debe ser numerico.');
        return;
    }

    const normalizedBody = args.body ? args.body.trim() : '';
    const campaign = resolveCampaign({
        ...args,
        body: normalizedBody || null
    });
    const bodyFromCampaign = campaign?.message_template ? String(campaign.message_template).trim() : ''; // RENAMED
    const messageBody = normalizedBody || bodyFromCampaign;
    if (!messageBody && !process.env.CONTENT_SID) {
        console.error('Falta CONTENT_SID o --body para enviar mensaje.');
        return;
    }

    console.log('Enviando mensajes a', RECIPIENTS.length, 'destinatarios...');

    const results = await Promise.allSettled(RECIPIENTS.map(async (to) => {
        const phone = normalizePhone(to); // RENAMED
        if (!phone) {
            return { to, skipped: true, reason: 'invalid_phone' };
        }

        const contact = safeDb('contact-upsert', () => upsertContact(phone, null));
        const optedOut = safeDb('opt-out-check', () => isOptedOut(phone), false);

        if (optedOut) {
            safeDb('contact-opt-out', () => updateContactStatus(phone, 'opted_out'));
            if (campaign && contact?.id) {
                safeDb('campaign-recipient-skip', () => insertCampaignRecipient({
                    campaignId: campaign.id,
                    contactId: contact.id,
                    phone, // RENAMED
                    status: 'skipped_optout',
                    errorMessage: 'opted_out'
                }));
            }
            return { to, skipped: true, reason: 'opted_out' };
        }

        const toForTwilio = to.toLowerCase().startsWith('whatsapp:')
            ? to
            : `whatsapp:${phone}`;

        try {
            const payload = {
                to: toForTwilio,
                messagingServiceSid: process.env.MESSAGING_SERVICE_SID
            };

            if (STATUS_CALLBACK_URL) {
                payload.statusCallback = STATUS_CALLBACK_URL;
            }

            if (messageBody) {
                payload.body = messageBody;
            } else {
                payload.contentSid = process.env.CONTENT_SID;
                // Si tu plantilla NO usa variables, puedes borrar estas 2 lineas:
                payload.contentVariables = JSON.stringify({
                    "1": "Dennys"
                });
            }

            const msg = await client.messages.create(payload);

            const status = msg.status || 'queued';

            if (campaign && contact?.id) {
                safeDb('campaign-recipient-sent', () => insertCampaignRecipient({
                    campaignId: campaign.id,
                    contactId: contact.id,
                    phone, // RENAMED
                    status,
                    messageSid: msg.sid, // RENAMED
                    sentAt: new Date().toISOString()
                }));
            }

            safeDb('message-outbound', () => insertMessage({
                contactId: contact?.id || null,
                campaignId: campaign?.id || null,
                direction: 'outbound',
                phone, // NEW REQUIRED
                body: messageBody || null,
                messageSid: msg.sid, // RENAMED
                status
            }));

            return { to, sid: msg.sid, status };
        } catch (error) {
            if (campaign && contact?.id) {
                safeDb('campaign-recipient-failed', () => insertCampaignRecipient({
                    campaignId: campaign.id,
                    contactId: contact.id,
                    phone, // RENAMED
                    status: 'failed',
                    errorMessage: error?.message || 'send_failed'
                }));
            }
            throw error;
        }
    }));

    results.forEach((result, index) => {
        const to = RECIPIENTS[index];
        const masked = maskPhone(normalizePhone(to));
        if (result.status === 'fulfilled') {
            if (result.value?.skipped) {
                console.log(`SKIP ${masked} - ${result.value.reason}`);
                return;
            }
            console.log(`OK ${masked} - SID: ${result.value.sid} (${result.value.status})`);
        } else {
            console.error(`ERR ${masked}:`, result.reason?.message || result.reason);
        }
    });
}

main().catch((err) => {
    console.error('Error:', err?.message || err);
    if (err?.code) {
        console.error('Twilio code:', err.code);
    }
});

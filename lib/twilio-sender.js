// Envia un mensaje outbound a un recipient de campania y actualiza su estado.
// Usado por el scheduler (processCampaignSendBatch) y por el endpoint de test-send.
// Antes esta logica estaba duplicada ~80 lineas en server.js.

import {
    getContactWithVehicle,
    isOptedOut,
    updateContactStatus,
    updateCampaignRecipientStatus,
    incrementCampaignSentCount,
    insertMessage,
    renderMessageTemplate,
    normalizePhone
} from '../db/index.js';

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

/**
 * Envia un mensaje a un recipient, aplicando opt-out, render de template y
 * registrando el resultado en BD. No lanza excepciones: siempre resuelve con
 * un objeto describiendo el outcome.
 *
 * @returns {Promise<{outcome: 'sent'|'skipped'|'failed', reason?: string, messageSid?: string}>}
 */
export async function sendOneRecipient({
    recipient,
    campaign,
    twilioClient,
    messagingServiceSid,
    statusCallbackUrl = null,
    contentSidFallback = null
}) {
    const contact = getContactWithVehicle(recipient.contact_id);
    const rawPhone = recipient.phone || contact?.phone || '';
    const phone = normalizePhone(rawPhone);

    if (!phone) {
        updateCampaignRecipientStatus({
            id: recipient.id,
            status: 'failed',
            errorMessage: 'invalid_phone'
        });
        return { outcome: 'failed', reason: 'invalid_phone' };
    }

    if (isOptedOut(phone)) {
        updateContactStatus(phone, 'opted_out');
        updateCampaignRecipientStatus({
            id: recipient.id,
            status: 'skipped_optout',
            errorMessage: 'opted_out'
        });
        return { outcome: 'skipped', reason: 'opted_out' };
    }

    const variables = buildTemplateVariables(contact || {});
    const rendered = renderMessageTemplate(campaign.message_template || '', variables).trim();
    const contentSid = campaign.content_sid || contentSidFallback || null;

    if (!rendered && !contentSid) {
        updateCampaignRecipientStatus({
            id: recipient.id,
            status: 'failed',
            errorMessage: 'missing_template'
        });
        return { outcome: 'failed', reason: 'missing_template' };
    }

    const payload = {
        to: toTwilioRecipient(phone),
        messagingServiceSid
    };
    if (statusCallbackUrl) {
        payload.statusCallback = statusCallbackUrl;
    }
    if (rendered) {
        payload.body = rendered;
    } else {
        payload.contentSid = contentSid;
        if (variables.name) {
            payload.contentVariables = JSON.stringify({ "1": variables.name });
        }
    }

    try {
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

        return { outcome: 'sent', messageSid: msg.sid };
    } catch (error) {
        updateCampaignRecipientStatus({
            id: recipient.id,
            status: 'failed',
            errorMessage: error?.message || 'send_failed'
        });
        return { outcome: 'failed', reason: error?.message || 'send_failed' };
    }
}

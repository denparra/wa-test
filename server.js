import 'dotenv/config';
import { timingSafeEqual } from 'crypto';
import fs from 'fs/promises';
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
    getContactByPhone,
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
    countVehicleAudienceByFilters,
    listVehicleAudiencePage,
    listContactsForCampaign,
    countContactsForCampaign,
    listContactAudiencePage,
    listScheduledCampaignsDue,
    listCampaignsByStatus,
    listPendingRecipients,
    updateCampaignRecipientStatus,
    getContactWithVehicle,
    assignRecipientsToCampaign,
    clearCampaignRecipients,
    listCampaignRecipientsByContacts,
    listCampaignRecipientContactIds,
    renderMessageTemplate,
    bulkImportContactsAndVehicles,
    listVehicleMakes,
    listVehicleYears,
    listContactsByMake,
    getVehiclesByContactId,
    listVehicles,
    countVehicles,
    getVehicleStats,
    getVehicleById,
    createVehicle,
    updateVehicle,
    deleteVehicle as dbDeleteVehicle,
    updateOptOut,
    deleteOptOut,
    releaseOptOut,
    getOptOutByPhone,
    listVehicleSuppressions,
    createVehicleSuppression,
    releaseVehicleSuppression,
    getLatestContactedVehicleByPhone,
    listCampaignRecipientTargets,
    getCampaignFollowUpStats,
    listCampaignRecipientsWithReplies,
    getRecipientConversationHistory,
    createTemplate,
    listTemplates,
    getTemplateById,
    updateTemplate,
    deleteTemplate as dbDeleteTemplate,
    createSegment,
    updateSegment,
    listSegments,
    getSegmentById,
    deleteSegment as dbDeleteSegment,
    addMembersToSegment,
    countSegmentMembers,
    listSegmentMembers,
    listSegmentRecipientTargets,
    removeSegmentMember,
    updateMessageStatus,
    bulkInsertOptOuts,
    getContactEngagementStats,
    getDashboardMetrics,
    listSegmentsWithCount,
    updateSegmentLastUsed,
    listInboxConversations,
    countUnreadConversations,
    markConversationRead,
    markConversationUnread,
    getConversationMessagesByPhone
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
    renderTemplateFormPage,
    renderVehiclesPage,
    renderVehicleFormPage,
    renderChatLabPage,
    renderSegmentsPage,
    renderSegmentDetailPage,
    renderInboxPage
} from './admin/pages.js';
import { sendOneRecipient } from './lib/twilio-sender.js';
import {
    normalizeAudienceFilters,
    resolveAudienceCandidatesFromFns,
    validateSegmentDefinition
} from './lib/segment-audience.js';
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
const SHOULD_BOOT_BACKGROUND_JOBS = process.env.SKIP_SERVER_LISTEN !== '1';

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
const HANDOFF_OFFER_WINDOW_MS = 20 * 60 * 1000;
const recentHandoffByPhone = new Map();
const recentHandoffOfferByPhone = new Map();
const LAB_CHAT_DEFAULT_PHONE = normalizePhone(String(process.env.LAB_CHAT_DEFAULT_PHONE || '+56935229766').trim()) || '+56935229766';

if (!N8N_CHAT_WEBHOOK_URL) {
    console.warn('[startup] N8N_CHAT_WEBHOOK_URL no configurada: /twilio/inbound usara respuesta local fallback');
}

async function getN8nChatReply(payload) {
    if (!N8N_CHAT_WEBHOOK_URL) {
        return null;
    }

    const MAX_ATTEMPTS = 2;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

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
            if (!response.ok) {
                const shouldRetry = response.status >= 500 && attempt < MAX_ATTEMPTS;
                console.warn('[n8n-chat] non-2xx response', {
                    status: response.status,
                    attempt,
                    retrying: shouldRetry
                });
                if (shouldRetry) {
                    continue;
                }
                return null;
            }
            if (!data) {
                console.warn('[n8n-chat] invalid json response', { attempt });
                return null;
            }

            const replyText = String(data.reply_text || '').trim();
            if (!replyText) {
                console.warn('[n8n-chat] empty reply_text', { attempt });
                return null;
            }

            return {
                replyText,
                needsHuman: Boolean(data.needs_human),
                handoffReason: String(data.handoff_reason || '').trim(),
                optoutRequested: Boolean(data.optout_requested)
            };
        } catch (error) {
            const isAbort = String(error?.name || '').toLowerCase() === 'aborterror';
            const shouldRetry = attempt < MAX_ATTEMPTS;
            console.warn('[n8n-chat] webhook call failed', {
                reason: isAbort ? 'timeout' : 'network_error',
                message: error?.message || String(error),
                attempt,
                retrying: shouldRetry
            });
            if (!shouldRetry) {
                return null;
            }
        } finally {
            clearTimeout(timeout);
        }
    }

    return null;
}

function isPhaticAckMessage(text = '') {
    const normalized = String(text || '').toLowerCase().replace(/[!?.,;:]/g, '').trim();
    return /^(gracias|ok|oki|okey|oka|dale|perfecto|listo|super|genial|buenisimo|de acuerdo|ok gracias|ok perfecto|si gracias|si perfecto|oka espero)$/.test(normalized);
}

function isHandoffOfferText(text = '') {
    const normalized = normalizeIntentText(text);
    const hasExecutive = /\b(ejecutivo|asesor)\b/.test(normalized);
    const hasContactAction = /\b(contacta|contacto|contacte|contacten|contactamos|contactarte|contactar|llame|llamemos|llamen|agendemos)\b/.test(normalized);
    const hasEta = /\b(15-30|15 30|min|minutos)\b/.test(normalized);
    return hasExecutive && (hasContactAction || hasEta);
}

function hasEmailInText(text = '') {
    return /([^\s<>"'`]+@[^\s<>"'`]+\.[^\s<>"'`]+)/i.test(String(text || ''));
}

function isHandoffOfferAffirmative(text = '') {
    const normalized = normalizeIntentText(text);
    if (!normalized) {
        return false;
    }
    if (/\b(no|no gracias|mejor no|despues|después)\b/.test(normalized)) {
        return false;
    }
    return /^(si|sii|ok|oki|okey|oka|dale|de acuerdo|perfecto|listo|vale|ya)\s*(porfa|por favor)?$/.test(normalized)
        || /\b(ok enviame|enviame|mandame|si espero|ok espero|oka espero|que me contacten|me contacten)\b/.test(normalized);
}

function normalizeIntentText(text = '') {
    return String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function detectVehicleUnavailableReason(text = '') {
    const normalized = normalizeIntentText(text);
    if (!normalized) {
        return null;
    }

    const soldPatterns = [
        /\b(ya\s+lo\s+vendi|ya\s+se\s+vendio|vendido|lo\s+vendi|se\s+vendio)\b/,
        /\b(ese\s+auto\s+ya\s+se\s+fue|ese\s+auto\s+ya\s+salio)\b/
    ];
    if (soldPatterns.some((pattern) => pattern.test(normalized))) {
        return 'vehicle_sold';
    }

    const unavailablePatterns = [
        /\b(ya\s+no\s+esta\s+disponible|no\s+esta\s+disponible|ya\s+no\s+esta)\b/,
        /\b(no\s+disponible|ya\s+salio|publicacion\s+caida)\b/
    ];
    if (unavailablePatterns.some((pattern) => pattern.test(normalized))) {
        return 'vehicle_unavailable';
    }

    return null;
}

function toVehicleContextList(vehicles = []) {
    if (!Array.isArray(vehicles)) {
        return [];
    }

    return vehicles
        .map((vehicle) => {
            const make = String(vehicle?.make || '').trim();
            const model = String(vehicle?.model || '').trim();
            const year = Number(vehicle?.year || 0);
            const link = String(vehicle?.link || '').trim();
            if (!make && !model && !year) {
                return null;
            }
            return {
                make,
                model,
                year: Number.isFinite(year) && year > 0 ? year : null,
                link
            };
        })
        .filter(Boolean);
}

function formatVehicleLine(vehicle = {}) {
    const make = String(vehicle.make || '').trim();
    const model = String(vehicle.model || '').trim();
    const year = vehicle.year ? String(vehicle.year) : '';
    return [make, model, year].filter(Boolean).join(' ').trim();
}

function formatVehicleShortSummary(vehicles = []) {
    if (!Array.isArray(vehicles) || vehicles.length === 0) {
        return '';
    }

    const labels = vehicles.map(formatVehicleLine).filter(Boolean);
    if (!labels.length) {
        return '';
    }
    if (labels.length === 1) {
        return labels[0];
    }

    return `${labels[0]} (+${labels.length - 1} mas)`;
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

function clearHandoffState(phone = '') {
    if (!phone) {
        return;
    }
    recentHandoffByPhone.delete(phone);
}

function getActiveHandoffOfferState(phone = '') {
    if (!phone) {
        return null;
    }
    const state = recentHandoffOfferByPhone.get(phone);
    if (!state) {
        return null;
    }
    if ((Date.now() - Number(state.offeredAt || 0)) > HANDOFF_OFFER_WINDOW_MS) {
        recentHandoffOfferByPhone.delete(phone);
        return null;
    }
    return state;
}

function markHandoffOffer(phone = '') {
    if (!phone) {
        return;
    }
    recentHandoffOfferByPhone.set(phone, {
        offeredAt: Date.now()
    });
}

function clearHandoffOffer(phone = '') {
    if (!phone) {
        return;
    }
    recentHandoffOfferByPhone.delete(phone);
}

function buildLabPhone() {
    return LAB_CHAT_DEFAULT_PHONE;
}

function resolveLabPhone(candidate = '') {
    return normalizePhone(String(candidate || '').trim()) || LAB_CHAT_DEFAULT_PHONE;
}

const LAB_SCENARIOS = [
    // ============================================================
    // Suite: smoke — critical happy paths and opt-out
    // ============================================================
    {
        id: 'happy_handoff',
        name: 'Happy Path Handoff',
        suite: 'smoke',
        steps: [
            { user: 'hola puedo consignar mi auto?', expect: { containsAny: ['consign', 'ejecutivo', 'contact'] } },
            { user: 'si dale que me contacte', expect: { containsAny: ['quedaste derivado', 'te contactamos en 15-30'] } },
            { user: 'gracias, chao', expect: { notContainsAny: ['quieres que te contacte', 'si quieres, te contacta un ejecutivo'] } }
        ]
    },
    {
        id: 'post_handoff_lock',
        name: 'Post-Handoff No Reopen',
        suite: 'smoke',
        steps: [
            { user: 'me interesa consignar', expect: { containsAny: ['ejecutivo', 'contact'] } },
            { user: 'si por favor que me contacten', expect: { containsAny: ['quedaste derivado'] } },
            { user: 'ok gracias', expect: { notContainsAny: ['quieres que te contacte', 'si quieres, te contacta un ejecutivo'] } }
        ]
    },
    {
        id: 'email_after_handoff',
        name: 'Email After Handoff',
        suite: 'smoke',
        steps: [
            { user: 'hola, me interesa consignar mi auto', expect: { containsAny: ['consign', 'ejecutivo'] } },
            { user: 'si por favor que me contacten', expect: { containsAny: ['quedaste derivado'] } },
            { user: 'mi correo es qa@example.com', expect: { containsAny: ['correo', 'derivado'], notContainsAny: ['quieres que te contacte'] } }
        ]
    },
    {
        id: 'optout_keyword',
        name: 'Opt-out Keyword',
        suite: 'smoke',
        steps: [
            { user: 'BAJA', expect: { containsAny: ['dado de baja', 'confirmado'] } }
        ]
    },
    {
        id: 'optout_semantic',
        name: 'Opt-out Semantic',
        suite: 'smoke',
        steps: [
            { user: 'no me escriban mas por favor', expect: { containsAny: ['dado de baja', 'confirmado'] } }
        ]
    },

    // ============================================================
    // Suite: regression — IA edge cases, handoff variants
    // ============================================================
    {
        id: 'known_vehicle_context',
        name: 'Known Vehicle Context',
        suite: 'regression',
        steps: [
            { user: 'me interesa consignar', expect: { notContainsAny: ['Marca, Modelo, Ano y Comuna'] } }
        ]
    },
    {
        id: 'informal_affirmative',
        name: 'Informal Affirmative',
        suite: 'regression',
        steps: [
            { user: 'hola me interesa consignar', expect: { containsAny: ['ejecutivo'] } },
            { user: 'oka porfa', expect: { containsAny: ['quedaste derivado', 'te contactamos en 15-30'] } }
        ]
    },
    {
        id: 'action_affirmative',
        name: 'Action-style Affirmative',
        suite: 'regression',
        steps: [
            { user: 'me interesa consignar', expect: { containsAny: ['ejecutivo'] } },
            { user: 'ok enviame', expect: { containsAny: ['quedaste derivado'] } }
        ]
    },
    {
        id: 'decline_handoff',
        name: 'Decline Handoff',
        suite: 'regression',
        steps: [
            { user: 'me interesa consignar', expect: { containsAny: ['ejecutivo'] } },
            { user: 'no gracias', expect: { notContainsAny: ['quedaste derivado'] } }
        ]
    },
    {
        id: 'faq_process',
        name: 'FAQ Process Question',
        suite: 'regression',
        steps: [
            { user: 'como es el proceso de consignacion?', expect: { containsAny: ['proceso', 'consign'] } }
        ]
    },
    {
        id: 'faq_costs',
        name: 'FAQ Costs Question',
        suite: 'regression',
        steps: [
            { user: 'que costo tiene consignar?', expect: { containsAny: ['consign', 'proceso', 'ejecutivo'] } }
        ]
    },
    {
        id: 'legal_sensitive',
        name: 'Legal Sensitive Case',
        suite: 'regression',
        steps: [
            { user: 'tengo un problema de prenda y embargo', expect: { containsAny: ['derivado', 'ejecutivo', 'contactamos'] } }
        ]
    },

    // ============================================================
    // Suite: dialect — spanish/chilean informal variations
    // ============================================================
    {
        id: 'informal_greeting',
        name: 'Dialect: Informal Greeting',
        suite: 'dialect',
        steps: [
            { user: 'que onda, quiero consignar mi auto', expect: { containsAny: ['consign', 'ejecutivo'], notContainsAny: ['error'], minLength: 15 } }
        ]
    },
    {
        id: 'formal_quisiera',
        name: 'Dialect: Formal Request',
        suite: 'dialect',
        steps: [
            { user: 'quisiera conocer ms sobre la consignacin', expect: { containsAny: ['consign', 'proceso', 'ejecutivo'], minLength: 15 } }
        ]
    },
    {
        id: 'chilenismo_po',
        name: 'Dialect: Particula Po',
        suite: 'dialect',
        steps: [
            { user: 'quisiera saber po, cuanto sale consignar?', expect: { containsAny: ['consign', 'precio', 'ejecutivo', 'costo'], minLength: 15 } }
        ]
    },
    {
        id: 'typo_kiero',
        name: 'Dialect: Typo Kiero',
        suite: 'dialect',
        steps: [
            { user: 'kiero consignar mi auto', expect: { containsAny: ['consign', 'ejecutivo'], notContainsAny: ['error'], minLength: 15 } }
        ]
    },
    {
        id: 'abbreviation_toyota',
        name: 'Dialect: Vehicle Abbreviation',
        suite: 'dialect',
        steps: [
            { user: 'toyota corolla 2020', expect: { containsAny: ['consign', 'proceso', 'ejecutivo'], minLength: 20 } }
        ]
    },
    {
        id: 'regional_chao_po',
        name: 'Dialect: Regional Goodbye',
        suite: 'dialect',
        steps: [
            { user: 'gracias chao po', expect: { notContainsAny: ['ejecutivo', 'contacta', 'derivar', 'derivado'] } }
        ]
    },
    {
        id: 'condition_ok',
        name: 'Dialect: Informal Vehicle Condition',
        suite: 'dialect',
        steps: [
            { user: 'el auto tiene las ruedas ok y quiero saber del servicio', expect: { containsAny: ['consign', 'proceso', 'ejecutivo'], minLength: 15 } }
        ]
    },
    {
        id: 'number_word',
        name: 'Dialect: Number as Word',
        suite: 'dialect',
        steps: [
            { user: 'el auto del dos', expect: { minLength: 10, notContainsAny: ['error'] } }
        ]
    },

    // ============================================================
    // Suite: intent — specific service intents
    // ============================================================
    {
        id: 'intent_precio',
        name: 'Intent: Precio',
        suite: 'intent',
        steps: [
            { user: 'cuanto sale consignar mi auto?', expect: { containsAny: ['precio', 'consign', 'valor', 'costo'], maxLength: 350 } }
        ]
    },
    {
        id: 'intent_seguro',
        name: 'Intent: Seguro',
        suite: 'intent',
        steps: [
            { user: 'tiene seguro incluido el servicio?', expect: { containsAny: ['seguro', 'incluido', 'proceso'] } }
        ]
    },
    {
        id: 'intent_sin_arriendo',
        name: 'Intent: Sin Arriendo',
        suite: 'intent',
        steps: [
            { user: 'me dijeron que es sin arriendo mensual', expect: { containsAny: ['arriendo', 'consign', 'sin'], minLength: 15 } }
        ]
    },
    {
        id: 'intent_plazo',
        name: 'Intent: Plazo de Venta',
        suite: 'intent',
        steps: [
            { user: 'en cuanto tiempo se vende un auto consignado?', expect: { containsAny: ['venta', 'proceso', 'tiempo', 'dias'] } }
        ]
    },
    {
        id: 'intent_que_incluye',
        name: 'Intent: Que Incluye',
        suite: 'intent',
        steps: [
            { user: 'que incluye el servicio de ustedes?', expect: { containsAll: ['proceso', 'publicamos'], minLength: 25, maxLength: 400 } }
        ]
    },
    {
        id: 'intent_region',
        name: 'Intent: Cobertura Regional',
        suite: 'intent',
        steps: [
            { user: 'estan en todas partes o solo santiago?', expect: { maxLength: 350 } }
        ]
    },
    {
        id: 'intent_comision',
        name: 'Intent: Comision',
        suite: 'intent',
        steps: [
            { user: 'cuanto cobran por comision?', expect: { containsAny: ['consign', 'proceso', 'comision', 'precio'] } }
        ]
    },

    // ============================================================
    // Suite: optout-full — all opt-out variants
    // ============================================================
    {
        id: 'optout_menu_3',
        name: 'Opt-out: Menu Option 3',
        suite: 'optout-full',
        steps: [
            { user: '3', expect: { containsAny: ['dado de baja', 'confirmado'] } }
        ]
    },
    {
        id: 'optout_stop',
        name: 'Opt-out: Stop Keyword',
        suite: 'optout-full',
        steps: [
            { user: 'stop', expect: { containsAny: ['dado de baja', 'confirmado'] } }
        ]
    },
    {
        id: 'optout_sacame',
        name: 'Opt-out: Sacame de Lista',
        suite: 'optout-full',
        steps: [
            { user: 'sacame de la lista', expect: { containsAny: ['dado de baja', 'confirmado'] } }
        ]
    },
    {
        id: 'optout_dame_baja',
        name: 'Opt-out: Dame de Baja',
        suite: 'optout-full',
        steps: [
            { user: 'dame de baja', expect: { containsAny: ['dado de baja', 'confirmado'] } }
        ]
    },

    // ============================================================
    // Suite: vehicle-suppression — puntual por vehículo/publicación
    // ============================================================
    {
        id: 'vehicle_sold_basic',
        name: 'Vehicle Suppression: Ya lo vendí',
        suite: 'vehicle-suppression',
        steps: [
            { user: 'ya lo vendí', expect: { containsAny: ['dejaremos de contactarte', 'publicación / vehículo'], notContainsAny: ['dado de baja', 'ejecutivo', 'te contactamos'] } }
        ]
    },
    {
        id: 'vehicle_unavailable_basic',
        name: 'Vehicle Suppression: No disponible',
        suite: 'vehicle-suppression',
        steps: [
            { user: 'ya no está disponible', expect: { containsAny: ['dejaremos de contactarte', 'publicación / vehículo'], notContainsAny: ['dado de baja', 'ejecutivo', 'te contactamos'] } }
        ]
    },
    {
        id: 'vehicle_gone_phrase',
        name: 'Vehicle Suppression: Ese auto ya salió',
        suite: 'vehicle-suppression',
        steps: [
            { user: 'ese auto ya salió', expect: { containsAny: ['dejaremos de contactarte', 'publicación / vehículo'], notContainsAny: ['dado de baja', 'ejecutivo'] } }
        ]
    },
    {
        id: 'vehicle_vs_global_stop',
        name: 'Vehicle Suppression: BAJA sigue global',
        suite: 'vehicle-suppression',
        steps: [
            { user: 'BAJA', expect: { containsAny: ['dado de baja', 'confirmado'], notContainsAny: ['publicación / vehículo'] } }
        ]
    },
    {
        id: 'vehicle_vs_global_semantic',
        name: 'Vehicle Suppression: No me contacten más sigue global',
        suite: 'vehicle-suppression',
        steps: [
            { user: 'no me contacten más', expect: { containsAny: ['dado de baja', 'confirmado'], notContainsAny: ['publicación / vehículo'] } }
        ]
    },

    // ============================================================
    // Suite: edge-cases — multi-step and complex flows
    // ============================================================
    {
        id: 'menu_two_si_handoff',
        name: 'Edge: Menu Op2 > SI > Handoff',
        suite: 'edge-cases',
        steps: [
            { user: '2', expect: { containsAny: ['ejecutivo', 'llame'] } },
            { user: 'si', expect: { containsAny: ['quedaste derivado', 'te contactamos'] } }
        ]
    },
    {
        id: 'vehicle_context_no_ask_data',
        name: 'Edge: Known Vehicle No Data Request',
        suite: 'edge-cases',
        steps: [
            { user: 'me interesa consignar', expect: { notContainsAny: ['Marca, Modelo, Ano y Comuna', 'que auto tienes', 'que modelo'] } }
        ]
    },
    {
        id: 'multi_exchange_then_handoff',
        name: 'Edge: Multi-exchange then Handoff',
        suite: 'edge-cases',
        steps: [
            { user: 'hola quiero vender mi auto', expect: { containsAny: ['consign', 'ejecutivo'], minLength: 10 } },
            { user: 'es un toyota', expect: { containsAny: ['proceso', 'consign', 'ejecutivo'], notContainsAny: ['error'], minLength: 10 } },
            { user: 'tiene 2020', expect: { containsAny: ['proceso', 'consign', 'ejecutivo'], minLength: 10 } },
            { user: 'si contactenme porfa', expect: { containsAny: ['derivado', 'contactamos', 'derivar'], minLength: 10 } }
        ]
    }
];

function getLabScenarioCatalog() {
    return LAB_SCENARIOS.map((scenario) => ({
        id: scenario.id,
        name: scenario.name,
        suite: scenario.suite,
        step_count: scenario.steps.length
    }));
}

function containsAnyText(text, list = []) {
    const hay = String(text || '').toLowerCase();
    return list.some((needle) => hay.includes(String(needle || '').toLowerCase()));
}

function containsAllText(text, list = []) {
    const hay = String(text || '').toLowerCase();
    return list.every((needle) => hay.includes(String(needle || '').toLowerCase()));
}

function containsNoneText(text, list = []) {
    const hay = String(text || '').toLowerCase();
    return list.every((needle) => !hay.includes(String(needle || '').toLowerCase()));
}

function evaluateLabExpectation(reply, expect = {}) {
    const failures = [];
    if (Array.isArray(expect.containsAny) && expect.containsAny.length > 0 && !containsAnyText(reply, expect.containsAny)) {
        failures.push(`missing containsAny: ${JSON.stringify(expect.containsAny)}`);
    }
    if (Array.isArray(expect.containsAll) && expect.containsAll.length > 0 && !containsAllText(reply, expect.containsAll)) {
        failures.push(`missing containsAll: ${JSON.stringify(expect.containsAll)}`);
    }
    if (Array.isArray(expect.notContainsAny) && expect.notContainsAny.length > 0 && !containsNoneText(reply, expect.notContainsAny)) {
        failures.push(`matched forbidden text: ${JSON.stringify(expect.notContainsAny)}`);
    }
    if (typeof expect.equals === 'string' && String(reply || '').trim() !== expect.equals.trim()) {
        failures.push(`equals mismatch: expected "${expect.equals}" got "${reply}"`);
    }
    if (typeof expect.minLength === 'number' && reply.trim().length < expect.minLength) {
        failures.push(`reply too short: ${reply.trim().length} < ${expect.minLength}`);
    }
    if (typeof expect.maxLength === 'number' && reply.trim().length > expect.maxLength) {
        failures.push(`reply too long: ${reply.trim().length} > ${expect.maxLength}`);
    }
    return {
        ok: failures.length === 0,
        failures
    };
}

function buildLabReportMarkdown({ suite, results, generatedAt, summary }) {
    const lines = [];
    lines.push(`# Lab Chat Report - ${generatedAt}`);
    lines.push('');
    lines.push(`- Suite: ${suite}`);
    lines.push(`- Total escenarios: ${summary.total}`);
    lines.push(`- PASS: ${summary.passed}`);
    lines.push(`- FAIL: ${summary.failed}`);
    lines.push('');

    for (const scenario of results) {
        lines.push(`## ${scenario.name} (${scenario.id})`);
        lines.push('');
        lines.push(`- Resultado: ${scenario.ok ? 'PASS' : 'FAIL'}`);
        lines.push(`- Pasos: ${scenario.steps.length}`);
        lines.push('');
        for (const step of scenario.steps) {
            lines.push(`### Paso ${step.step}`);
            lines.push(`- User: ${step.user}`);
            lines.push(`- Bot: ${step.reply || '(empty)'}`);
            lines.push(`- Resultado: ${step.ok ? 'PASS' : 'FAIL'}`);
            if (!step.ok && step.failures.length > 0) {
                lines.push(`- Fallas: ${step.failures.join(' | ')}`);
            }
            lines.push('');
        }
    }

    return lines.join('\n');
}

async function saveLabMarkdownReport(content, prefix = 'lab-chat-report') {
    const now = new Date();
    const stamp = now.toISOString().replace(/[:]/g, '-').replace(/\..+/, '');
    const relativeDir = 'docs/qa';
    const relativePath = `${relativeDir}/${prefix}-${stamp}.md`;
    await fs.mkdir(relativeDir, { recursive: true });
    await fs.writeFile(relativePath, content, 'utf8');
    return relativePath;
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

function normalizeRecipientAssignments(rawRecipients = []) {
    if (!Array.isArray(rawRecipients)) {
        return [];
    }

    return rawRecipients
        .map((item) => {
            if (typeof item === 'number') {
                return item > 0 ? item : null;
            }

            if (typeof item === 'string') {
                const parsed = Number(item);
                return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
            }

            if (!item || typeof item !== 'object') {
                return null;
            }

            const vehicleId = Number(item.vehicle_id || 0);
            const contactId = Number(item.contact_id || item.id || 0);

            if (vehicleId > 0) {
                return {
                    vehicle_id: vehicleId,
                    contact_id: contactId > 0 ? contactId : null
                };
            }

            if (contactId > 0) {
                return { contact_id: contactId };
            }

            return null;
        })
        .filter(Boolean);
}

function getSegmentDescriptor(segmentId) {
    if (!Number.isInteger(Number(segmentId)) || Number(segmentId) <= 0) {
        return null;
    }

    const segment = getSegmentById(Number(segmentId));
    if (!segment) {
        throw new Error('Segment not found');
    }

    return {
        segment,
        filters: normalizeAudienceFilters(segment.filters)
    };
}

function assertManualContactSegment(descriptor) {
    if (!descriptor || descriptor.filters.mode !== 'manual' || descriptor.filters.source !== 'contacts') {
        const error = new Error('Only manual contact segments support CSV contact import');
        error.statusCode = 400;
        throw error;
    }
}

function getSegmentDetailRows(descriptor, { limit, offset }) {
    const id = Number(descriptor.segment.id);
    const mode = descriptor.filters.mode;
    const source = descriptor.filters.source;

    if (mode === 'manual') {
        return {
            total: countSegmentMembers(id),
            rows: listSegmentMembers(id, { limit, offset })
        };
    }

    if (source === 'contacts') {
        return {
            total: countContactsForCampaign({ query: descriptor.filters.query || '' }),
            rows: listContactAudiencePage({ query: descriptor.filters.query || '', limit, offset })
        };
    }

    return {
        total: countVehicleAudienceByFilters(descriptor.filters),
        rows: listVehicleAudiencePage({ ...descriptor.filters, limit, offset })
    };
}

function renderSegmentDetailResponse(req, { descriptor, importPreview = null, importResult = null } = {}) {
    const { limit, offset } = getPaging(req);
    const { rows, total } = getSegmentDetailRows(descriptor, { limit, offset });

    return renderSegmentDetailPage({
        segment: descriptor.segment,
        segmentFilters: descriptor.filters,
        rows,
        total,
        offset,
        limit,
        importPreview,
        importResult
    });
}

function parseSegmentContactCsv(fileBuffer) {
    const csvContent = fileBuffer.toString('utf8').replace(/^\uFEFF/, '');
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
        const error = new Error(`Error al parsear CSV: ${parseError.message}`);
        error.statusCode = 400;
        throw error;
    }

    if (!records.length) {
        const error = new Error('El archivo CSV está vacío');
        error.statusCode = 400;
        throw error;
    }

    if (records.length > 5000) {
        const error = new Error('Máximo 5000 registros por importación');
        error.statusCode = 400;
        throw error;
    }

    const firstRecord = records[0];
    const originalHeaders = Object.keys(firstRecord);
    const normalizedHeaders = originalHeaders.reduce((acc, header) => {
        const key = String(header || '').trim().toLowerCase();
        if (key) {
            acc[key] = header;
        }
        return acc;
    }, {});

    const phoneHeader = normalizedHeaders.phone || normalizedHeaders.telefono || normalizedHeaders['teléfono'];
    const nameHeader = normalizedHeaders.name || normalizedHeaders.nombre || null;

    if (!phoneHeader) {
        const error = new Error('Falta columna requerida: phone o telefono');
        error.statusCode = 400;
        throw error;
    }

    const validRecords = [];
    const invalidRows = [];
    const seenPhones = new Set();

    records.forEach((row, index) => {
        const rowNum = index + 2;
        const rawPhone = String(row[phoneHeader] || '').trim();
        const rawName = nameHeader ? String(row[nameHeader] || '').trim() : '';

        if (!rawPhone) {
            invalidRows.push({ row: rowNum, phone: '', error: 'Teléfono vacío' });
            return;
        }

        const phone = normalizePhone(rawPhone);
        if (!phone || !phone.match(/^\+[1-9]\d{7,14}$/)) {
            invalidRows.push({ row: rowNum, phone: rawPhone, error: 'Formato de teléfono inválido (E.164)' });
            return;
        }

        if (seenPhones.has(phone)) {
            invalidRows.push({ row: rowNum, phone, error: 'Teléfono duplicado en archivo' });
            return;
        }

        seenPhones.add(phone);
        validRecords.push({ row: rowNum, phone, name: rawName || null });
    });

    return { validRecords, invalidRows };
}

function buildSegmentContactImportPreview(segmentId, records = [], invalidRows = []) {
    const existingSegmentIds = new Set(
        listSegmentRecipientTargets(segmentId, { limit: 100000 })
            .map((item) => Number(item.contact_id || 0))
            .filter((id) => id > 0)
    );

    const validRows = records.map((record) => {
        const existingContact = getContactByPhone(record.phone);
        const inSegment = existingContact ? existingSegmentIds.has(Number(existingContact.id || 0)) : false;
        const optedOut = isOptedOut(record.phone);
        const inactive = existingContact ? existingContact.status !== 'active' : false;

        let state = 'nuevo';
        if (inSegment) {
            state = 'ya en segmento';
        } else if (optedOut || inactive) {
            state = 'no elegible';
        } else if (existingContact) {
            state = 'existente';
        }

        return {
            phone: record.phone,
            name: record.name || existingContact?.name || '',
            state
        };
    });

    return {
        records,
        validRows,
        invalidRows,
        validCount: records.length,
        invalidCount: invalidRows.length
    };
}

function importContactsIntoManualSegment(segmentId, records = []) {
    const existingSegmentIds = new Set(
        listSegmentRecipientTargets(segmentId, { limit: 100000 })
            .map((item) => Number(item.contact_id || 0))
            .filter((id) => id > 0)
    );

    const result = {
        processed: Array.isArray(records) ? records.length : 0,
        createdContacts: 0,
        reusedContacts: 0,
        addedToSegment: 0,
        alreadyInSegment: 0,
        skippedIneligible: 0,
        totalMembers: countSegmentMembers(segmentId)
    };

    const recipientsToAdd = [];

    for (const record of Array.isArray(records) ? records : []) {
        const existingBefore = getContactByPhone(record.phone);
        const contact = upsertContact(record.phone, record.name || null);

        if (!existingBefore) {
            result.createdContacts++;
        } else {
            result.reusedContacts++;
        }

        const contactId = Number(contact?.id || 0);
        if (!contactId) {
            continue;
        }

        if ((contact.status && contact.status !== 'active') || isOptedOut(contact.phone || record.phone)) {
            result.skippedIneligible++;
            continue;
        }

        if (existingSegmentIds.has(contactId)) {
            result.alreadyInSegment++;
            continue;
        }

        recipientsToAdd.push({ contact_id: contactId });
        existingSegmentIds.add(contactId);
    }

    const previousTotal = result.totalMembers;
    result.totalMembers = addMembersToSegment(segmentId, recipientsToAdd);
    result.addedToSegment = Math.max(0, result.totalMembers - previousTotal);

    return result;
}

function resolveAudiencePreviewItems(candidates = [], source = 'vehicles', limit = 10) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 20));
    return candidates.slice(0, safeLimit).map((candidate) => {
        if (source === 'contacts') {
            return {
                id: candidate.contact_id || candidate.id,
                contact_id: candidate.contact_id || candidate.id,
                phone: candidate.phone,
                name: candidate.name || null
            };
        }

        return {
            id: candidate.contact_id || candidate.id,
            contact_id: candidate.contact_id || candidate.id,
            vehicle_id: candidate.vehicle_id || null,
            phone: candidate.phone,
            name: candidate.name || null,
            make: candidate.make || null,
            model: candidate.model || null,
            year: candidate.year || null,
            link: candidate.link || null
        };
    });
}

function escapeCsvValue(value) {
    const text = String(value ?? '');
    if (/[",\n\r]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

function toCsv(headers = [], rows = []) {
    const headerLine = headers.map(escapeCsvValue).join(',');
    const bodyLines = rows.map((row) => row.map(escapeCsvValue).join(','));
    return [headerLine, ...bodyLines].join('\n');
}

function toSegmentFileSafeName(name = '') {
    return String(name || 'segmento')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase() || 'segmento';
}

function resolveAudienceCandidates({ source = 'vehicles', filters = {}, limit = 10000 } = {}) {
    return resolveAudienceCandidatesFromFns({
        getSegmentById,
        countSegmentMembers,
        listSegmentRecipientTargets,
        listContactsForCampaign,
        countContactsForCampaign,
        listVehicleContactsByFilters,
        countVehicleAudienceByFilters
    }, { source, filters, limit });
}

function sendJsonError(res, error, fallbackMessage) {
    const statusCode = Number(error?.statusCode) === 400 ? 400 : 500;
    return res.status(statusCode).json({ error: error?.message || fallbackMessage });
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

if (SHOULD_BOOT_BACKGROUND_JOBS) {
    setInterval(processCampaignQueue, SCHEDULER_INTERVAL_MS);
    processCampaignQueue();
}

app.use('/admin', adminAuth);

app.get('/admin', (req, res) => {
    const stats = getAdminStats();
    const metrics = getDashboardMetrics();
    res.status(200).type('text/html').send(renderDashboardPage({ stats, metrics }));
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
    const engagement = getContactEngagementStats(id);
    res.status(200).type('text/html').send(renderContactEditPage({ contact, vehicles, engagement }));
});

// POST /admin/contacts/:id - Update contact
app.post('/admin/contacts/:id', adminAuth, express.urlencoded({ extended: true }), (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
        return res.status(400).send('Invalid contact ID');
    }

    const originalContact = getContactById(id);
    if (!originalContact) {
        return res.status(404).send('Contact not found');
    }

    const { phone, name, status } = req.body;

    // Validate phone format (E.164)
    if (!phone || !phone.match(/^\+[1-9]\d{1,14}$/)) {
        return res.status(400).type('text/html').send(
            renderContactEditPage({ contact: originalContact, vehicles: getVehiclesByContactId(id), engagement: getContactEngagementStats(id), error: 'Invalid phone format. Must be E.164 format (e.g., +56975400946)' })
        );
    }

    // Validate status
    if (!['active', 'opted_out', 'invalid'].includes(status)) {
        return res.status(400).type('text/html').send(
            renderContactEditPage({ contact: originalContact, vehicles: getVehiclesByContactId(id), engagement: getContactEngagementStats(id), error: 'Invalid status value' })
        );
    }

    try {
        const updated = updateContact(id, { phone, name: name || null, status });
        if (!updated) {
            return res.status(500).send('Failed to update contact');
        }

        if (status === 'opted_out') {
            insertOptOut(updated.phone, 'global_manual', {
                source: 'admin',
                createdBy: 'admin_contact_edit',
                reasonDetail: 'Aplicado manualmente desde edición de contacto'
            });
            updateContactStatus(updated.phone, 'opted_out');
        } else {
            releaseOptOut(originalContact.phone, 'admin_contact_edit');
            if (updated.phone !== originalContact.phone) {
                releaseOptOut(updated.phone, 'admin_contact_edit');
            }
            if (status === 'active') {
                updateContactStatus(updated.phone, 'active');
            }
        }

        // Redirect back to contacts list
        res.redirect('/admin/contacts');
    } catch (error) {
        console.error('Contact update error:', error);
        res.status(500).type('text/html').send(
            renderContactEditPage({ contact: originalContact, vehicles: getVehiclesByContactId(id), engagement: getContactEngagementStats(id), error: error.message })
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
        if (contactData.status === 'opted_out') {
            insertOptOut(newContact.phone, 'global_manual', {
                source: 'admin',
                createdBy: 'admin_contact_create',
                reasonDetail: 'Contacto creado ya en BAJA global'
            });
        }
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

// ============================================================
// Vehicles admin routes
// ============================================================

app.get('/admin/vehicles', (req, res) => {
    const { limit, offset } = getPaging(req);
    const make   = String(req.query.make   || '').trim();
    const search = String(req.query.search || '').trim();
    const yearMin = req.query.year_min ? Number(req.query.year_min) : null;
    const yearMax = req.query.year_max ? Number(req.query.year_max) : null;

    const filters = {
        make: make || null,
        yearMin: yearMin || null,
        yearMax: yearMax || null,
        search: search || null
    };

    const vehicles    = listVehicles({ ...filters, limit, offset });
    const total       = countVehicles(filters);
    const vehicleStats = getVehicleStats();
    const makes       = listVehicleMakes();

    res.status(200).type('text/html').send(renderVehiclesPage({
        vehicles, vehicleStats, makes,
        filters: { make, yearMin: yearMin || '', yearMax: yearMax || '', search },
        offset, limit, total
    }));
});

app.get('/admin/vehicles/new', (req, res) => {
    const prePhone = String(req.query.phone || '').trim();
    const back = String(req.query.back || '/admin/vehicles');
    res.status(200).type('text/html').send(renderVehicleFormPage({
        vehicle: null,
        formData: { contact_phone: prePhone, back }
    }));
});

app.post('/admin/vehicles', express.urlencoded({ extended: true }), (req, res) => {
    const { contact_phone, make, model, year, price, link, back } = req.body;
    const backUrl = String(back || '/admin/vehicles');

    const phone = normalizePhone(String(contact_phone || '').trim());
    if (!phone) {
        return res.status(400).type('text/html').send(renderVehicleFormPage({
            error: 'Teléfono inválido. Debe estar en formato E.164 (ej: +56975400946).',
            formData: req.body
        }));
    }

    const contact = getContactByPhone(phone);
    if (!contact) {
        return res.status(400).type('text/html').send(renderVehicleFormPage({
            error: `No existe ningún contacto con el teléfono ${phone}. Créalo primero desde Contactos.`,
            formData: req.body
        }));
    }

    const trimMake  = String(make  || '').trim();
    const trimModel = String(model || '').trim();
    const parsedYear = parseInt(year);

    if (!trimMake || !trimModel || !parsedYear || parsedYear < 1960 || parsedYear > 2030) {
        return res.status(400).type('text/html').send(renderVehicleFormPage({
            error: 'Marca, modelo y año válido son obligatorios.',
            formData: req.body
        }));
    }

    try {
        createVehicle({
            contact_id: contact.id,
            make: trimMake,
            model: trimModel,
            year: parsedYear,
            price: price ? parseFloat(price) : null,
            link: String(link || '').trim() || null
        });
        res.redirect(backUrl);
    } catch (err) {
        console.error('Vehicle create error:', err);
        res.status(500).type('text/html').send(renderVehicleFormPage({
            error: err.message,
            formData: req.body
        }));
    }
});

app.get('/admin/vehicles/:id/edit', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).send('Invalid vehicle ID');

    const vehicle = getVehicleById(id);
    if (!vehicle) return res.status(404).send('Vehicle not found');

    const back = String(req.query.back || '/admin/vehicles');
    res.status(200).type('text/html').send(renderVehicleFormPage({ vehicle, formData: { back } }));
});

app.post('/admin/vehicles/:id', express.urlencoded({ extended: true }), (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).send('Invalid vehicle ID');

    const { contact_phone, make, model, year, price, link, back } = req.body;
    const backUrl = String(back || '/admin/vehicles');

    const phone = normalizePhone(String(contact_phone || '').trim());
    if (!phone) {
        const vehicle = getVehicleById(id);
        return res.status(400).type('text/html').send(renderVehicleFormPage({
            vehicle,
            error: 'Teléfono inválido. Debe estar en formato E.164 (ej: +56975400946).',
            formData: req.body
        }));
    }

    const contact = getContactByPhone(phone);
    if (!contact) {
        const vehicle = getVehicleById(id);
        return res.status(400).type('text/html').send(renderVehicleFormPage({
            vehicle,
            error: `No existe ningún contacto con el teléfono ${phone}.`,
            formData: req.body
        }));
    }

    const trimMake  = String(make  || '').trim();
    const trimModel = String(model || '').trim();
    const parsedYear = parseInt(year);

    if (!trimMake || !trimModel || !parsedYear || parsedYear < 1960 || parsedYear > 2030) {
        const vehicle = getVehicleById(id);
        return res.status(400).type('text/html').send(renderVehicleFormPage({
            vehicle,
            error: 'Marca, modelo y año válido son obligatorios.',
            formData: req.body
        }));
    }

    try {
        updateVehicle(id, {
            contact_id: contact.id,
            make: trimMake,
            model: trimModel,
            year: parsedYear,
            price: price ? parseFloat(price) : null,
            link: String(link || '').trim() || null
        });
        res.redirect(backUrl);
    } catch (err) {
        console.error('Vehicle update error:', err);
        const vehicle = getVehicleById(id);
        res.status(500).type('text/html').send(renderVehicleFormPage({
            vehicle,
            error: err.message,
            formData: req.body
        }));
    }
});

app.post('/admin/vehicles/:id/delete', express.urlencoded({ extended: true }), (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).send('Invalid vehicle ID');

    const backUrl = String(req.body.back || '/admin/vehicles');

    try {
        const deleted = dbDeleteVehicle(id);
        if (!deleted) return res.status(404).send('Vehicle not found');
        res.redirect(backUrl);
    } catch (err) {
        console.error('Vehicle delete error:', err);
        res.status(500).send('Failed to delete vehicle: ' + err.message);
    }
});

app.post('/admin/vehicles/:id/suppress', adminAuth, express.urlencoded({ extended: true }), (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).send('Invalid vehicle ID');

    const backUrl = String(req.body.back || `/admin/vehicles/${id}/edit`);
    const reasonCode = String(req.body.reason_code || 'vehicle_manual').trim() || 'vehicle_manual';
    const notes = String(req.body.notes || '').trim() || null;

    try {
        const vehicle = getVehicleById(id);
        if (!vehicle) {
            return res.status(404).send('Vehicle not found');
        }
        createVehicleSuppression({
            vehicleId: id,
            phone: vehicle.contact_phone,
            reasonCode,
            reasonDetail: notes || 'Aplicado manualmente desde admin',
            source: 'manual',
            createdBy: 'admin_vehicle'
        });
        res.redirect(backUrl);
    } catch (error) {
        console.error('Vehicle suppression create error:', error);
        res.status(500).send('Failed to suppress vehicle: ' + error.message);
    }
});

app.post('/admin/vehicles/:id/release-suppression', adminAuth, express.urlencoded({ extended: true }), (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).send('Invalid vehicle ID');

    const backUrl = String(req.body.back || `/admin/vehicles/${id}/edit`);

    try {
        const vehicle = getVehicleById(id);
        if (!vehicle?.suppression_id) {
            return res.redirect(backUrl);
        }
        releaseVehicleSuppression(vehicle.suppression_id, 'admin_vehicle');
        res.redirect(backUrl);
    } catch (error) {
        console.error('Vehicle suppression release error:', error);
        res.status(500).send('Failed to release vehicle suppression: ' + error.message);
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

app.get('/admin/lab/chat', (req, res) => {
    res.status(200).type('text/html').send(renderChatLabPage({
        defaultPhone: LAB_CHAT_DEFAULT_PHONE,
        scenarioCatalog: getLabScenarioCatalog()
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
    const vehicleSuppressions = listVehicleSuppressions({ limit, offset });
    res.status(200).type('text/html').send(renderOptOutsPage({
        optOuts,
        vehicleSuppressions,
        offset,
        limit
    }));
});

app.post('/admin/opt-outs/manual', adminAuth, express.urlencoded({ extended: true }), (req, res) => {
    const phone = normalizePhone(String(req.body.phone || '').trim());
    const reasonCode = String(req.body.reason_code || 'global_manual').trim() || 'global_manual';
    const reasonDetail = String(req.body.reason_detail || '').trim() || 'Aplicado manualmente desde admin';

    if (!phone) {
        return res.status(400).send('Teléfono inválido');
    }

    try {
        upsertContact(phone, null);
        insertOptOut(phone, reasonCode, {
            source: 'admin',
            createdBy: 'admin_optout_page',
            reasonDetail
        });
        updateContactStatus(phone, 'opted_out');
        res.redirect('/admin/opt-outs');
    } catch (error) {
        console.error('Manual opt-out create error:', error);
        res.status(500).send('Failed to create opt-out: ' + error.message);
    }
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
        releaseOptOut(phone, 'admin_optout_release');
        updateContactStatus(phone, 'active');
        res.status(200).send('Opt-out released');
    } catch (error) {
        console.error('Opt-out delete error:', error);
        res.status(500).send('Failed to delete opt-out: ' + error.message);
    }
});

app.post('/admin/api/vehicle-suppressions/:id/release', adminAuth, express.json(), (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid suppression id' });
    }
    try {
        releaseVehicleSuppression(id, 'admin_optout_release');
        res.status(200).json({ ok: true });
    } catch (error) {
        console.error('Vehicle suppression release API error:', error);
        res.status(500).json({ error: error.message });
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

// Feature 3: Bulk opt-out import
app.post('/admin/import/optouts', adminAuth, upload.single('csvFile'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(200).type('text/html').send(
                renderImportPage({ optOutResult: { error: 'No se seleccionó archivo' } })
            );
        }

        const csvContent = req.file.buffer.toString('utf8').replace(/^﻿/, '');
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
            return res.status(200).type('text/html').send(
                renderImportPage({ optOutResult: { error: 'Error al parsear el CSV: ' + parseError.message } })
            );
        }

        const phones = [];
        const invalidRows = [];
        for (let i = 0; i < records.length; i++) {
            const row = records[i];
            const raw = row.Telefono || row.telefono || row.TELEFONO || row.Phone || row.phone || '';
            if (!raw) {
                invalidRows.push({ row: i + 2, value: '', reason: 'Teléfono vacío' });
                continue;
            }
            const normalized = normalizePhone(String(raw).trim());
            if (!normalized || !normalized.match(/^\+[1-9]\d{7,14}$/)) {
                invalidRows.push({ row: i + 2, value: raw, reason: 'Formato inválido' });
                continue;
            }
            phones.push(normalized);
        }

        const inserted = phones.length > 0 ? bulkInsertOptOuts(phones) : 0;
        res.status(200).type('text/html').send(renderImportPage({
            optOutResult: {
                total: records.length,
                valid: phones.length,
                inserted,
                skipped: phones.length - inserted,
                invalidCount: invalidRows.length
            }
        }));
    } catch (error) {
        console.error('Import opt-outs error:', error);
        res.status(500).send('Error al importar opt-outs: ' + error.message);
    }
});

// ============================================================
// Campaign Management API
// ============================================================

app.post('/admin/api/campaigns', adminAuth, express.json(), (req, res) => {
    try {
        const { name, messageTemplate, type, scheduledAt, contentSid, templateId, filters, recipientIds, recipients, isTest } = req.body;
        const normalizedScheduledAt = normalizeScheduledAt(scheduledAt);
        const status = normalizedScheduledAt ? 'scheduled' : 'draft';
        const normalizedTemplateId = normalizeTemplateId(templateId);
        let resolvedFilters = filters ? validateSegmentDefinition(filters) : null;
        let resolvedRecipients = normalizeRecipientAssignments(recipients || recipientIds || []);
        let resolvedAudience = null;

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

        if (!Boolean(isTest) && !resolvedRecipients.length && resolvedFilters?.source) {
            resolvedAudience = resolveAudienceCandidates({
                source: resolvedFilters.source,
                filters: resolvedFilters,
                limit: 10000
            });
            resolvedRecipients = normalizeRecipientAssignments(resolvedAudience.candidates);
            resolvedFilters = resolvedAudience.filters;
        }

        const campaign = createCampaign({
            name,
            messageTemplate: resolvedMessageTemplate,
            type: normalizedType,
            scheduledAt: normalizedScheduledAt,
            templateId: normalizedTemplateId,
            contentSid: resolvedContentSid,
            filters: resolvedFilters,
            status,
            isTest: Boolean(isTest)
        });

        // Assign recipients if provided
        if (resolvedRecipients.length > 0) {
            assignRecipientsToCampaign(campaign.id, resolvedRecipients);
            if (resolvedAudience?.segmentId) {
                updateSegmentLastUsed(resolvedAudience.segmentId, campaign.id);
            }
        }

        res.status(201).json(getCampaignById(campaign.id) || campaign);
    } catch (error) {
        console.error('Create campaign error:', error);
        sendJsonError(res, error, 'Failed to create campaign');
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

        const hasRecipientsPayload = Array.isArray(updates.recipientIds)
            || Array.isArray(updates.recipients)
            || Object.prototype.hasOwnProperty.call(updates, 'filters');

        let resolvedFilters = Object.prototype.hasOwnProperty.call(updates, 'filters')
            ? (updates.filters ? validateSegmentDefinition(updates.filters) : null)
            : (current.filters ? normalizeAudienceFilters(current.filters) : null);
        let resolvedAudience = null;
        let resolvedRecipients = normalizeRecipientAssignments(updates.recipients || updates.recipientIds || []);

        if (!Boolean(current.is_test || updates.isTest) && hasRecipientsPayload && !resolvedRecipients.length && resolvedFilters?.source) {
            resolvedAudience = resolveAudienceCandidates({
                source: resolvedFilters.source,
                filters: resolvedFilters,
                limit: 10000
            });
            resolvedRecipients = normalizeRecipientAssignments(resolvedAudience.candidates);
            resolvedFilters = resolvedAudience.filters;
        }

        const payload = {
            name: updates.name ?? current.name,
            messageTemplate: resolvedMessageTemplate,
            type: nextType,
            scheduledAt: normalizedScheduledAt,
            templateId: normalizedTemplateId,
            contentSid: resolvedContentSid,
            filters: resolvedFilters
        };

        let campaign = updateCampaignFull(id, payload);

        if (hasRecipientsPayload && ['draft', 'scheduled'].includes(current.status)) {
            clearCampaignRecipients(id);
            if (resolvedRecipients.length > 0) {
                assignRecipientsToCampaign(id, resolvedRecipients);
                if (resolvedAudience?.segmentId) {
                    updateSegmentLastUsed(resolvedAudience.segmentId, id);
                }
            }
            campaign = getCampaignById(id) || campaign;
        }

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
        sendJsonError(res, error, 'Failed to update campaign');
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

// Feature 1: Duplicate campaign
app.post('/admin/api/campaigns/:id/duplicate', adminAuth, (req, res) => {
    try {
        const original = getCampaignById(Number(req.params.id));
        if (!original) return res.status(404).json({ error: 'Campaign not found' });
        const copy = createCampaign({
            name: original.name + ' — Copia',
            messageTemplate: original.message_template,
            type: original.type,
            contentSid: original.content_sid,
            templateId: original.template_id || null,
            filters: original.filters ? JSON.parse(original.filters) : null,
            status: 'draft',
            isTest: Boolean(original.is_test)
        });

        const originalTargets = listCampaignRecipientTargets(original.id);

        if (originalTargets.length > 0) {
            assignRecipientsToCampaign(copy.id, originalTargets);
        }

        res.status(201).json(getCampaignById(copy.id));
    } catch (error) {
        console.error('Duplicate campaign error:', error);
        res.status(500).json({ error: 'Failed to duplicate campaign' });
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
        const { source = 'vehicles', filters = {}, query = '', recipients = [] } = req.body || {};
        const explicitRecipients = normalizeRecipientAssignments(recipients);

        let candidates = explicitRecipients;
        let resolvedAudience = null;
        if (!candidates.length) {
            resolvedAudience = resolveAudienceCandidates({
                source,
                filters: { ...filters, query },
                limit: 10000
            });
            candidates = normalizeRecipientAssignments(resolvedAudience.candidates);
        }

        const count = assignRecipientsToCampaign(id, candidates);

        if (resolvedAudience?.segmentId && count > 0) {
            updateSegmentLastUsed(resolvedAudience.segmentId, id);
        }

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
        const safeLimit = Math.max(1, Math.min(Number(limit) || 3, 20));
        const resolved = resolveAudienceCandidates({ source, filters, limit: safeLimit });
        const samples = resolveAudiencePreviewItems(resolved.candidates, resolved.source, safeLimit);

        res.json({
            samples,
            total: resolved.total,
            source: resolved.source,
            mode: resolved.mode,
            segmentId: resolved.segmentId || null
        });
    } catch (error) {
        console.error('Preview samples error:', error);
        sendJsonError(res, error, 'Preview samples failed');
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
// Feature J: Segments Routes
// ============================================================

app.get('/admin/segments', adminAuth, (req, res) => {
    const segments = listSegmentsWithCount();
    const makes = listVehicleMakes();
    const years = listVehicleYears();
    res.status(200).type('text/html').send(renderSegmentsPage({ segments, makes, years }));
});

app.get('/admin/segments/:id', adminAuth, (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).send('Invalid segment ID');
        }

        const descriptor = getSegmentDescriptor(id);
        res.status(200).type('text/html').send(renderSegmentDetailResponse(req, { descriptor }));
    } catch (error) {
        console.error('Segment detail error:', error);
        res.status(500).send('Failed to load segment detail');
    }
});

app.post('/admin/segments/:id/import-contacts/upload', adminAuth, upload.single('csvFile'), (req, res) => {
    try {
        const id = Number(req.params.id);
        const descriptor = getSegmentDescriptor(id);
        assertManualContactSegment(descriptor);

        if (!req.file) {
            return res.status(200).type('text/html').send(renderSegmentDetailResponse(req, {
                descriptor,
                importPreview: { error: 'No se seleccionó archivo', records: [], validRows: [], invalidRows: [], validCount: 0, invalidCount: 0 }
            }));
        }

        const { validRecords, invalidRows } = parseSegmentContactCsv(req.file.buffer);
        const importPreview = buildSegmentContactImportPreview(id, validRecords, invalidRows);
        res.status(200).type('text/html').send(renderSegmentDetailResponse(req, { descriptor, importPreview }));
    } catch (error) {
        console.error('Segment contact import preview error:', error);
        const id = Number(req.params.id);
        const descriptor = Number.isInteger(id) && id > 0 ? getSegmentDescriptor(id) : null;
        if (descriptor) {
            return res.status(200).type('text/html').send(renderSegmentDetailResponse(req, {
                descriptor,
                importPreview: {
                    error: error.message || 'No se pudo procesar el CSV',
                    records: [],
                    validRows: [],
                    invalidRows: [],
                    validCount: 0,
                    invalidCount: 0
                }
            }));
        }
        res.status(error.statusCode || 500).send(error.message || 'Failed to preview contact CSV import');
    }
});

app.post('/admin/segments/:id/import-contacts/confirm', adminAuth, express.urlencoded({ extended: false, limit: '10mb' }), (req, res) => {
    try {
        const id = Number(req.params.id);
        const descriptor = getSegmentDescriptor(id);
        assertManualContactSegment(descriptor);

        const csvData = String(req.body?.csvData || '').trim();
        if (!csvData) {
            return res.status(200).type('text/html').send(renderSegmentDetailResponse(req, {
                descriptor,
                importResult: { error: 'No hay registros válidos para importar' }
            }));
        }

        let records;
        try {
            records = JSON.parse(csvData);
        } catch (_) {
            return res.status(200).type('text/html').send(renderSegmentDetailResponse(req, {
                descriptor,
                importResult: { error: 'Datos de importación inválidos' }
            }));
        }

        const importResult = importContactsIntoManualSegment(id, Array.isArray(records) ? records : []);
        res.status(200).type('text/html').send(renderSegmentDetailResponse(req, { descriptor, importResult }));
    } catch (error) {
        console.error('Segment contact import confirm error:', error);
        const id = Number(req.params.id);
        const descriptor = Number.isInteger(id) && id > 0 ? getSegmentDescriptor(id) : null;
        if (descriptor) {
            return res.status(200).type('text/html').send(renderSegmentDetailResponse(req, {
                descriptor,
                importResult: { error: error.message || 'No se pudo importar el CSV' }
            }));
        }
        res.status(error.statusCode || 500).send(error.message || 'Failed to import contact CSV');
    }
});

app.get('/admin/api/segments', adminAuth, (req, res) => {
    try {
        const source = req.query?.source === 'contacts'
            ? 'contacts'
            : (req.query?.source === 'vehicles' ? 'vehicles' : null);
        const segments = listSegments(source ? { source } : undefined);
        res.json({ segments });
    } catch (error) {
        console.error('API segments error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/admin/api/segments', adminAuth, express.json(), (req, res) => {
    const { name, filters } = req.body || {};
    if (!name?.trim()) {
        return res.status(400).json({ error: 'Name is required' });
    }
    try {
        const normalizedFilters = validateSegmentDefinition(filters || {});
        const segment = createSegment(name.trim(), normalizedFilters);
        res.status(201).json({ segment });
    } catch (error) {
        console.error('Segment create error:', error);
        sendJsonError(res, error, 'Failed to create segment');
    }
});

app.patch('/admin/api/segments/:id', adminAuth, express.json(), (req, res) => {
    const id = Number(req.params.id);
    const current = Number.isInteger(id) && id > 0 ? getSegmentById(id) : null;
    if (!current) {
        return res.status(404).json({ error: 'Segment not found' });
    }

    const nextName = String(req.body?.name ?? current.name ?? '').trim();
    if (!nextName) {
        return res.status(400).json({ error: 'Name is required' });
    }

    try {
        const currentFilters = normalizeAudienceFilters(current.filters);
        const nextFilters = validateSegmentDefinition({
            ...currentFilters,
            ...(req.body?.filters || {}),
            source: req.body?.filters?.source ?? currentFilters.source,
            mode: req.body?.filters?.mode ?? currentFilters.mode,
            segmentId: null
        }, {
            expectedSource: currentFilters.source
        });
        const segment = updateSegment(id, {
            name: nextName,
            filters: nextFilters
        });
        res.status(200).json({ segment });
    } catch (error) {
        console.error('Segment update error:', error);
        sendJsonError(res, error, 'Failed to update segment');
    }
});

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
        res.status(200).json({ ok: true });
    } catch (error) {
        console.error('Segment delete error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/admin/api/segments/:id/members/preview', adminAuth, express.json(), (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ error: 'Invalid segment ID' });
        }

        const descriptor = getSegmentDescriptor(id);
        const source = descriptor.filters.source;
        const requestFilters = req.body?.filters || {};
        const incomingFilters = validateSegmentDefinition({
            ...requestFilters,
            source: requestFilters.source ?? source
        }, { expectedSource: source });
        const resolved = resolveAudienceCandidates({
            source,
            filters: incomingFilters,
            limit: Math.max(1, Math.min(Number(req.body?.limit) || 10, 20))
        });

        const samples = resolveAudiencePreviewItems(resolved.candidates, source, 10);

        res.json({
            segment: descriptor.segment,
            source,
            mode: descriptor.filters.mode,
            total: resolved.total,
            samples
        });
    } catch (error) {
        console.error('Segment members preview error:', error);
        sendJsonError(res, error, 'Failed to preview segment members');
    }
});

app.post('/admin/api/segments/:id/members/bulk-add', adminAuth, express.json(), (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ error: 'Invalid segment ID' });
        }

        const descriptor = getSegmentDescriptor(id);
        if (descriptor.filters.mode !== 'manual') {
            return res.status(400).json({ error: 'Only manual segments accept explicit members' });
        }

        const requestFilters = req.body?.filters || {};
        const incomingFilters = validateSegmentDefinition({
            ...requestFilters,
            source: requestFilters.source ?? descriptor.filters.source
        }, { expectedSource: descriptor.filters.source });

        const resolved = resolveAudienceCandidates({
            source: descriptor.filters.source,
            filters: incomingFilters,
            limit: 10000
        });
        const recipients = normalizeRecipientAssignments(resolved.candidates);
        const totalMembers = addMembersToSegment(id, recipients);

        res.json({
            added: recipients.length,
            totalMembers,
            source: descriptor.filters.source
        });
    } catch (error) {
        console.error('Segment members bulk add error:', error);
        sendJsonError(res, error, 'Failed to add segment members');
    }
});

app.delete('/admin/api/segments/:id/members/:memberId', adminAuth, (req, res) => {
    try {
        const id = Number(req.params.id);
        const memberId = Number(req.params.memberId);
        if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(memberId) || memberId <= 0) {
            return res.status(400).json({ error: 'Invalid segment member reference' });
        }

        const descriptor = getSegmentDescriptor(id);
        if (descriptor.filters.mode !== 'manual') {
            return res.status(400).json({ error: 'Only manual segments allow member removal' });
        }

        const removed = removeSegmentMember(id, memberId);
        if (!removed) {
            return res.status(404).json({ error: 'Segment member not found' });
        }

        res.status(200).json({ ok: true, totalMembers: countSegmentMembers(id) });
    } catch (error) {
        console.error('Segment member delete error:', error);
        res.status(500).json({ error: error.message || 'Failed to remove segment member' });
    }
});

app.get('/admin/segments/:id/export', adminAuth, (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).send('Invalid segment ID');
        }

        const descriptor = getSegmentDescriptor(id);
        const mode = descriptor.filters.mode;
        const source = descriptor.filters.source;
        const exportLimit = 100000;
        let rows = [];
        let headers = [];

        if (mode === 'manual') {
            rows = listSegmentMembers(id, { limit: exportLimit, offset: 0 });
            headers = source === 'contacts'
                ? ['member_id', 'contact_id', 'phone', 'name', 'status', 'created_at']
                : ['member_id', 'contact_id', 'vehicle_id', 'phone', 'name', 'make', 'model', 'year', 'link', 'created_at'];
        } else if (source === 'contacts') {
            rows = listContactAudiencePage({ query: descriptor.filters.query || '', limit: exportLimit, offset: 0 });
            headers = ['contact_id', 'phone', 'name', 'status', 'updated_at'];
        } else {
            rows = listVehicleAudiencePage({ ...descriptor.filters, limit: exportLimit, offset: 0 });
            headers = ['contact_id', 'vehicle_id', 'phone', 'name', 'make', 'model', 'year', 'link'];
        }

        const csvRows = rows.map((row) => {
            if (mode === 'manual' && source === 'contacts') {
                return [row.id, row.contact_id, row.phone, row.name, row.status, row.created_at];
            }
            if (mode === 'manual' && source === 'vehicles') {
                return [row.id, row.contact_id, row.vehicle_id, row.phone, row.name, row.make, row.model, row.year, row.link, row.created_at];
            }
            if (source === 'contacts') {
                return [row.id, row.phone, row.name, row.status, row.updated_at];
            }
            return [row.contact_id, row.vehicle_id, row.phone, row.name, row.make, row.model, row.year, row.link];
        });

        const csv = toCsv(headers, csvRows);
        const filename = `${toSegmentFileSafeName(descriptor.segment.name)}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.status(200).send(`\uFEFF${csv}`);
    } catch (error) {
        console.error('Segment export error:', error);
        res.status(500).send('Failed to export segment');
    }
});

// ============================================================
// Feature 4: Inbox Routes
// ============================================================

app.get('/admin/inbox', adminAuth, (req, res) => {
    const { limit, offset } = getPaging(req);
    const filter = ['all', 'unread', 'read'].includes(req.query.filter) ? req.query.filter : 'all';
    const conversations = listInboxConversations({ limit, offset });
    const unreadCount = countUnreadConversations();
    res.status(200).type('text/html').send(renderInboxPage({ conversations, filter, unreadCount }));
});

app.post('/admin/api/inbox/:phone/read', adminAuth, (req, res) => {
    const phone = decodeURIComponent(req.params.phone);
    markConversationRead(phone);
    res.status(200).json({ ok: true });
});

app.post('/admin/api/inbox/:phone/unread', adminAuth, (req, res) => {
    const phone = decodeURIComponent(req.params.phone);
    markConversationUnread(phone);
    res.status(200).json({ ok: true });
});

app.get('/admin/api/inbox/unread-count', adminAuth, (req, res) => {
    res.status(200).json({ count: countUnreadConversations() });
});

// ============================================================
// Webhooks
// ============================================================
async function processInboundMessage({ from, body, messageSid = null, persist = true, source = 'twilio' }) {
    const text = String(body || '').trim();
    const phone = normalizePhone(from);
    const normalizedBody = normalizeIntentText(text);
    const upper = text.toUpperCase();
    const existingContact = phone ? getContactByPhone(phone) : null;
    const knownVehicles = existingContact?.id
        ? toVehicleContextList(getVehiclesByContactId(existingContact.id))
        : [];
    const knownVehicleSummary = formatVehicleShortSummary(knownVehicles);

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
    const vehicleSuppressionReason = detectVehicleUnavailableReason(text);
    const isVehicleUnavailable = Boolean(vehicleSuppressionReason);

    let reply = 'Gracias por escribir a Queirolo Autos. Responde:\n1) Me interesa consignar\n2) Quiero mas info\n3) BAJA';

    if (isBaja) {
        reply = '✅ Confirmado: Tu número ha sido dado de baja. No recibirás más mensajes de Queirolo Autos.';
    } else if (isVehicleUnavailable) {
        reply = '✅ Gracias por avisar. Dejaremos de contactarte por esta publicación / vehículo.';
    } else if (upper === '1' || upper.includes('CONSIGN')) {
        if (knownVehicles.length > 0) {
            reply = `Perfecto. Ya tengo registrado tu vehiculo (${knownVehicleSummary}). Si quieres, te contacta un ejecutivo en 15-30 min para orientarte mejor.`;
        } else {
            reply = 'Hola, gracias por tu interes en consignar con Queirolo Autos. Analizamos mercado, sugerimos precio y gestionamos la venta sin arriendo mensual y con seguro incluido. Si quieres, te contacto un ejecutivo en 15-30 min para orientarte mejor.';
        }
    } else if (upper === '2' || upper.includes('INFO')) {
        reply = 'Genial. Te cuento: consignamos, publicamos y gestionamos todo. Quieres que te llame un ejecutivo? (SI/NO)';
    }

    let usedAi = false;
    let aiNeedsHuman = false;
    let aiHandoffReason = '';

    if (!isBaja && !isVehicleUnavailable) {
        const handoffState = phone ? getActiveHandoffState(phone) : null;
        const handoffOfferState = phone ? getActiveHandoffOfferState(phone) : null;
        const isPhaticAck = isPhaticAckMessage(text);
        let bypassAiForAck = false;
        let aiResult = null;

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
        } else if (handoffOfferState && isHandoffOfferAffirmative(text)) {
            markHandoffStarted(phone);
            clearHandoffOffer(phone);
            reply = 'Perfecto, quedaste derivado. Te contactamos en 15-30 min.';
            bypassAiForAck = true;
        }

        if (!bypassAiForAck) {
            aiResult = await getN8nChatReply({
                source,
                phone,
                message_text: text,
                message_sid: messageSid,
                received_at: new Date().toISOString(),
                context: {
                    is_opted_out: phone ? isOptedOut(phone) : false,
                    campaign_id: null,
                    contact_id: existingContact?.id || null,
                    contact_name: existingContact?.name || null,
                    handoff_active: Boolean(handoffState),
                    handoff_offer_pending: Boolean(handoffOfferState),
                    known_vehicle_count: knownVehicles.length,
                    known_vehicles: knownVehicles,
                    lab_mode: source === 'lab'
                }
            });

            usedAi = Boolean(aiResult);
            aiNeedsHuman = Boolean(aiResult?.needsHuman);
            aiHandoffReason = String(aiResult?.handoffReason || '');

            if (aiResult?.replyText) {
                reply = aiResult.replyText;
            }

            if (handoffState && !aiResult?.needsHuman) {
                if (hasEmailInText(text)) {
                    reply = 'Perfecto, ya tengo tu correo. Quedaste derivado. Te contactamos en 15-30 min.';
                } else if (isHandoffOfferText(reply)) {
                    reply = 'Perfecto, quedaste derivado. Te contactamos en 15-30 min.';
                }
            }

            if (aiResult?.optoutRequested && phone && persist) {
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
                clearHandoffOffer(phone);
                console.log('INBOUND-HANDOFF:', {
                    from: maskPhone(phone),
                    reason: aiResult.handoffReason || 'unspecified',
                    source
                });
            }

            if (!aiResult?.needsHuman && isHandoffOfferText(reply)) {
                markHandoffOffer(phone);
            }
        } else {
            clearHandoffOffer(phone);
        }
    } else {
        clearHandoffOffer(phone);
        clearHandoffState(phone);
    }

    if (persist) {
        try {
            if (phone) {
                const contact = upsertContact(phone, null);
                insertMessage({
                    contactId: contact?.id || null,
                    campaignId: null,
                    direction: 'inbound',
                    phone,
                    body: text,
                    messageSid,
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
                } else if (isVehicleUnavailable) {
                    const latestVehicle = getLatestContactedVehicleByPhone(phone);
                    if (latestVehicle?.vehicle_id) {
                        createVehicleSuppression({
                            vehicleId: latestVehicle.vehicle_id,
                            phone,
                            reasonCode: vehicleSuppressionReason,
                            reasonDetail: text,
                            source: 'rule',
                            campaignId: latestVehicle.campaign_id || null,
                            messageSid: latestVehicle.message_sid || null,
                            createdBy: source === 'twilio' ? 'twilio_inbound_rule' : 'lab_inbound_rule',
                            notes: 'Supresión automática por respuesta de no disponibilidad'
                        });
                    }
                }
            }
        } catch (error) {
            console.error('DB error (inbound):', error?.message || error);
        }
    }

    console.log('INBOUND:', {
        from: maskPhone(phone),
        bodyLength: text.length,
        isBaja,
        isVehicleUnavailable,
        source
    });

    return {
        reply,
        isBaja,
        isVehicleUnavailable,
        phone,
        usedAi,
        needsHuman: aiNeedsHuman,
        handoffReason: aiHandoffReason
    };
}

app.post('/admin/api/lab/chat/send', adminAuth, express.json(), async (req, res) => {
    const message = String(req.body?.message || '').trim();
    const candidatePhone = String(req.body?.phone || '').trim();
    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    const phone = resolveLabPhone(candidatePhone);
    const from = `whatsapp:${phone}`;

    try {
        const result = await processInboundMessage({
            from,
            body: message,
            messageSid: `SMLAB${Date.now()}`,
            persist: false,
            source: 'lab'
        });

        res.status(200).json({
            ok: true,
            phone,
            reply: result.reply,
            is_baja: result.isBaja,
            meta: {
                used_ai: result.usedAi,
                needs_human: result.needsHuman,
                handoff_reason: result.handoffReason || ''
            }
        });
    } catch (error) {
        console.error('Lab chat send error:', error);
        res.status(500).json({ error: 'Failed to process lab message' });
    }
});

app.get('/admin/api/lab/chat/scenarios', adminAuth, (req, res) => {
    res.status(200).json({
        scenarios: getLabScenarioCatalog()
    });
});

app.post('/admin/api/lab/chat/run-scenarios', adminAuth, express.json(), async (req, res) => {
    const requestedSuite = String(req.body?.suite || 'smoke').trim().toLowerCase();
    const selectedIds = Array.isArray(req.body?.scenario_ids)
        ? req.body.scenario_ids.map((item) => String(item || '').trim()).filter(Boolean)
        : [];

    let scenarios = LAB_SCENARIOS.filter((scenario) => scenario.suite === requestedSuite);
    if (selectedIds.length > 0) {
        const allowed = new Set(selectedIds);
        scenarios = LAB_SCENARIOS.filter((scenario) => allowed.has(scenario.id));
    }

    if (scenarios.length === 0) {
        return res.status(400).json({ error: 'No scenarios selected for this run' });
    }

    const basePhone = resolveLabPhone(req.body?.phone || LAB_CHAT_DEFAULT_PHONE);
    const generatedAt = new Date().toISOString();
    const results = [];

    for (const [scenarioIndex, scenario] of scenarios.entries()) {
        const scenarioPhone = `${basePhone.slice(0, -1)}${(scenarioIndex % 9) + 1}`;
        clearHandoffState(scenarioPhone);
        clearHandoffOffer(scenarioPhone);

        const stepResults = [];
        let scenarioOk = true;

        for (const [stepIndex, step] of scenario.steps.entries()) {
            const result = await processInboundMessage({
                from: `whatsapp:${scenarioPhone}`,
                body: step.user,
                messageSid: `SMLABRUN${Date.now()}${scenarioIndex}${stepIndex}`,
                persist: false,
                source: 'lab'
            });

            const check = evaluateLabExpectation(result.reply, step.expect || {});
            if (!check.ok) {
                scenarioOk = false;
            }
            stepResults.push({
                step: stepIndex + 1,
                user: step.user,
                reply: result.reply,
                ok: check.ok,
                failures: check.failures
            });
        }

        results.push({
            id: scenario.id,
            name: scenario.name,
            suite: scenario.suite,
            ok: scenarioOk,
            steps: stepResults
        });
    }

    const summary = {
        total: results.length,
        passed: results.filter((item) => item.ok).length,
        failed: results.filter((item) => !item.ok).length
    };

    const markdown = buildLabReportMarkdown({
        suite: selectedIds.length > 0 ? 'custom' : requestedSuite,
        results,
        generatedAt,
        summary
    });

    let reportPath = '';
    if (req.body?.save_report !== false) {
        try {
            reportPath = await saveLabMarkdownReport(markdown, 'lab-chat-report');
        } catch (error) {
            console.warn('Failed to save lab report markdown:', error?.message || error);
        }
    }

    res.status(200).json({
        ok: summary.failed === 0,
        suite: selectedIds.length > 0 ? 'custom' : requestedSuite,
        generated_at: generatedAt,
        summary,
        report_path: reportPath,
        results
    });
});

app.post('/admin/api/lab/chat/save-session', adminAuth, express.json({ limit: '2mb' }), async (req, res) => {
    const transcript = Array.isArray(req.body?.transcript) ? req.body.transcript : [];
    const phone = resolveLabPhone(req.body?.phone || LAB_CHAT_DEFAULT_PHONE);
    if (transcript.length === 0) {
        return res.status(400).json({ error: 'Transcript is empty' });
    }

    const lines = [];
    lines.push(`# Lab Chat Session - ${new Date().toISOString()}`);
    lines.push('');
    lines.push(`- Phone: ${phone}`);
    lines.push(`- Entries: ${transcript.length}`);
    lines.push('');

    transcript.forEach((entry, idx) => {
        const role = String(entry?.role || '').toLowerCase() === 'assistant' ? 'BOT' : 'USER';
        const text = String(entry?.text || '').trim();
        lines.push(`## ${idx + 1}. ${role}`);
        lines.push(text || '(empty)');
        lines.push('');
    });

    try {
        const reportPath = await saveLabMarkdownReport(lines.join('\n'), 'lab-chat-session');
        res.status(200).json({ ok: true, report_path: reportPath });
    } catch (error) {
        console.error('Lab save-session error:', error);
        res.status(500).json({ error: 'Failed to save session markdown' });
    }
});

app.post('/admin/api/lab/chat/reset', adminAuth, express.json(), (req, res) => {
    const oldPhone = normalizePhone(String(req.body?.phone || '').trim());
    if (oldPhone) {
        clearHandoffState(oldPhone);
        clearHandoffOffer(oldPhone);
    }
    res.status(200).json({ ok: true, phone: resolveLabPhone(req.body?.phone || '') });
});

app.post('/twilio/inbound', validateTwilioSignature, async (req, res) => {
    const from = req.body.From;
    const body = req.body.Body;
    const messageSid = req.body.MessageSid || null;

    const result = await processInboundMessage({
        from,
        body,
        messageSid,
        persist: true,
        source: 'twilio'
    });

    const twimlMessage = result.reply
        ? `<Message>${escapeXml(result.reply)}</Message>`
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

export { app };

if (SHOULD_BOOT_BACKGROUND_JOBS) {
    app.listen(PORT, () => console.log('Listening on', PORT));
}

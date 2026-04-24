import fs from 'fs';
import path from 'path';

const WORKFLOW_PATH = path.resolve('n8n/workflows/META-CONSIGNACION-V1.json');

function getNode(workflow, name) {
    const node = workflow.nodes.find((item) => item.name === name);
    if (!node) {
        throw new Error(`Node not found: ${name}`);
    }
    return node;
}

function main() {
    const raw = fs.readFileSync(WORKFLOW_PATH, 'utf8');
    const workflow = JSON.parse(raw);

    const aiNode = getNode(workflow, 'AI Agent');
    aiNode.parameters.options.systemMessage = `Eres el asistente de WhatsApp para respuestas post-campana de Queirolo Autos.

ROL
- Informas de forma clara, calificas interes y derivas a ejecutivo cuando corresponde.
- No eres insistente ni repetitivo.

OBJETIVO
- Resolver la duda del cliente en forma breve.
- Detectar intencion positiva.
- Pedir correo de forma opcional (util, no obligatorio).
- Si hay interes real, proponer contacto de ejecutivo en 15-30 minutos.

CONTEXTO CLAVE
- Ya existe telefono y datos del vehiculo en sistema.
- No vuelvas a pedir telefono ni datos del auto salvo que falten en contexto.
- Si memory_key_facts.known_vehicles_count > 0, usa esos vehiculos como datos validos y no pidas Marca/Modelo/Ano/Comuna.

ESTILO
- Espanol chileno neutral.
- 1 a 3 lineas por respuesta.
- Maximo 1 emoji por mensaje.
- Primero responde la pregunta del cliente, luego propone siguiente paso.

REGLAS DE NEGOCIO
- Si el cliente pide BAJA/STOP, marca intencion de opt-out y responde con confirmacion breve.
- El opt-out final lo define wa-test; no contradigas esa regla.
- Si cliente pide humano, caso sensible, reclamo o interes alto, activa derivacion.

DERIVACION Y PERSUASION SUAVE
- Antes de derivar, idealmente entrega 1 respuesta de valor y luego CTA suave.
- CTA recomendado: "Si quieres, te contacta un ejecutivo en 15-30 min para orientarte mejor".
- Si el cliente acepta, confirma derivacion en una linea.
- Aceptaciones como "si", "ok", "dale", "quiero" o "contactenme" tras CTA cuentan como confirmacion.

NO REPETICION DESPUES DE DERIVAR
- Si memory_key_facts.derivado_agente_humano = true, NO vuelvas a ofrecer ejecutivo.
- Si despues de derivar el cliente responde "gracias", "ok", "dale", "perfecto" o similar, responde solo cierre breve:
  "Perfecto, quedaste derivado. Te contactamos en 15-30 min.".
- No hagas nuevas preguntas de cierre en ese estado.

CORREO
- Puedes solicitar correo como opcion para enviar resumen.
- No bloquear derivacion por falta de correo.
- Si el cliente no quiere dar correo, continua y deriva igual cuando aplique.

SALIDA ESPERADA
- Entrega texto final en output.
- Cuando corresponda, marca needs_human=true y handoff_reason claro.`;

    const unificarNode = getNode(workflow, 'Unificar Contexto IA');
    unificarNode.parameters.jsCode = `const live = $('Preparar Contexto Memoria Persistente').item.json;
const mem = $input.first().json || {};

let keyFacts = {};
if (mem.key_facts && typeof mem.key_facts === 'object') {
  keyFacts = mem.key_facts;
} else if (typeof mem.key_facts === 'string') {
  try {
    keyFacts = JSON.parse(mem.key_facts);
  } catch (e) {
    keyFacts = {};
  }
}

const currentFacts = live.extracted_facts || {};
const knownVehicles = Array.isArray(live.raw_input?.context?.known_vehicles)
  ? live.raw_input.context.known_vehicles
      .map((v) => {
        const make = String(v?.make || '').trim();
        const model = String(v?.model || '').trim();
        const year = Number(v?.year || 0);
        const link = String(v?.link || '').trim();
        if (!make && !model && !year) return null;
        return {
          make,
          model,
          year: Number.isFinite(year) && year > 0 ? year : null,
          link
        };
      })
      .filter(Boolean)
  : [];

if (knownVehicles.length > 0) {
  const first = knownVehicles[0];
  if (!currentFacts.vehicle_brand_model) {
    currentFacts.vehicle_brand_model = [first.make, first.model].filter(Boolean).join(' ').trim();
  }
  if (!currentFacts.vehicle_year && first.year) {
    currentFacts.vehicle_year = String(first.year);
  }
  currentFacts.known_vehicles = knownVehicles;
  currentFacts.known_vehicles_count = knownVehicles.length;
  const knownSummary = knownVehicles
    .map((v) => [v.make, v.model, v.year ? String(v.year) : ''].filter(Boolean).join(' ').trim())
    .filter(Boolean)
    .join(' | ');
  if (knownSummary) {
    currentFacts.known_vehicles_summary = knownSummary;
  }
}

for (const [key, value] of Object.entries(currentFacts)) {
  if (value !== null && value !== undefined && String(value).trim() !== '') {
    keyFacts[key] = typeof value === 'string' ? value.trim() : value;
  }
}

const nowIso = new Date().toISOString();
const nonEmpty = (v) => typeof v === 'string' ? v.trim().length > 0 : v !== null && v !== undefined;

const firstSeenBase = keyFacts.primer_contacto_at || keyFacts.first_contact_at || mem.created_at || nowIso;
keyFacts.primer_contacto_at = String(firstSeenBase);
keyFacts.first_contact_at = String(firstSeenBase);
keyFacts.ultimo_contacto_at = nowIso;
keyFacts.last_contact_at = nowIso;

const hasEmail = nonEmpty(keyFacts.customer_email);
const hasAuto = nonEmpty(keyFacts.vehicle_brand_model)
  || nonEmpty(keyFacts.vehicle_description)
  || nonEmpty(keyFacts.vehicle_url)
  || Number(keyFacts.known_vehicles_count || 0) > 0;

keyFacts.has_closing_email = hasEmail;
keyFacts.has_vehicle_min_data = hasAuto;
keyFacts.correo_de_cierre = hasEmail;

let stage = 'contacto_inicial';
if (hasEmail && hasAuto) stage = 'listo_para_cierre';
else if (hasEmail || hasAuto) stage = 'datos_parciales';
keyFacts.funnel_stage = stage;

const rawSignal = String(keyFacts.user_signal || keyFacts.last_turn_signal || 'regular').toLowerCase();
let userSignal = 'regular';
if (rawSignal.includes('question')) userSignal = 'question';
else if (rawSignal.includes('phatic')) userSignal = 'phatic';
else if (rawSignal.includes('command')) userSignal = 'command';
else if (rawSignal.includes('ambiguous')) userSignal = 'ambiguous';

const postCloseLock = stage === 'listo_para_cierre' ? 'on' : 'off';
const isPostCloseStrict = postCloseLock === 'on';

let responseStyle = String(keyFacts.response_style || 'normal');
if (postCloseLock === 'on' && userSignal === 'phatic') responseStyle = 'ultra_concise';
else if (postCloseLock === 'on' && userSignal === 'question') responseStyle = 'concise';
else if (userSignal === 'question' || userSignal === 'command') responseStyle = 'concise';

const precisionMode = (postCloseLock === 'on' || responseStyle !== 'normal') ? 'on' : 'off';
const toneMode = postCloseLock === 'on' ? 'direct' : 'warm';

let contactState = 'active';
const hasHistory = Boolean(mem.context_summary || mem.key_facts || mem.last_intent);
if (!hasHistory && stage === 'contacto_inicial') contactState = 'new';
else if (stage === 'listo_para_cierre') contactState = 'closed';

let daysSinceLastContact = null;
let isReturningClient = false;
const lastUpdate = mem.updated_at || mem.created_at;
if (lastUpdate) {
  const diffMs = Date.now() - new Date(lastUpdate).getTime();
  daysSinceLastContact = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  isReturningClient = daysSinceLastContact >= 1;
  if (isReturningClient && contactState !== 'closed') contactState = 'reengaged';
}

keyFacts.contact_state = contactState;
keyFacts.response_style = responseStyle;
keyFacts.precision_mode = precisionMode;
keyFacts.post_close_lock = postCloseLock;
keyFacts.is_post_close_strict = isPostCloseStrict;
keyFacts.tone_mode = toneMode;
keyFacts.user_signal = userSignal;

if (keyFacts.derivado_agente_humano === undefined) keyFacts.derivado_agente_humano = false;
if (keyFacts.is_human_handoff === undefined) keyFacts.is_human_handoff = false;

keyFacts.conversation_version = 8;

return [{
  json: {
    ...live,
    memory_summary: String(mem.context_summary || ''),
    memory_last_intent: String(mem.last_intent || ''),
    memory_needs_human: Boolean(mem.needs_human),
    memory_key_facts: keyFacts,
    days_since_last_contact: daysSinceLastContact,
    is_returning_client: isReturningClient
  }
}];`;

    const handoffNode = getNode(workflow, 'Detectar Handoff');
    handoffNode.parameters.jsCode = `const item = $input.first().json;
const textRaw = String(item.message_text || '');
const textNorm = textRaw
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\\u0300-\\u036f]/g, '')
  .replace(/[^\\p{L}\\p{N}\\s]/gu, ' ')
  .replace(/\\s+/g, ' ')
  .trim();
const security = item.security_flags || {};
const memoryFacts = item.memory_key_facts || {};

const parseBool = (v) => {
  if (typeof v === 'boolean') return v;
  const s = String(v || '').toLowerCase().trim();
  return s === 'true' || s === '1' || s === 'si' || s === 'yes';
};

const derivedAlready = parseBool(memoryFacts.derivado_agente_humano || memoryFacts.is_human_handoff);
const awaitingHandoffConfirmation = parseBool(memoryFacts.awaiting_handoff_confirmation);

const hasHumanNegation = /\\b(no quiero|no me contacten|no me llamen|sin ejecutivo|sin asesor|no gracias)\\b/.test(textNorm);
const explicitHuman = /\\b(humano|persona|ejecutivo|asesor|persona real|hablar con alguien|necesito hablar|quiero hablar con)\\b/.test(textNorm);
const legalSensitive = /\\b(prenda|deuda prendaria|limitacion de dominio|embargo|gravamen|perdida total|multa|multas|reclamo|queja|molesto|mala atencion|denuncia|demanda|estafa)\\b/.test(textNorm);
const affirmative = /^(si|sii|ok|oki|okey|dale|de acuerdo|perfecto|listo|quiero|me interesa)$/.test(textNorm)
  || /\\b(si|sii|ok|dale|quiero|contactenme|contacten me|me contacten|que me contacten|que me llame|quiero que me contacten)\\b/.test(textNorm);
const phaticAck = /^(gracias|ok|oki|okey|dale|perfecto|listo|super|genial|buenisimo|de acuerdo)$/.test(textNorm);

let reason = '';
let handoffOutput = '';
let needsHuman = false;

if (security.is_prompt_injection) {
  reason = 'security_prompt_injection';
  handoffOutput = 'Por seguridad, solo te puedo ayudar con informacion de consignacion. Si quieres, te orienta un ejecutivo en 15-30 min.';
} else if (security.is_spam_like) {
  reason = 'security_spam_guard';
  handoffOutput = 'Recibi mucha informacion en un solo mensaje. Si quieres, te contacta un ejecutivo en 15-30 min para verlo contigo.';
} else if (derivedAlready && phaticAck) {
  reason = 'post_handoff_ack';
  handoffOutput = 'Perfecto, quedaste derivado. Te contactamos en 15-30 min.';
} else if (!hasHumanNegation && explicitHuman) {
  reason = 'solicitud_humano';
  needsHuman = true;
  handoffOutput = 'Perfecto, quedaste derivado. Te contactamos en 15-30 min.';
} else if (legalSensitive) {
  reason = 'caso_sensible';
  needsHuman = true;
  handoffOutput = 'Perfecto, te puedo derivar con un ejecutivo para revisarlo bien. Te contactamos en 15-30 min.';
} else if (!hasHumanNegation && awaitingHandoffConfirmation && affirmative) {
  reason = 'confirmacion_handoff';
  needsHuman = true;
  handoffOutput = 'Perfecto, quedaste derivado. Te contactamos en 15-30 min.';
}

return [{
  json: {
    ...item,
    needs_human: Boolean(needsHuman),
    handoff_reason: reason,
    handoff_output: handoffOutput
  }
}];`;

    const outboundNode = getNode(workflow, 'Preparar Outbound Persistencia');
    outboundNode.parameters.jsCode = `const out = $input.first().json;
const waId = $('Normalizar Entrada').item.json.wa_id;
const rawInput = $('Normalizar Entrada').item.json.raw_input ?? {};
const messageText = $('Normalizar Entrada').item.json.message_text ?? '';
const extractedNode = $('Extraer Datos Vitales').item.json;
const extractedFacts = extractedNode.extracted_facts ?? {};
const resetNotifyRequested = Boolean(extractedNode.reset_notify_requested);
const securityFlags = extractedNode.security_flags ?? {};

let h1 = 0x811c9dc5;
let h2 = 0x811c9dc5;
for (let i = 0; i < waId.length; i++) {
  const c = waId.charCodeAt(i);
  h1 ^= c;
  h1 += (h1 << 1) + (h1 << 4) + (h1 << 7) + (h1 << 8) + (h1 << 24);
  h2 ^= (c + i);
  h2 += (h2 << 1) + (h2 << 4) + (h2 << 7) + (h2 << 8) + (h2 << 24);
}
const hex = (n) => (n >>> 0).toString(16).padStart(8, '0');
const raw = (hex(h1) + hex(h2) + hex(h1 ^ h2) + hex((h1 + h2) >>> 0)).slice(0, 32);
const customerId = raw.slice(0, 8) + '-' + raw.slice(8, 12) + '-' + raw.slice(12, 16) + '-' + raw.slice(16, 20) + '-' + raw.slice(20, 32);

return [{
  json: {
    wa_id: waId,
    customer_id: customerId,
    output: out.output,
    message_text: messageText,
    raw_input: rawInput,
    needs_human: Boolean(out.needs_human),
    handoff_reason: String(out.handoff_reason || ''),
    optout_requested: Boolean(out.optout_requested),
    extracted_facts: extractedFacts,
    memory_key_facts: out.memory_key_facts ?? {},
    reset_notify_requested: resetNotifyRequested,
    security_flags: securityFlags
  }
}];`;

    const fusionNode = getNode(workflow, 'Fusionar Memoria Incremental');
    fusionNode.parameters.jsCode = `const existing = $input.first().json || {};
const outbound = $('Preparar Outbound Persistencia').item.json;

const nowIso = new Date().toISOString();
const nowMs = Date.now();
const COOLDOWN_MINUTES = 360;
const cooldownMs = COOLDOWN_MINUTES * 60 * 1000;

const nonEmpty = (v) => typeof v === 'string' ? v.trim().length > 0 : v !== null && v !== undefined;
const normalizeText = (v) => typeof v === 'string' ? v.trim() : v;
const parseBool = (v) => {
  if (typeof v === 'boolean') return v;
  const s = String(v || '').toLowerCase().trim();
  return s === 'true' || s === '1' || s === 'si' || s === 'yes';
};
const normalizeForRepeat = (txt) => String(txt || '').toLowerCase().replace(/[!?.,;:]/g, '').replace(/\\s+/g, ' ').trim();

let existingFacts = {};
let parseStatus = 'ok';
if (existing.key_facts && typeof existing.key_facts === 'object') {
  existingFacts = existing.key_facts;
} else if (typeof existing.key_facts === 'string') {
  try {
    existingFacts = JSON.parse(existing.key_facts);
  } catch (e) {
    existingFacts = {};
    parseStatus = 'invalid_json';
  }
} else if (existing.key_facts === null || existing.key_facts === undefined) {
  parseStatus = 'empty';
}

const contextFacts = outbound.memory_key_facts && typeof outbound.memory_key_facts === 'object'
  ? outbound.memory_key_facts
  : {};
const incomingFacts = outbound.extracted_facts || {};
const knownVehiclesRaw = Array.isArray(outbound.raw_input?.context?.known_vehicles)
  ? outbound.raw_input.context.known_vehicles
  : [];
const knownVehicles = knownVehiclesRaw
  .map((v) => {
    const make = String(v?.make || '').trim();
    const model = String(v?.model || '').trim();
    const year = Number(v?.year || 0);
    const link = String(v?.link || '').trim();
    if (!make && !model && !year) return null;
    return {
      make,
      model,
      year: Number.isFinite(year) && year > 0 ? year : null,
      link
    };
  })
  .filter(Boolean);

const mergedFacts = { ...existingFacts, ...contextFacts };
const updated = [];

for (const [key, value] of Object.entries(incomingFacts)) {
  if (nonEmpty(value)) {
    const normalized = normalizeText(value);
    if (mergedFacts[key] !== normalized) {
      mergedFacts[key] = normalized;
      updated.push(key);
    }
  }
}

if (knownVehicles.length > 0) {
  mergedFacts.known_vehicles = knownVehicles;
  mergedFacts.known_vehicles_count = knownVehicles.length;
  const knownSummary = knownVehicles
    .map((v) => [v.make, v.model, v.year ? String(v.year) : ''].filter(Boolean).join(' ').trim())
    .filter(Boolean)
    .join(' | ');
  if (knownSummary) {
    mergedFacts.known_vehicles_summary = knownSummary;
    updated.push('known_vehicles_summary');
  }

  const firstKnown = knownVehicles[0];
  if (!nonEmpty(mergedFacts.vehicle_brand_model)) {
    mergedFacts.vehicle_brand_model = [firstKnown.make, firstKnown.model].filter(Boolean).join(' ').trim();
    updated.push('vehicle_brand_model');
  }
  if (!nonEmpty(mergedFacts.vehicle_year) && firstKnown.year) {
    mergedFacts.vehicle_year = String(firstKnown.year);
    updated.push('vehicle_year');
  }
}

if (!nonEmpty(mergedFacts.customer_name)) {
  const fallbackName = String(outbound.raw_input?.body?.name || '').trim();
  if (fallbackName) {
    mergedFacts.customer_name = fallbackName;
    updated.push('customer_name');
  }
}

const firstSeen = mergedFacts.primer_contacto_at || mergedFacts.first_contact_at || existing.created_at || nowIso;
mergedFacts.primer_contacto_at = String(firstSeen);
mergedFacts.first_contact_at = String(firstSeen);
mergedFacts.ultimo_contacto_at = nowIso;
mergedFacts.last_contact_at = nowIso;

const hasEmail = nonEmpty(mergedFacts.customer_email);
const hasAuto = nonEmpty(mergedFacts.vehicle_brand_model)
  || nonEmpty(mergedFacts.vehicle_description)
  || nonEmpty(mergedFacts.vehicle_url)
  || Number(mergedFacts.known_vehicles_count || 0) > 0;

mergedFacts.has_closing_email = hasEmail;
mergedFacts.has_vehicle_min_data = hasAuto;
mergedFacts.correo_de_cierre = hasEmail;

const wasDerived = parseBool(mergedFacts.derivado_agente_humano);
const isHumanThisTurn = Boolean(outbound.needs_human);
const isDerived = wasDerived || isHumanThisTurn;

let stage = 'contacto_inicial';
if (isDerived) stage = 'derivado';
else if (hasEmail && hasAuto) stage = 'listo_para_cierre';
else if (hasEmail || hasAuto) stage = 'datos_parciales';
mergedFacts.funnel_stage = stage;

let contactState = 'active';
if (stage === 'listo_para_cierre') contactState = 'closed';
else {
  const lastSeen = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
  const daysSince = lastSeen ? Math.floor((nowMs - lastSeen) / 86400000) : 0;
  if (daysSince >= 1) contactState = 'reengaged';
}
if (!existing.created_at && stage === 'contacto_inicial') contactState = 'new';
mergedFacts.contact_state = contactState;

const userSignal = String(mergedFacts.user_signal || mergedFacts.last_turn_signal || 'regular');
const postCloseLock = stage === 'listo_para_cierre' ? 'on' : 'off';
let responseStyle = String(mergedFacts.response_style || 'normal');
if (isDerived && (userSignal === 'phatic' || userSignal === 'regular')) responseStyle = 'ultra_concise';
else if (postCloseLock === 'on' && userSignal === 'phatic') responseStyle = 'ultra_concise';
else if (userSignal === 'question' || userSignal === 'command') responseStyle = 'concise';
const precisionMode = (postCloseLock === 'on' || responseStyle !== 'normal' || isDerived) ? 'on' : 'off';
const toneMode = isDerived ? 'direct' : (postCloseLock === 'on' ? 'direct' : 'warm');

mergedFacts.post_close_lock = postCloseLock;
mergedFacts.is_post_close_strict = postCloseLock === 'on';
mergedFacts.response_style = responseStyle;
mergedFacts.precision_mode = precisionMode;
mergedFacts.tone_mode = toneMode;

mergedFacts.derivado_agente_humano = isDerived;
mergedFacts.is_human_handoff = isDerived;
if (isHumanThisTurn) {
  mergedFacts.last_handoff_reason = String(outbound.handoff_reason || 'solicitud_humano');
  mergedFacts.last_handoff_at = nowIso;
}

const outputText = String(outbound.output || '').trim();
const outputNorm = outputText.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
const offersExecutive = /\\b(ejecutivo|asesor)\\b/.test(outputNorm)
  && /\\b(contacta|contactamos|llame|llamemos|15-30|min)\\b/.test(outputNorm);
const confirmsHandoff = /\\b(quedaste derivado|ya te derivo|te contactamos en 15-30|min)\\b/.test(outputNorm);

const awaitingPrev = parseBool(mergedFacts.awaiting_handoff_confirmation);
let awaitingNext = awaitingPrev;
if (isDerived || confirmsHandoff || isHumanThisTurn) awaitingNext = false;
else if (offersExecutive) awaitingNext = true;

mergedFacts.awaiting_handoff_confirmation = awaitingNext;
mergedFacts.last_handoff_offer_at = offersExecutive ? nowIso : (mergedFacts.last_handoff_offer_at || '');

if (outputText) {
    const prevOutput = String(mergedFacts.last_assistant_output || '').trim();
    const prevNorm = normalizeForRepeat(prevOutput);
    const currNorm = normalizeForRepeat(outputText);
    const isRepeat = prevNorm && currNorm && (prevNorm === currNorm || prevNorm.includes(currNorm) || currNorm.includes(prevNorm));
    mergedFacts.assistant_repeat_count = isRepeat ? Number(mergedFacts.assistant_repeat_count || 0) + 1 : 0;
    if (mergedFacts.assistant_repeat_count >= 2 && !isDerived) {
      mergedFacts.response_style = 'ultra_concise';
    }
    mergedFacts.last_assistant_output = outputText.slice(0, 500);
}

if (updated.length > 0) {
  mergedFacts.updated_fields_last_turn = updated;
  mergedFacts.last_captured_at = nowIso;
}

const resetNotifyRequested = Boolean(outbound.reset_notify_requested);
if (resetNotifyRequested) {
  mergedFacts.team_notified = false;
  mergedFacts.team_notified_at = '';
  mergedFacts.lead_notify_last_at = '';
  mergedFacts.lead_notify_cooldown_until = '';
  mergedFacts.handoff_notified = false;
  mergedFacts.handoff_notified_at = '';
}

const leadNotifyLastAt = String(mergedFacts.lead_notify_last_at || '').trim();
const leadNotifyLastMs = leadNotifyLastAt ? new Date(leadNotifyLastAt).getTime() : 0;
const cooldownUntilMs = leadNotifyLastMs ? (leadNotifyLastMs + cooldownMs) : 0;
const cooldownActive = leadNotifyLastMs > 0 && nowMs < cooldownUntilMs;

const leadRelevantFields = new Set(['customer_email', 'vehicle_brand_model', 'vehicle_description', 'vehicle_url', 'vehicle_year', 'vehicle_km', 'customer_phone', 'customer_name', 'known_vehicles_summary']);
const hasLeadRelevantUpdate = updated.some(f => leadRelevantFields.has(f));

let shouldNotify = false;
let notifyReason = '';

const handoffNotified = parseBool(mergedFacts.handoff_notified);
const teamNotified = parseBool(mergedFacts.team_notified);

if (isHumanThisTurn && !cooldownActive && !handoffNotified) {
  shouldNotify = true;
  notifyReason = 'handoff_first_time';
} else if (stage === 'listo_para_cierre' && !isDerived) {
  if (cooldownActive) notifyReason = 'cooldown_active';
  else if (!teamNotified) {
    shouldNotify = true;
    notifyReason = 'ready_first_notification';
  } else if (hasLeadRelevantUpdate) {
    shouldNotify = true;
    notifyReason = 'ready_with_new_data';
  } else notifyReason = 'already_notified_no_change';
} else if (isDerived) {
  notifyReason = handoffNotified ? 'handoff_already_notified' : (cooldownActive ? 'cooldown_active' : 'derived_waiting');
} else {
  notifyReason = 'stage_not_ready';
}

if (shouldNotify) {
  mergedFacts.team_notified = true;
  mergedFacts.team_notified_at = nowIso;
  mergedFacts.lead_notify_last_at = nowIso;
  mergedFacts.lead_notify_cooldown_until = new Date(nowMs + cooldownMs).toISOString();
  mergedFacts.lead_notify_count = Number(mergedFacts.lead_notify_count || 0) + 1;
  if (isHumanThisTurn) {
    mergedFacts.handoff_notified = true;
    mergedFacts.handoff_notified_at = nowIso;
  }
}

const securityLevel = String(outbound.security_flags?.level || 'none');
let responseMode = 'normal';
if (isHumanThisTurn) responseMode = 'handoff';
else if (isDerived && (userSignal === 'phatic' || userSignal === 'regular')) responseMode = 'post_handoff_ack';
else if (isDerived) responseMode = 'post_handoff';
else if (postCloseLock === 'on' && userSignal === 'phatic') responseMode = 'post_cierre_phatic';
else if (postCloseLock === 'on') responseMode = 'post_cierre';
else if (securityLevel === 'high' || securityLevel === 'medium') responseMode = 'security_guard';

mergedFacts.last_agent_mode = responseMode;
mergedFacts.conversation_version = 9;

mergedFacts.notification_debug = {
  at: nowIso,
  parse_status: parseStatus,
  stage,
  contact_state: mergedFacts.contact_state,
  response_style: mergedFacts.response_style,
  precision_mode: mergedFacts.precision_mode,
  post_close_lock: mergedFacts.post_close_lock,
  tone_mode: mergedFacts.tone_mode,
  user_signal: userSignal,
  response_mode: responseMode,
  security_level: securityLevel,
  should_notify: shouldNotify,
  reason: notifyReason,
  cooldown_minutes: COOLDOWN_MINUTES,
  cooldown_active: cooldownActive,
  has_lead_relevant_update: hasLeadRelevantUpdate,
  repeat_count: Number(mergedFacts.assistant_repeat_count || 0),
  is_human_this_turn: isHumanThisTurn,
  was_derived: wasDerived,
  is_derived: isDerived
};

const memoryName = String(mergedFacts.customer_name || existing.name || '').trim();
const memoryLastIntent = String(
  mergedFacts.last_user_intent
  || mergedFacts.customer_intent
  || outbound.message_text
  || existing.last_intent
  || ''
).trim();

return [{
  json: {
    ...outbound,
    memory_key_facts: mergedFacts,
    memory_name: memoryName,
    memory_last_intent: memoryLastIntent,
    should_notify: shouldNotify,
    notify_reason: notifyReason,
    notify_debug: mergedFacts.notification_debug
  }
}];`;

    const notifNode = getNode(workflow, 'Preparar Notificacion Lead');
    notifNode.parameters.jsCode = `const item = $input.first().json;
const kf = item.memory_key_facts || {};
const notifyPhone = $('Normalizar Entrada').item.json.notify_phone || '+56975400946';
const notifyEmail = $('Normalizar Entrada').item.json.notify_email || 'infoautorecente@gmail.com';

const lines = ['*Lead post-campana*', ''];
if (kf.customer_name) lines.push('Nombre: ' + kf.customer_name);
if (item.wa_id) lines.push('Tel: ' + item.wa_id);
if (kf.customer_email) lines.push('Correo: ' + kf.customer_email);

let knownVehicles = [];
if (Array.isArray(kf.known_vehicles)) {
  knownVehicles = kf.known_vehicles;
} else if (typeof kf.known_vehicles === 'string') {
  try {
    const parsed = JSON.parse(kf.known_vehicles);
    knownVehicles = Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    knownVehicles = [];
  }
}

if (knownVehicles.length > 0) {
  lines.push('Vehiculos registrados:');
  for (const [idx, vehicle] of knownVehicles.entries()) {
    const label = [String(vehicle?.make || '').trim(), String(vehicle?.model || '').trim(), vehicle?.year ? String(vehicle.year) : '']
      .filter(Boolean)
      .join(' ')
      .trim();
    if (label) {
      lines.push((idx + 1) + ') ' + label);
    }
  }
}

if (kf.vehicle_url) {
  lines.push('Link auto: ' + kf.vehicle_url);
} else if (kf.vehicle_brand_model || kf.vehicle_description) {
  lines.push('Auto: ' + (kf.vehicle_brand_model || kf.vehicle_description));
}

if (kf.customer_intent) lines.push('Intencion: ' + kf.customer_intent);
if (item.handoff_reason) lines.push('Motivo: ' + item.handoff_reason);
if (item.message_text) lines.push('Ultimo msg: ' + String(item.message_text).slice(0, 140));
if (item.notify_reason) lines.push('Trigger: ' + item.notify_reason);

lines.push('');
lines.push('SLA: 15-30 min');

return [{
  json: {
    notify_phone: notifyPhone,
    notify_email: notifyEmail,
    notification_text: lines.join('\\n')
  }
}];`;

    fs.writeFileSync(WORKFLOW_PATH, JSON.stringify(workflow, null, 2));
    console.log('Workflow tuned for handoff and anti-repeat closure.');
}

main();

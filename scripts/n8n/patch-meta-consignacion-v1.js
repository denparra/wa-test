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

function getAssignment(assignments, name) {
    return assignments.find((item) => item.name === name);
}

function setAssignment(assignments, name, value, type = 'string') {
    const current = getAssignment(assignments, name);
    if (current) {
        current.value = value;
        current.type = type;
        return;
    }
    assignments.push({
        id: `a_${name}`,
        name,
        value,
        type
    });
}

function main() {
    const raw = fs.readFileSync(WORKFLOW_PATH, 'utf8');
    const workflow = JSON.parse(raw);

    workflow.description = 'Workflow operativo de conversacion post-campana (Twilio outbound + IA/handoff + opt-out en wa-test).';

    const normalizar = getNode(workflow, 'Normalizar Entrada');
    const assignments = normalizar.parameters.assignments.assignments;
    setAssignment(assignments, 'wa_id', "={{ $json.phone ?? $json.wa_id ?? $json.contacts?.[0]?.wa_id ?? '' }}");
    setAssignment(assignments, 'message_text', "={{ $json.message_text ?? $json.body ?? $json.messages?.[0]?.text?.body ?? '' }}");
    setAssignment(assignments, 'message_type', "={{ $json.message_type ?? $json.messages?.[0]?.type ?? 'text' }}");
    setAssignment(assignments, 'notify_phone', '+56975400946');
    setAssignment(assignments, 'notify_email', 'infoautorecente@gmail.com');

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

CORREO
- Puedes solicitar correo como opcion para enviar resumen.
- No bloquear derivacion por falta de correo.
- Si el cliente no quiere dar correo, continua y deriva igual cuando aplique.

SALIDA ESPERADA
- Entrega texto final en output.
- Cuando corresponda, marca needs_human=true y handoff_reason claro.`;

    const handoffNode = getNode(workflow, 'Detectar Handoff');
    handoffNode.parameters.jsCode = `const item = $input.first().json;
const text = String(item.message_text || '').toLowerCase();
const security = item.security_flags || {};

let reason = '';
let handoffOutput = '';
let needsHuman = false;

if (security.is_prompt_injection) {
  reason = 'security_prompt_injection';
  handoffOutput = 'Por seguridad, solo te puedo ayudar con informacion de consignacion. Si quieres, te orienta un ejecutivo en 15-30 min.';
} else if (security.is_spam_like) {
  reason = 'security_spam_guard';
  handoffOutput = 'Recibi mucha informacion en un solo mensaje. Si quieres, te contacta un ejecutivo en 15-30 min para verlo contigo.';
} else {
  const patterns = [
    { r: /\\b(humano|persona|ejecutivo|asesor|persona real|hablar con alguien|necesito hablar|quiero hablar con)\\b/, reason: 'solicitud_humano' },
    { r: /\\b(prenda|deuda prendaria|limitacion de dominio|embargo|gravamen|perdida total|pérdida total)\\b/, reason: 'caso_legal' },
    { r: /\\b(multa|multas)\\b/, reason: 'multas' },
    { r: /\\b(reclamo|queja|molesto|mala atencion|denuncia|demanda|estafa)\\b/, reason: 'reclamo' }
  ];

  for (const pattern of patterns) {
    if (pattern.r.test(text)) {
      reason = pattern.reason;
      break;
    }
  }

  if (reason) {
    needsHuman = true;
    handoffOutput = 'Perfecto, te puedo derivar con un ejecutivo para revisarlo bien. Si te parece, te contactamos en 15-30 min.';
  }
}

return [{
  json: {
    ...item,
    needs_human: Boolean(needsHuman),
    handoff_reason: reason,
    handoff_output: handoffOutput
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

if (kf.vehicle_url) {
  lines.push('Link auto: ' + kf.vehicle_url);
} else if (kf.vehicle_brand_model || kf.vehicle_description) {
  lines.push('Auto: ' + (kf.vehicle_brand_model || kf.vehicle_description));
}

if (kf.customer_intent) lines.push('Intencion: ' + kf.customer_intent);
if (item.handoff_reason) lines.push('Motivo: ' + item.handoff_reason);
if (item.message_text) lines.push('Ultimo msg: ' + String(item.message_text).slice(0, 140));

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
    console.log('Patched workflow JSON:', workflow.id, workflow.name);
}

main();

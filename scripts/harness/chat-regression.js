import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';

const DEFAULT_SCENARIO = 'scenarios/harness/chat-regression.default.json';

function resolveScenarioPath(argPath) {
    const selected = argPath || DEFAULT_SCENARIO;
    return path.isAbsolute(selected)
        ? selected
        : path.resolve(process.cwd(), selected);
}

function decodeXmlEntities(value = '') {
    return String(value)
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
}

function extractTwimlMessage(xml = '') {
    const match = String(xml).match(/<Message>([\s\S]*?)<\/Message>/i);
    if (!match) {
        return '';
    }
    return decodeXmlEntities(match[1]).trim();
}

function normalizePhoneForTwilio(phone = '') {
    const trimmed = String(phone || '').trim();
    if (!trimmed) {
        return 'whatsapp:+56911112222';
    }
    if (trimmed.toLowerCase().startsWith('whatsapp:')) {
        return trimmed;
    }
    return `whatsapp:${trimmed}`;
}

function ensureArray(value) {
    return Array.isArray(value) ? value : [];
}

function containsAny(text, expectedList) {
    const hay = String(text || '').toLowerCase();
    return ensureArray(expectedList).some((needle) => hay.includes(String(needle).toLowerCase()));
}

function containsAll(text, expectedList) {
    const hay = String(text || '').toLowerCase();
    return ensureArray(expectedList).every((needle) => hay.includes(String(needle).toLowerCase()));
}

function containsNone(text, blockedList) {
    const hay = String(text || '').toLowerCase();
    return ensureArray(blockedList).every((needle) => !hay.includes(String(needle).toLowerCase()));
}

function evaluateStepExpectation(reply, expect = {}) {
    const failures = [];

    if (expect.equals !== undefined) {
        const expected = String(expect.equals).trim();
        const actual = String(reply || '').trim();
        if (actual !== expected) {
            failures.push(`equals mismatch: expected \"${expected}\" got \"${actual}\"`);
        }
    }

    if (ensureArray(expect.containsAll).length > 0 && !containsAll(reply, expect.containsAll)) {
        failures.push(`missing containsAll: ${JSON.stringify(expect.containsAll)}`);
    }

    if (ensureArray(expect.containsAny).length > 0 && !containsAny(reply, expect.containsAny)) {
        failures.push(`missing containsAny: ${JSON.stringify(expect.containsAny)}`);
    }

    if (ensureArray(expect.notContainsAny).length > 0 && !containsNone(reply, expect.notContainsAny)) {
        failures.push(`matched forbidden text: ${JSON.stringify(expect.notContainsAny)}`);
    }

    return {
        ok: failures.length === 0,
        failures
    };
}

function countOccurrences(messages, source, needle) {
    const target = String(needle || '').toLowerCase();
    if (!target) {
        return 0;
    }

    return messages
        .filter((message) => source === 'all' || message.role === source)
        .reduce((total, message) => {
            const text = String(message.text || '').toLowerCase();
            if (!text) {
                return total;
            }
            return total + text.split(target).length - 1;
        }, 0);
}

function evaluateConversationRules(messages, rules = []) {
    const failures = [];

    for (const rule of ensureArray(rules)) {
        if (!rule || typeof rule !== 'object') {
            continue;
        }

        if (rule.type === 'max_substring_occurrences') {
            const source = String(rule.source || 'assistant');
            const max = Number(rule.max ?? 0);
            const count = countOccurrences(messages, source, rule.substring);
            if (count > max) {
                failures.push(`rule[max_substring_occurrences] failed for \"${rule.substring}\": ${count} > ${max}`);
            }
            continue;
        }

        if (rule.type === 'forbid_after_trigger') {
            const trigger = String(rule.triggerContains || '').toLowerCase();
            const forbidden = ensureArray(rule.forbiddenContainsAny).map((item) => String(item).toLowerCase());
            if (!trigger || forbidden.length === 0) {
                continue;
            }

            let triggerSeen = false;
            for (const message of messages) {
                if (message.role !== 'assistant') {
                    continue;
                }
                const text = String(message.text || '').toLowerCase();
                if (!text) {
                    continue;
                }
                if (text.includes(trigger)) {
                    triggerSeen = true;
                    continue;
                }
                if (triggerSeen && forbidden.some((piece) => text.includes(piece))) {
                    failures.push(`rule[forbid_after_trigger] failed after trigger \"${rule.triggerContains}\" with message \"${message.text}\"`);
                    break;
                }
            }
        }
    }

    return {
        ok: failures.length === 0,
        failures
    };
}

async function sendTwilioInbound(runtime, step, stepIndex) {
    const endpoint = `${runtime.baseUrl.replace(/\/$/, '')}/twilio/inbound`;
    const from = normalizePhoneForTwilio(step.from || runtime.defaultFrom);
    const sid = step.messageSid || `SMHARNESS${String(stepIndex + 1).padStart(4, '0')}`;

    const form = new URLSearchParams();
    form.set('From', from);
    form.set('Body', String(step.user || ''));
    form.set('MessageSid', sid);

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: form
    });

    const text = await response.text();
    if (!response.ok) {
        throw new Error(`twilio_inbound HTTP ${response.status}: ${text.slice(0, 300)}`);
    }

    return {
        raw: text,
        assistantReply: extractTwimlMessage(text)
    };
}

async function sendN8nWebhook(runtime, step) {
    if (!runtime.n8nWebhookUrl) {
        throw new Error('n8n_webhook mode requires n8nWebhookUrl (scenario or HARNESS_N8N_WEBHOOK_URL)');
    }

    const payload = {
        source: 'harness',
        phone: step.phone || runtime.defaultPhone,
        message_text: String(step.user || ''),
        message_sid: step.messageSid || null,
        received_at: new Date().toISOString(),
        context: {
            is_opted_out: false,
            campaign_id: null,
            contact_id: null,
            contact_name: runtime.defaultName,
            handoff_active: false,
            handoff_offer_pending: false,
            known_vehicle_count: 0,
            known_vehicles: [],
            ...(runtime.defaultContext || {}),
            ...(step.context || {})
        },
        ...(step.payload || {})
    };

    const response = await fetch(runtime.n8nWebhookUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    const text = await response.text();
    let data = null;
    try {
        data = JSON.parse(text);
    } catch {
        data = null;
    }
    if (!response.ok || !data) {
        throw new Error(`n8n_webhook HTTP ${response.status}: ${text.slice(0, 300)}`);
    }

    return {
        raw: data,
        assistantReply: String(data.reply_text || '').trim()
    };
}

async function run() {
    const scenarioArg = process.argv[2];
    if (scenarioArg === '--help' || scenarioArg === '-h') {
        console.log('Usage: node scripts/harness/chat-regression.js [scenario.json]');
        console.log('Default scenario: scenarios/harness/chat-regression.default.json');
        process.exit(0);
    }
    const scenarioPath = resolveScenarioPath(scenarioArg);
    const scenarioRaw = await fs.readFile(scenarioPath, 'utf8');
    const scenario = JSON.parse(scenarioRaw);

    const mode = String(process.env.HARNESS_MODE || scenario.mode || 'twilio_inbound');
    const runtime = {
        mode,
        baseUrl: String(process.env.HARNESS_BASE_URL || scenario.baseUrl || 'http://localhost:3000').trim(),
        n8nWebhookUrl: String(process.env.HARNESS_N8N_WEBHOOK_URL || scenario.n8nWebhookUrl || process.env.N8N_CHAT_WEBHOOK_URL || '').trim(),
        defaultPhone: String(process.env.HARNESS_PHONE || scenario.defaultPhone || '+56911112222').trim(),
        defaultFrom: String(process.env.HARNESS_FROM || scenario.defaultFrom || '').trim(),
        defaultName: String(process.env.HARNESS_NAME || scenario.defaultName || 'Harness QA').trim(),
        defaultContext: scenario.defaultContext || {}
    };
    if (!runtime.defaultFrom) {
        runtime.defaultFrom = `whatsapp:${runtime.defaultPhone}`;
    }

    console.log('--- Chat Harness ---');
    console.log(`Scenario: ${scenario.name || path.basename(scenarioPath)}`);
    console.log(`Mode: ${runtime.mode}`);
    if (runtime.mode === 'twilio_inbound') {
        console.log(`Base URL: ${runtime.baseUrl}`);
        console.log(`From: ${runtime.defaultFrom}`);
    } else {
        console.log(`Webhook: ${runtime.n8nWebhookUrl || '(missing)'}`);
        console.log(`Phone: ${runtime.defaultPhone}`);
    }

    const messages = [];
    let failed = false;

    for (const [index, step] of ensureArray(scenario.steps).entries()) {
        const userText = String(step.user || '').trim();
        if (!userText) {
            continue;
        }
        messages.push({ role: 'user', text: userText });

        let result;
        try {
            if (runtime.mode === 'n8n_webhook') {
                result = await sendN8nWebhook(runtime, step);
            } else {
                result = await sendTwilioInbound(runtime, step, index);
            }
        } catch (error) {
            failed = true;
            console.error(`\n[STEP ${index + 1}] USER: ${userText}`);
            console.error(`[STEP ${index + 1}] ERROR: ${error.message}`);
            continue;
        }

        const assistantText = String(result.assistantReply || '').trim();
        messages.push({ role: 'assistant', text: assistantText });
        const check = evaluateStepExpectation(assistantText, step.expect || {});

        console.log(`\n[STEP ${index + 1}] USER: ${userText}`);
        console.log(`[STEP ${index + 1}] BOT : ${assistantText || '(empty)'}`);
        if (check.ok) {
            console.log(`[STEP ${index + 1}] PASS`);
        } else {
            failed = true;
            console.log(`[STEP ${index + 1}] FAIL`);
            for (const issue of check.failures) {
                console.log(`  - ${issue}`);
            }
        }

        const pauseMs = Number(step.pauseMs || 0);
        if (pauseMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, pauseMs));
        }
    }

    const rulesCheck = evaluateConversationRules(messages, scenario.conversationRules || []);
    if (!rulesCheck.ok) {
        failed = true;
        console.log('\n[CONVERSATION RULES] FAIL');
        for (const issue of rulesCheck.failures) {
            console.log(`  - ${issue}`);
        }
    } else if (ensureArray(scenario.conversationRules).length > 0) {
        console.log('\n[CONVERSATION RULES] PASS');
    }

    console.log('\n--- Harness Result ---');
    console.log(failed ? 'FAILED' : 'PASSED');
    process.exit(failed ? 1 : 0);
}

run().catch((error) => {
    console.error('Harness fatal error:', error?.message || error);
    process.exit(1);
});

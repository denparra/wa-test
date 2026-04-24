const N8N_REQUIRED_ENV = ['N8N_API_URL', 'N8N_API_KEY'];

function getMissingEnv() {
    return N8N_REQUIRED_ENV.filter((key) => !String(process.env[key] || '').trim());
}

function extractResponsePayload(payload) {
    if (!payload) {
        return payload;
    }
    if (Array.isArray(payload?.data)) {
        return payload.data;
    }
    if (payload?.data && typeof payload.data === 'object') {
        return payload.data;
    }
    return payload;
}

function normalizeBaseUrl(baseUrl) {
    return String(baseUrl || '').trim().replace(/\/+$/, '');
}

export function getN8nConfigStatus() {
    const missing = getMissingEnv();
    const baseUrl = normalizeBaseUrl(process.env.N8N_API_URL);
    return {
        enabled: missing.length === 0,
        missing,
        baseUrl
    };
}

export function sanitizeWorkflowForCreate(workflow) {
    const source = workflow || {};
    const next = {
        name: source.name,
        nodes: Array.isArray(source.nodes) ? source.nodes : [],
        connections: source.connections && typeof source.connections === 'object' ? source.connections : {}
    };
    if (source.settings && typeof source.settings === 'object') {
        next.settings = source.settings;
    }
    if (!next.settings || typeof next.settings !== 'object') {
        next.settings = {};
    }
    if (!next.settings.executionOrder) {
        next.settings.executionOrder = 'v1';
    }
    return next;
}

export function sanitizeWorkflowForUpdate(workflow) {
    const source = workflow || {};
    const next = {
        name: source.name,
        nodes: Array.isArray(source.nodes) ? source.nodes : [],
        connections: source.connections && typeof source.connections === 'object' ? source.connections : {}
    };
    if (source.settings && typeof source.settings === 'object') {
        next.settings = source.settings;
    }
    return next;
}

async function n8nRequest(method, endpoint, body = null) {
    const status = getN8nConfigStatus();
    if (!status.enabled) {
        const missingMessage = status.missing.join(', ');
        throw new Error(`N8N is not configured. Missing env vars: ${missingMessage}`);
    }

    const url = `${status.baseUrl}${endpoint}`;
    const headers = {
        'X-N8N-API-KEY': process.env.N8N_API_KEY
    };

    const init = {
        method,
        headers
    };

    if (body !== null && body !== undefined) {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
    }

    const response = await fetch(url, init);
    const text = await response.text();

    let parsed = null;
    if (text) {
        try {
            parsed = JSON.parse(text);
        } catch {
            parsed = text;
        }
    }

    if (!response.ok) {
        const details = typeof parsed === 'string' ? parsed : JSON.stringify(parsed || {});
        throw new Error(`n8n API ${method} ${endpoint} failed (${response.status}): ${details}`);
    }

    return parsed;
}

export async function listWorkflows() {
    const payload = await n8nRequest('GET', '/workflows');
    const workflows = extractResponsePayload(payload);
    return Array.isArray(workflows) ? workflows : [];
}

export async function getWorkflowById(id) {
    const payload = await n8nRequest('GET', `/workflows/${id}`);
    return extractResponsePayload(payload);
}

export async function createWorkflow(workflow) {
    const payload = await n8nRequest('POST', '/workflows', sanitizeWorkflowForCreate(workflow));
    return extractResponsePayload(payload);
}

export async function updateWorkflowById(id, workflow) {
    const payload = await n8nRequest('PUT', `/workflows/${id}`, sanitizeWorkflowForUpdate(workflow));
    return extractResponsePayload(payload);
}

export async function deleteWorkflowById(id) {
    const payload = await n8nRequest('DELETE', `/workflows/${id}`);
    return extractResponsePayload(payload);
}

export async function activateWorkflowById(id) {
    const payload = await n8nRequest('POST', `/workflows/${id}/activate`);
    return extractResponsePayload(payload);
}

export async function deactivateWorkflowById(id) {
    const payload = await n8nRequest('POST', `/workflows/${id}/deactivate`);
    return extractResponsePayload(payload);
}

export async function duplicateWorkflowById(id, options = {}) {
    const original = await getWorkflowById(id);
    if (!original || typeof original !== 'object') {
        throw new Error('Original workflow not found');
    }

    const suffix = String(options.suffix || ' - Copy').trim();
    const customName = String(options.name || '').trim();
    const nextName = customName || `${original.name || 'Workflow'}${suffix}`;

    const clonePayload = sanitizeWorkflowForCreate({
        ...original,
        name: nextName
    });

    const created = await createWorkflow(clonePayload);
    if (options.activate === true && created?.id) {
        await activateWorkflowById(created.id);
        return getWorkflowById(created.id);
    }

    return created;
}

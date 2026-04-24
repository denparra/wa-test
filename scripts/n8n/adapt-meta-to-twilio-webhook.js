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

    // 1) Trigger: WhatsApp -> Webhook (called by wa-test /twilio/inbound bridge)
    const trigger = getNode(workflow, 'Chat Recibido');
    trigger.name = 'Inbound desde wa-test';
    trigger.type = 'n8n-nodes-base.webhook';
    trigger.typeVersion = 2;
    trigger.parameters = {
        httpMethod: 'POST',
        path: 'wa-test-twilio-inbound-ai',
        responseMode: 'responseNode',
        options: {}
    };
    delete trigger.credentials;
    delete trigger.webhookId;

    // 2) Response node for webhook caller
    const responder = getNode(workflow, 'Enviar Mensaje');
    responder.name = 'Responder HTTP';
    responder.type = 'n8n-nodes-base.respondToWebhook';
    responder.typeVersion = 1;
    responder.parameters = {
        respondWith: 'json',
        responseBody: '={{ { reply_text: $json.output ?? "", needs_human: !!$json.needs_human, handoff_reason: $json.handoff_reason ?? "", optout_requested: !!$json.optout_requested, notify_agent: !!$json.needs_human, agent_summary: $json.message_text ? String($json.message_text).slice(0, 160) : "" } }}',
        options: {}
    };
    delete responder.credentials;
    delete responder.webhookId;

    // 3) Non-text branch: prepare data and forward to responder
    const nonText = getNode(workflow, 'Enviar Respuesta No-Texto');
    nonText.name = 'Preparar Respuesta HTTP No-Texto';
    nonText.type = 'n8n-nodes-base.set';
    nonText.typeVersion = 3.4;
    nonText.parameters = {
        assignments: {
            assignments: [
                {
                    id: 'nt1',
                    name: 'output',
                    value: '={{ $json.output ?? "" }}',
                    type: 'string'
                },
                {
                    id: 'nt2',
                    name: 'needs_human',
                    value: false,
                    type: 'boolean'
                },
                {
                    id: 'nt3',
                    name: 'handoff_reason',
                    value: '',
                    type: 'string'
                },
                {
                    id: 'nt4',
                    name: 'optout_requested',
                    value: false,
                    type: 'boolean'
                }
            ]
        },
        options: {}
    };
    delete nonText.credentials;
    delete nonText.webhookId;

    // 4) Rewire connections to renamed nodes
    if (workflow.connections['Inbound desde wa-test']) {
        delete workflow.connections['Inbound desde wa-test'];
    }

    workflow.connections['Inbound desde wa-test'] = workflow.connections['Chat Recibido'];
    delete workflow.connections['Chat Recibido'];

    const replaceNodeName = (connectionKey, oldName, newName) => {
        const entry = workflow.connections[connectionKey];
        if (!entry || !Array.isArray(entry.main)) {
            return;
        }
        for (const branch of entry.main) {
            if (!Array.isArray(branch)) {
                continue;
            }
            for (const edge of branch) {
                if (edge?.node === oldName) {
                    edge.node = newName;
                }
            }
        }
    };

    replaceNodeName('AI Agent', 'Enviar Mensaje', 'Responder HTTP');
    replaceNodeName('Preparar Respuesta Handoff', 'Enviar Mensaje', 'Responder HTTP');
    replaceNodeName('If Respuesta No-Texto', 'Enviar Respuesta No-Texto', 'Preparar Respuesta HTTP No-Texto');

    workflow.connections['Preparar Respuesta HTTP No-Texto'] = {
        main: [
            [
                {
                    node: 'Responder HTTP',
                    type: 'main',
                    index: 0
                }
            ]
        ]
    };

    if (workflow.connections['Enviar Respuesta No-Texto']) {
        delete workflow.connections['Enviar Respuesta No-Texto'];
    }

    workflow.description = 'Workflow operativo Twilio inbound -> n8n IA -> respuesta HTTP para wa-test.';

    fs.writeFileSync(WORKFLOW_PATH, JSON.stringify(workflow, null, 2));
    console.log('Adapted workflow to Twilio webhook bridge mode.');
}

main();

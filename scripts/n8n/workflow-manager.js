import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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
} from '../../lib/n8n-workflows.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const command = args[0];

if (!command || ['help', '--help', '-h'].includes(command)) {
    printUsage();
    process.exit(0);
}

const configStatus = getN8nConfigStatus();
if (!configStatus.enabled) {
    console.error(`Error: Missing env vars: ${configStatus.missing.join(', ')}`);
    process.exit(1);
}

const handlers = {
    list: handleList,
    get: handleGet,
    create: handleCreate,
    update: handleUpdate,
    delete: handleDelete,
    activate: handleActivate,
    deactivate: handleDeactivate,
    duplicate: handleDuplicate
};

const handler = handlers[command];
if (!handler) {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
}

handler(args.slice(1)).catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
});

async function handleList() {
    const workflows = await listWorkflows();
    if (!workflows.length) {
        console.log('No workflows found.');
        return;
    }

    console.log('\nWorkflows:\n');
    console.log('ID'.padEnd(22), 'Active'.padEnd(8), 'Name');
    console.log('-'.repeat(72));
    for (const workflow of workflows) {
        const id = String(workflow.id || '').padEnd(22);
        const active = String(Boolean(workflow.active)).padEnd(8);
        const name = String(workflow.name || '').slice(0, 120);
        console.log(`${id} ${active} ${name}`);
    }
}

async function handleGet(handlerArgs) {
    const id = handlerArgs[0];
    if (!id) {
        fail('Usage: npm run n8n:get -- <id>');
    }

    const workflow = await getWorkflowById(id);
    console.log(JSON.stringify(workflow, null, 2));
}

async function handleCreate(handlerArgs) {
    const filePath = handlerArgs[0];
    if (!filePath) {
        fail('Usage: npm run n8n:create -- <file.json>');
    }

    const workflow = readJsonFile(filePath);
    const created = await createWorkflow(workflow);
    console.log('Workflow created successfully:');
    console.log(JSON.stringify(created, null, 2));
}

async function handleUpdate(handlerArgs) {
    const id = handlerArgs[0];
    const filePath = handlerArgs[1];
    if (!id || !filePath) {
        fail('Usage: npm run n8n:update -- <id> <file.json>');
    }

    const workflow = readJsonFile(filePath);
    const updated = await updateWorkflowById(id, workflow);
    console.log('Workflow updated successfully:');
    console.log(JSON.stringify(updated, null, 2));
}

async function handleDelete(handlerArgs) {
    const id = handlerArgs[0];
    if (!id) {
        fail('Usage: npm run n8n:delete -- <id>');
    }

    const result = await deleteWorkflowById(id);
    console.log('Workflow deleted successfully.');
    if (result) {
        console.log(JSON.stringify(result, null, 2));
    }
}

async function handleActivate(handlerArgs) {
    const id = handlerArgs[0];
    if (!id) {
        fail('Usage: npm run n8n:activate -- <id>');
    }

    const result = await activateWorkflowById(id);
    console.log('Workflow activated successfully.');
    if (result) {
        console.log(JSON.stringify(result, null, 2));
    }
}

async function handleDeactivate(handlerArgs) {
    const id = handlerArgs[0];
    if (!id) {
        fail('Usage: npm run n8n:deactivate -- <id>');
    }

    const result = await deactivateWorkflowById(id);
    console.log('Workflow deactivated successfully.');
    if (result) {
        console.log(JSON.stringify(result, null, 2));
    }
}

async function handleDuplicate(handlerArgs) {
    const id = handlerArgs[0];
    const providedName = handlerArgs[1] || '';
    if (!id) {
        fail('Usage: npm run n8n:duplicate -- <id> [new-name]');
    }

    const duplicated = await duplicateWorkflowById(id, {
        name: providedName || undefined
    });
    console.log('Workflow duplicated successfully:');
    console.log(JSON.stringify(duplicated, null, 2));
}

function readJsonFile(filePath) {
    const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(__dirname, '..', '..', filePath);

    try {
        const content = fs.readFileSync(absolutePath, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        throw new Error(`Unable to read JSON file: ${absolutePath}. ${error.message}`);
    }
}

function fail(message) {
    console.error(message);
    process.exit(1);
}

function printUsage() {
    console.log(`
n8n Workflow Manager (wa-test)

Commands:
  npm run n8n:list
  npm run n8n:get -- <id>
  npm run n8n:create -- <file.json>
  npm run n8n:update -- <id> <file.json>
  npm run n8n:delete -- <id>
  npm run n8n:activate -- <id>
  npm run n8n:deactivate -- <id>
  npm run n8n:duplicate -- <id> [new-name]
`);
}

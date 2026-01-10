import {
    upsertContact,
    createCampaign,
    insertMessage,
    getAdminStats
} from '../db/index.js';

async function main() {
    try {
        console.log('--- TESTING DB INIT ---');
        const stats = getAdminStats();
        console.log('Stats:', stats);

        console.log('--- TESTING CONTACT UPSERT ---');
        const contact = upsertContact('+56912345678', 'Test User');
        console.log('Contact created:', contact);

        if (!contact || contact.phone !== '+56912345678') {
            throw new Error('Contact creation failed');
        }

        console.log('--- TESTING CAMPAIGN CREATION ---');
        const campaign = createCampaign({
            name: 'Test Campaign',
            messageTemplate: 'Hello {{1}}'
        });
        console.log('Campaign created:', campaign);
        if (!campaign || campaign.message_template !== 'Hello {{1}}') {
            throw new Error('Campaign creation failed');
        }

        console.log('--- DB VERIFICATION SUCCESS ---');
    } catch (error) {
        console.error('VERIFICATION FAILED:', error);
        process.exit(1);
    }
}

main();

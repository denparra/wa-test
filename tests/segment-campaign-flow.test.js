import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { renderCampaignFormPage, renderSegmentDetailPage, renderSegmentsPage } from '../admin/pages.js';

let httpServerContextPromise;

async function loadDbModule() {
    process.env.DB_PATH = ':memory:';
    return import(`../db/index.js?test=${Date.now()}-${Math.random()}`);
}

async function getHttpServerContext() {
    if (!httpServerContextPromise) {
        httpServerContextPromise = (async () => {
            const dbFile = path.join(os.tmpdir(), `wa-test-segments-${Date.now()}-${Math.random()}.sqlite`);
            process.env.DB_PATH = dbFile;
            process.env.PORT = '0';
            process.env.SKIP_SERVER_LISTEN = '1';
            process.env.ADMIN_USER = '';
            process.env.ADMIN_PASS = '';

            const serverModule = await import(`../server.js?http-test=${Date.now()}-${Math.random()}`);
            const db = await import('../db/index.js');
            const listener = serverModule.app.listen(0);
            await new Promise((resolve) => listener.once('listening', resolve));

            return {
                db,
                listener,
                baseUrl: `http://127.0.0.1:${listener.address().port}`,
                async close() {
                    await new Promise((resolve, reject) => {
                        listener.close((error) => {
                            if (error) {
                                reject(error);
                                return;
                            }
                            resolve();
                        });
                    });
                }
            };
        })();
    }

    return httpServerContextPromise;
}

test.after(async () => {
    if (!httpServerContextPromise) {
        return;
    }
    const context = await httpServerContextPromise;
    await context.close();
});

async function seedBase() {
  const db = await loadDbModule();

  db.upsertContact('+56911111111', 'Ana Toyota');
  db.upsertContact('+56922222222', 'Beto Toyota');
  db.upsertContact('+56933333333', 'Carla Ford');

  const ana = db.getContactByPhone('+56911111111');
  const beto = db.getContactByPhone('+56922222222');
  const carla = db.getContactByPhone('+56933333333');

  const vehicleA1 = db.createVehicle({ contact_id: ana.id, make: 'Toyota', model: 'Corolla', year: 2020, price: null, link: null });
  const vehicleA2 = db.createVehicle({ contact_id: ana.id, make: 'Toyota', model: 'Yaris', year: 2023, price: null, link: null });
  const vehicleB1 = db.createVehicle({ contact_id: beto.id, make: 'Toyota', model: 'Rav4', year: 2021, price: null, link: null });
  const vehicleC1 = db.createVehicle({ contact_id: carla.id, make: 'Ford', model: 'Explorer', year: 2022, price: null, link: null });

  return { db, contacts: { ana, beto, carla }, vehicles: { vehicleA1, vehicleA2, vehicleB1, vehicleC1 } };
}

test('dynamic vehicle segment counts vehicle targets', async () => {
  const { db } = await seedBase();

  db.createSegment('Toyota 2020+', {
    mode: 'dynamic',
    source: 'vehicles',
    make: 'Toyota',
    model: null,
    yearMin: 2020,
    yearMax: null
  });

  const segments = db.listSegmentsWithCount();
  assert.equal(segments.length, 1);
  assert.equal(segments[0].segment_mode, 'dynamic');
  assert.equal(segments[0].segment_source, 'vehicles');
  assert.equal(segments[0].target_count, 3);
  assert.equal(db.countVehicleAudienceByFilters({ make: 'Toyota', yearMin: 2020 }), 3);
});

test('manual vehicle segment stores explicit vehicle recipients', async () => {
  const { db } = await seedBase();

  const segment = db.createSegment('Toyota manual', {
    mode: 'manual',
    source: 'vehicles'
  });

  const toyotaVehicles = db.listVehicleContactsByFilters({ make: 'Toyota', limit: 100 });
  const totalMembers = db.addMembersToSegment(segment.id, toyotaVehicles);

  assert.equal(totalMembers, 3);

  const targets = db.listSegmentRecipientTargets(segment.id, { limit: 100 });
  assert.equal(targets.length, 3);
  assert.ok(targets.every((target) => Number(target.vehicle_id) > 0));
});

test('manual segment member can be removed individually', async () => {
  const { db } = await seedBase();

  const segment = db.createSegment('Toyota manual', {
    mode: 'manual',
    source: 'vehicles'
  });

  const toyotaVehicles = db.listVehicleContactsByFilters({ make: 'Toyota', limit: 100 });
  db.addMembersToSegment(segment.id, toyotaVehicles);

  const members = db.listSegmentMembers(segment.id, { limit: 100, offset: 0 });
  assert.equal(members.length, 3);

  const removed = db.removeSegmentMember(segment.id, members[0].id);
  assert.equal(removed, true);
  assert.equal(db.countSegmentMembers(segment.id), 2);
});

test('campaign assignment from explicit vehicle recipients preserves total recipients', async () => {
  const { db } = await seedBase();

  const campaign = db.createCampaign({
    name: 'Toyota campaña',
    type: 'custom_message',
    messageTemplate: 'Hola {{nombre}}',
    filters: { mode: 'dynamic', source: 'vehicles', make: 'Toyota', yearMin: 2020 }
  });

  const recipients = db.listVehicleContactsByFilters({ make: 'Toyota', yearMin: 2020, limit: 100 });
  const total = db.assignRecipientsToCampaign(campaign.id, recipients);
  const updated = db.getCampaignById(campaign.id);

  assert.equal(total, 3);
  assert.equal(updated.total_recipients, 3);
});

test('contact audience count excludes opted-out phones', async () => {
  const { db, contacts } = await seedBase();

  db.insertOptOut(contacts.ana.phone, 'global_manual', {
    reasonDetail: 'test',
    source: 'admin',
    createdBy: 'test'
  });

  assert.equal(db.countContactsForCampaign({ query: 'Toyota' }), 1);
});

test('vehicle years list is sorted descending', async () => {
  const { db } = await seedBase();

  assert.deepEqual(db.listVehicleYears(), [2023, 2022, 2021, 2020]);
});

test('legacy vehicle segments default to vehicles and mixed-source definitions are rejected', async () => {
  const { normalizeAudienceFilters, validateSegmentDefinition } = await import('../lib/segment-audience.js');
  const { db } = await seedBase();

  db.createSegment('Legacy Toyota', {
    mode: 'dynamic',
    make: 'Toyota',
    yearMin: 2020
  });

  const [segment] = db.listSegmentsWithCount();
  assert.equal(segment.segment_source, 'vehicles');
  assert.equal(segment.target_count, 3);

  assert.deepEqual(normalizeAudienceFilters({ mode: 'dynamic', make: ' Toyota ', yearMin: '2020' }), {
    source: 'vehicles',
    mode: 'dynamic',
    segmentId: null,
    make: 'Toyota',
    model: null,
    query: '',
    yearMin: 2020,
    yearMax: null
  });

  assert.throws(
    () => validateSegmentDefinition({ mode: 'dynamic', source: 'contacts', make: 'Toyota' }),
    /contacts segments do not accept vehicle filters/i
  );
  assert.throws(
    () => validateSegmentDefinition({ mode: 'dynamic', source: 'vehicles', query: 'Toyota' }),
    /vehicles segments do not accept contact query filters/i
  );
  assert.throws(
    () => validateSegmentDefinition({ mode: 'dynamic', source: 'vehicles', yearMin: 2024, yearMax: 2020 }),
    /year range is invalid/i
  );
});

test('manual contacts segments accept contacts without vehicles', async () => {
  const { db, contacts } = await seedBase();

  const diego = db.upsertContact('+56944444444', 'Diego Prospecto');
  const segment = db.createSegment('Contactos manuales', {
    mode: 'manual',
    source: 'contacts'
  });

  const totalMembers = db.addMembersToSegment(segment.id, [{ contact_id: diego.id }, contacts.ana.id]);
  const targets = db.listSegmentRecipientTargets(segment.id, { limit: 100 });

  assert.equal(totalMembers, 2);
  assert.equal(targets.length, 2);
  assert.ok(targets.some((target) => Number(target.contact_id) === diego.id && target.vehicle_id === null));
});

test('manual vehicle segments reject contact-only members and mixed payloads', async () => {
  const { db, contacts, vehicles } = await seedBase();

  const segment = db.createSegment('Vehículos manuales', {
    mode: 'manual',
    source: 'vehicles'
  });

  assert.throws(
    () => db.addMembersToSegment(segment.id, [{ contact_id: contacts.ana.id }]),
    /vehicle segments only accept vehicle members/i
  );
  assert.throws(
    () => db.addMembersToSegment(segment.id, [{ vehicle_id: vehicles.vehicleA1 }, { contact_id: contacts.beto.id }]),
    /vehicle segments only accept vehicle members/i
  );
  assert.equal(db.countSegmentMembers(segment.id), 0);
});

test('contact segments resolve campaign audiences from contacts only', async () => {
  const { resolveAudienceCandidatesFromFns } = await import('../lib/segment-audience.js');
  const { db } = await seedBase();

  db.upsertContact('+56944444444', 'Diego Toyota');
  const segment = db.createSegment('Toyota contactos', {
    mode: 'dynamic',
    source: 'contacts',
    query: 'Toyota'
  });

  const resolved = resolveAudienceCandidatesFromFns({
    getSegmentById: db.getSegmentById,
    countSegmentMembers: db.countSegmentMembers,
    listSegmentRecipientTargets: db.listSegmentRecipientTargets,
    listContactsForCampaign: db.listContactsForCampaign,
    countContactsForCampaign: db.countContactsForCampaign,
    listVehicleContactsByFilters: db.listVehicleContactsByFilters,
    countVehicleAudienceByFilters: db.countVehicleAudienceByFilters
  }, {
    source: 'vehicles',
    filters: {
      segmentId: segment.id,
      source: 'vehicles',
      make: 'Toyota'
    },
    limit: 100
  });

  const campaign = db.createCampaign({
    name: 'Campaña contactos Toyota',
    type: 'custom_message',
    messageTemplate: 'Hola {{nombre}}',
    filters: {
      mode: 'dynamic',
      source: 'contacts',
      segmentId: segment.id,
      query: 'Toyota'
    }
  });
  const total = db.assignRecipientsToCampaign(campaign.id, resolved.candidates);
  const updated = db.getCampaignById(campaign.id);

  assert.equal(resolved.source, 'contacts');
  assert.equal(resolved.mode, 'dynamic');
  assert.equal(resolved.total, 3);
  assert.ok(resolved.candidates.every((candidate) => !candidate.vehicle_id));
  assert.equal(total, 3);
  assert.equal(updated.total_recipients, 3);
});

test('segments page enables dynamic contacts creation without changing vehicle-first defaults', () => {
  const html = renderSegmentsPage({
    segments: [],
    makes: [{ make: 'Toyota', vehicles: 3 }],
    years: [2023, 2022]
  });

  assert.match(html, /id="segmentContactQuery"/);
  assert.match(html, /id="segmentSource"/);
  assert.doesNotMatch(html, /solo puedes guardar segmentos dinámicos desde filtros de vehículos/i);
});

test('segments list uses clearer edit and manage actions by segment mode', () => {
  const html = renderSegmentsPage({
    segments: [
      {
        id: 1,
        name: 'Dynamic Toyota',
        filters: JSON.stringify({ mode: 'dynamic', source: 'vehicles', make: 'Toyota' }),
        target_count: 3,
        last_used_at: null
      },
      {
        id: 2,
        name: 'Manual Prospectos',
        filters: JSON.stringify({ mode: 'manual', source: 'contacts' }),
        target_count: 2,
        last_used_at: null
      }
    ],
    makes: [{ make: 'Toyota', vehicles: 3 }],
    years: [2023, 2022]
  });

  assert.match(html, /Editar segmento/);
  assert.match(html, />\s*Editar<\/a>/);
  assert.match(html, /Gestionar segmento/);
  assert.match(html, />\s*Gestionar<\/a>/);
});

test('campaign form loads source-specific segments from a shared selector', () => {
  const html = renderCampaignFormPage({
    campaign: {},
    makes: [{ make: 'Toyota', contacts: 3 }],
    templates: []
  });

  assert.match(html, /id="recipientSegmentTools"/);
  assert.match(html, /id="segmentSelect"/);
  assert.match(html, /Solo se muestran segmentos compatibles con la fuente elegida/i);
  assert.match(html, /\/admin\/api\/segments\?source=/);
  assert.match(html, /loadSegmentBtn'\)\?\.addEventListener\('click', async \(\) =>/);
  assert.match(html, /Resolviendo audiencia/);
  assert.match(html, /await loadProdRecipients\(\);/);
});

test('manual contact segment detail exposes csv import and segment timestamp', () => {
  const html = renderSegmentDetailPage({
    segment: { id: 7, name: 'Prospectos importados' },
    segmentFilters: { mode: 'manual', source: 'contacts' },
    rows: [{ id: 1, phone: '+56999990001', name: 'Ana', status: 'active', created_at: '2026-04-29 10:45:00' }],
    total: 1,
    offset: 0,
    limit: 50
  });

  assert.match(html, /id="importContactsCsvForm"/);
  assert.match(html, /phone<\/code> o <code>telefono/i);
  assert.match(html, /Agregado al segmento/i);
});

test('http segment routes preserve vehicles baseline and reject mixed-source payloads', async () => {
  const { baseUrl, db } = await getHttpServerContext();

  const ana = db.upsertContact('+56955550001', 'Ana HTTP');
  db.createVehicle({ contact_id: ana.id, make: 'Toyota', model: 'Corolla', year: 2020, price: null, link: null });
  db.createVehicle({ contact_id: ana.id, make: 'Toyota', model: 'Yaris', year: 2023, price: null, link: null });
  const beto = db.upsertContact('+56955550002', 'Beto HTTP');
  db.createVehicle({ contact_id: beto.id, make: 'Toyota', model: 'Rav4', year: 2021, price: null, link: null });

  const legacySegmentRes = await fetch(`${baseUrl}/admin/api/segments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Legacy HTTP Toyota',
      filters: { mode: 'dynamic', make: 'Toyota', yearMin: 2020 }
    })
  });
  const legacySegmentData = await legacySegmentRes.json();
  assert.equal(legacySegmentRes.status, 201);
  assert.match(String(legacySegmentData.segment.filters), /"source":"vehicles"/);

  const mixedSegmentRes = await fetch(`${baseUrl}/admin/api/segments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Mixed HTTP Segment',
      filters: { mode: 'dynamic', source: 'contacts', make: 'Toyota' }
    })
  });
  const mixedSegmentData = await mixedSegmentRes.json();
  assert.equal(mixedSegmentRes.status, 400);
  assert.match(mixedSegmentData.error, /contacts segments do not accept vehicle filters/i);

  const campaignRes = await fetch(`${baseUrl}/admin/api/campaigns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'HTTP vehicles baseline',
      type: 'custom_message',
      messageTemplate: 'Hola {{nombre}}',
      filters: { source: 'vehicles', segmentId: legacySegmentData.segment.id }
    })
  });
  const campaignData = await campaignRes.json();
  assert.equal(campaignRes.status, 201);
  assert.equal(campaignData.total_recipients, 3);
});

test('http segment routes edit dynamic contact segments without allowing vehicle criteria', async () => {
  const { baseUrl, db } = await getHttpServerContext();

  db.upsertContact('+56955550101', 'Diego HTTP Toyota');
  db.upsertContact('+56955550102', 'Elena HTTP Ford');

  const createRes = await fetch(`${baseUrl}/admin/api/segments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'HTTP contactos',
      filters: { mode: 'dynamic', source: 'contacts', query: 'Toyota' }
    })
  });
  const createData = await createRes.json();
  assert.equal(createRes.status, 201);

  const detailRes = await fetch(`${baseUrl}/admin/segments/${createData.segment.id}`);
  const detailHtml = await detailRes.text();
  assert.equal(detailRes.status, 200);
  assert.match(detailHtml, /segmentEditForm/);

  const updateRes = await fetch(`${baseUrl}/admin/api/segments/${createData.segment.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'HTTP contactos editado',
      filters: { mode: 'dynamic', source: 'contacts', query: 'Diego' }
    })
  });
  const updateData = await updateRes.json();
  assert.equal(updateRes.status, 200);
  assert.equal(updateData.segment.name, 'HTTP contactos editado');
  assert.match(String(updateData.segment.filters), /"source":"contacts"/);
  assert.match(String(updateData.segment.filters), /"query":"Diego"/);

  const invalidUpdateRes = await fetch(`${baseUrl}/admin/api/segments/${createData.segment.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filters: { mode: 'dynamic', source: 'contacts', query: 'Diego', make: 'Toyota' }
    })
  });
  const invalidUpdateData = await invalidUpdateRes.json();
  assert.equal(invalidUpdateRes.status, 400);
  assert.match(invalidUpdateData.error, /contacts segments do not accept vehicle filters/i);
});

test('http segment listing can filter segments by source for campaign wizard', async () => {
  const { baseUrl } = await getHttpServerContext();

  const vehicleCreateRes = await fetch(`${baseUrl}/admin/api/segments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'HTTP vehículos wizard',
      filters: { mode: 'dynamic', source: 'vehicles', make: 'Toyota' }
    })
  });
  assert.equal(vehicleCreateRes.status, 201);

  const contactCreateRes = await fetch(`${baseUrl}/admin/api/segments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'HTTP contactos wizard',
      filters: { mode: 'dynamic', source: 'contacts', query: 'Toyota' }
    })
  });
  assert.equal(contactCreateRes.status, 201);

  const vehicleListRes = await fetch(`${baseUrl}/admin/api/segments?source=vehicles`);
  const vehicleListData = await vehicleListRes.json();
  assert.equal(vehicleListRes.status, 200);
  assert.ok(vehicleListData.segments.some((segment) => segment.name === 'HTTP vehículos wizard'));
  assert.ok(vehicleListData.segments.every((segment) => !String(segment.filters).includes('"source":"contacts"')));

  const contactListRes = await fetch(`${baseUrl}/admin/api/segments?source=contacts`);
  const contactListData = await contactListRes.json();
  assert.equal(contactListRes.status, 200);
  assert.ok(contactListData.segments.some((segment) => segment.name === 'HTTP contactos wizard'));
  assert.ok(contactListData.segments.every((segment) => String(segment.filters).includes('"source":"contacts"')));
});

test('manual contact segments can import csv contacts without duplicating base contacts or segment members', async () => {
  const { baseUrl, db } = await getHttpServerContext();

  const existing = db.upsertContact('+56955550301', 'Ana existente');
  const segment = db.createSegment('Import CSV manual contactos', {
    mode: 'manual',
    source: 'contacts'
  });

  const csv = [
    'phone,name',
    '+56955550301,Ana CSV',
    '+56955550302,',
    '+56955550302,Duplicado'
  ].join('\n');

  const form = new FormData();
  form.append('csvFile', new Blob([csv], { type: 'text/csv' }), 'segment-contacts.csv');

  const previewRes = await fetch(`${baseUrl}/admin/segments/${segment.id}/import-contacts/upload`, {
    method: 'POST',
    body: form
  });
  const previewHtml = await previewRes.text();
  assert.equal(previewRes.status, 200);
  assert.match(previewHtml, /Vista previa importación CSV/i);
  assert.match(previewHtml, /Teléfono duplicado en archivo/i);
  assert.match(previewHtml, /existente/i);
  assert.match(previewHtml, /nuevo/i);

  const body = new URLSearchParams();
  body.set('csvData', JSON.stringify([
    { row: 2, phone: '+56955550301', name: 'Ana CSV' },
    { row: 3, phone: '+56955550302', name: null }
  ]));

  const confirmRes = await fetch(`${baseUrl}/admin/segments/${segment.id}/import-contacts/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  const confirmHtml = await confirmRes.text();
  assert.equal(confirmRes.status, 200);
  assert.match(confirmHtml, /Resultado importación CSV/i);
  assert.match(confirmHtml, /agregados al segmento: 2/i);

  const importedExisting = db.getContactByPhone('+56955550301');
  const importedNew = db.getContactByPhone('+56955550302');
  const memberTargets = db.listSegmentRecipientTargets(segment.id, { limit: 10 });

  assert.equal(importedExisting.id, existing.id);
  assert.equal(importedExisting.name, 'Ana CSV');
  assert.ok(importedNew);
  assert.equal(db.countSegmentMembers(segment.id), 2);
  assert.ok(memberTargets.some((target) => Number(target.contact_id) === existing.id));
  assert.ok(memberTargets.some((target) => Number(target.contact_id) === importedNew.id));

  const confirmAgainRes = await fetch(`${baseUrl}/admin/segments/${segment.id}/import-contacts/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  const confirmAgainHtml = await confirmAgainRes.text();
  assert.equal(confirmAgainRes.status, 200);
  assert.equal(db.countSegmentMembers(segment.id), 2);
  assert.match(confirmAgainHtml, /ya en segmento: 2/i);
});

import test from 'node:test';
import assert from 'node:assert/strict';

async function loadDbModule() {
  process.env.DB_PATH = ':memory:';
  return import(`../db/index.js?test=${Date.now()}-${Math.random()}`);
}

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

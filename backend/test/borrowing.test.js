import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { isolatedMongo, fixtureUser, fixtureEquipment } from './helpers/mongo.js';
import { borrowingService } from '../src/borrowing/service.js';
import { inventoryService } from '../src/equipment/transactional.js';
import { requestBody } from '../src/borrowing/validation.js';
const conflict = error => error.status === 409;
test('borrowing transactions against real MongoDB', { timeout: 180000 }, async t => {
  const connection = await isolatedMongo(); const { db } = connection;
  try {
    const borrower = await fixtureUser(db), other = await fixtureUser(db), staff = await fixtureUser(db, 'staff'), staff2 = await fixtureUser(db, 'staff'), admin = await fixtureUser(db, 'admin');
    const now = () => new Date('2026-11-20T12:00:00Z');
    const service = actor => borrowingService(connection, actor._id, now);
    const request = (type, quantity = 1) => requestBody({ items: [{ equipmentTypeId: String(type._id), quantity }], startDate: '2026-11-20', endDate: '2026-11-21' });
    await t.test('submit, ownership, reject and invalid transitions', async () => {
      const { type } = await fixtureEquipment(db);
      const r = await service(borrower).submit(request(type));
      await assert.rejects(service(other).cancel(r._id), e => e.status === 403);
      await assert.rejects(service(borrower).approve(r._id), e => e.status === 403);
      assert.equal((await service(borrower).cancel(r._id)).status, 'cancelled');
      await assert.rejects(service(staff).approve(r._id), conflict);
      const second = await service(borrower).submit(request(type));
      assert.equal((await service(staff).reject(second._id)).status, 'rejected');
      await assert.rejects(service(staff).checkout(second._id), conflict);
    });
    await t.test('two staff concurrently approve overlapping requests: one winner', async () => {
      const { type } = await fixtureEquipment(db);
      const a = await service(borrower).submit(request(type)), b = await service(other).submit(request(type));
      const result = await Promise.allSettled([service(staff).approve(a._id), service(staff2).approve(b._id)]);
      assert.equal(result.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal(result.find(r => r.status === 'rejected').reason.status, 409);
      assert.equal(await db.collection('reservations').countDocuments({ requestId: { $in: [a._id, b._id] } }), 1);
    });
    await t.test('partial multi-item allocation rolls back request, reservations and audits', async () => {
      const a = await fixtureEquipment(db), b = await fixtureEquipment(db, 0);
      const r = await service(borrower).submit(requestBody({ items: [a,b].map(x => ({ equipmentTypeId: String(x.type._id), quantity: 1 })), startDate: '2026-11-20', endDate: '2026-11-21' }));
      const before = await db.collection('auditEvents').countDocuments();
      await assert.rejects(service(staff).approve(r._id), conflict);
      assert.equal(await db.collection('reservations').countDocuments({ requestId: r._id }), 0);
      assert.equal((await db.collection('borrowRequests').findOne({ _id: r._id })).status, 'pending');
      assert.equal(await db.collection('auditEvents').countDocuments(), before);
    });
    await t.test('checkout and return preserve history and clear references atomically', async () => {
      const { type, units } = await fixtureEquipment(db);
      const r = await service(borrower).submit(request(type)); await service(staff).approve(r._id);
      assert.equal((await service(staff).checkout(r._id)).status, 'checked_out');
      await assert.rejects(service(staff).checkout(r._id), conflict);
      assert.equal((await service(staff).return(r._id, { units: [{ equipmentUnitId: units[0]._id, condition: 'fair' }], returnNotes: 'Checked' })).status, 'returned');
      const unit = await db.collection('equipmentUnits').findOne({ _id: units[0]._id });
      assert.equal(unit.activeCheckoutRequestId, null); assert.equal(unit.condition, 'fair');
      assert.equal((await db.collection('reservations').findOne({ requestId: r._id })).status, 'completed');
      await assert.rejects(inventoryService(connection, admin._id).remove(unit._id), conflict);
    });
    await t.test('approval races maintenance, deletion and type deactivation safely', async () => {
      for (const action of ['maintenance', 'delete', 'deactivate']) {
        const { type, units } = await fixtureEquipment(db);
        const r = await service(borrower).submit(request(type));
        const inventory = inventoryService(connection, admin._id);
        const mutation = () => action === 'delete' ? inventory.remove(units[0]._id) : action === 'deactivate' ? inventory.patch('type', type._id, { isActive: false }) : inventory.patch('unit', units[0]._id, { serviceStatus: 'maintenance' });
        const results = await Promise.allSettled([service(staff).approve(r._id), mutation()]);
        assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
        assert.equal(results.find(x => x.status === 'rejected').reason.status, 409);
        const allocated = await db.collection('reservations').findOne({ requestId: r._id });
        if (allocated) { assert(await db.collection('equipmentUnits').findOne({ _id: allocated.equipmentUnitId, serviceStatus: 'active' })); assert.equal((await db.collection('equipmentTypes').findOne({ _id: type._id })).isActive, true); }
      }
    });
    await t.test('unique partial multikey index rejects overlapping active days', async () => {
      const { units } = await fixtureEquipment(db);
      const row = { requestId: new ObjectId(), equipmentUnitId: units[0]._id, reservedDays: [new Date('2026-11-20Z'), new Date('2026-11-21Z')], status: 'active', createdAt: now(), updatedAt: now() };
      await db.collection('reservations').insertOne({ ...row });
      await assert.rejects(db.collection('reservations').insertOne({ ...row, requestId: new ObjectId(), reservedDays: [new Date('2026-11-21Z'), new Date('2026-11-22Z')] }), e => e.code === 11000);
      await db.collection('reservations').insertOne({ ...row, status: 'completed' });
    });
  } finally { await connection.close(); }
});

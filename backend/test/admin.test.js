import test from 'node:test';
import assert from 'node:assert/strict';
import { isolatedMongo, fixtureUser } from './helpers/mongo.js';
import { bootstrap, adminService } from '../src/admin/service.js';
import { verifyPassword } from '../src/auth/passwords.js';
test('administration and bootstrap against real MongoDB', { timeout: 180000 }, async t => {
  const connection = await isolatedMongo(); const { db } = connection;
  try {
    let admin;
    const credentials = { name: 'Administrator', email: ' ADMIN@example.test ', password: 'Test-only secret phrase 42!' };
    await t.test('concurrent bootstrap creates exactly one hashed administrator and audit', async () => {
      const results = await Promise.allSettled([bootstrap(connection, credentials), bootstrap(connection, { ...credentials, email: 'second@example.test' })]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal(await db.collection('users').countDocuments({ role: 'admin' }), 1);
      admin = await db.collection('users').findOne({ role: 'admin' });
      assert(admin.passwordHash.startsWith('$argon2id$'));
      assert(await verifyPassword(admin.passwordHash, credentials.password));
      assert.equal(await db.collection('auditEvents').countDocuments({ action: 'bootstrapped', actorId: admin._id }), 1);
      assert(!('passwordHash' in results.find(r => r.status === 'fulfilled').value));
      await assert.rejects(bootstrap(connection, credentials), e => e.status === 409);
    });
    await t.test('account creation validates fields, normalizes email and enforces uniqueness', async () => {
      const service = adminService(connection, admin._id);
      const user = await service.create({ name: 'Borrower', email: ' USER@example.test ', password: credentials.password, role: 'borrower' });
      assert.equal(user.emailNormalized, 'user@example.test'); assert(!('passwordHash' in user));
      await assert.rejects(service.create({ name: 'Duplicate', email: 'user@example.test', password: credentials.password, role: 'staff' }), e => e.code === 11000);
      await assert.rejects(service.create({ name: 'Invalid', email: 'x@example.test', password: 'weak', role: 'borrower' }), e => e.status === 400);
      const changed = await service.change(user._id, { role: 'staff' }); assert.equal(changed.role, 'staff');
      assert.equal((await service.change(user._id, { isActive: false })).isActive, false);
      assert.equal(await db.collection('auditEvents').countDocuments({ entityId: user._id }), 3);
      const staff = await fixtureUser(db, 'staff');
      await assert.rejects(adminService(connection, staff._id).change(user._id, { role: 'admin' }), e => e.status === 403);
      assert.equal(await verifyPassword('TEST_ONLY_NO_LOGIN', credentials.password), false);
    });
    await t.test('audit insertion failure rolls back account creation', async () => {
      const failing = { client: connection.client, db: { collection(name) { if (name === 'auditEvents') return { insertOne: async () => { throw new Error('Injected audit failure'); } }; return db.collection(name); } } };
      await assert.rejects(adminService(failing, admin._id).create({ name: 'Rollback', email: 'rollback@example.test', password: credentials.password, role: 'borrower' }), /Injected audit failure/);
      assert.equal(await db.collection('users').countDocuments({ emailNormalized: 'rollback@example.test' }), 0);
    });
  } finally { await connection.close(); }
});

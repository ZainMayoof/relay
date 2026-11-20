import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { isolatedMongo } from './helpers/mongo.js';
import { bootstrap } from '../src/admin/service.js';
import { createApp } from '../src/app.js';
test('authenticated backend end to end against real MongoDB', { timeout: 180000 }, async t => {
  const c = await isolatedMongo(); let server; let clock = Date.now();
  const origin = 'https://relay.example.test', password = 'Isolated test password 123!';
  try {
    await bootstrap(c, { name: 'Admin', email: 'admin@example.test', password });
    server = createApp(c, { origin, now: () => clock, ttl: 60000 }).listen(0, '127.0.0.1'); await once(server, 'listening');
    const base = 'http://127.0.0.1:' + server.address().port + '/api';
    async function call(method, route, body, cookie, expected = 200, extra = {}) {
      const r = await fetch(base + route, { method, headers: { origin, ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const text = await r.text(); assert.equal(r.status, expected, method + ' ' + route + ' ' + text);
      return { body: text ? JSON.parse(text) : null, cookie: r.headers.get('set-cookie')?.split(';')[0], headers: r.headers };
    }
    const login = async email => (await call('POST', '/auth/login', { email, password })).cookie;
    let admin = await login('ADMIN@example.test'); let staff, borrower, other;
    await t.test('login cookies, current user, invalid credentials and origin', async () => {
      const r = await call('POST', '/auth/login', { email: 'admin@example.test', password });
      for (const flag of ['Secure', 'HttpOnly', 'SameSite=Strict', 'Path=/']) assert(r.headers.get('set-cookie').includes(flag));
      assert(!JSON.stringify(r.body).includes('passwordHash'));
      await call('GET', '/auth/me', undefined, admin);
      await call('POST', '/auth/login', { email: 'admin@example.test', password: 'wrong' }, undefined, 401);
      await call('POST', '/auth/login', { email: 'admin@example.test', password }, undefined, 403, { origin: 'https://evil.test' });
      await call('GET', '/auth/me', undefined, '__Host-relay=forged', 401);
    });
    await t.test('all administration routes and account status enforcement', async () => {
      for (const [name, role] of [['staff','staff'], ['borrower','borrower'], ['other','borrower']]) await call('POST', '/users', { name, email: name + '@example.test', password, role }, admin, 201);
      staff = await login('staff@example.test'); borrower = await login('borrower@example.test'); other = await login('other@example.test');
      const users = (await call('GET', '/users', undefined, admin)).body.items;
      assert(!JSON.stringify(users).includes('passwordHash'));
      const target = users.find(u => u.emailNormalized === 'other@example.test');
      await call('PATCH', '/users/' + target._id + '/role', { role: 'borrower' }, admin);
      await call('GET', '/auth/me', undefined, other, 401); other = await login('other@example.test');
      await call('PATCH', '/users/' + target._id + '/status', { isActive: false }, admin);
      await call('GET', '/auth/me', undefined, other, 401);
      await call('POST', '/auth/login', { email: 'other@example.test', password }, undefined, 401);
      await call('PATCH', '/users/' + target._id + '/status', { isActive: true }, admin); other = await login('other@example.test');
      await call('GET', '/users', undefined, staff, 403);
      await call('GET', '/audit-events', undefined, borrower, 403);
    });
    let type, unit;
    await t.test('all equipment routes with real authenticated actors', async () => {
      type = (await call('POST', '/equipment-types', { name: 'Board', category: 'Lab' }, staff, 201)).body;
      unit = (await call('POST', '/equipment-units', { equipmentTypeId: type._id, assetTag: 'E2E-1', condition: 'good', serviceStatus: 'active' }, staff, 201)).body;
      await call('GET', '/equipment-types', undefined, borrower);
      await call('GET', '/equipment-units', undefined, staff);
      await call('PATCH', '/equipment-types/' + type._id, { description: 'Lab board' }, staff);
      await call('PATCH', '/equipment-units/' + unit._id, { location: 'DLAB' }, staff);
      const spare = (await call('POST', '/equipment-units', { equipmentTypeId: type._id, assetTag: 'E2E-spare', condition: 'good', serviceStatus: 'active' }, staff, 201)).body;
      await call('DELETE', '/equipment-units/' + spare._id, undefined, admin, 409);
      await call('PATCH', '/equipment-units/' + spare._id, { serviceStatus: 'maintenance' }, staff);
      await call('GET', '/equipment-units', undefined, borrower, 403);
      await call('POST', '/equipment-types', { name: 'Denied', category: 'Lab' }, borrower, 403);
    });
    await t.test('all borrowing routes, ownership, concurrency and audit consistency', async () => {
      const date = new Date().toISOString().slice(0,10);
      const body = { items: [{ equipmentTypeId: type._id, quantity: 1 }], startDate: date, endDate: date };
      const submit = async cookie => (await call('POST', '/requests', body, cookie, 201)).body;
      const cancelled = await submit(borrower);
      await call('PATCH', '/requests/' + cancelled._id + '/cancel', undefined, other, 403);
      await call('PATCH', '/requests/' + cancelled._id + '/cancel', undefined, borrower);
      const rejected = await submit(borrower); await call('POST', '/requests/' + rejected._id + '/reject', undefined, staff);
      await call('POST', '/requests/' + rejected._id + '/checkout', undefined, staff, 409);
      const r = await submit(borrower);
      await call('GET', '/requests/mine', undefined, borrower); await call('GET', '/requests', undefined, staff);
      await call('POST', '/requests/' + r._id + '/approve', undefined, borrower, 403);
      await call('POST', '/requests/' + r._id + '/approve', undefined, staff);
      const available = await call('GET', '/equipment-types/' + type._id + '/availability?startDate=' + date + '&endDate=' + date, undefined, borrower);
      assert.equal(available.body.availableCount, 0);
      await call('POST', '/requests/' + r._id + '/checkout', undefined, staff);
      await call('POST', '/requests/' + r._id + '/return', { units: [{ equipmentUnitId: unit._id, condition: 'fair' }], returnNotes: 'Inspected' }, staff);
      await call('DELETE', '/equipment-units/' + unit._id, undefined, admin, 409);
      const events = (await call('GET', '/audit-events?limit=100', undefined, admin)).body.items;
      assert(events.some(e => e.action === 'returned' && e.entityId === r._id));
      assert(events.every(e => e.actorId)); assert(!JSON.stringify(events).includes(password));
    });
    await t.test('logout, expiration and placeholder rejection', async () => {
      await call('POST', '/auth/logout', undefined, borrower, 204); await call('GET', '/auth/me', undefined, borrower, 401);
      clock += 60001; await call('GET', '/auth/me', undefined, admin, 401);
      await c.db.collection('users').insertOne({ name: 'Seed', emailNormalized: 'seed@example.test', passwordHash: 'TEST_ONLY_NO_LOGIN', role: 'borrower', isActive: true, createdAt: new Date(), updatedAt: new Date() });
      await call('POST', '/auth/login', { email: 'seed@example.test', password: 'TEST_ONLY_NO_LOGIN' }, undefined, 401);
    });
  } finally { if (server) { server.closeAllConnections(); await new Promise(r => server.close(r)); } await c.close(); }
});


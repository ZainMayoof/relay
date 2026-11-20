import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { createApp } from '../src/app.js';
import { equipmentRouter } from '../src/equipment/routes.js';
async function run(app, check) {
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await check('http://127.0.0.1:' + server.address().port); }
  finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
}
test('production denies all eight equipment routes before database access', async () => {
  const db = { collection() { assert.fail('Production must not access collections'); } };
  await run(createApp({ db }), async base => {
    for (const [method, route] of [
      ['GET','equipment-types'], ['GET','equipment-types/000000000000000000000001/availability'],
      ['POST','equipment-types'], ['PATCH','equipment-types/000000000000000000000001'],
      ['GET','equipment-units'], ['POST','equipment-units'],
      ['PATCH','equipment-units/000000000000000000000001'], ['DELETE','equipment-units/000000000000000000000001']
    ]) {
      const response = await fetch(base + '/api/' + route, { method, headers: { 'x-test-role': 'admin', authorization: 'Bearer admin' } });
      assert.equal(response.status, 401); assert.equal((await response.json()).error.code, 'UNAUTHENTICATED');
    }
  });
});
test('simulated driver errors are sanitized', async () => {
  for (const [error, status] of [
    [Object.assign(new Error('secret connection string'), { name: 'MongoNetworkError' }),503],
    [new Error('secret connection string'),500]
  ]) {
    const app = express();
    app.use('/api', equipmentRouter({ db: { collection() { throw error; } }, identity: () => ({ role: 'admin', isActive: true }) }));
    await run(app, async base => {
      const response = await fetch(base + '/api/equipment-types');
      assert.equal(response.status,status); assert(!(await response.text()).includes('secret'));
    });
  }
});

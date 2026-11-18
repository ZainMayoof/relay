import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { COLLECTION_NAMES, databaseConfig, checkDatabase } from '../src/db.js';

test('configuration requires a MongoDB URI and defaults to the existing relay database', () => {
  assert.throws(() => databaseConfig({}), /MONGODB_URI/);
  assert.throws(() => databaseConfig({ MONGODB_URI: 'https://example.com' }), /MongoDB connection string/);
  assert.throws(() => databaseConfig({ MONGODB_URI: 'mongodb://localhost', MONGODB_DB: 'bad/name' }), /database name/);
  assert.deepEqual(databaseConfig({ MONGODB_URI: 'mongodb://localhost' }), { uri: 'mongodb://localhost', name: 'relay' });
  assert.equal(databaseConfig({ MONGODB_URI: 'mongodb+srv://example.com', MONGODB_DB: 'relay_test' }).name, 'relay_test');
});

test('read-only database verification pings and checks all six collection names', async () => {
  const calls = [];
  const db = {
    databaseName: 'relay',
    command: async command => { calls.push(command); return { ok: 1 }; },
    listCollections: (filter, options) => {
      calls.push({ filter, options });
      return { toArray: async () => COLLECTION_NAMES.map(name => ({ name })) };
    }
  };
  const result = await checkDatabase(db);
  assert.equal(result.database, 'relay');
  assert.deepEqual(result.collections, COLLECTION_NAMES);
  assert.deepEqual(calls, [{ ping: 1 }, { filter: {}, options: { nameOnly: true } }]);
});

test('database verification rejects missing collections', async () => {
  const db = {
    command: async () => ({ ok: 1 }),
    listCollections: () => ({ toArray: async () => [{ name: 'users' }] })
  };
  await assert.rejects(checkDatabase(db), /Required collections missing: equipmentTypes/);
});

test('database verification propagates a failed ping without continuing', async () => {
  const db = {
    command: async () => { throw new Error('unreachable'); },
    listCollections: () => { assert.fail('Should not list collections after a failed ping'); }
  };
  await assert.rejects(checkDatabase(db), /unreachable/);
});

async function withServer(db, check) {
  const server = createServer(createApp({ db }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await check('http://127.0.0.1:' + server.address().port); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('HTTP health returns 200 when the supplied database ping succeeds', async () => {
  let calls = 0;
  await withServer({ command: async command => { assert.deepEqual(command, { ping: 1 }); calls++; } }, async base => {
    const response = await fetch(base + '/health');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-powered-by'), null);
    assert.deepEqual(await response.json(), { status: 'ok', database: 'connected' });
  });
  assert.equal(calls, 1);
});

test('HTTP health returns 503 without exposing connection details on failure', async () => {
  await withServer({ command: async () => { throw new Error('mongodb://secret:password@example.com'); } }, async base => {
    const response = await fetch(base + '/health');
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: 'unavailable', database: 'disconnected' });
  });
});

test('Phase 1 exposes no collection CRUD route', async () => {
  await withServer({ command: async () => ({ ok: 1 }) }, async base => {
    const response = await fetch(base + '/api/users');
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'Route not found' });
  });
});

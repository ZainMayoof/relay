import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import SwaggerParser from '@apidevtools/swagger-parser';
import { openapi } from '../src/documentation.js';
import { createApp } from '../src/app.js';
import { equipmentRouter } from '../src/equipment/routes.js';
import { borrowingRouter } from '../src/borrowing/routes.js';
import { adminRouter } from '../src/admin/routes.js';
import { authentication } from '../src/auth/sessions.js';
const operations = document => Object.entries(document.paths).flatMap(([path, methods]) => Object.keys(methods).map(method => method.toUpperCase() + ' ' + path)).sort();
test('OpenAPI is valid and contains exactly the 24 implemented Express operations', async () => {
  await SwaggerParser.validate(structuredClone(openapi));
  const options = { db: {}, identity: () => null };
  const routers = [equipmentRouter(options), borrowingRouter(options), adminRouter(options), authentication({ db: {}, origin: 'https://relay.test' }).router];
  const actual = routers.flatMap(router => router.stack.filter(layer => layer.route).flatMap(layer => Object.keys(layer.route.methods).map(method => method.toUpperCase() + ' /api' + layer.route.path.replaceAll(':id', '{id}')))).sort();
  assert.equal(actual.length, 24); assert.deepEqual(operations(openapi), actual);
  assert.equal(openapi.components.securitySchemes.cookieAuth.name, '__Host-relay');
  for (const [path, methods] of Object.entries(openapi.paths)) for (const op of Object.values(methods)) {
    assert(op.summary && op.tags.length && op.responses);
    assert.deepEqual(op.security, path === '/api/auth/login' ? [] : [{ cookieAuth: [] }]);
  }
});
test('Swagger UI, assets and raw OpenAPI are publicly served without database access', async () => {
  const db = { collection() { assert.fail('Documentation must not access the database'); } };
  const server = createApp({ db }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const ui = await fetch(base + '/api-docs'); assert.equal(ui.status, 200); assert((await ui.text()).includes('swagger-ui'));
    const asset = await fetch(base + '/api-docs/swagger-ui-bundle.js'); assert.equal(asset.status, 200);
    const spec = await fetch(base + '/openapi.json'); assert.equal(spec.status, 200); assert.deepEqual(await spec.json(), openapi);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

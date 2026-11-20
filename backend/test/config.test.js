import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { serverConfig } from '../src/config.js';
test('HTTPS origin and backend port are validated before database startup', () => {
  assert.deepEqual(serverConfig({ APP_ORIGIN: 'https://localhost' }), { port: 3000, host: '127.0.0.1', origin: 'https://localhost' });
  for (const origin of [undefined, 'http://localhost', 'https://localhost/', 'https://localhost/path', 'bad']) assert.throws(() => serverConfig({ APP_ORIGIN: origin }), /APP_ORIGIN/);
  assert.throws(() => serverConfig({ APP_ORIGIN: 'https://localhost', PORT: '0' }), /PORT/);
});
test('local proxy terminates TLS and forwards to loopback without changing Origin', async () => {
  const conf = await readFile(new URL('../deploy/nginx.conf', import.meta.url), 'utf8');
  assert(conf.includes('listen 443 ssl;'));
  assert(conf.includes('proxy_pass http://127.0.0.1:3000;'));
  assert(!conf.includes('proxy_set_header Origin'));
});

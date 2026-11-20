import assert from 'node:assert/strict';
import { mkdtemp, realpath, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { MongoClient, ObjectId } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
export async function isolatedMongo() {
  const folder = await mkdtemp(join(tmpdir(), 'relay-backend-'));
  const repl = await MongoMemoryReplSet.create({ binary: { version: '7.0.24' }, instanceOpts: [{ dbPath: folder }], replSet: { count: 1, name: 'relayBackendTest', ip: '127.0.0.1', storageEngine: 'wiredTiger' } });
  const client = new MongoClient(repl.getUri('relay'));
  const close = async () => {
    await client.close();
    const child = relative(await realpath(tmpdir()), await realpath(folder));
    assert(child && !child.startsWith('..') && !isAbsolute(child));
    await repl.stop({ doCleanup: true, force: true });
  };
  try {
    await client.connect();
    const db = client.db('relay');
    const options = await db.admin().command({ getCmdLineOpts: 1 });
    assert.equal(resolve(options.parsed.storage.dbPath), resolve(await realpath(folder)));
    assert.equal(options.parsed.net.bindIp, '127.0.0.1');
    const hello = await db.admin().command({ hello: 1 });
    assert.equal(hello.setName, 'relayBackendTest'); assert.equal(hello.isWritablePrimary, true);
    assert.equal((await db.listCollections().toArray()).length, 0);
    const script = fileURLToPath(new URL('../../../database/setup.js', import.meta.url));
    const source = Buffer.from((await readFile(script, 'utf8')).replaceAll('\r\n', '\n'));
    assert.equal(createHash('sha1').update('blob ' + source.length + '\0').update(source).digest('hex'), '32c39b103733f2e6fdd6374a415150bbf3ece120');
    await promisify(execFile)(process.platform === 'win32' ? 'mongosh.exe' : 'mongosh', [repl.getUri('relay'), '--quiet', '--norc', '--file', script], { windowsHide: true, timeout: 30000 });
    assert.equal((await db.listCollections().toArray()).length, 6);
    return { client, db, close };
  } catch (error) { await close(); throw error; }
}
export async function fixtureUser(db, role = 'borrower') {
  const user = { _id: new ObjectId(), name: 'Fixture', emailNormalized: String(new ObjectId()) + '@example.test', passwordHash: 'TEST_ONLY_NO_LOGIN', role, isActive: true, createdAt: new Date(), updatedAt: new Date() };
  await db.collection('users').insertOne(user); return user;
}
export async function fixtureEquipment(db, count = 1) {
  const type = { name: 'Board', category: 'Test', isActive: true, createdAt: new Date(), updatedAt: new Date() };
  await db.collection('equipmentTypes').insertOne(type);
  const units = [];
  for (let i = 0; i < count; i++) {
    const unit = { equipmentTypeId: type._id, assetTag: String(new ObjectId()), condition: 'good', serviceStatus: 'active', activeCheckoutRequestId: null, createdAt: new Date(), updatedAt: new Date() };
    await db.collection('equipmentUnits').insertOne(unit); units.push(unit);
  }
  return { type, units };
}

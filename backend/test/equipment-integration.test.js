import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, realpath, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import express from 'express';
import { MongoClient, ObjectId, Int32 } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { equipmentRouter } from '../src/equipment/routes.js';
const execute = promisify(execFile);
test('equipment endpoints against disposable real MongoDB', { timeout: 180000 }, async t => {
  const folder = await mkdtemp(join(tmpdir(), 'relay-equipment-'));
  const repl = await MongoMemoryReplSet.create({ binary: { version: '7.0.24' }, instanceOpts: [{ dbPath: folder }], replSet: { count: 1, name: 'relayEquipmentTest', ip: '127.0.0.1', storageEngine: 'wiredTiger' } });
  const client = new MongoClient(repl.getUri('relay'));
  let server;
  try {
    await client.connect();
    const db = client.db('relay');
    const options = await db.admin().command({ getCmdLineOpts: 1 });
    assert.equal(resolve(options.parsed.storage.dbPath), resolve(await realpath(folder)));
    assert.equal(options.parsed.net.bindIp, '127.0.0.1');
    const hello = await db.admin().command({ hello: 1 });
    assert.equal(hello.setName, 'relayEquipmentTest'); assert.equal(hello.isWritablePrimary,true);
    assert.equal((await db.listCollections().toArray()).length,0);
    const script = fileURLToPath(new URL('../../database/setup.js', import.meta.url));
    const source = Buffer.from((await readFile(script, 'utf8')).replaceAll('\r\n', '\n')); 
    assert.equal(createHash('sha1').update('blob ' + source.length + '\0').update(source).digest('hex'), '32c39b103733f2e6fdd6374a415150bbf3ece120');
    await execute(process.platform === 'win32' ? 'mongosh.exe' : 'mongosh', [repl.getUri('relay'), '--quiet', '--norc', '--file', script], { windowsHide: true, timeout: 30000 });
    assert.equal((await db.listCollections().toArray()).length,6);
    let principal = { role: 'admin', isActive: true };
    const now = new Date('2026-11-20T12:00:00Z');
    const app = express();
    app.use('/api', equipmentRouter({ db, now: () => now, identity: () => principal }));
    server = app.listen(0,'127.0.0.1'); await once(server,'listening');
    const base = 'http://127.0.0.1:' + server.address().port + '/api';
    async function call(method, route, body, expected = 200, headers = {}) {
      const response = await fetch(base + route, { method, headers: { ...(body === undefined ? {} : { 'content-type':'application/json' }), ...headers }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
      const text = await response.text(); const result = text ? JSON.parse(text) : null;
      assert.equal(response.status, expected, method + ' ' + route + ': ' + text);
      return result;
    }
    const newType = (extra = {}) => call('POST','/equipment-types',{name:'Board',category:'Test',...extra},201);
    const newUnit = (type, extra = {}) => call('POST','/equipment-units',{equipmentTypeId:type._id,assetTag:String(new ObjectId()),condition:'good',serviceStatus:'active',...extra},201);
    const availability = (type,start='2026-11-21',end=start) => call('GET','/equipment-types/'+type._id+'/availability?startDate='+start+'&endDate='+end);
    async function reservation(unit, days, status='active', requestId=new ObjectId()) {
      await db.collection('reservations').insertOne({ requestId,equipmentUnitId:new ObjectId(unit._id),reservedDays:days.map(d=>new Date(d+'T00:00:00Z')),status,createdAt:now,updatedAt:now });
    }
    async function checkout(unit, type, changes={}) {
      const _id=new ObjectId();
      await db.collection('borrowRequests').insertOne({_id,borrowerId:new ObjectId(),items:[{equipmentTypeId:new ObjectId(type._id),quantity:new Int32(1)}],startDate:new Date('2026-11-19Z'),endDate:new Date('2026-11-21Z'),checkedOutAt:new Date('2026-11-19T12:00:00Z'),status:'checked_out',requestedAt:now,updatedAt:now,...changes});
      await db.collection('equipmentUnits').updateOne({_id:new ObjectId(unit._id)},{$set:{activeCheckoutRequestId:_id}});
      return _id;
    }
    await t.test('all eight routes and persisted defaults',async()=>{
      const type=await newType(); assert.equal(type.isActive,true);
      assert((await call('GET','/equipment-types')).items.some(x=>x._id===type._id));
      assert.equal((await call('PATCH','/equipment-types/'+type._id,{description:'Changed'})).name,'Board');
      const unit=await newUnit(type); assert.equal(unit.activeCheckoutRequestId,null);
      assert((await call('GET','/equipment-units?equipmentTypeId='+type._id)).items.some(x=>x._id===unit._id));
      assert.equal((await call('PATCH','/equipment-units/'+unit._id,{location:'Lab'})).location,'Lab');
      assert.equal((await availability(type)).availableCount,1);
      await call('DELETE','/equipment-units/'+unit._id,undefined,204);
      await call('DELETE','/equipment-units/'+unit._id,undefined,404);
    });
    await t.test('authorization and inactive catalog restrictions',async()=>{
      const type=await newType({isActive:false}); const unit=await newUnit(type);
      assert.equal((await availability(type)).availableCount,0);
      for(const role of ['borrower','staff','admin']) {
        principal={role,isActive:true};
        await call('GET','/equipment-types');
        await call('GET','/equipment-types?isActive=false',undefined,role==='borrower'?403:200);
        await call('GET','/equipment-units',undefined,role==='borrower'?403:200);
        await call('POST','/equipment-types',{name:'Role',category:'Test'},role==='borrower'?403:201);
        await call('PATCH','/equipment-types/'+type._id,{description:role},role==='borrower'?403:200);
        await call('POST','/equipment-units',{equipmentTypeId:type._id,assetTag:String(new ObjectId()),condition:'fair',serviceStatus:'active'},role==='borrower'?403:201);
        await call('PATCH','/equipment-units/'+unit._id,{location:role},role==='borrower'?403:200);
        if(role!=='admin') await call('DELETE','/equipment-units/'+unit._id,undefined,403);
      }
      principal={role:'admin',isActive:false}; await call('GET','/equipment-types',undefined,401);
      principal={role:'admin',isActive:true};
    });
    await t.test('strict validation, protected fields, references and media errors',async()=>{
      const type=await newType(); const unit=await newUnit(type);
      for(const field of ['_id','createdAt','updatedAt','activeCheckoutRequestId','equipmentTypeId','assetTag','$set']) await call('PATCH','/equipment-units/'+unit._id,{[field]:'bad'},400);
      await call('PATCH','/equipment-types/'+type._id,{},400);
      await call('PATCH','/equipment-types/invalid',{name:'x'},400);
      await call('PATCH','/equipment-types/'+new ObjectId(),{name:'x'},404);
      await call('POST','/equipment-units',{equipmentTypeId:String(new ObjectId()),assetTag:'Unknown',condition:'good',serviceStatus:'active'},404);
      await call('POST','/equipment-types',{name:'x',category:'y',isActive:'true'},400);
      await call('POST','/equipment-types',{name:'x',category:'y',specifications:JSON.parse('{"$where":"bad"}')},400);
      await call('PATCH','/equipment-units/'+unit._id,{condition:'perfect'},400);
      await call('GET','/equipment-types?limit=101',undefined,400);
      await call('GET','/equipment-types?category=a&category=b',undefined,400);
      await call('GET','/equipment-types?category[$ne]=x',undefined,400);
      await call('POST','/equipment-types','{',400);
      await call('POST','/equipment-types',undefined,415);
      await call('POST','/equipment-types',{name:'a'.repeat(40000),category:'x'},413);
      await call('DELETE','/equipment-units/'+unit._id,{},400);
    });
    await t.test('unique asset index handles competing inserts',async()=>{
      const type=await newType(); const body={equipmentTypeId:type._id,assetTag:'RACE',condition:'good',serviceStatus:'active'};
      const responses=await Promise.all([1,2].map(()=>fetch(base+'/equipment-units',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})));
      assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);
    });
    await t.test('allocation restrictions and history-preserving deletion',async()=>{
      for(const status of ['active','completed','released']){
        const type=await newType(); const unit=await newUnit(type); await reservation(unit,['2026-11-21'],status);
        await call('DELETE','/equipment-units/'+unit._id,undefined,409);
        if(status==='active'){
          for(const fields of [{condition:'damaged'},{serviceStatus:'maintenance'},{serviceStatus:'retired'}]) await call('PATCH','/equipment-units/'+unit._id,fields,409);
          await call('PATCH','/equipment-types/'+type._id,{isActive:false},409);
        }
      }
      const type=await newType(); const unit=await newUnit(type); await checkout(unit,type);
      await call('DELETE','/equipment-units/'+unit._id,undefined,409);
      await call('PATCH','/equipment-types/'+type._id,{isActive:false},409);
      await call('PATCH','/equipment-units/'+unit._id,{condition:'damaged'},409);
      const audited=await newUnit(type);
      await db.collection('auditEvents').insertOne({actorId:new ObjectId(),action:'fixture',entityType:'equipmentUnits',entityId:new ObjectId(audited._id),occurredAt:now});
      await call('DELETE','/equipment-units/'+audited._id,undefined,409);
      assert(await db.collection('equipmentUnits').findOne({_id:new ObjectId(audited._id)}));
    });
    await t.test('whole interval and inclusive reservation boundaries',async()=>{
      const type=await newType(); const a=await newUnit(type),b=await newUnit(type);
      await reservation(a,['2026-11-21']); await reservation(b,['2026-11-22']);
      assert.equal((await availability(type,'2026-11-21','2026-11-22')).availableCount,0);
      assert.equal((await availability(type,'2026-11-21')).availableCount,1);
      assert.equal((await availability(type,'2026-11-23')).availableCount,2);
      const c=await newUnit(type); await reservation(c,['2026-11-20','2026-11-24']);
      assert.equal((await availability(type,'2026-11-21','2026-11-22')).availableCount,1);
      const result=await availability(type);assert.equal(result.advisory,true);assert(!('units' in result));
      await call('GET','/equipment-types/'+type._id+'/availability?startDate=2027-02-29&endDate=2027-03-01',undefined,400);
      await call('GET','/equipment-types/'+type._id+'/availability?startDate=2026-11-22&endDate=2026-11-21',undefined,400);
      await availability(type,'2028-02-29');
    });
    await t.test('service states, damage and reservation lifecycle',async()=>{
      const type=await newType();
      await newUnit(type,{serviceStatus:'maintenance'});await newUnit(type,{serviceStatus:'retired'});await newUnit(type,{condition:'damaged'});
      const a=await newUnit(type);await reservation(a,['2026-11-21'],'completed');
      const b=await newUnit(type);await reservation(b,['2026-11-21'],'released');
      assert.equal((await availability(type)).availableCount,2);
    });
    await t.test('scheduled return, overdue and inconsistent checkout references',async()=>{
      const type=await newType();const unit=await newUnit(type); const request=await checkout(unit,type);
      assert.equal((await availability(type,'2026-11-21')).availableCount,0);
      assert.equal((await availability(type,'2026-11-22')).availableCount,1);
      await db.collection('borrowRequests').updateOne({_id:request},{$set:{endDate:new Date('2026-11-19Z')}});
      assert.equal((await availability(type,'2026-12-01')).availableCount,0);
      await db.collection('borrowRequests').updateOne({_id:request},{$set:{endDate:new Date('2026-11-21Z'),status:'returned'}});
      assert.equal((await availability(type,'2026-12-01')).availableCount,0);
      await db.collection('borrowRequests').deleteOne({_id:request});
      assert.equal((await availability(type,'2026-12-01')).availableCount,0);
    });
  } finally {
    if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
    await client.close();
    assert((await realpath(folder)).startsWith(await realpath(tmpdir())));
    await repl.stop({doCleanup:true,force:true});
  }
});

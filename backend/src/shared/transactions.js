import { fail } from '../equipment/errors.js';
export function sessionDatabase(db, session) {
  return { collection(name) {
    const c = db.collection(name);
    return {
      find: (f, o) => c.find(f, { ...o, session }),
      findOne: (f, o) => c.findOne(f, { ...o, session }),
      aggregate: (p, o) => c.aggregate(p, { ...o, session }),
      insertOne: (d, o) => c.insertOne(d, { ...o, session }),
      updateOne: (f, u, o) => c.updateOne(f, u, { ...o, session }),
      updateMany: (f, u, o) => c.updateMany(f, u, { ...o, session }),
      findOneAndUpdate: (f, u, o) => c.findOneAndUpdate(f, u, { ...o, session }),
      deleteOne: (f, o) => c.deleteOne(f, { ...o, session })
    };
  } };
}
export async function lock(db, collection, _id) {
  // Always change the timestamp so competing transactions conflict.
  const doc = await db.collection(collection).findOneAndUpdate({ _id }, [{ $set: {
    updatedAt: { $max: ['$$NOW', { $add: [{ $ifNull: ['$updatedAt', new Date(0)] }, 1] }] }
  } }], { returnDocument: 'after' });
  if (!doc) fail(404, 'RESOURCE_NOT_FOUND', 'Record not found');
  return doc;
}
export async function audit(db, actorId, action, entityType, entityId, details = {}) {
  await db.collection('auditEvents').insertOne({ actorId, action, entityType, entityId, details, occurredAt: new Date() });
}
export async function transaction({ client, db }, actorId, roles, work) {
  return client.withSession(session => session.withTransaction(async () => {
    const scoped = sessionDatabase(db, session);
    const actor = await lock(scoped, 'users', actorId);
    if (!actor.isActive) fail(401, 'UNAUTHENTICATED', 'Authentication required');
    if (!roles.includes(actor.role)) fail(403, 'FORBIDDEN', 'Insufficient permissions');
    return work(scoped, actor);
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary', maxCommitTimeMS: 10000 }));
}

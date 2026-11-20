import { ObjectId } from 'mongodb';
import { object } from '../equipment/validation.js';
import { fail } from '../equipment/errors.js';
import { email, hashPassword, profile } from '../auth/passwords.js';
import { transaction, lock, audit, sessionDatabase } from '../shared/transactions.js';
export const roles = ['borrower', 'staff', 'admin'];
export async function account(body) {
  object(body, ['name', 'email', 'password', 'role', 'isActive']);
  if (typeof body.name !== 'string' || !body.name.trim()) fail(400, 'INVALID_INPUT', 'Name is required');
  if (!roles.includes(body.role)) fail(400, 'INVALID_INPUT', 'Invalid role');
  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') fail(400, 'INVALID_INPUT', 'isActive must be boolean');
  return { name: body.name.trim(), emailNormalized: email(body.email), passwordHash: await hashPassword(body.password), role: body.role, isActive: body.isActive ?? true, createdAt: new Date(), updatedAt: new Date() };
}
export function adminService(connection, actorId) {
  return {
    async create(body) {
      const user = await account(body);
      return transaction(connection, actorId, ['admin'], async db => {
        await db.collection('users').insertOne(user);
        await audit(db, actorId, 'created', 'users', user._id, { role: user.role });
        return profile(user);
      });
    },
    change: (_id, fields) => transaction(connection, actorId, ['admin'], async db => {
      await lock(db, 'users', _id);
      const user = await db.collection('users').findOneAndUpdate({ _id }, { $set: { ...fields, updatedAt: new Date() } }, { returnDocument: 'after' });
      await audit(db, actorId, 'updated', 'users', _id, fields);
      return profile(user);
    })
  };
}
export async function bootstrap(connection, credentials) {
  object(credentials, ['name', 'email', 'password']);
  const user = await account({ ...credentials, role: 'admin' });
  // A shared first-admin ID makes simultaneous bootstrap attempts conflict.
  user._id = new ObjectId('000000000000000000000001');
  return connection.client.withSession(session => session.withTransaction(async () => {
    const db = sessionDatabase(connection.db, session);
    if (await db.collection('auditEvents').findOne({ action: 'bootstrapped', entityType: 'users', entityId: user._id }) ||
        await db.collection('users').findOne({ role: 'admin', passwordHash: { $ne: 'TEST_ONLY_NO_LOGIN' } })) fail(409, 'ADMIN_EXISTS', 'An administrator already exists');
    await db.collection('users').insertOne(user);
    await audit(db, user._id, 'bootstrapped', 'users', user._id);
    return profile(user);
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }));
}

import { MongoClient } from 'mongodb';

export const COLLECTION_NAMES = [
  'users', 'equipmentTypes', 'equipmentUnits',
  'borrowRequests', 'reservations', 'auditEvents'
];

export function databaseConfig(env = process.env) {
  if (!env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  if (!/^mongodb(\+srv)?:\/\//.test(env.MONGODB_URI)) {
    throw new Error('MONGODB_URI must be a MongoDB connection string');
  }
  const name = env.MONGODB_DB || 'relay';
  if (!/^[a-zA-Z0-9_-]{1,63}$/.test(name)) {
    throw new Error('MONGODB_DB must be a simple database name');
  }
  return { uri: env.MONGODB_URI, name };
}

// Read-only verification: no collections, indexes, validators, or records are changed.
export async function checkDatabase(db) {
  await db.command({ ping: 1 });
  const existing = await db.listCollections({}, { nameOnly: true }).toArray();
  const missing = COLLECTION_NAMES.filter(name => !existing.some(c => c.name === name));
  if (missing.length) throw new Error('Required collections missing: ' + missing.join(', '));
  return { database: db.databaseName, collections: COLLECTION_NAMES };
}

export async function connectDatabase(env = process.env) {
  const { uri, name } = databaseConfig(env);
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const db = client.db(name);
    await checkDatabase(db);
    return { client, db };
  } catch (error) {
    await client.close();
    throw error;
  }
}

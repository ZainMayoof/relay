import { connectDatabase } from '../src/db.js';

let client;
try {
  const connection = await connectDatabase();
  client = connection.client;
  console.log('PASS: connected to MongoDB, ping succeeded, and all six Relay collections exist.');
} catch {
  console.error('FAIL: connection check did not pass. Check MONGODB_URI, MONGODB_DB, network access and permission to list the six existing collections.');
  process.exitCode = 1;
} finally {
  if (client) await client.close();
}

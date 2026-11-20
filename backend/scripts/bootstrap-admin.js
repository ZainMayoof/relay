import { connectDatabase } from '../src/db.js';
import { bootstrap } from '../src/admin/service.js';
let connection;
try {
  if (process.stdin.isTTY) throw new Error('Pipe credentials through standard input');
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 32768) throw new Error('Input too large');
  }
  const credentials = JSON.parse(input);
  connection = await connectDatabase();
  await bootstrap(connection, credentials);
  console.log('First administrator created.');
} catch {
  console.error('Bootstrap failed. Check input, database configuration, duplicate email, and whether an administrator already exists. No existing account was overwritten.');
  process.exitCode = 1;
} finally { if (connection) await connection.client.close(); }

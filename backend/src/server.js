import { connectDatabase } from './db.js';
import { createApp } from './app.js';

let client;
try {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid PORT');
  }
  const connection = await connectDatabase();
  client = connection.client;
  const origin = process.env.APP_ORIGIN;
  if (!origin || new URL(origin).protocol !== 'https:' || new URL(origin).origin !== origin) throw new Error('APP_ORIGIN must be an HTTPS origin');
  const app = createApp(connection, { origin });
  const server = app.listen(port, process.env.HOST || '127.0.0.1', () => {
    console.log('Relay API listening on port ' + port + '; MongoDB connection verified.');
  });
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    const timer = setTimeout(() => process.exit(1), 10000);
    timer.unref();
    server.close(async () => {
      try { await client.close(); } finally { clearTimeout(timer); }
    });
  };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
  server.on('error', async () => {
    console.error('HTTP server failed to start. Check HOST and PORT.');
    await client.close();
    process.exitCode = 1;
  });
} catch {
  // Driver errors may contain connection details. Do not print credentials or the URI.
  console.error('Startup failed. Check MONGODB_URI, MONGODB_DB, network access, the six existing collections, HOST and PORT.');
  if (client) await client.close();
  process.exitCode = 1;
}


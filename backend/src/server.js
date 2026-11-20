import { connectDatabase } from './db.js';
import { createApp } from './app.js';
import { serverConfig } from './config.js';

let client;
try {
  let config;
  try { config = serverConfig(); } catch (error) {
    console.error('Server configuration: ' + error.message);
    process.exitCode = 1;
    throw new Error('Configuration rejected');
  }
  const { port, host, origin } = config;
  const connection = await connectDatabase();
  client = connection.client;
  const app = createApp(connection, { origin });
  const server = app.listen(port, host, () => {
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
  if (!process.exitCode) console.error('Startup failed. Check MONGODB_URI, MONGODB_DB, network access, the six existing collections, HOST and PORT.');
  if (client) await client.close();
  process.exitCode = 1;
}

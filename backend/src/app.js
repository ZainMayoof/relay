import express from 'express';

export function createApp({ db }) {
  const app = express();
  app.disable('x-powered-by');

  // Connection health only. No collection records are exposed.
  app.get('/health', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      await db.command({ ping: 1 });
      res.json({ status: 'ok', database: 'connected' });
    } catch {
      res.status(503).json({ status: 'unavailable', database: 'disconnected' });
    }
  });

  app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
  return app;
}

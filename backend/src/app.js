import express from 'express';
import { equipmentRouter } from './equipment/routes.js';

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

  // Equipment stays locked until authentication and auditing are integrated.
  app.use('/api', equipmentRouter({ db }));

  app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
  return app;
}

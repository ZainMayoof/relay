import { readFileSync } from 'node:fs';
import swaggerUi from 'swagger-ui-express';
export const openapi = JSON.parse(readFileSync(new URL('../docs/openapi.yaml', import.meta.url), 'utf8'));
export function documentation(app) {
  app.get('/openapi.json', (req, res) => res.json(openapi));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapi, { swaggerOptions: { persistAuthorization: false, withCredentials: true } }));
}

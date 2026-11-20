import { Router, json } from 'express';
import * as v from './validation.js';
import { fail, errorHandler } from './errors.js';
import { equipmentService } from './service.js';

export function equipmentRouter({ db, identity = () => null, now }) {
  const router = Router();
  const service = () => equipmentService(db, now);
  const permit = roles => async (req, res, next) => {
    const user = await identity(req);
    if (!user || user.isActive !== true) fail(401, 'UNAUTHENTICATED', 'Authentication required');
    if (!roles.includes(user.role)) fail(403, 'FORBIDDEN', 'Insufficient permissions');
    res.locals.role = user.role;
    next();
  };
  const all = permit(['borrower', 'staff', 'admin']);
  const staff = permit(['staff', 'admin']);
  const admin = permit(['admin']);
  const parse = [ (req, res, next) => {
    if (!req.is('application/json')) fail(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json');
    next();
  }, json({ limit: '32kb' }) ];
  for (const [route, kind] of [['equipment-types', 'type'], ['equipment-units', 'unit']]) {
    router.get('/' + route, kind === 'type' ? all : staff, async (req, res) =>
      res.json(await service().list(kind, v.listQuery(req.query, kind, res.locals.role))));
    router.post('/' + route, staff, ...parse, async (req, res) => {
      v.noQuery(req.query);
      res.status(201).json(await service().create(kind, v.body(req.body, kind)));
    });
    router.patch('/' + route + '/:id', staff, ...parse, async (req, res) => {
      v.noQuery(req.query);
      res.json(await service().patch(kind, v.id(req.params.id), v.body(req.body, kind, true)));
    });
  }
  router.get('/equipment-types/:id/availability', all, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await service().availability(v.id(req.params.id), v.interval(req.query)));
  });
  router.delete('/equipment-units/:id', admin, async (req, res) => {
    v.noQuery(req.query);
    if (req.headers['transfer-encoding'] || Number(req.headers['content-length'] || 0) > 0) fail(400, 'INVALID_INPUT', 'DELETE does not accept a body');
    await service().remove(v.id(req.params.id));
    res.status(204).end();
  });
  router.use(errorHandler);
  return router;
}

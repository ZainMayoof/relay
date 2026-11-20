import { Router } from 'express';
import { adminService, roles } from './service.js';
import { profile } from '../auth/passwords.js';
import { permit, parseJson, page } from '../shared/http.js';
import { id, object, noQuery } from '../equipment/validation.js';
import { fail, errorHandler } from '../equipment/errors.js';
export function adminRouter({ db, client, identity = () => null, revokeUser = () => {} }) {
  const router = Router();
  const admin = permit(identity, ['admin']);
  router.get('/users', admin, async (req, res) => {
    const paging = page(req.query);
    const items = await db.collection('users').find({}, { projection: { passwordHash: 0 } }).sort({ _id: 1 }).skip(paging.offset).limit(paging.limit).toArray();
    res.json({ items: items.map(profile), ...paging });
  });
  router.post('/users', admin, ...parseJson, async (req, res) => {
    noQuery(req.query); res.status(201).json(await adminService({ db, client }, res.locals.actor._id).create(req.body));
  });
  for (const [route, field] of [['role', 'role'], ['status', 'isActive']]) router.patch('/users/:id/' + route, admin, ...parseJson, async (req, res) => {
    noQuery(req.query); object(req.body, [field]);
    if (field === 'role' ? !roles.includes(req.body.role) : typeof req.body.isActive !== 'boolean') fail(400, 'INVALID_INPUT', 'Invalid account update');
    const _id = id(req.params.id);
    const result = await adminService({ db, client }, res.locals.actor._id).change(_id, { [field]: req.body[field] });
    revokeUser(_id); res.json(result);
  });
  router.get('/audit-events', admin, async (req, res) => {
    const paging = page(req.query, ['actorId', 'entityType', 'entityId']);
    const filter = {};
    for (const field of ['actorId', 'entityId']) if (req.query[field] !== undefined) filter[field] = id(req.query[field]);
    if (req.query.entityType !== undefined) {
      if (!['users', 'equipmentTypes', 'equipmentUnits', 'borrowRequests', 'reservations'].includes(req.query.entityType)) fail(400, 'INVALID_INPUT', 'Invalid entity type');
      filter.entityType = req.query.entityType;
    }
    const items = await db.collection('auditEvents').find(filter).sort({ occurredAt: -1, _id: -1 }).skip(paging.offset).limit(paging.limit).toArray();
    res.json({ items, ...paging });
  });
  router.use(errorHandler); return router;
}

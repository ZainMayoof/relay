import { Router } from 'express';
import { borrowingService } from './service.js';
import { requestBody, returnBody, states } from './validation.js';
import { permit, parseJson, empty, page } from '../shared/http.js';
import { id, noQuery } from '../equipment/validation.js';
import { fail, errorHandler } from '../equipment/errors.js';
export function borrowingRouter({ db, client, identity = () => null, now }) {
  const router = Router();
  const borrower = permit(identity, ['borrower']), staff = permit(identity, ['staff', 'admin']);
  const service = res => borrowingService({ db, client }, res.locals.actor._id, now);
  router.post('/requests', borrower, ...parseJson, async (req, res) => {
    noQuery(req.query); res.status(201).json(await service(res).submit(requestBody(req.body)));
  });
  for (const [route, guard, own] of [['/requests/mine', borrower, true], ['/requests', staff, false]]) {
    router.get(route, guard, async (req, res) => {
      const paging = page(req.query, ['status']);
      if (req.query.status !== undefined && !states.includes(req.query.status)) fail(400, 'INVALID_INPUT', 'Invalid request status');
      const filter = { ...(own ? { borrowerId: res.locals.actor._id } : {}), ...(req.query.status ? { status: req.query.status } : {}) };
      const items = await db.collection('borrowRequests').find(filter).sort({ requestedAt: -1, _id: -1 }).skip(paging.offset).limit(paging.limit).toArray();
      res.json({ items, ...paging });
    });
  }
  router.patch('/requests/:id/cancel', borrower, async (req, res) => { empty(req); res.json(await service(res).cancel(id(req.params.id))); });
  for (const action of ['approve', 'reject', 'checkout']) router.post('/requests/:id/' + action, staff, async (req, res) => {
    empty(req); res.json(await service(res)[action](id(req.params.id)));
  });
  router.post('/requests/:id/return', staff, ...parseJson, async (req, res) => {
    noQuery(req.query); res.json(await service(res).return(id(req.params.id), returnBody(req.body)));
  });
  router.use(errorHandler);
  return router;
}

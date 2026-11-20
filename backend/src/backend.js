import { Router } from 'express';
import { authentication } from './auth/sessions.js';
import { equipmentRouter } from './equipment/routes.js';
import { borrowingRouter } from './borrowing/routes.js';
import { adminRouter } from './admin/routes.js';
import { errorHandler } from './equipment/errors.js';
export function backendRouter(connection, options) {
  const router = Router();
  const auth = authentication({ db: connection.db, ...options });
  router.use(auth.guard, auth.router);
  router.use(equipmentRouter({ ...connection, identity: auth.identity, transactional: true }));
  router.use(borrowingRouter({ ...connection, identity: auth.identity }));
  router.use(adminRouter({ ...connection, identity: auth.identity, revokeUser: auth.revokeUser }));
  router.use(errorHandler);
  return router;
}

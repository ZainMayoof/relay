import { json } from 'express';
import { fail } from '../equipment/errors.js';
import { object } from '../equipment/validation.js';
export const parseJson = [(req, res, next) => {
  if (!req.is('application/json')) fail(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json');
  next();
}, json({ limit: '32kb' })];
export const permit = (identity, roles) => async (req, res, next) => {
  const user = await identity(req);
  if (!user || user.isActive !== true) fail(401, 'UNAUTHENTICATED', 'Authentication required');
  if (!roles.includes(user.role)) fail(403, 'FORBIDDEN', 'Insufficient permissions');
  res.locals.actor = user;
  next();
};
export function empty(req) {
  object(req.query, []);
  if (req.headers['transfer-encoding'] || Number(req.headers['content-length'] || 0) > 0) fail(400, 'INVALID_INPUT', 'This operation does not accept a body');
}
export function page(query, fields = []) {
  object(query, ['limit', 'offset', ...fields]);
  for (const value of Object.values(query)) if (typeof value !== 'string') fail(400, 'INVALID_INPUT', 'Query parameters must be single values');
  const parse = (v, fallback, min, max) => {
    if (v === undefined) return fallback;
    if (!/^(0|[1-9]\d*)$/.test(v) || !Number.isSafeInteger(+v) || +v < min || +v > max) fail(400, 'INVALID_INPUT', 'Invalid pagination');
    return +v;
  };
  return { limit: parse(query.limit, 25, 1, 100), offset: parse(query.offset, 0, 0, Number.MAX_SAFE_INTEGER) };
}

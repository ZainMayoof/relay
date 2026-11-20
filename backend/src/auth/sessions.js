import { Router } from 'express';
import { randomBytes, createHash } from 'node:crypto';
import { email, verifyPassword, profile } from './passwords.js';
import { object } from '../equipment/validation.js';
import { fail, errorHandler } from '../equipment/errors.js';
import { parseJson, empty } from '../shared/http.js';
export function authentication({ db, origin, ttl = 3600000, now = Date.now }) {
  const sessions = new Map();
  const digest = value => createHash('sha256').update(value).digest('hex');
  const token = req => req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('__Host-relay='))?.slice(13);
  const identity = async req => {
    const value = token(req), record = value && sessions.get(digest(value));
    if (!record) return null;
    if (record.expires <= now()) { sessions.delete(digest(value)); return null; }
    const user = await db.collection('users').findOne({ _id: record.userId });
    return user?.isActive ? user : null;
  };
  const guard = (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== origin) fail(403, 'FORBIDDEN', 'Invalid request origin');
    next();
  };
  const router = Router();
  const cookie = value => '__Host-relay=' + value + '; Path=/; Secure; HttpOnly; SameSite=Strict';
  router.post('/auth/login', ...parseJson, async (req, res) => {
    object(req.query, []); object(req.body, ['email', 'password']);
    const user = await db.collection('users').findOne({ emailNormalized: email(req.body.email) });
    if (!user?.isActive || !await verifyPassword(user.passwordHash, req.body.password)) fail(401, 'UNAUTHENTICATED', 'Invalid credentials');
    for (const [key, session] of sessions) if (session.expires <= now()) sessions.delete(key);
    if (sessions.size >= 10000) fail(503, 'SESSION_CAPACITY', 'Session capacity reached');
    const previous = token(req); if (previous) sessions.delete(digest(previous));
    const value = randomBytes(32).toString('base64url');
    sessions.set(digest(value), { userId: user._id, expires: now() + ttl });
    res.set('Set-Cookie', cookie(value) + '; Max-Age=' + Math.floor(ttl / 1000)); res.json(profile(user));
  });
  router.get('/auth/me', async (req, res) => {
    object(req.query, []); const user = await identity(req);
    if (!user) fail(401, 'UNAUTHENTICATED', 'Authentication required');
    res.json(profile(user));
  });
  router.post('/auth/logout', async (req, res) => {
    empty(req); if (!await identity(req)) fail(401, 'UNAUTHENTICATED', 'Authentication required');
    sessions.delete(digest(token(req))); res.set('Set-Cookie', cookie('') + '; Max-Age=0'); res.status(204).end();
  });
  router.use(errorHandler);
  return { router, identity, guard, revokeUser: id => { for (const [key, session] of sessions) if (session.userId.equals(id)) sessions.delete(key); } };
}

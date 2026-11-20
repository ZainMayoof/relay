import argon2 from 'argon2';
import { fail } from '../equipment/errors.js';
export function email(value) {
  if (typeof value !== 'string') fail(400, 'INVALID_INPUT', 'Invalid email');
  const normalized = value.trim().toLowerCase();
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) fail(400, 'INVALID_INPUT', 'Invalid email');
  return normalized;
}
export function password(value) {
  if (typeof value !== 'string' || value.length < 12 || Buffer.byteLength(value, 'utf8') > 1024) fail(400, 'INVALID_INPUT', 'Password must be at least 12 characters and at most 1024 bytes');
  return value;
}
export const hashPassword = value => argon2.hash(password(value), { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
export async function verifyPassword(hash, value) {
  if (typeof hash !== 'string' || !hash.startsWith('$argon2id$') || typeof value !== 'string' || Buffer.byteLength(value) > 1024) return false;
  try { return await argon2.verify(hash, value); } catch { return false; }
}
export const profile = user => ({ _id: user._id, name: user.name, emailNormalized: user.emailNormalized, role: user.role, isActive: user.isActive, createdAt: user.createdAt, updatedAt: user.updatedAt });

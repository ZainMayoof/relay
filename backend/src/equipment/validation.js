import { ObjectId } from 'mongodb';
import { fail } from './errors.js';
const invalid = message => fail(400, 'INVALID_INPUT', message);
const conditions = ['good', 'fair', 'damaged'];
const statuses = ['active', 'maintenance', 'retired'];
export function object(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Expected an object');
  for (const key of Object.keys(value)) if (!allowed.includes(key)) invalid('Unknown field: ' + key);
  return value;
}
export function id(value) {
  if (typeof value !== 'string' || !/^[a-fA-F0-9]{24}$/.test(value)) invalid('Invalid identifier');
  return new ObjectId(value);
}
function string(value, required = false) {
  if (typeof value !== 'string' || (required && !value.trim())) invalid('Expected a valid string');
  return value.trim();
}
function safeJson(value, depth = 0) {
  if (depth > 10) invalid('Specifications are too deeply nested');
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith('$') || key.includes('.') || ['__proto__', 'constructor', 'prototype'].includes(key)) invalid('Unsafe specification key');
      safeJson(child, depth + 1);
    }
  } else if (typeof value === 'number' && !Number.isFinite(value)) invalid('Invalid number');
}
export function body(value, kind, patch = false) {
  const allowed = kind === 'type'
    ? ['name', 'category', 'description', 'specifications', 'isActive']
    : patch ? ['condition', 'serviceStatus', 'serialNumber', 'location']
    : ['equipmentTypeId', 'assetTag', 'condition', 'serviceStatus', 'serialNumber', 'location'];
  object(value, allowed);
  if (patch && !Object.keys(value).length) invalid('Provide at least one field');
  const required = patch ? [] : kind === 'type' ? ['name', 'category'] : ['equipmentTypeId', 'assetTag', 'condition', 'serviceStatus'];
  for (const key of required) if (!(key in value)) invalid('Missing field: ' + key);
  const result = {};
  for (const [key, input] of Object.entries(value)) {
    if (key === 'equipmentTypeId') result[key] = id(input);
    else if (key === 'isActive') {
      if (typeof input !== 'boolean') invalid('isActive must be boolean');
      result[key] = input;
    } else if (key === 'specifications') {
      if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('specifications must be an object');
      safeJson(input); result[key] = input;
    } else {
      result[key] = string(input, ['name', 'category', 'assetTag'].includes(key));
      if (key === 'condition' && !conditions.includes(result[key])) invalid('Invalid condition');
      if (key === 'serviceStatus' && !statuses.includes(result[key])) invalid('Invalid service status');
    }
  }
  if (!patch && kind === 'type') result.isActive ??= true;
  return result;
}
export function listQuery(query, kind, role) {
  object(query, kind === 'type' ? ['category', 'isActive', 'limit', 'offset'] : ['equipmentTypeId', 'assetTag', 'condition', 'serviceStatus', 'limit', 'offset']);
  const filter = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value !== 'string') invalid('Query parameters must be single values');
    if (key === 'limit' || key === 'offset') continue;
    if (key === 'equipmentTypeId') filter[key] = id(value);
    else if (key === 'isActive') {
      if (!['true', 'false'].includes(value)) invalid('Invalid isActive filter');
      if (role === 'borrower' && value === 'false') fail(403, 'FORBIDDEN', 'Inactive catalog is restricted');
      filter[key] = value === 'true';
    } else {
      filter[key] = string(value, true);
      if (key === 'condition' && !conditions.includes(value)) invalid('Invalid condition');
      if (key === 'serviceStatus' && !statuses.includes(value)) invalid('Invalid service status');
    }
  }
  if (kind === 'type') filter.isActive ??= true;
  const number = (value, fallback, min, max) => {
    if (value === undefined) return fallback;
    if (!/^(0|[1-9]\d*)$/.test(value)) invalid('Invalid pagination');
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < min || n > max) invalid('Invalid pagination');
    return n;
  };
  return { filter, limit: number(query.limit, 25, 1, 100), offset: number(query.offset, 0, 0, Number.MAX_SAFE_INTEGER) };
}
export function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid('Use YYYY-MM-DD dates');
  const d = new Date(value + 'T00:00:00.000Z');
  if (!Number.isFinite(+d) || d.toISOString().slice(0, 10) !== value) invalid('Invalid calendar date');
  return d;
}
export function interval(query) {
  object(query, ['startDate', 'endDate']);
  const start = date(query.startDate), end = date(query.endDate);
  if (end < start) invalid('endDate must not precede startDate');
  return { start, end };
}
export const noQuery = query => object(query, []);

import { Int32 } from 'mongodb';
import { object, id, interval } from '../equipment/validation.js';
import { fail } from '../equipment/errors.js';
const bad = message => fail(400, 'INVALID_INPUT', message);
export function requestBody(body) {
  object(body, ['items', 'startDate', 'endDate']);
  const { start, end } = interval({ startDate: body.startDate, endDate: body.endDate });
  if (!Array.isArray(body.items) || !body.items.length) bad('Provide requested items');
  const seen = new Set();
  const items = body.items.map(item => {
    object(item, ['equipmentTypeId', 'quantity']);
    const equipmentTypeId = id(item.equipmentTypeId);
    if (seen.has(String(equipmentTypeId))) bad('Duplicate equipment type');
    seen.add(String(equipmentTypeId));
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 2147483647) bad('Quantity must be a positive BSON integer');
    return { equipmentTypeId, quantity: new Int32(item.quantity) };
  });
  return { items, startDate: start, endDate: end };
}
export function returnBody(body) {
  object(body, ['returnNotes', 'units']);
  const result = { units: [] };
  if (body.returnNotes !== undefined) {
    if (typeof body.returnNotes !== 'string') bad('Invalid return notes');
    result.returnNotes = body.returnNotes.trim();
  }
  if (body.units !== undefined) {
    if (!Array.isArray(body.units)) bad('Invalid returned units');
    const seen = new Set();
    result.units = body.units.map(unit => {
      object(unit, ['equipmentUnitId', 'condition']);
      const equipmentUnitId = id(unit.equipmentUnitId);
      if (seen.has(String(equipmentUnitId)) || !['good', 'fair', 'damaged'].includes(unit.condition)) bad('Invalid or duplicate returned unit');
      seen.add(String(equipmentUnitId));
      return { equipmentUnitId, condition: unit.condition };
    });
  }
  return result;
}
export const states = ['pending', 'approved', 'rejected', 'checked_out', 'returned', 'cancelled'];

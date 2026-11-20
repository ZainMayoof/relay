import { fail } from '../equipment/errors.js';
import { eligibleUnits } from '../equipment/service.js';
import { transaction, lock, audit } from '../shared/transactions.js';
const conflict = message => fail(409, 'REQUEST_CONFLICT', message);
const day = d => new Date(d.toISOString().slice(0, 10) + 'T00:00:00Z');
export function borrowingService(connection, actorId, now = () => new Date()) {
  const write = (roles, work) => transaction(connection, actorId, roles, work);
  const staff = ['staff', 'admin'];
  async function state(db, _id, expected) {
    const request = await lock(db, 'borrowRequests', _id);
    if (request.status !== expected) conflict('Invalid request state');
    return request;
  }
  async function finish(db, request, action, fields) {
    const result = await db.collection('borrowRequests').findOneAndUpdate({ _id: request._id }, { $set: { ...fields, updatedAt: now() } }, { returnDocument: 'after' });
    await audit(db, actorId, action, 'borrowRequests', request._id);
    return result;
  }
  async function allocations(db, request) {
    const rows = await db.collection('reservations').find({ requestId: request._id, status: 'active' }).sort({ equipmentUnitId: 1 }).toArray();
    const counts = new Map(), seen = new Set();
    const units = [];
    for (const row of rows) {
      if (seen.has(String(row.equipmentUnitId))) conflict('Duplicate allocation');
      seen.add(String(row.equipmentUnitId));
      const unit = await lock(db, 'equipmentUnits', row.equipmentUnitId);
      const days = row.reservedDays;
      const length = (request.endDate - request.startDate) / 86400000 + 1;
      if (days.length !== length || new Set(days.map(Number)).size !== length || days.some(d => +d % 86400000 || d < request.startDate || d > request.endDate)) conflict('Incomplete reservation dates');
      const key = String(unit.equipmentTypeId);
      counts.set(key, (counts.get(key) || 0) + 1);
      units.push({ row, unit });
    }
    if (!rows.length || counts.size !== request.items.length || request.items.some(i => counts.get(String(i.equipmentTypeId)) !== Number(i.quantity))) conflict('Incomplete allocation');
    return units;
  }
  return {
    submit: fields => write(['borrower'], async db => {
      for (const item of [...fields.items].sort((a,b) => String(a.equipmentTypeId).localeCompare(String(b.equipmentTypeId)))) {
        const type = await lock(db, 'equipmentTypes', item.equipmentTypeId);
        if (!type.isActive) conflict('Equipment type is inactive');
      }
      const request = { ...fields, borrowerId: actorId, status: 'pending', requestedAt: now(), updatedAt: now() };
      await db.collection('borrowRequests').insertOne(request);
      await audit(db, actorId, 'submitted', 'borrowRequests', request._id);
      return request;
    }),
    cancel: _id => write(['borrower'], async db => {
      const request = await state(db, _id, 'pending');
      if (!request.borrowerId.equals(actorId)) fail(403, 'FORBIDDEN', 'Request belongs to another borrower');
      return finish(db, request, 'cancelled', { status: 'cancelled' });
    }),
    reject: _id => write(staff, async db => {
      const request = await state(db, _id, 'pending');
      return finish(db, request, 'rejected', { status: 'rejected', reviewedBy: actorId, reviewedAt: now() });
    }),
    approve: _id => write(staff, async db => {
      const request = await state(db, _id, 'pending');
      const days = [];
      // Keep one reservation document below MongoDB's BSON size limit.
      if ((request.endDate - request.startDate) / 86400000 > 500000) fail(413, 'REQUEST_TOO_LARGE', 'Reservation interval is too large');
      for (let date = +request.startDate; date <= +request.endDate; date += 86400000) days.push(new Date(date));
      for (const item of [...request.items].sort((a,b) => String(a.equipmentTypeId).localeCompare(String(b.equipmentTypeId)))) {
        const type = await lock(db, 'equipmentTypes', item.equipmentTypeId);
        if (!type.isActive) conflict('Equipment type is inactive');
        const candidates = await eligibleUnits(db, item.equipmentTypeId, { start: request.startDate, end: request.endDate }, now);
        candidates.sort((a,b) => String(a._id).localeCompare(String(b._id)));
        if (candidates.length < Number(item.quantity)) conflict('Insufficient available equipment');
        for (const candidate of candidates.slice(0, Number(item.quantity))) {
          await lock(db, 'equipmentUnits', candidate._id);
          const row = { requestId: _id, equipmentUnitId: candidate._id, reservedDays: days, status: 'active', createdAt: now(), updatedAt: now() };
          await db.collection('reservations').insertOne(row);
          await audit(db, actorId, 'allocated', 'reservations', row._id);
        }
      }
      return finish(db, request, 'approved', { status: 'approved', reviewedBy: actorId, reviewedAt: now() });
    }),
    checkout: _id => write(staff, async db => {
      const request = await state(db, _id, 'approved');
      const today = day(now());
      if (today < request.startDate || today > request.endDate) conflict('Checkout must be within the reserved dates');
      const allocated = await allocations(db, request);
      for (const { unit } of allocated) {
        if (unit.activeCheckoutRequestId != null || unit.serviceStatus !== 'active' || unit.condition === 'damaged') conflict('Allocated unit is unavailable');
        await db.collection('equipmentUnits').updateOne({ _id: unit._id }, { $set: { activeCheckoutRequestId: _id, updatedAt: now() } });
        await audit(db, actorId, 'checked_out', 'equipmentUnits', unit._id, { requestId: _id });
      }
      return finish(db, request, 'checked_out', { status: 'checked_out', checkedOutAt: now(), checkedOutBy: actorId });
    }),
    return: (_id, fields) => write(staff, async db => {
      const request = await state(db, _id, 'checked_out');
      const allocated = await allocations(db, request);
      if (fields.units.some(change => !allocated.some(({ unit }) => unit._id.equals(change.equipmentUnitId)))) conflict('Condition change does not belong to this allocation');
      for (const { row, unit } of allocated) {
        if (!unit.activeCheckoutRequestId?.equals(_id)) conflict('Checkout reference is inconsistent');
        const condition = fields.units.find(change => unit._id.equals(change.equipmentUnitId))?.condition ?? unit.condition;
        await db.collection('equipmentUnits').updateOne({ _id: unit._id }, { $set: { activeCheckoutRequestId: null, condition, updatedAt: now() } });
        await db.collection('reservations').updateOne({ _id: row._id }, { $set: { status: 'completed', updatedAt: now() } });
        await audit(db, actorId, 'returned', 'equipmentUnits', unit._id, { requestId: _id, condition });
        await audit(db, actorId, 'completed', 'reservations', row._id);
      }
      return finish(db, request, 'returned', { status: 'returned', returnedAt: now(), returnedTo: actorId, ...(fields.returnNotes === undefined ? {} : { returnNotes: fields.returnNotes }) });
    })
  };
}

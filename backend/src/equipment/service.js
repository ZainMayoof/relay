import { fail } from './errors.js';
const missing = () => fail(404, 'RESOURCE_NOT_FOUND', 'Equipment record not found');
const conflict = () => fail(409, 'INVENTORY_CONFLICT', 'Equipment has outstanding allocations or historical references');
const validDay = d => d instanceof Date && Number.isFinite(+d) && +d % 86400000 === 0;
export function equipmentService(db, now = () => new Date()) {
  const types = db.collection('equipmentTypes'), units = db.collection('equipmentUnits');
  const reservations = db.collection('reservations'), audits = db.collection('auditEvents');
  async function find(collection, _id) { const record = await collection.findOne({ _id }); return record || missing(); }
  async function busy(unitIds) {
    if (await units.findOne({ _id: { $in: unitIds }, activeCheckoutRequestId: { $ne: null } })) conflict();
    if (await reservations.findOne({ equipmentUnitId: { $in: unitIds }, status: 'active' })) conflict();
  }
  return {
    async list(kind, { filter, limit, offset }) {
      const items = await (kind === 'type' ? types : units).find(filter).sort({ _id: 1 }).skip(offset).limit(limit).toArray();
      return { items, limit, offset };
    },
    async create(kind, fields) {
      const collection = kind === 'type' ? types : units;
      if (kind === 'unit') await find(types, fields.equipmentTypeId);
      const stamp = now();
      const record = { ...fields, ...(kind === 'unit' ? { activeCheckoutRequestId: null } : {}), createdAt: stamp, updatedAt: stamp };
      await collection.insertOne(record);
      return record;
    },
    async patch(kind, _id, fields) {
      const collection = kind === 'type' ? types : units;
      await find(collection, _id);
      if (kind === 'type' && fields.isActive === false) {
        const children = await units.find({ equipmentTypeId: _id }, { projection: { _id: 1 } }).toArray();
        await busy(children.map(u => u._id));
      }
      if (kind === 'unit' && (['maintenance', 'retired'].includes(fields.serviceStatus) || fields.condition === 'damaged')) await busy([_id]);
      const record = await collection.findOneAndUpdate({ _id }, { $set: { ...fields, updatedAt: now() } }, { returnDocument: 'after' });
      return record || missing();
    },
    async remove(_id) {
      const unit = await find(units, _id);
      if (unit.activeCheckoutRequestId != null) conflict();
      if (await reservations.findOne({ equipmentUnitId: _id })) conflict();
      if (await audits.findOne({ entityType: 'equipmentUnits', entityId: _id })) conflict();
      // Phase 3 must coordinate reference writers with this deletion.
      const result = await units.deleteOne({ _id, activeCheckoutRequestId: null });
      if (!result.deletedCount) conflict();
    },
    async availability(_id, { start, end }) {
      const type = await find(types, _id);
      const response = { equipmentTypeId: String(_id), startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10), availableCount: 0, advisory: true };
      if (!type.isActive) return response;
      const candidates = await units.aggregate([
        { $match: { equipmentTypeId: _id, serviceStatus: 'active', condition: { $in: ['good', 'fair'] } } },
        { $lookup: { from: 'reservations', let: { unit: '$_id' }, pipeline: [
          { $match: { $expr: { $eq: ['$equipmentUnitId', '$$unit'] }, status: 'active', reservedDays: { $elemMatch: { $gte: start, $lte: end } } } },
          { $limit: 1 }
        ], as: 'conflicts' } },
        { $match: { 'conflicts.0': { $exists: false } } },
        { $lookup: { from: 'borrowRequests', localField: 'activeCheckoutRequestId', foreignField: '_id', as: 'checkout' } },
        { $project: { activeCheckoutRequestId: 1, equipmentTypeId: 1, checkout: 1 } }
      ]).toArray();
      const today = new Date(now().toISOString().slice(0, 10) + 'T00:00:00.000Z');
      for (const unit of candidates) {
        if (unit.activeCheckoutRequestId != null) {
          const request = unit.checkout[0];
          if (!request || request.status !== 'checked_out' || !validDay(request.startDate) || !validDay(request.endDate) ||
              request.startDate > request.endDate || !(request.checkedOutAt instanceof Date) ||
              !Number.isFinite(+request.checkedOutAt) || request.checkedOutAt > now() ||
              request.returnedAt != null || !request.items?.some(i => i.equipmentTypeId?.equals(_id)) ||
              request.endDate < today) continue;
          if (start <= request.endDate) continue;
        }
        response.availableCount++;
      }
      return response;
    }
  };
}

import { equipmentService } from './service.js';
import { transaction, lock, audit } from '../shared/transactions.js';
export function inventoryService(connection, actorId, now) {
  const write = (roles, work) => transaction(connection, actorId, roles, work);
  return {
    create: (kind, fields) => write(['staff', 'admin'], async db => {
      if (kind === 'unit') await lock(db, 'equipmentTypes', fields.equipmentTypeId);
      const record = await equipmentService(db, now).create(kind, fields);
      await audit(db, actorId, 'created', kind === 'type' ? 'equipmentTypes' : 'equipmentUnits', record._id);
      return record;
    }),
    patch: (kind, _id, fields) => write(['staff', 'admin'], async db => {
      await lock(db, kind === 'type' ? 'equipmentTypes' : 'equipmentUnits', _id);
      const record = await equipmentService(db, now).patch(kind, _id, fields);
      await audit(db, actorId, 'updated', kind === 'type' ? 'equipmentTypes' : 'equipmentUnits', _id, { fields: Object.keys(fields) });
      return record;
    }),
    remove: _id => write(['admin'], async db => {
      await lock(db, 'equipmentUnits', _id);
      await equipmentService(db, now).remove(_id);
      await audit(db, actorId, 'deleted', 'equipmentUnits', _id);
    })
  };
}

const relay = db.getSiblingDB("relay");
const heading = title => print("\n========== " + title + " ==========");
const show = value => printjson(value);
const expected = {
  users: 15,
  equipmentTypes: 42,
  equipmentUnits: 154,
  borrowRequests: 15,
  reservations: 20,
  auditEvents: 46
};

heading("COLLECTION COUNTS");
for (const [name, count] of Object.entries(expected)) {
  const actual = relay.getCollection(name).countDocuments({});
  print(name + ": " + actual + " / " + count);
  if (actual !== count) throw new Error("Unexpected record count: " + name);
}

heading("EQUIPMENT QUERIES");
print("[READ] Microcontrollers and development boards");
relay.equipmentTypes.find(
  { category: "Microcontrollers & Development Boards" },
  { _id: 0, name: 1, category: 1 }
).sort({ name: 1 }).forEach(show);

print("\n[READ] Equipment under maintenance");
relay.equipmentUnits.find(
  { serviceStatus: "maintenance" },
  { _id: 0, assetTag: 1, condition: 1, serviceStatus: 1 }
).forEach(show);

print("\n[AGGREGATION] Inventory by service status");
relay.equipmentUnits.aggregate([
  { $group: { _id: "$serviceStatus", count: { $sum: 1 } } },
  { $sort: { _id: 1 } }
]).forEach(show);

heading("REFERENCE AND DATE CHECKS");
const toLookup = collection => Object.fromEntries(relay.getCollection(collection).find({}, { _id: 1 }).toArray().map(d => [String(d._id), true]));
const typeIds = toLookup("equipmentTypes");
const unitIds = toLookup("equipmentUnits");
const userIds = toLookup("users");
const requestIds = toLookup("borrowRequests");
const entityIds = {
  users: userIds,
  equipmentTypes: typeIds,
  equipmentUnits: unitIds,
  borrowRequests: requestIds,
  reservations: toLookup("reservations")
};
let checkedUnits = 0;
let checkedRequests = 0;
let checkedReservations = 0;
let checkedEvents = 0;

for (const unit of relay.equipmentUnits.find()) {
  if (!typeIds[String(unit.equipmentTypeId)]) throw new Error("Invalid equipment type reference");
  checkedUnits++;
}
for (const request of relay.borrowRequests.find()) {
  if (!userIds[String(request.borrowerId)]) throw new Error("Invalid borrower reference");
  if (request.endDate < request.startDate) throw new Error("Invalid borrowing date range");
  for (const item of request.items) {
    if (!typeIds[String(item.equipmentTypeId)]) throw new Error("Invalid requested type reference");
  }
  checkedRequests++;
}
for (const reservation of relay.reservations.find()) {
  if (!requestIds[String(reservation.requestId)] || !unitIds[String(reservation.equipmentUnitId)]) {
    throw new Error("Invalid reservation reference");
  }
  checkedReservations++;
}
for (const event of relay.auditEvents.find()) {
  if (!userIds[String(event.actorId)]) throw new Error("Invalid audit actor");
  if (!(entityIds[event.entityType] && entityIds[event.entityType][String(event.entityId)])) {
    throw new Error("Invalid audit entity reference");
  }
  checkedEvents++;
}
print("[PASS] Equipment type references: " + checkedUnits);
print("[PASS] Borrower, requested types and dates: " + checkedRequests);
print("[PASS] Reservation references: " + checkedReservations);
print("[PASS] Audit actors and entities: " + checkedEvents);

heading("CRUD OPERATIONS");
const marker = "RELAY-CRUD-TEST";
const now = new Date();
const draft = {
  name: marker,
  category: "Test",
  description: "Temporary record for CRUD testing",
  isActive: false,
  createdAt: now,
  updatedAt: now
};
const existingTest = relay.equipmentTypes.findOne({ name: marker });
if (existingTest) throw new Error("A temporary CRUD record already exists; remove it manually before rerunning");
let createdId = null;

try {
  const created = relay.equipmentTypes.insertOne(draft);
  createdId = created.insertedId;
  print("[CREATE] Inserted equipment type");
  show({ acknowledged: created.acknowledged, insertedId: created.insertedId });

  const found = relay.equipmentTypes.findOne(
    { _id: createdId },
    { name: 1, category: 1, description: 1, isActive: 1 }
  );
  if (!found) throw new Error("Read failed");
  print("\n[READ] Retrieved equipment type");
  show(found);

  const updated = relay.equipmentTypes.updateOne(
    { _id: createdId },
    { $set: { description: "Updated during CRUD testing", updatedAt: new Date() } }
  );
  const after = relay.equipmentTypes.findOne(
    { _id: createdId },
    { name: 1, description: 1 }
  );
  if (updated.modifiedCount !== 1 || after.description !== "Updated during CRUD testing") {
    throw new Error("Update failed");
  }
  print("\n[UPDATE] Modified equipment type");
  show({ matchedCount: updated.matchedCount, modifiedCount: updated.modifiedCount, document: after });

  heading("VALIDATION AND UNIQUE INDEX TESTS");
  let schemaError;
  try {
    relay.equipmentTypes.insertOne({ name: "INVALID-SCHEMA-TEST" });
  } catch (error) {
    schemaError = error;
  }
  if (schemaError?.code !== 121) throw new Error("Schema validation test failed");
  print("[PASS] Required fields enforced; MongoDB error code: " + schemaError.code);

  const existing = relay.equipmentUnits.findOne({}, { assetTag: 1, equipmentTypeId: 1 });
  if (!existing) throw new Error("No equipment unit available for duplicate test");
  let assetError;
  try {
    relay.equipmentUnits.insertOne({
      equipmentTypeId: existing.equipmentTypeId,
      assetTag: existing.assetTag,
      condition: "good",
      serviceStatus: "active",
      createdAt: now,
      updatedAt: now
    });
  } catch (error) {
    assetError = error;
  }
  if (assetError?.code !== 11000) throw new Error("Duplicate asset tag test failed");
  print("[PASS] Duplicate asset tag " + existing.assetTag + " rejected; MongoDB error code: " + assetError.code);

  const request = relay.borrowRequests.findOne({ status: "returned" });
  const unit = relay.equipmentUnits.findOne({ serviceStatus: "active", activeCheckoutRequestId: null });
  if (!request || !unit) throw new Error("Missing test request or equipment unit");
  const day = new Date("2026-12-15T00:00:00.000Z");
  const reservation = {
    requestId: request._id,
    equipmentUnitId: unit._id,
    reservedDays: [day],
    status: "active",
    createdAt: now,
    updatedAt: now
  };
  let reservationId = null;
  try {
    reservationId = relay.reservations.insertOne(reservation).insertedId;
    let conflictError;
    try {
      relay.reservations.insertOne({ ...reservation, _id: new ObjectId() });
    } catch (error) {
      conflictError = error;
    }
    if (conflictError?.code !== 11000) throw new Error("Overlapping reservation test failed");
    print("[PASS] Overlapping reservation rejected");
    show({ equipmentAssetTag: unit.assetTag, reservedDay: day, errorCode: conflictError.code });
  } finally {
    if (reservationId) {
      const cleaned = relay.reservations.deleteOne({ _id: reservationId });
      if (cleaned.deletedCount !== 1) throw new Error("Reservation test cleanup failed");
    }
  }
  print("[CLEANUP] Temporary reservation deleted");
} finally {
  if (createdId) {
    const deleted = relay.equipmentTypes.deleteOne({ _id: createdId });
    print("\n[DELETE] Temporary equipment type");
    show({ deletedCount: deleted.deletedCount });
    if (deleted.deletedCount !== 1) throw new Error("CRUD test cleanup failed");
  }
}

heading("FINAL CHECK");
for (const [name, count] of Object.entries(expected)) {
  if (relay.getCollection(name).countDocuments({}) !== count) {
    throw new Error("Test left unexpected documents in " + name);
  }
}
print("[PASS] All checks completed. Original record counts preserved.");

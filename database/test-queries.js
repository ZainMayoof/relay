const relay = db.getSiblingDB("relay");
const expected = {
  users: 15,
  equipmentTypes: 42,
  equipmentUnits: 154,
  borrowRequests: 15,
  reservations: 20,
  auditEvents: 46
};

for (const [name, count] of Object.entries(expected)) {
  const actual = relay.getCollection(name).countDocuments({});
  print(name + ": " + actual + " / " + count);
  if (actual < count) throw new Error("Missing records: " + name);
}

const types = new Set(relay.equipmentTypes.find({}, { _id: 1 }).toArray().map(d => String(d._id)));
const units = new Set(relay.equipmentUnits.find({}, { _id: 1 }).toArray().map(d => String(d._id)));
const users = new Set(relay.users.find({}, { _id: 1 }).toArray().map(d => String(d._id)));
const requests = new Set(relay.borrowRequests.find({}, { _id: 1 }).toArray().map(d => String(d._id)));

for (const unit of relay.equipmentUnits.find()) {
  if (!types.has(String(unit.equipmentTypeId))) throw new Error("Invalid equipment type");
}
for (const request of relay.borrowRequests.find()) {
  if (!users.has(String(request.borrowerId))) throw new Error("Invalid borrower");
  if (request.endDate < request.startDate) throw new Error("Invalid date range");
  for (const item of request.items) {
    if (!types.has(String(item.equipmentTypeId))) throw new Error("Invalid requested type");
  }
}
for (const reservation of relay.reservations.find()) {
  if (!requests.has(String(reservation.requestId)) || !units.has(String(reservation.equipmentUnitId))) {
    throw new Error("Invalid reservation reference");
  }
}
for (const event of relay.auditEvents.find()) {
  if (!users.has(String(event.actorId))) throw new Error("Invalid audit actor");
}

print("References and borrowing dates verified.");

const marker = "RELAY-CRUD-TEST";
const now = new Date();
const draft = {
  name: marker, category: "Test", isActive: false,
  createdAt: now, updatedAt: now
};
try {
  relay.equipmentTypes.deleteMany({ name: marker });
  const created = relay.equipmentTypes.insertOne(draft);
  const found = relay.equipmentTypes.findOne({ _id: created.insertedId });
  if (!found) throw new Error("Create/read failed");
  relay.equipmentTypes.updateOne({ _id: created.insertedId }, { $set: { description: "Updated" } });
  if (relay.equipmentTypes.findOne({ _id: created.insertedId }).description !== "Updated") {
    throw new Error("Update failed");
  }
  print("Create/read/update verified.");

  let invalidRejected = false;
  try {
    relay.equipmentTypes.insertOne({ name: "INVALID-SCHEMA-TEST" });
  } catch (error) {
    invalidRejected = error.code === 121;
  }
  if (!invalidRejected) throw new Error("Schema validation test failed");
  print("Schema validation verified.");

  const existing = relay.equipmentUnits.findOne({}, { assetTag: 1, equipmentTypeId: 1 });
  let duplicateRejected = false;
  try {
    relay.equipmentUnits.insertOne({
      equipmentTypeId: existing.equipmentTypeId, assetTag: existing.assetTag,
      condition: "good", serviceStatus: "active",
      createdAt: now, updatedAt: now
    });
  } catch (error) {
    duplicateRejected = error.code === 11000;
  }
  if (!duplicateRejected) throw new Error("Duplicate asset test failed");
  print("Unique asset tag verified.");

  const request = relay.borrowRequests.findOne({ status: "returned" });
  const unit = relay.equipmentUnits.findOne({ serviceStatus: "active", activeCheckoutRequestId: null });
  const day = new Date("2026-12-15T00:00:00.000Z");
  const reservation = {
    requestId: request._id, equipmentUnitId: unit._id,
    reservedDays: [day], status: "active",
    createdAt: now, updatedAt: now
  };
  let firstId;
  try {
    firstId = relay.reservations.insertOne(reservation).insertedId;
    let conflictRejected = false;
    try {
      relay.reservations.insertOne({ ...reservation, _id: new ObjectId() });
    } catch (error) {
      conflictRejected = error.code === 11000;
    }
    if (!conflictRejected) throw new Error("Overlapping reservation test failed");
    print("Overlapping active reservation rejected.");
  } finally {
    if (firstId) relay.reservations.deleteOne({ _id: firstId });
  }
} finally {
  relay.equipmentTypes.deleteMany({ name: marker });
}
print("CRUD test record deleted. Tests complete.");

const relay = db.getSiblingDB("relay");

const date = { bsonType: "date" };
const oid = { bsonType: "objectId" };
const str = { bsonType: "string" };

const schemas = {
  users: {
    required: ["name", "emailNormalized", "passwordHash", "role", "isActive", "createdAt", "updatedAt"],
    properties: {
      _id: oid, name: { bsonType: "string", minLength: 1 },
      emailNormalized: str, passwordHash: str,
      role: { enum: ["borrower", "staff", "admin"] },
      isActive: { bsonType: "bool" }, createdAt: date, updatedAt: date
    }
  },
  equipmentTypes: {
    required: ["name", "category", "isActive", "createdAt", "updatedAt"],
    properties: {
      _id: oid, name: { bsonType: "string", minLength: 1 },
      category: { bsonType: "string", minLength: 1 },
      description: str, specifications: { bsonType: "object" },
      isActive: { bsonType: "bool" }, createdAt: date, updatedAt: date
    }
  },
  equipmentUnits: {
    required: ["equipmentTypeId", "assetTag", "condition", "serviceStatus", "createdAt", "updatedAt"],
    properties: {
      _id: oid, equipmentTypeId: oid,
      assetTag: { bsonType: "string", minLength: 1 }, serialNumber: str,
      condition: { enum: ["good", "fair", "damaged"] },
      serviceStatus: { enum: ["active", "maintenance", "retired"] },
      location: str, activeCheckoutRequestId: { bsonType: ["objectId", "null"] },
      createdAt: date, updatedAt: date
    }
  },
  borrowRequests: {
    required: ["borrowerId", "items", "startDate", "endDate", "status", "requestedAt", "updatedAt"],
    properties: {
      _id: oid, borrowerId: oid,
      items: {
        bsonType: "array", minItems: 1,
        items: {
          bsonType: "object", required: ["equipmentTypeId", "quantity"],
          properties: { equipmentTypeId: oid, quantity: { bsonType: "int", minimum: 1 } }
        }
      },
      startDate: date, endDate: date,
      status: { enum: ["pending", "approved", "rejected", "checked_out", "returned", "cancelled"] },
      requestedAt: date, reviewedBy: oid, reviewedAt: date,
      checkedOutAt: date, checkedOutBy: oid,
      returnedAt: date, returnedTo: oid, returnNotes: str, updatedAt: date
    }
  },
  reservations: {
    required: ["requestId", "equipmentUnitId", "reservedDays", "status", "createdAt", "updatedAt"],
    properties: {
      _id: oid, requestId: oid, equipmentUnitId: oid,
      reservedDays: { bsonType: "array", minItems: 1, uniqueItems: true, items: date },
      status: { enum: ["active", "completed", "released"] },
      createdAt: date, updatedAt: date
    }
  },
  auditEvents: {
    required: ["actorId", "action", "entityType", "entityId", "occurredAt"],
    properties: {
      _id: oid, actorId: oid, action: { bsonType: "string", minLength: 1 },
      entityType: { enum: ["users", "equipmentTypes", "equipmentUnits", "borrowRequests", "reservations"] },
      entityId: oid, occurredAt: date, details: { bsonType: "object" }
    }
  }
};

for (const [name, schema] of Object.entries(schemas)) {
  if (!relay.getCollectionNames().includes(name)) relay.createCollection(name);
  const result = relay.runCommand({
    collMod: name,
    validator: { $jsonSchema: { bsonType: "object", ...schema } },
    validationLevel: "strict",
    validationAction: "error"
  });
  if (result.ok !== 1) throw new Error("Schema failed: " + name);
}

relay.users.createIndex({ emailNormalized: 1 }, { unique: true });
relay.equipmentTypes.createIndex({ category: 1, name: 1 });
relay.equipmentUnits.createIndex({ assetTag: 1 }, { unique: true });
relay.equipmentUnits.createIndex({ equipmentTypeId: 1, serviceStatus: 1 });
relay.borrowRequests.createIndex({ borrowerId: 1, status: 1 });
relay.borrowRequests.createIndex({ status: 1, startDate: 1 });
relay.reservations.createIndex(
  { equipmentUnitId: 1, reservedDays: 1 },
  { unique: true, partialFilterExpression: { status: "active" } }
);
relay.reservations.createIndex({ requestId: 1 });
relay.auditEvents.createIndex({ entityType: 1, entityId: 1, occurredAt: -1 });
relay.auditEvents.createIndex({ actorId: 1, occurredAt: -1 });

print("Configured " + Object.keys(schemas).length + " collections.");

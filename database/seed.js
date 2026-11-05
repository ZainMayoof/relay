const relay = db.getSiblingDB("relay");
const catalog = [
  {
    "name": "Arduino Uno R3",
    "category": "Microcontrollers & Development Boards",
    "quantity": 4,
    "prefix": "UNO"
  },
  {
    "name": "Arduino Mega 2560",
    "category": "Microcontrollers & Development Boards",
    "quantity": 2,
    "prefix": "MEGA"
  },
  {
    "name": "Arduino Nano",
    "category": "Microcontrollers & Development Boards",
    "quantity": 2,
    "prefix": "NANO"
  },
  {
    "name": "ESP32 DevKit",
    "category": "Microcontrollers & Development Boards",
    "quantity": 5,
    "prefix": "ESP"
  },
  {
    "name": "Raspberry Pi Pico",
    "category": "Microcontrollers & Development Boards",
    "quantity": 1,
    "prefix": "PICO"
  },
  {
    "name": "Raspberry Pi 4",
    "category": "Microcontrollers & Development Boards",
    "quantity": 2,
    "prefix": "RPI"
  },
  {
    "name": "HC-SR04 Ultrasonic Sensor",
    "category": "Sensors",
    "quantity": 4,
    "prefix": "US"
  },
  {
    "name": "DHT22 Temperature & Humidity Sensor",
    "category": "Sensors",
    "quantity": 3,
    "prefix": "DHT"
  },
  {
    "name": "BMP280 Pressure Sensor",
    "category": "Sensors",
    "quantity": 2,
    "prefix": "BMP"
  },
  {
    "name": "HC-SR501 Motion Sensor",
    "category": "Sensors",
    "quantity": 3,
    "prefix": "PIR"
  },
  {
    "name": "MPU6050 Accelerometer/Gyroscope",
    "category": "Sensors",
    "quantity": 2,
    "prefix": "MPU"
  },
  {
    "name": "ESP32-CAM Module",
    "category": "Cameras & Imaging",
    "quantity": 3,
    "prefix": "CAM"
  },
  {
    "name": "Raspberry Pi Camera Module",
    "category": "Cameras & Imaging",
    "quantity": 2,
    "prefix": "RPICAM"
  },
  {
    "name": "SG90 Servo Motor",
    "category": "Motors & Actuators",
    "quantity": 4,
    "prefix": "SERVO"
  },
  {
    "name": "DC Motor",
    "category": "Motors & Actuators",
    "quantity": 4,
    "prefix": "DCM"
  },
  {
    "name": "28BYJ-48 Stepper Motor",
    "category": "Motors & Actuators",
    "quantity": 2,
    "prefix": "STEP"
  },
  {
    "name": "L298N Motor Driver",
    "category": "Motor Drivers",
    "quantity": 3,
    "prefix": "L298N"
  },
  {
    "name": "ULN2003 Stepper Motor Driver",
    "category": "Motor Drivers",
    "quantity": 2,
    "prefix": "ULN"
  },
  {
    "name": "TB6612FNG Motor Driver",
    "category": "Motor Drivers",
    "quantity": 2,
    "prefix": "TB"
  },
  {
    "name": "5V Relay Module",
    "category": "Switching & Control",
    "quantity": 3,
    "prefix": "RLY"
  },
  {
    "name": "16×2 I2C LCD Display",
    "category": "Displays",
    "quantity": 3,
    "prefix": "LCD"
  },
  {
    "name": "0.96-inch OLED Display",
    "category": "Displays",
    "quantity": 2,
    "prefix": "OLED"
  },
  {
    "name": "RFID RC522 Module",
    "category": "Communication & Identification",
    "quantity": 2,
    "prefix": "RFID"
  },
  {
    "name": "Bluetooth HC-05 Module",
    "category": "Communication & Identification",
    "quantity": 2,
    "prefix": "BT"
  },
  {
    "name": "LoRa SX1278 Module",
    "category": "Communication & Identification",
    "quantity": 2,
    "prefix": "LORA"
  },
  {
    "name": "4×4 Matrix Keypad",
    "category": "Buttons & Input",
    "quantity": 2,
    "prefix": "KEY"
  },
  {
    "name": "Push Button Kit",
    "category": "Buttons & Input",
    "quantity": 5,
    "prefix": "BTN"
  },
  {
    "name": "LED Kit",
    "category": "LEDs & Indicators",
    "quantity": 5,
    "prefix": "LED"
  },
  {
    "name": "RGB LED Module",
    "category": "LEDs & Indicators",
    "quantity": 3,
    "prefix": "RGB"
  },
  {
    "name": "830-Point Breadboard",
    "category": "Breadboards & Prototyping",
    "quantity": 10,
    "prefix": "BRD"
  },
  {
    "name": "Mini Breadboard",
    "category": "Breadboards & Prototyping",
    "quantity": 5,
    "prefix": "MINI"
  },
  {
    "name": "Jumper Wire Pack — Mixed",
    "category": "Jumper Wires & Cables",
    "quantity": 10,
    "prefix": "JUMP"
  },
  {
    "name": "Jumper Wire Pack — Male-Male (M-M)",
    "category": "Jumper Wires & Cables",
    "quantity": 5,
    "prefix": "JUMP-MM"
  },
  {
    "name": "Jumper Wire Pack — Female-Female (F-F)",
    "category": "Jumper Wires & Cables",
    "quantity": 5,
    "prefix": "JUMP-FF"
  },
  {
    "name": "Jumper Wire Pack — Male-Female (M-F)",
    "category": "Jumper Wires & Cables",
    "quantity": 5,
    "prefix": "JUMP-MF"
  },
  {
    "name": "USB A-to-B Cable",
    "category": "Jumper Wires & Cables",
    "quantity": 10,
    "prefix": "USB"
  },
  {
    "name": "Resistor Kit",
    "category": "Passive Electronic Components",
    "quantity": 5,
    "prefix": "RES"
  },
  {
    "name": "9V Battery Holder",
    "category": "Power & Battery Accessories",
    "quantity": 5,
    "prefix": "BATT"
  },
  {
    "name": "MB102 Breadboard Power Supply",
    "category": "Power & Battery Accessories",
    "quantity": 4,
    "prefix": "MB102"
  },
  {
    "name": "5V DC Power Adapter",
    "category": "Power & Battery Accessories",
    "quantity": 4,
    "prefix": "PWR"
  },
  {
    "name": "LM2596 DC-DC Buck Converter",
    "category": "Power & Battery Accessories",
    "quantity": 3,
    "prefix": "BUCK"
  },
  {
    "name": "USB Power Bank",
    "category": "Power & Battery Accessories",
    "quantity": 2,
    "prefix": "BANK"
  }
];
const id = (prefix, n) => ObjectId(prefix + n.toString(16).padStart(23, "0"));
const at = (day) => new Date(day + "T00:00:00.000Z");
const stamp = at("2026-09-01");
const insert = (collection, documents) => {
  for (const document of documents) {
    relay.getCollection(collection).updateOne(
      { _id: document._id }, { $setOnInsert: document }, { upsert: true }
    );
  }
};

const types = catalog.map((item, i) => ({
  _id: id("2", i + 1),
  name: item.name,
  category: item.category,
  description: item.name,
  specifications: {},
  isActive: true,
  createdAt: stamp,
  updatedAt: stamp
}));
insert("equipmentTypes", types);
const byName = Object.fromEntries(types.map(t => [t.name, t._id]));
const byPrefix = Object.fromEntries(catalog.map(c => [c.prefix, byName[c.name]]));
const units = catalog.flatMap(item =>
  Array.from({ length: item.quantity }, (_, i) => {
    const tag = item.prefix + "-" + String(i + 1).padStart(3, "0");
    const retired = ["UNO-004", "DCM-004", "BRD-010"].includes(tag);
    const maintenance = tag === "ESP-005";
    return {
      _id: id("3", unitsIndex(tag)),
      equipmentTypeId: byName[item.name],
      assetTag: tag,
      condition: retired ? "damaged" : maintenance ? "fair" : "good",
      serviceStatus: retired ? "retired" : maintenance ? "maintenance" : "active",
      location: "DLab - " + item.category,
      activeCheckoutRequestId: null,
      createdAt: stamp,
      updatedAt: stamp
    };
  })
);
function unitsIndex(tag) {
  let next = 1;
  for (const item of catalog) {
    for (let n = 1; n <= item.quantity; n++, next++) {
      if (item.prefix + "-" + String(n).padStart(3, "0") === tag) return next;
    }
  }
  throw new Error("Unknown asset tag: " + tag);
}
insert("equipmentUnits", units);
const unitId = Object.fromEntries(units.map(u => [u.assetTag, u._id]));

const roles = [
  ...Array.from({ length: 12 }, (_, i) => "borrower"),
  "staff", "staff", "admin"
];
const users = roles.map((role, i) => ({
  _id: id("1", i + 1),
  name: "Test " + (role === "borrower" ? "Student" : role === "staff" ? "Staff" : "Admin") + " " + (i + 1),
  emailNormalized: "relay.test" + (i + 1) + "@example.com",
  passwordHash: "TEST_ONLY_NO_LOGIN",
  role,
  isActive: true,
  createdAt: stamp,
  updatedAt: stamp
}));
insert("users", users);

const specs = [
  ["pending", "2026-11-12", "2026-11-15", [["UNO",1],["US",1]]],
  ["pending", "2026-11-16", "2026-11-19", [["ESP",1],["DHT",1]]],
  ["pending", "2026-11-20", "2026-11-22", [["RPI",1],["USB",1]]],
  ["pending", "2026-11-23", "2026-11-25", [["SERVO",2],["L298N",1]]],
  ["returned", "2026-10-01", "2026-10-03", [["UNO",1],["US",1],["SERVO",1]]],
  ["returned", "2026-10-04", "2026-10-06", [["ESP",1],["DHT",1]]],
  ["returned", "2026-10-07", "2026-10-09", [["RPI",1],["OLED",1]]],
  ["returned", "2026-10-10", "2026-10-12", [["RLY",1],["LCD",1]]],
  ["returned", "2026-10-13", "2026-10-15", [["UNO",1],["BRD",1],["JUMP",1]]],
  ["returned", "2026-10-16", "2026-10-18", [["ESP",1],["BMP",1],["USB",1]]],
  ["returned", "2026-10-19", "2026-10-21", [["PICO",1],["LCD",1],["USB",1]]],
  ["returned", "2026-10-22", "2026-10-24", [["DCM",1],["L298N",1]]],
  ["rejected", "2026-11-08", "2026-11-10", [["RPI",2],["LORA",2]]],
  ["rejected", "2026-11-09", "2026-11-11", [["UNO",5]]],
  ["cancelled", "2026-11-14", "2026-11-16", [["MINI",1],["LED",1]]]
];
const reviewed = at("2026-10-25");
const requests = specs.map(([status, start, end, items], i) => {
  const borrower = users[i % 12]._id;
  const historical = status === "returned";
  const request = {
    _id: id("4", i + 1),
    borrowerId: borrower,
    items: items.map(([prefix, quantity]) => ({ equipmentTypeId: byPrefix[prefix], quantity: NumberInt(quantity) })),
    startDate: at(start),
    endDate: at(end),
    status,
    requestedAt: historical ? at("2026-09-29") : at("2026-11-01"),
    updatedAt: historical ? at(end) : at("2026-11-01")
  };
  if (historical || status === "rejected") {
    request.reviewedBy = users[12]._id;
    request.reviewedAt = historical ? at(start) : reviewed;
  }
  if (historical) {
    request.checkedOutBy = users[13]._id;
    request.checkedOutAt = at(start);
    request.returnedTo = users[12]._id;
    request.returnedAt = at(end);
    request.returnNotes = "Returned in good condition";
  }
  return request;
});
insert("borrowRequests", requests);

const allocated = [
  ["UNO-001","US-001","SERVO-001"],
  ["ESP-001","DHT-001"],
  ["RPI-001","OLED-001"],
  ["RLY-001","LCD-001"],
  ["UNO-002","BRD-001","JUMP-001"],
  ["ESP-002","BMP-001","USB-001"],
  ["PICO-001","LCD-002","USB-002"],
  ["DCM-001","L298N-001"]
];
const days = (start, end) => {
  const result = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) result.push(new Date(t));
  return result;
};
const reservations = allocated.flatMap((tags, i) =>
  tags.map(tag => ({
    _id: id("5", allocated.slice(0, i).reduce((a, row) => a + row.length, 0) + tags.indexOf(tag) + 1),
    requestId: requests[i + 4]._id,
    equipmentUnitId: unitId[tag],
    reservedDays: days(requests[i + 4].startDate, requests[i + 4].endDate),
    status: "completed",
    createdAt: requests[i + 4].startDate,
    updatedAt: requests[i + 4].endDate
  }))
);
insert("reservations", reservations);

const events = [];
const addEvent = (actorId, action, entityType, entityId, occurredAt) => {
  events.push({
    _id: id("6", events.length + 1), actorId, action, entityType, entityId,
    occurredAt, details: { sample: true }
  });
};
requests.forEach(r => addEvent(r.borrowerId, "request_submitted", "borrowRequests", r._id, r.requestedAt));
requests.slice(4, 12).forEach(r => {
  addEvent(users[12]._id, "request_approved", "borrowRequests", r._id, r.startDate);
  addEvent(users[13]._id, "equipment_checked_out", "borrowRequests", r._id, r.startDate);
  addEvent(users[12]._id, "equipment_returned", "borrowRequests", r._id, r.endDate);
});
requests.slice(12, 14).forEach(r => addEvent(users[12]._id, "request_rejected", "borrowRequests", r._id, reviewed));
addEvent(requests[14].borrowerId, "request_cancelled", "borrowRequests", requests[14]._id, at("2026-11-02"));
["ESP-005","UNO-004","DCM-004","BRD-010"].forEach(tag =>
  addEvent(users[14]._id, "equipment_updated", "equipmentUnits", unitId[tag], at("2026-10-26"))
);
insert("auditEvents", events);

const expected = { users: 15, equipmentTypes: 42, equipmentUnits: 154, borrowRequests: 15, reservations: 20, auditEvents: 46 };
for (const [collection, n] of Object.entries(expected)) {
  const count = relay.getCollection(collection).countDocuments({});
  print(collection + ": " + count + " (expected at least " + n + ")");
}
print("Seed complete. Test-only password placeholders cannot be used to log in.");

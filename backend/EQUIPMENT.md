# Phase 2B equipment APIs

Production equipment routes return 401 until authentication, RBAC integration and actor-linked auditing are completed. The production app supplies no identity provider. Only automated tests construct the router with trusted identities. No request header, role parameter, environment flag or Atlas bypass enables these routes.

## Contract

| Method | Route | Permission |
| --- | --- | --- |
| GET | /api/equipment-types | Borrower, staff, admin |
| GET | /api/equipment-types/:id/availability | Borrower, staff, admin |
| POST | /api/equipment-types | Staff, admin |
| PATCH | /api/equipment-types/:id | Staff, admin |
| GET | /api/equipment-units | Staff, admin |
| POST | /api/equipment-units | Staff, admin |
| PATCH | /api/equipment-units/:id | Staff, admin |
| DELETE | /api/equipment-units/:id | Admin |

Type creation requires name/category; description/specifications/isActive are optional. isActive defaults to true. PATCH accepts the same fields, with at least one required. Specifications are replaced as an object.

Unit creation requires equipmentTypeId/assetTag/condition/serviceStatus; serialNumber/location are optional. The type must exist, but may be inactive. Unit PATCH accepts condition/serviceStatus/serialNumber/location only. IDs, asset tags, type references, timestamps and checkout references are protected. The server initializes activeCheckoutRequestId to null.

Type listing supports category/isActive; defaults to active only. Borrowers cannot request inactive types. Unit listing supports equipmentTypeId/assetTag/condition/serviceStatus. Both accept limit (1-100, default 25) and offset (nonnegative integer, default 0), sort by _id, and return {items, limit, offset}. Unknown and repeated parameters are rejected.

Successful POST returns 201 and the document, PATCH returns 200 and the document, DELETE returns 204. IDs serialize as strings and timestamps as ISO dates. Errors use {error: {code, message}} with 400 for invalid inputs, 404 for missing targets/references, 409 for duplicates/conflicts, 401/403 for authorization, 413/415 for body size/media type, 503 for recognized connection failures and 500 for unexpected errors. Raw driver errors are never returned.

## Availability

Required query: startDate and endDate, real YYYY-MM-DD dates, inclusive UTC calendar days. Response includes equipmentTypeId/startDate/endDate/availableCount/advisory:true. No reservation is created or guaranteed.

Inactive types return zero. Maintenance, retired and damaged units are excluded. Any conflicting active reservation excludes the unit for the entire interval. Completed/released reservations do not block. The query uses $elemMatch for a single date within both range bounds.

A current checkout blocks through its inclusive scheduled return day. Future intervals after that day may count the unit, subject to actual return. Overdue, missing or inconsistent outstanding checkout records remain unavailable. Missing/null checkout references are treated as unassigned. Current checkout records must have checked_out status, valid ordered UTC dates, a nonfuture checkout timestamp, no returnedAt and a matching requested type. Availability is advisory and must be rechecked during Phase 3 approval.

## Integrity and limits

Active reservations or current checkouts block maintenance/retirement/damage changes and parent type deactivation with 409. DELETE is blocked by any reservation, current checkout or audit-history reference. No dependent records are removed.

Cross-collection reference checks are not a concurrency guarantee. Another writer could create a reference or allocation between a check and mutation. Before approval and inventory operations can run together, Phase 3 must coordinate both with a tested conflicting-write strategy inside transactions. A read-only transaction check is insufficient. No such guarantee or borrowing workflow is implemented here.

Inventory audit writes are deferred. Production access must remain locked until real actor-linked auditing and authentication are integrated. This phase adds no schemas, indexes, seed changes, user administration or authentication.

## Tests

Run from backend:

- npm ci
- npm test
- npm run test:equipment

The integration suite starts its own MongoDB 7.0.24 single-node replica set through mongodb-memory-server. It verifies the generated data directory, loopback binding, writable primary and empty database before executing the unchanged setup.js through mongosh. It checks the original script hash after normalizing Git checkout line endings. It never reads .env or accepts an Atlas URI. It stops and cleans its own instance afterward.

Prerequisites: Node.js 22.14+, mongosh on PATH, and network access for the first MongoDB binary download. MONGOMS_DOWNLOAD_DIR can point to the Phase 2A binary cache to avoid downloading again. Real database fixtures are test-only and preserve the original schemas.

Verified on 2026-11-20, Node.js 22.14.0, MongoDB 7.0.24:
- npm test: 9 passed, 0 failed, 0 skipped. Includes the seven unchanged Phase 1 tests and two production-denial/error-sanitization tests. Database behavior here is simulated.
- npm run test:equipment: 10 scenario groups passed against real MongoDB (Node reports 11 passes including the parent test), 0 failed, 0 skipped.
- Real scenarios cover all eight routes, trusted test-role permissions, strict validation, references, duplicate inserts, deletion/update conflicts, inclusive/whole-interval availability, lifecycle filtering and checkout rules. Regression coverage includes 243 borrower filter combinations, zero-unit type deactivation, and future counts for overdue, missing, mismatched-type, invalid-date, future-timestamp and returned checkout records.

No Atlas, real login/session, inventory audit, failover or concurrent borrowing approval tests were run. Competing asset-tag insertion was tested; cross-collection races remain Phase 3 work.

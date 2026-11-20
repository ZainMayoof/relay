# Completed backend

All 24 approved API routes are integrated through cookie authentication. Start with APP_ORIGIN set to the exact HTTPS browser origin, such as https://relay.example.test. Use HTTPS at the deployment proxy. Mutations require an exact matching Origin header, including login and logout. Cookies use Secure, HttpOnly, SameSite=Strict, and the __Host- prefix. No client role header grants access.

Sessions contain random opaque tokens, with only token hashes held in server memory. They expire after one hour and are revoked on logout and account role/status updates. Account status and role are loaded from MongoDB on each request. Sessions are local to one process, disappear on restart, and do not support multiple server instances. Login throttling and distributed session storage are not implemented; deployment hardening remains necessary before public exposure.

Passwords use Argon2id. New passwords require at least 12 characters and at most 1024 bytes. Seed placeholder hashes never authenticate.

## First administrator

Run database setup only when provisioning an intended database. The bootstrap CLI never runs automatically. From backend, pipe a JSON object containing name, email and password through standard input to npm run bootstrap:admin. Supply it using a secure local secret source, not command-line arguments or a committed file. The CLI reads backend/.env and refuses any existing administrator or duplicate email. It never overwrites an account. A seeded administrator with TEST_ONLY_NO_LOGIN blocks bootstrap and requires a separately approved account recovery decision.

After login, an administrator creates staff and borrower accounts through POST /api/users with name, email, password and role. isActive is optional and defaults to true. No public registration exists.

## Routes

| Method | Path | Permission |
| --- | --- | --- |
| POST | /api/auth/login | Public |
| POST | /api/auth/logout | Authenticated |
| GET | /api/auth/me | Authenticated |
| GET | /api/equipment-types | All roles |
| GET | /api/equipment-types/:id/availability | All roles |
| POST | /api/equipment-types | Staff/admin |
| PATCH | /api/equipment-types/:id | Staff/admin |
| GET | /api/equipment-units | Staff/admin |
| POST | /api/equipment-units | Staff/admin |
| PATCH | /api/equipment-units/:id | Staff/admin |
| DELETE | /api/equipment-units/:id | Admin |
| POST | /api/requests | Borrower |
| GET | /api/requests/mine | Borrower |
| PATCH | /api/requests/:id/cancel | Owning borrower, pending only |
| GET | /api/requests | Staff/admin |
| POST | /api/requests/:id/approve | Staff/admin |
| POST | /api/requests/:id/reject | Staff/admin |
| POST | /api/requests/:id/checkout | Staff/admin |
| POST | /api/requests/:id/return | Staff/admin |
| GET | /api/users | Admin |
| POST | /api/users | Admin |
| PATCH | /api/users/:id/role | Admin |
| PATCH | /api/users/:id/status | Admin |
| GET | /api/audit-events | Admin |

Requests accept items containing equipmentTypeId and positive BSON integer quantity, startDate and endDate as inclusive UTC YYYY-MM-DD dates. Duplicate types are rejected. Cancel, approve, reject and checkout accept no body. Return accepts an object with optional returnNotes and units containing equipmentUnitId/condition. Role updates accept role; status updates accept isActive. List routes accept limit/offset; request lists also accept status, and audits accept actorId/entityType/entityId. Unknown fields are rejected. Successful creation returns 201, reads/updates 200, logout/deletion 204. Validation uses 400, authentication 401, permission 403, missing records 404, conflicts 409, oversized bodies 413 and wrong media type 415.

## Integrity

Inventory, borrowing and account mutations write actor-linked audits in the same transaction. Approvals lock equipment types and selected physical units by changing updatedAt, then insert reservations. Inventory mutations use the same unit writes. MongoDB retries snapshot write conflicts and reruns candidate selection. Operations within a transaction are sequential. The existing partial unique reservation index also rejects overlapping active calendar days, as verified independently against real MongoDB.

Approval is all-or-nothing. Checkout requires complete allocations and dates within the reserved interval. Return clears checkout references, completes reservations, records conditions/notes and preserves history. Availability remains advisory. Since creation itself now adds audit history, API-created units cannot subsequently be deleted under the approved history restriction. Retire them instead.

The original schemas, indexes, setup, seed and query scripts remain unchanged. No extra collections were added. Direct database writers must follow the same coordination protocol; these guarantees cover application workflows, not arbitrary external writes.

## Actual verification

On the final integrated run, node --test backend/test/*.test.js reported 37 passed, zero failed and zero skipped. This includes parent test counts. The real MongoDB suites contain 24 scenario groups plus four parents; nine other tests use controlled database behavior. MongoDB 7.0.24 runs in owned temporary directories on loopback and is cleaned up after testing. Setup uses the original script with a verified hash. Atlas was not used.

Coverage includes all 24 HTTP routes, cookie flags, login/logout/expiry, placeholder rejection, active status, role and ownership boundaries, invalid transitions, simultaneous conflicting approvals, maintenance/deletion/deactivation races, partial allocation rollback, audit failure rollback, reservation index enforcement and existing equipment regressions. The expiry test injects a clock; HTTP tests transport cookies explicitly over local HTTP and do not validate browser HTTPS or proxy configuration. Race tests demonstrate tested interleavings, not a proof of every possible execution.

Run npm test for the original fast suite, npm run test:equipment for equipment regressions, and npm run test:all for all suites. Install mongosh and allow the first MongoDB binary download. MONGOMS_DOWNLOAD_DIR may point to the existing Phase 2A cache. Never substitute an Atlas URI into destructive tests.

Remaining work includes isolated mongodump/mongorestore recovery verification, deployment security testing, login rate limiting, and multi-instance session support. No failover or live Atlas integration test was performed.

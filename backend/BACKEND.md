# Completed backend

All 24 approved API routes are integrated through cookie authentication. Start with APP_ORIGIN set to the exact HTTPS browser origin, such as https://relay.example.test. Use HTTPS at the deployment proxy. Mutations require an exact matching Origin header, including login and logout. Cookies use Secure, HttpOnly, SameSite=Strict, and the __Host- prefix. No client role header grants access.

Sessions contain random opaque tokens, with only token hashes held in server memory. They expire after one hour and are revoked on logout and account role/status updates. Account status and role are loaded from MongoDB on each request. Sessions are local to one process, disappear on restart, and do not support multiple server instances. Login throttling and distributed session storage are not implemented; deployment hardening remains necessary before public exposure.

Passwords use Argon2id. New passwords require at least 12 characters and at most 1024 bytes. Seed placeholder hashes never authenticate.

## First administrator

Run database setup only when provisioning an intended database. The bootstrap CLI never runs automatically. From backend, pipe a JSON object containing name, email and password through standard input to npm run bootstrap:admin. Supply it using a secure local secret source, not command-line arguments or a committed file. The CLI reads backend/.env and refuses an existing non-placeholder administrator, a previous bootstrap audit, or duplicate email. Only the exact TEST_ONLY_NO_LOGIN placeholder is exempt. Inactive and malformed non-placeholder admin hashes still block bootstrap. It never overwrites seeded accounts or their referenced IDs. The reserved first-admin ID and bootstrap audit keep this one-time, even after that account is demoted or removed.

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

## Interactive API documentation

Open `/api-docs` on the running backend for Swagger UI, or `/openapi.json` for the raw OpenAPI 3.0 document. The dedicated specification is `docs/openapi.yaml` (JSON syntax, valid YAML). All 24 operations are documented.

Use the same HTTPS origin configured in APP_ORIGIN for interactive authenticated requests. The browser manages the Secure, HttpOnly session cookie after login. Swagger cannot set that cookie through the Authorize dialog. Local HTTP and cross-origin access may prevent authenticated Try it out requests. Authentication, role checks and Origin protection remain unchanged. Never paste session tokens into Swagger.

## Local HTTPS

Application traffic: browser -> HTTPS Nginx -> HTTP Express on loopback -> MongoDB Atlas. Atlas remains the application database. Nginx only terminates TLS and forwards requests; authentication, RBAC, auditing and transactions stay in Express. No Express trust-proxy setting is needed because cookies are explicitly Secure and Origin is checked directly.

Install Node.js, mongosh, Nginx and mkcert using their official distributions. Both teammates use the same relative paths. From the repository root:

```powershell
mkcert -install
New-Item -ItemType Directory -Force backend/deploy/certs, backend/deploy/logs, backend/deploy/temp/client_body_temp, backend/deploy/temp/proxy_temp, backend/deploy/temp/fastcgi_temp, backend/deploy/temp/uwsgi_temp, backend/deploy/temp/scgi_temp
mkcert -cert-file backend/deploy/certs/localhost.pem -key-file backend/deploy/certs/localhost-key.pem localhost 127.0.0.1 ::1
cd backend
npm ci
Copy-Item .env.example .env
```

Set MONGODB_URI locally to the existing Atlas SRV/TLS connection string. MONGODB_DB is the application database name, normally relay. Keep HOST=127.0.0.1, PORT=3000 and APP_ORIGIN=https://localhost. HOST/PORT bind the internal HTTP API; APP_ORIGIN identifies the browser-facing HTTPS origin. Never commit .env or certificate keys. mkcert installs a local trust root; do not share its private root key.

From backend, run `npm run test:connection` for the read-only Atlas check, then `npm start`. In another terminal at the repository root:

```powershell
$proxyRoot = (Resolve-Path backend/deploy).Path.Replace('\', '/') + '/'
nginx -p $proxyRoot -c nginx.conf -t
nginx -p $proxyRoot -c nginx.conf
```

Nginx must be on PATH. Port 443 must be free; permission to bind it depends on the OS. Stop the proxy with `nginx -p $proxyRoot -c nginx.conf -s quit`. If PORT changes, update proxy_pass too. Do not expose the internal HTTP listener beyond loopback.

Open https://localhost/api-docs and https://localhost/openapi.json. Login through the same HTTPS origin so the browser can use the Secure, HttpOnly cookie. Origin checks stay enabled. No Atlas records need to change to verify the documentation URLs or health endpoint.

### Automated database isolation

mongodb-memory-server is test infrastructure only. It downloads or reuses a local MongoDB binary and creates disposable instances for transaction, rollback, reservation conflict, concurrent approval, inventory race, account-change and destructive CRUD tests. It does not replace Atlas. The first npm install/npm ci or full test run may take longer while a relatively large MongoDB binary downloads. Never point destructive tests at Atlas.

The team subsequently reported successful Windows HTTPS, Nginx syntax, Swagger browser and read-only Atlas verification. These checks were not independently rerun here. This workspace lacked Nginx, mkcert and a configured backend/.env during this change. HTTPS proxy execution and the Atlas checker could not be verified here. The proxy configuration test checks its text, not Nginx runtime behavior. Browser certificate trust and authenticated Swagger still require verification on the configured local setup.

### Initialize the seeded Atlas database

Seeded users remain demonstration records and never authenticate. Bootstrap adds one separate real administrator with an Argon2id hash and an actor-linked audit, without changing seed IDs or history. Normal staff and borrower accounts are then created through POST /api/users. Access to the bootstrap CLI and Atlas write credentials must stay with the project owners; there is no public bootstrap endpoint.

After pulling this branch, configure backend/.env locally with the existing Atlas credentials and APP_ORIGIN=https://localhost. Do not rerun setup or seed. In PowerShell, from backend:

```powershell
$adminName = Read-Host 'Administrator name'
$adminEmail = Read-Host 'Administrator email (use a new email)'
$adminSecret = Read-Host 'Password (at least 12 characters)' -AsSecureString
$adminCredential = [System.Net.NetworkCredential]::new('', $adminSecret)
try {
    @{ name = $adminName; email = $adminEmail; password = $adminCredential.Password } | ConvertTo-Json -Compress | npm run bootstrap:admin
} finally {
    Remove-Variable adminCredential, adminSecret
}
```

Run this explicitly once. Do not put a password directly in shell history or a saved JSON file. The password briefly exists in process memory and stdin for hashing. A failure never replaces a seeded hash or resets an account. The students should retain the real admin credentials securely; bootstrap is not account recovery.

Start Express and Nginx using the local HTTPS instructions. Open https://localhost/api-docs, execute POST /api/auth/login with the new email/password, then execute GET /api/auth/me. The browser manages the HttpOnly cookie; leave cookieAuth Authorize empty. Use POST /api/users as this admin to create staff and borrower accounts. Do not use seeded placeholder credentials. Avoid saving passwords in Swagger examples or screenshots.

The bootstrap changes are tested only against disposable MongoDB. No live Atlas records or references were inspected or changed by this work.

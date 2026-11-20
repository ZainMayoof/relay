# Relay
Hana Wahban and Zain Mayoof — COSC 412

Relay uses MongoDB to manage DLAB equipment, borrowing requests, and reservations.

## Existing database files
- `database/setup.js`: creates the six collections, validation rules, and indexes.
- `database/seed.js`: adds sample data for testing.
- `database/test-queries.js`: tests CRUD, references, validation, and duplicate reservation rejection.

These three files are unchanged by Phase 1. The backend does not run them automatically.

## Progress Report 2 — Section 1.2 (Phase 1 only)
The backend uses Node.js, Express, and the official MongoDB driver. Before listening
for HTTP requests, it connects to the configured database, runs a read-only ping,
and verifies that these existing collections are present:

`users`, `equipmentTypes`, `equipmentUnits`, `borrowRequests`,
`reservations`, and `auditEvents`.

The server shares one MongoClient connection pool, closes it on shutdown, and
returns a generic error if startup fails so connection details are not logged.
It does not change database records, schemas, or indexes.

Only `GET /health` is implemented. CRUD APIs, authentication, role permissions,
transactions, and backups are deferred to later approved phases.

## Setup
1. Install Node.js 22.14 or newer.
2. From the repository root, run:

   ```powershell
   cd backend
   npm ci
   Copy-Item .env.example .env
   ```

3. Edit `backend/.env` locally. Set `MONGODB_URI` to the Node.js driver
   connection string from the existing MongoDB Atlas cluster and keep
   `MONGODB_DB=relay` (or the actual database name).
   Use a MongoDB database user with permission to list collections in that
   database, and allow your computer's IP address in Atlas Network Access.
   URL-encode special characters in credentials. The existing .gitignore excludes
   .env. Do not paste passwords in chat or commit them.
4. Check the live connection:

   ```powershell
   npm run test:connection
   ```

   A successful run prints:
   `PASS: connected to MongoDB, ping succeeded, and all six Relay collections exist.`
   A failed run exits with code 1. A failure is not a connection pass.
5. Start the backend:

   ```powershell
   npm start
   ```

   Open [the health endpoint](http://127.0.0.1:3000/health).
   A successful database ping returns HTTP 200:
   `{"status":"ok","database":"connected"}`.
   A failed runtime ping returns HTTP 503:
   `{"status":"unavailable","database":"disconnected"}`.

If setup reports missing collections, confirm the selected database before
taking any action. Do not rerun seed or setup against an existing database just
to resolve a connection error. The health endpoint checks reachability; it does
not validate existing records, indexes, or validators.

## Tests and verified status
Run `npm test` inside backend for the configuration and HTTP behavior tests.
These use a controlled database substitute and do not connect to Atlas.

On 2026-11-19, all **7 automated tests passed** on Node.js 22.14.0.
The live connection check was invoked without configured credentials and correctly
failed. **A successful connection to the existing Atlas database has not yet been
verified**, because its connection string is not configured in this workspace.

See [Phase 1 test notes](backend/TESTING.md) for details and the remaining manual checks.

References: [MongoDB Atlas connection requirements](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/),
[MongoDB Node.js driver](https://www.mongodb.com/docs/drivers/node/current/get-started/).

## Phase 2B equipment implementation

The eight equipment routes are implemented and tested against isolated MongoDB. Production access remains denied until authentication and actor-linked auditing are integrated. See [equipment API contract and test results](backend/EQUIPMENT.md).

# Section 1.2 — Test evidence

Scope: basic Express startup and read-only MongoDB connection integration only.

## Automated checks completed
Command: `npm test` in backend.

Date: 2026-11-19. Runtime: Node.js 22.14.0 on Windows.
Result: **7 passed, 0 failed, 0 skipped** on the final run.

1. Missing/invalid MongoDB URI and invalid database name are rejected; relay is the default database.
2. Database verification sends ping and checks the six original collection names.
3. A missing collection causes verification to fail.
4. A failed ping stops verification.
5. A real local HTTP request receives 200 when the supplied database ping succeeds.
6. A real local HTTP request receives 503 when the supplied database ping fails; credentials from the error are not exposed.
7. The unimplemented `/api/users` route returns 404.

Database operations in these tests are substituted with controlled functions.
These tests verify application behavior, not Atlas connectivity. The initial
restricted execution could not reach the local HTTP test server; the complete
suite passed when local HTTP access was available.

## Live database check
Attempted: `node scripts/check-connection.js` without a configured MONGODB_URI.
Result: exit code 1 and the expected generic failure message.
This verifies the missing-configuration failure path only.

No configured Atlas connection string was available during Phase 1 implementation.
The project owner subsequently reported successful manual Atlas connection and
health endpoint verification. This was not independently rerun during Phase 2B.
The original seven tests remain unchanged; see [Phase 2B results](EQUIPMENT.md)
for the current expanded suite.

After setting backend/.env locally:
1. Run `npm run test:connection` and record the actual exit code and output.
2. Run `npm start`; confirm the success message appears only after the database checks.
3. Request `http://127.0.0.1:3000/health`; record HTTP status and response.
4. Stop the process with Ctrl+C.
5. Record these actual results before describing the Atlas integration as tested in the report.

The check only connects, pings, and lists collection names. It does not execute
the original seed or query scripts, modify the database, or test schemas,
indexes, CRUD, authentication, permissions, transactions, or backup/restore.

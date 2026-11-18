# Production smoke-test report

Verified on **18 November 2026** after the owner authorized public repository creation, push and free Render deployment.

- Live application: https://taskflow-td5y.onrender.com
- Repository: https://github.com/Ambujkrr/taskflow
- Deployed application commit: 8fd3cb83c2b38ed6b8bbd23b772a05a0c371f0bb
- Render deploy: dep-dbuqvvom7kps73d82gs0 — live
- GitHub CI: https://github.com/Ambujkrr/taskflow/actions/runs/44319695596 — success
- Hosting: one free Node web service and one free PostgreSQL 17 database, Oregon, My Workspace.
- Database public IP allow list: empty (internal access only).
- Production migration log: both initial and revocable-session migrations applied successfully before the HTTP server started on port 10000.
- Database expiry supplied by Render: **18 December 2026, 7:31 PM IST** (2026-12-18T14:01:33.022230Z).

## Public API checks — all 16 passed

1. HTTPS API readiness and real PostgreSQL connection.
2. Built frontend loads over HTTPS and uses same-origin API assets without embedded credentials.
3. Environment files and Git configuration are not publicly exposed.
4. Anonymous task access is rejected.
5. Registration and authenticated cookie session persistence.
6. Secure HttpOnly SameSite host-only production authentication cookie.
7. Second independent user registration.
8. Task creation and read with real persisted fields.
9. Dashboard counts match actual saved tasks.
10. Case-insensitive search and status/priority filtering.
11. Cross-user task read/edit/delete/list/statistics isolation.
12. Missing CSRF token and foreign-origin writes are rejected.
13. Task editing/completion preserves omitted fields and updates dashboard statistics.
14. Task deletion persists and dashboard returns to zero.
15. Logout immediately revokes captured authentication tokens.
16. Invalid login rejected; valid login and logout work over HTTPS.

Completed at 2026-11-18T14:06:47.077Z. The HTTPS client and browser did not disable certificate validation. Requests were made against the actual public application, not mocks or localhost.

## Public browser checks — both passed

| Browser project  | Viewport    | Result                                                                    |
| ---------------- | ----------- | ------------------------------------------------------------------------- |
| Desktop Chromium | 1440 × 1000 | Passed complete lifecycle and accessibility scans                         |
| Mobile Chromium  | 390 × 844   | Passed complete lifecycle and accessibility scans; no horizontal overflow |

The browser checks cover registration, authenticated refresh, task creation/read/edit/completion/deletion, search, status/priority filtering, dashboard progress, sign-out/sign-in and actual same-origin HTTPS API request URLs. axe-core WCAG A/AA scans reported no violations in the scanned sign-in and populated-workspace states. These scans are not exhaustive accessibility certification.

A separate manual browser review repeated registration, creation, editing, completion, persistence after refresh, filtering/search empty states, mobile actions/navigation, deletion, dashboard reset and login/logout on the public deployment. Its created task was deleted and the browser was left signed out.

## Secrets and isolation checks

- Production secrets were generated and injected by Render; no production JWT secret or database credential was copied into source or printed.
- No .env, .local, node_modules or generated local database files are tracked by Git.
- The reviewed Git history did not contain the actual local secret values; production configuration uses provider references and generated values.
- Registration/API responses exclude password hashes and passwords. Session JWTs are delivered through Secure HttpOnly SameSite=Lax host-only cookies.
- Public environment/Git-file probes did not expose configuration; built frontend JavaScript did not contain database connection strings, private keys or password hashes.
- Anonymous requests are rejected. A second account could not read, change, delete, list or count the first account’s tasks.
- Missing CSRF tokens and foreign-origin writes were rejected. A captured session cookie stopped working immediately after logout.
- Reviewed startup/application logs did not contain plaintext credentials or request bodies.

This is a scoped review of the repository, deployed responses/assets and inspected logs, not a claim that a finite test suite proves every possible security property.

## Cleanup and remaining limits

All tasks created by the API, automated browser and manual verification workflows were deleted. Isolated synthetic test accounts remain with generated passwords that are not published. There are no shared public demo credentials; visitors register their own account.

Only free plans were created. Existing projects, including the expired ML Sentinel database, were left unchanged. Automatic service deployment and Blueprint auto-sync are disabled intentionally; a future release requires an explicit manual deploy.

The free web service can sleep after inactivity. The PostgreSQL database has the expiry above and no free managed backups. Export data before expiry or choose a separately approved storage plan later. No paid resources were used.

The MVP does not include email verification/password reset, team collaboration or reminders. Rate limits are in memory for one instance. The runtime audit reports zero vulnerabilities; the development/build tool graph still inherits the documented unpatched picomatch advisory. See VERIFICATION.md.

# Verification record

Date: 2026-11-18 (India). This record describes executed checks, not an inferred deployment result.

## Executed local checks

| Check                               | Command or method                                                                                                         | Result                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Complete local check sequence       | npm run verify                                                                                                            | PASS: lint, typecheck, tests, production build, runtime audit                                 |
| API integration and production mode | Vitest + Supertest against separate PostgreSQL database                                                                   | 22 passed: 19 lifecycle/security tests and 3 production-mode tests                            |
| Critical frontend components        | React Testing Library + Vitest                                                                                            | 4 passed                                                                                      |
| Desktop browser lifecycle           | Playwright Chromium, 1440×1000                                                                                            | PASS                                                                                          |
| Mobile browser lifecycle            | Playwright Chromium, 390×844                                                                                              | PASS                                                                                          |
| Browser accessibility               | axe-core WCAG 2 A/AA and 2.1 A/AA checks on sign-in and populated workspace, desktop/mobile                               | No violations reported in those scanned states                                                |
| Database migrations                 | prisma migrate deploy                                                                                                     | Both committed migrations applied successfully; repeated deploy reports no pending migrations |
| Live local readiness                | GET http://localhost:5173/api/health                                                                                      | 200, status ok, database connected                                                            |
| Runtime dependency audit            | npm audit --omit=dev --audit-level=high                                                                                   | 0 vulnerabilities                                                                             |
| Render Blueprint structure          | AJV 2020 against https://render.com/schema/render.yaml.json                                                               | Valid; no schema errors                                                                       |
| Manual browser review               | Registration, dated/high-priority Unicode task, refresh persistence, completion counts, completed view, mobile navigation | PASS; document width 390 equals mobile viewport width 390                                     |
| Optional seed                       | npm run db:seed with privately generated credentials                                                                      | Private sample account and eight realistic tasks created                                      |

The local database is **real PostgreSQL 17.11**, running natively on loopback. Docker Desktop was installed but stopped; a workspace-private launcher was used for verification instead. No SQLite or in-memory database substituted for PostgreSQL. The app and test databases are separate and UTF-8. The reproducible general setup uses PostgreSQL 17 through Compose or an existing PostgreSQL installation, as documented in the README.

Checks ran through a workspace-local Node.js **26.13.1** runtime. The machine's globally installed Node.js remains 26.8.2; install the version in .node-version before using ordinary npm commands outside this session. No system-wide Node installation was changed.

The browser tests verify registration, refresh persistence, task creation/read/edit/completion/deletion, title search, status/priority filtering, real dashboard progress, sign-out/sign-in, and no horizontal overflow. API tests separately verify task ownership and cross-user read/write/delete isolation. Production tests verify Secure/HttpOnly/SameSite host-only cookies, captured-token invalidation after logout, built React assets, JSON API 404s, and compatibility with Render's 256-bit generated secret.

Accessibility results cover the scanned states only; they are not a claim of exhaustive accessibility certification. Closed mobile navigation is inert and hidden from assistive technology. Native dialogs provide focus containment; keyboard focus styles and reduced-motion rules are included.

## Problems found and corrected

- PATCH inherited create defaults and reset omitted fields. Update validation now has no defaults; regression tests verify preserved priority/title and reject empty patches.
- Browser tests exposed ambiguous select labeling and asynchronous-list timing. Explicit accessible names and state-based waits fixed the issue.
- Production cookies needed revocation in addition to client-side clearing. A database-backed session ID now revokes captured JWTs on logout.
- Render generates a 256-bit base64 secret (44 characters). Validation accepts at least 32 characters and still rejects the example placeholder; a production test uses the actual generated-secret format.
- Measured low-contrast UI text and closed mobile navigation accessibility were corrected and rechecked by the browser scans.

## Dependency audit limitation

The full development/build dependency graph reports **11 high-severity package findings**, all inherited from the same unpatched picomatch advisory: [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf). The advisory lists no patched version as of this review. The application does not accept glob patterns. Vite, Vitest and ESLint are build/test tools, and the public application serves built assets through Express. The runtime-only audit reports zero vulnerabilities. Do not expose the Vite development server to the internet or apply blind force-upgrade/downgrade fixes.

## Public deployment — verified

**LIVE:** https://taskflow-td5y.onrender.com

**Repository:** https://github.com/Ambujkrr/taskflow

The owner authorized the deployment. Render created only a new free Node web service and a new free PostgreSQL 17 database in My Workspace. The initial deploy of commit 8fd3cb8 is live; startup logs confirm both migrations applied successfully. Production uses Render's exact RENDER_EXTERNAL_URL as its trusted origin, with an optional explicit APP_ORIGIN override for a custom domain. The generated 256-bit JWT secret and internal database URL are supplied by Render. No manual secret values were required.

The production API passed all 16 smoke checks, and the live desktop/mobile browser flows passed, including accessibility scans and same-origin HTTPS network assertions. A separate manual browser lifecycle passed. The deployed commit's GitHub CI run succeeded.

- [x] Authorized public repository creation and commit push.
- [x] Free database availability confirmed by successful creation; existing projects unchanged.
- [x] Exact public HTTPS origin configured automatically.
- [x] Production migrations applied and public health reports a connected PostgreSQL database.
- [x] Registration, login/logout, refresh persistence and captured-token revocation.
- [x] Task create/read/edit/complete/delete, search, filtering and dashboard counts.
- [x] Cross-user isolation, CSRF rejection and production cookie flags.
- [x] Public desktop/mobile layout and HTTPS frontend/backend communication.
- [x] Test tasks deleted; secrets/source exposure checks passed within the inspected scope.
- [x] Database expiry recorded: 18 December 2026, 7:31 PM IST.

See [PRODUCTION_SMOKE.md](PRODUCTION_SMOKE.md) for the full production evidence, commands and limitations. Later documentation/test-only commits do not change the deployed server/client implementation.

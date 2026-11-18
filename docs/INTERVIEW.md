# Explaining TaskFlow in an interview

## A concise introduction

“TaskFlow is a full-stack task management application I built using Node.js, Express, TypeScript, React and PostgreSQL. Users can create an account, manage their own tasks, search and filter them, and see dashboard counts calculated by the backend. I used Prisma for database access and migrations, Zod for validation, and JWTs in HttpOnly cookies for authentication. I also added CSRF protection and database-backed session revocation. My tests cover authentication, the task lifecycle, and attempts to access another user’s tasks.”

The public deployment is verified; use the real URL in PRODUCTION_SMOKE.md when demonstrating the application. Explain the code yourself and acknowledge AI coding assistance honestly when asked.

| Question                                            | Key points to explain                                                                                                                                                      |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Why Node.js when you know Python?                   | Learn the JavaScript/TypeScript server ecosystem; one language across the stack; asynchronous I/O is useful for database-backed HTTP requests.                             |
| How does a request reach the database?              | React fetch → Express middleware → JWT/session validation → Zod → owner-scoped Prisma query → PostgreSQL → JSON response → React state.                                    |
| Why PostgreSQL?                                     | Persistent relational data, foreign keys, unique constraints, indexes and transactions.                                                                                    |
| Why Prisma?                                         | Typed database queries, schema definitions and versioned migrations; still understand generated SQL and query performance.                                                 |
| Why HttpOnly cookies?                               | JavaScript cannot read the session token; Secure and SameSite reduce exposure. XSS still matters, so render text safely and use CSP.                                       |
| Why CSRF protection?                                | Browsers automatically send cookies. Exact Origin, JSON-only mutations and a custom CSRF header stop other sites from making authenticated changes.                        |
| Why store sessions if JWTs are stateless?           | Logout must immediately revoke a stolen token. A session lookup adds database cost but provides revocation.                                                                |
| How do you stop one user accessing another’s tasks? | Use authenticated user ID in every query, including mutations, and return 404 for foreign IDs. Integration tests use two real accounts.                                    |
| How do you store passwords?                         | bcrypt cost 12, random salts from the library, enforce the 72-byte limit; no plaintext storage or logging.                                                                 |
| What happens on invalid input?                      | Zod returns safe field errors with 400; unknown mutation fields are rejected; database constraints protect concurrent duplicate registration.                              |
| How do dashboard counts work?                       | One PostgreSQL group-by over the current user’s tasks; independent of list filters.                                                                                        |
| Why these indexes?                                  | Lists filter by user and status/priority, and order by creation date. Substring title search is fine at MVP scale; consider trigram indexing when measurements justify it. |
| What would you change for multiple instances?       | Shared rate-limit store, carefully configured proxy trust, load testing and stronger observability; sessions already live in PostgreSQL.                                   |
| What are the current limitations?                   | No email verification/password reset, no team collaboration, no automatic reminders, no optimistic concurrency controls; free hosting has sleep and expiry constraints.    |
| How did you verify it?                              | Show the executed verification report. Distinguish real database tests, UI tests, local browser smoke checks, and completed public deployment checks.                      |

## A focused code-reading path

1. `server/prisma/schema.prisma`: database relations and indexes.
2. `server/src/config.ts`: fail-fast environment validation.
3. `server/src/contracts.ts`: validation and API boundaries.
4. `server/src/app.ts`: middleware order, authentication, owner-scoped queries and error handling.
5. `client/src/api.ts`: credentials and CSRF token lifecycle.
6. `client/src/App.tsx`: debounced filters, pagination, reloads after writes and stale-response guards.
7. `server/tests/api.test.ts`: two-user isolation and actual database behavior.

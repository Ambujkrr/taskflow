# TaskFlow REST API

All endpoints are under `/api`. JSON responses use camelCase. Dates are ISO-8601; `dueDate` input is a real `YYYY-MM-DD` date or `null`. No API key or external service is required.

## Authentication and CSRF

The browser stores an eight-hour JWT in an HttpOnly cookie. Production uses `Secure`, `SameSite=Lax`, `Path=/`, no `Domain`, and a `__Host-` cookie name. The JWT has an issuer, audience, subject and unique session ID. Each authenticated request verifies its signature and an unexpired PostgreSQL session; logout deletes that session, invalidating captured tokens immediately.

1. `GET /auth/csrf` returns `{ "csrfToken": "…" }` and sets an HttpOnly CSRF cookie.
2. For **every POST, PATCH and DELETE**, send `Content-Type: application/json`, `Origin: <APP_ORIGIN>` and `X-CSRF-Token: <csrfToken>`, including login, registration and logout.
3. Keep cookies between requests. Cross-origin mutations and cross-site fetches are denied. The app never enables cross-origin credential sharing. Vite proxies `/api` in development; production React and Express share one origin.
4. After logout or a CSRF rejection, fetch a new token. A mutation rejected for CSRF is not automatically retried.

## Routes

| Method | Route              | Auth | Result                                        |
| ------ | ------------------ | ---- | --------------------------------------------- |
| GET    | `/health`          | No   | 200 database ready; 503 unavailable           |
| GET    | `/auth/csrf`       | No   | 200 CSRF token and cookie                     |
| POST   | `/auth/register`   | No   | 201 user and session                          |
| POST   | `/auth/login`      | No   | 200 user and session                          |
| POST   | `/auth/logout`     | No   | 204; revoke current session and clear cookies |
| GET    | `/auth/me`         | Yes  | 200 current user                              |
| GET    | `/tasks`           | Yes  | 200 paginated tasks                           |
| POST   | `/tasks`           | Yes  | 201 created task                              |
| GET    | `/tasks/:id`       | Yes  | 200 owned task                                |
| PATCH  | `/tasks/:id`       | Yes  | 200 updated owned task                        |
| DELETE | `/tasks/:id`       | Yes  | 204 deleted owned task                        |
| GET    | `/dashboard/stats` | Yes  | 200 counts for current user                   |

Register: `{ "name": "Ambuj Kumar", "email": "you@example.com", "password": "your unique password" }`.
Login: `{ "email": "you@example.com", "password": "your unique password" }`.
Email is normalized to lowercase; name is 2–80 characters. Password is at least 10 characters and no more than 72 UTF-8 bytes (bcrypt's limit). Passwords are never returned.

Create a task:

```json
{
  "title": "Prepare the portfolio walkthrough",
  "description": "Explain architecture and authentication tradeoffs",
  "status": "IN_PROGRESS",
  "priority": "HIGH",
  "dueDate": "2027-05-01"
}
```

Only `title` is required. Defaults: empty description, `TODO`, `MEDIUM`, no due date. Title is 1–160 trimmed characters; description is at most 3,000 characters. PATCH accepts any nonempty subset of these fields. Passing `dueDate: null` clears it. Unknown mutation fields are rejected, including `userId`.

Statuses: `TODO`, `IN_PROGRESS`, `COMPLETED`. Priorities: `LOW`, `MEDIUM`, `HIGH`.

List query: `?search=portfolio&status=TODO&priority=HIGH&page=1&limit=12`.
Search matches title case-insensitively. Results sort newest first with ID as tie-breaker. Page starts at 1; limit is 1–50, default 12.

```json
{ "tasks": [], "total": 0, "page": 1, "pageSize": 12, "pages": 0 }
```

Stats: `{ "total": 8, "pending": 4, "inProgress": 2, "completed": 2 }`.
`pending` means **To do** only, so the three status counts sum to `total`. Counts are independent of list filters.

Task responses wrap the record in `{ "task": { ... } }`. User responses use `{ "user": { "id", "name", "email", "createdAt" } }`.

## Errors and isolation

Errors use `{ "error": "Public message" }`; validation also includes `issues: [{ "field": "title", "message": "…" }]`.

| Status | Meaning                                                      |
| ------ | ------------------------------------------------------------ |
| 400    | Validation error or malformed JSON/UUID                      |
| 401    | Missing, invalid, expired, or revoked session; invalid login |
| 403    | Origin or CSRF check failed                                  |
| 404    | Missing task, another user's task, or unknown API route      |
| 409    | Registration email unavailable                               |
| 413    | Body larger than 16 KiB                                      |
| 415    | Mutation did not send JSON                                   |
| 429    | Authentication or API rate limit                             |
| 500    | Sanitized unexpected server error                            |

Every task read/update/delete includes both task ID and authenticated user ID in the database query. Ownership is never accepted from browser input. Another user's task and a nonexistent task have the same 404 response.

Authentication: 20 attempts per IP per 15 minutes. API: 180 requests per IP per minute. These limits use in-memory storage for the single-instance MVP. JSON bodies, passwords, tokens, email addresses, database URLs, and raw query strings are not logged. API responses are `no-store`.

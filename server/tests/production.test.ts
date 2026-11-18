import { afterAll, beforeAll, expect, it, vi } from "vitest";
import request from "supertest";
import { randomUUID, randomBytes } from "node:crypto";

const origin = "https://taskflow.example.test";
const email = `production-${randomUUID()}@example.test`;
let app: ReturnType<typeof import("../src/app.js").createApp>;
let db: typeof import("../src/db.js").db;
let csrfToken: string;
let csrfCookie: string;
let sessionCookie: string;
beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_ORIGIN", "");
  vi.stubEnv("RENDER_EXTERNAL_URL", origin);
  vi.stubEnv("JWT_SECRET", randomBytes(32).toString("base64"));
  vi.resetModules();
  app = (await import("../src/app.js")).createApp();
  db = (await import("../src/db.js")).db;
  const token = await request(app).get("/api/auth/csrf");
  csrfToken = token.body.csrfToken;
  csrfCookie = token.headers["set-cookie"][0].split(";")[0];
});
afterAll(async () => {
  await db.user.deleteMany({ where: { email } });
  await db.$disconnect();
  vi.unstubAllEnvs();
});
it("issues host-only Secure HttpOnly SameSite cookies and excludes secrets", async () => {
  const res = await request(app)
    .post("/api/auth/register")
    .set("Origin", origin)
    .set("Cookie", csrfCookie)
    .set("X-CSRF-Token", csrfToken)
    .send({
      name: "Production Test",
      email,
      password: "Production-test-secret-567!",
    });
  expect(res.status).toBe(201);
  const cookie = res.headers["set-cookie"][0];
  expect(cookie).toMatch(/^__Host-taskflow=/);
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("Secure");
  expect(cookie).toContain("SameSite=Lax");
  expect(cookie).toContain("Path=/");
  expect(cookie).not.toContain("Domain=");
  expect(JSON.stringify(res.body)).not.toMatch(/password|token|stack/i);
  sessionCookie = cookie.split(";")[0];
});
it("authenticates the production session and revokes it on logout", async () => {
  expect(
    (await request(app).get("/api/auth/me").set("Cookie", sessionCookie))
      .status,
  ).toBe(200);
  const logout = await request(app)
    .post("/api/auth/logout")
    .set("Origin", origin)
    .set("Cookie", `${csrfCookie}; ${sessionCookie}`)
    .set("X-CSRF-Token", csrfToken)
    .send({});
  expect(logout.status).toBe(204);
  expect(
    (await request(app).get("/api/auth/me").set("Cookie", sessionCookie))
      .status,
  ).toBe(401);
});
it("serves built React assets while unknown API routes remain JSON 404s", async () => {
  const root = await request(app).get("/");
  expect(root.status).toBe(200);
  expect(root.headers["content-type"]).toContain("text/html");
  const asset = root.text.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  expect(asset).toBeDefined();
  expect((await request(app).get(asset!)).status).toBe(200);
  expect(root.headers["content-security-policy"]).toContain(
    "script-src 'self'",
  );
  const missing = await request(app).get("/api/missing");
  expect(missing.status).toBe(404);
  expect(missing.headers["content-type"]).toContain("application/json");
  expect(missing.headers["cache-control"]).toBe("no-store");
});

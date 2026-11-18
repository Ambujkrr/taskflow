import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { request } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const base = process.env.E2E_BASE_URL;
assert(
  base,
  "Set E2E_BASE_URL to an explicitly authorized public application URL.",
);
const origin = new URL(base).origin;
assert.equal(
  new URL(origin).protocol,
  "https:",
  "Production checks require valid HTTPS.",
);
const run = Date.now() + "-" + randomBytes(5).toString("hex");
const password = randomBytes(24).toString("hex");
const email = "production-" + run + "@example.test";
const checks = [];
const contexts = [];
const created = [];
const pass = (name) => {
  checks.push(name);
  console.log("PASS " + name);
};
const makeContext = async () => {
  const ctx = await request.newContext({
    baseURL: origin,
    ignoreHTTPSErrors: false,
  });
  contexts.push(ctx);
  return ctx;
};
const alice = await makeContext();
const bob = await makeContext();
const tokenFor = async (ctx) => {
  const r = await ctx.get("/api/auth/csrf");
  assert.equal(r.status(), 200);
  return (await r.json()).csrfToken;
};
const aToken = await tokenFor(alice),
  bToken = await tokenFor(bob);
const mutate = (ctx, token, method, path, data) =>
  ctx[method](path, {
    headers: { Origin: origin, "X-CSRF-Token": token },
    data,
  });
try {
  let res = await alice.get("/api/health");
  assert.equal(res.status(), 200);
  assert.deepEqual(await res.json(), { status: "ok", database: "connected" });
  pass("HTTPS API readiness and real PostgreSQL connection");
  res = await alice.get("/");
  assert.equal(res.status(), 200);
  const html = await res.text();
  assert.match(res.headers()["content-type"], /text\/html/);
  assert.match(res.headers()["content-security-policy"], /script-src 'self'/);
  const script = html.match(/src="(\/assets\/[^" ]+\.js)"/)?.[1];
  assert(script);
  const asset = await alice.get(script);
  assert.equal(asset.status(), 200);
  const js = await asset.text();
  assert(
    !/postgres(?:ql)?:\/\/|passwordHash|JWT_SECRET=|DATABASE_URL=|-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(
      js,
    ),
  );
  assert(!js.includes("http://localhost:3001"));
  pass(
    "Built frontend loads over HTTPS and uses same-origin API assets without embedded credentials",
  );
  for (const path of ["/.env", "/.git/config", "/server/.env"]) {
    const probe = await alice.get(path);
    assert([200, 403, 404].includes(probe.status()));
    const body = await probe.text();
    assert(
      !/DATABASE_URL=|JWT_SECRET=|SEED_PASSWORD=|\[remote "origin"\]/.test(
        body,
      ),
    );
    if (probe.status() === 200)
      assert.match(probe.headers()["content-type"], /text\/html/);
  }
  pass("Environment files and Git configuration are not publicly exposed");
  assert.equal((await bob.get("/api/tasks")).status(), 401);
  pass("Anonymous task access is rejected");
  res = await mutate(alice, aToken, "post", "/api/auth/register", {
    name: "Production Smoke Test",
    email,
    password,
  });
  assert.equal(res.status(), 201);
  const account = await res.json();
  assert(!JSON.stringify(account).includes("passwordHash"));
  assert(!JSON.stringify(account).includes(password));
  const me = await alice.get("/api/auth/me");
  assert.equal(me.status(), 200);
  assert.equal((await me.json()).user.email, email);
  pass("Registration and authenticated cookie session persistence");
  const session = (await alice.storageState()).cookies.find(
    (c) => c.name === "__Host-taskflow",
  );
  assert(session);
  assert(session.httpOnly && session.secure);
  assert.equal(session.sameSite, "Lax");
  assert.equal(session.path, "/");
  pass("Secure HttpOnly SameSite host-only production authentication cookie");
  res = await mutate(bob, bToken, "post", "/api/auth/register", {
    name: "Isolation Smoke Test",
    email: "isolation-" + run + "@example.test",
    password,
  });
  assert.equal(res.status(), 201);
  pass("Second independent user registration");
  res = await mutate(alice, aToken, "post", "/api/tasks", {
    title: "Production smoke " + run,
    description: "Real production smoke test",
    status: "TODO",
    priority: "HIGH",
    dueDate: "2026-12-01",
  });
  assert.equal(res.status(), 201);
  const first = (await res.json()).task;
  created.push(first.id);
  res = await mutate(alice, aToken, "post", "/api/tasks", {
    title: "Follow-up " + run,
    status: "IN_PROGRESS",
    priority: "LOW",
  });
  assert.equal(res.status(), 201);
  const second = (await res.json()).task;
  created.push(second.id);
  assert.equal((await alice.get("/api/tasks/" + first.id)).status(), 200);
  pass("Task creation and read with real persisted fields");
  assert.deepEqual(await (await alice.get("/api/dashboard/stats")).json(), {
    total: 2,
    pending: 1,
    inProgress: 1,
    completed: 0,
  });
  pass("Dashboard counts match actual saved tasks");
  res = await alice.get("/api/tasks", {
    params: { search: "PRODUCTION SMOKE", status: "TODO", priority: "HIGH" },
  });
  let page = await res.json();
  assert.equal(page.total, 1);
  assert.equal(page.tasks[0].id, first.id);
  res = await alice.get("/api/tasks", {
    params: { status: "IN_PROGRESS", priority: "LOW", limit: 1 },
  });
  page = await res.json();
  assert.equal(page.total, 1);
  assert.equal(page.tasks[0].id, second.id);
  pass("Case-insensitive search and status/priority filtering");
  assert.equal((await bob.get("/api/tasks/" + first.id)).status(), 404);
  assert.equal(
    (
      await mutate(bob, bToken, "patch", "/api/tasks/" + first.id, {
        title: "Forbidden",
      })
    ).status(),
    404,
  );
  assert.equal(
    (
      await mutate(bob, bToken, "delete", "/api/tasks/" + first.id, {})
    ).status(),
    404,
  );
  assert.equal((await (await bob.get("/api/tasks")).json()).total, 0);
  assert.equal((await (await bob.get("/api/dashboard/stats")).json()).total, 0);
  pass("Cross-user task read/edit/delete/list/statistics isolation");
  assert.equal(
    (
      await alice.post("/api/tasks", {
        headers: { Origin: origin },
        data: { title: "Rejected" },
      })
    ).status(),
    403,
  );
  assert.equal(
    (
      await alice.post("/api/tasks", {
        headers: {
          Origin: "https://untrusted.example",
          "X-CSRF-Token": aToken,
        },
        data: { title: "Rejected" },
      })
    ).status(),
    403,
  );
  pass("Missing CSRF token and foreign-origin writes are rejected");
  res = await mutate(alice, aToken, "patch", "/api/tasks/" + first.id, {
    title: "Verified production task " + run,
    status: "COMPLETED",
    description: "Updated securely",
    dueDate: null,
  });
  assert.equal(res.status(), 200);
  const updated = (await res.json()).task;
  assert.equal(updated.priority, "HIGH");
  assert.equal(updated.dueDate, null);
  assert.equal(updated.status, "COMPLETED");
  assert.deepEqual(await (await alice.get("/api/dashboard/stats")).json(), {
    total: 2,
    pending: 0,
    inProgress: 1,
    completed: 1,
  });
  pass(
    "Task editing/completion preserves omitted fields and updates dashboard statistics",
  );
  for (const id of created) {
    assert.equal(
      (await mutate(alice, aToken, "delete", "/api/tasks/" + id, {})).status(),
      204,
    );
  }
  created.length = 0;
  assert.equal((await alice.get("/api/tasks/" + first.id)).status(), 404);
  assert.equal(
    (await (await alice.get("/api/dashboard/stats")).json()).total,
    0,
  );
  pass("Task deletion persists and dashboard returns to zero");
  assert.equal(
    (await mutate(alice, aToken, "post", "/api/auth/logout", {})).status(),
    204,
  );
  assert.equal((await alice.get("/api/auth/me")).status(), 401);
  const replay = await makeContext();
  assert.equal(
    (
      await replay.get("/api/auth/me", {
        headers: { Cookie: session.name + "=" + session.value },
      })
    ).status(),
    401,
  );
  pass("Logout immediately revokes captured authentication tokens");
  const fresh = await tokenFor(alice);
  assert.equal(
    (
      await mutate(alice, fresh, "post", "/api/auth/login", {
        email,
        password: "incorrect-password",
      })
    ).status(),
    401,
  );
  assert.equal(
    (
      await mutate(alice, fresh, "post", "/api/auth/login", { email, password })
    ).status(),
    200,
  );
  assert.equal((await alice.get("/api/auth/me")).status(), 200);
  assert.equal(
    (await mutate(alice, fresh, "post", "/api/auth/logout", {})).status(),
    204,
  );
  pass("Invalid login rejected; valid login and logout work over HTTPS");
  const report = {
    target: origin,
    passed: true,
    checks,
    completedAt: new Date().toISOString(),
    cleanup:
      "Created tasks removed; isolated synthetic accounts remain without published credentials.",
  };
  if (process.env.SMOKE_REPORT_PATH)
    await writeFile(
      process.env.SMOKE_REPORT_PATH,
      JSON.stringify(report, null, 2),
    );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error("Production smoke failed:", error.message);
  process.exitCode = 1;
} finally {
  for (const id of created)
    await mutate(alice, aToken, "delete", "/api/tasks/" + id, {}).catch(
      () => {},
    );
  for (const ctx of contexts) await ctx.dispose();
}

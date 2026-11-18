import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { db } from "../src/db.js";
const app = createApp();
const origin = "http://localhost:5173";
const email = `test-${randomUUID()}@example.test`,
  otherEmail = `test-${randomUUID()}@example.test`;
const password = "Correct horse battery 73!";
const alice = request.agent(app),
  bob = request.agent(app);
let csrfA: string, csrfB: string, taskId: string;
const post = (path: string, body: object, agent = alice, token = csrfA) =>
  agent.post(path).set("Origin", origin).set("X-CSRF-Token", token).send(body);
beforeAll(async () => {
  csrfA = (await alice.get("/api/auth/csrf")).body.csrfToken;
  csrfB = (await bob.get("/api/auth/csrf")).body.csrfToken;
});
afterAll(async () => {
  await db.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });
  await db.$disconnect();
});
describe("authentication and input validation", () => {
  it("reports database readiness", async () => {
    expect((await request(app).get("/api/health")).body).toEqual({
      status: "ok",
      database: "connected",
    });
  });
  it("rejects unauthenticated access", async () => {
    for (const path of ["/api/auth/me", "/api/tasks", "/api/dashboard/stats"])
      expect((await request(app).get(path)).status).toBe(401);
  });
  it("rejects missing CSRF and wrong origin", async () => {
    expect(
      (await alice.post("/api/auth/register").set("Origin", origin).send({}))
        .status,
    ).toBe(403);
    expect(
      (
        await alice
          .post("/api/auth/register")
          .set("Origin", "https://evil.example")
          .set("X-CSRF-Token", csrfA)
          .send({})
      ).status,
    ).toBe(403);
  });
  it("rejects invalid registration without leaking sensitive values", async () => {
    const res = await post("/api/auth/register", {
      name: "A",
      email: "bad",
      password: "short",
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain("short");
  });
  it("registers, hashes passwords, and persists the cookie session", async () => {
    const res = await post("/api/auth/register", {
      name: "Alice Test",
      email: email.toUpperCase(),
      password,
    });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(res.headers["set-cookie"][0]).toContain("SameSite=Lax");
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash).not.toBe(password);
    expect(await bcrypt.compare(password, user.passwordHash)).toBe(true);
    expect((await alice.get("/api/auth/me")).body.user.id).toBe(user.id);
  });
  it("rejects duplicate email", async () => {
    expect(
      (await post("/api/auth/register", { name: "Alice", email, password }))
        .status,
    ).toBe(409);
  });
  it("rejects invalid login with the same generic message for unknown accounts", async () => {
    const bad = await post("/api/auth/login", { email, password: "wrong" });
    const unknown = await post("/api/auth/login", {
      email: "unknown@example.test",
      password: "wrong",
    });
    expect(bad.status).toBe(401);
    expect(unknown.body).toEqual(bad.body);
  });
  it("rejects forged and expired JWTs", async () => {
    expect(
      (await request(app).get("/api/tasks").set("Cookie", "taskflow=forged"))
        .status,
    ).toBe(401);
    const token = jwt.sign({}, process.env.JWT_SECRET!, {
      subject: randomUUID(),
      expiresIn: -10,
      issuer: "taskflow",
      audience: "taskflow-web",
    });
    expect(
      (await request(app).get("/api/tasks").set("Cookie", `taskflow=${token}`))
        .status,
    ).toBe(401);
  });
  it("creates a second isolated user", async () => {
    expect(
      (
        await post(
          "/api/auth/register",
          { name: "Bob Test", email: otherEmail, password },
          bob,
          csrfB,
        )
      ).status,
    ).toBe(201);
  });
  it("rate-limits repeated authentication attempts", async () => {
    const fresh = request.agent(createApp());
    const token = (await fresh.get("/api/auth/csrf")).body.csrfToken;
    for (let i = 0; i < 20; i++)
      expect((await post("/api/auth/login", {}, fresh, token)).status).toBe(
        400,
      );
    const limited = await post("/api/auth/login", {}, fresh, token);
    expect(limited.status).toBe(429);
    expect(limited.headers["retry-after"]).toBeDefined();
  });
});
describe("real PostgreSQL task lifecycle", () => {
  it("creates a task and returns durable fields", async () => {
    const res = await post("/api/tasks", {
      title: "Ship application",
      description: "Finish the reliable MVP",
      priority: "HIGH",
      dueDate: "2027-05-01",
    });
    expect(res.status).toBe(201);
    expect(res.body.task.status).toBe("TODO");
    taskId = res.body.task.id;
    expect((await alice.get(`/api/tasks/${taskId}`)).body.task.title).toBe(
      "Ship application",
    );
  });
  it("validates titles, enum values, dates, unexpected fields and empty updates", async () => {
    for (const body of [
      { title: "" },
      { title: "x", priority: "URGENT" },
      { title: "x", dueDate: "2027-02-30" },
      { title: "x", userId: randomUUID() },
    ])
      expect((await post("/api/tasks", body)).status).toBe(400);
    expect(
      (
        await alice
          .patch(`/api/tasks/${taskId}`)
          .set("Origin", origin)
          .set("X-CSRF-Token", csrfA)
          .send({})
      ).status,
    ).toBe(400);
  });
  it("isolates reads, changes, deletes, lists and statistics by owner", async () => {
    expect((await bob.get(`/api/tasks/${taskId}`)).status).toBe(404);
    expect(
      (
        await bob
          .patch(`/api/tasks/${taskId}`)
          .set("Origin", origin)
          .set("X-CSRF-Token", csrfB)
          .send({ title: "Stolen" })
      ).status,
    ).toBe(404);
    expect(
      (
        await bob
          .delete(`/api/tasks/${taskId}`)
          .set("Origin", origin)
          .set("X-CSRF-Token", csrfB)
          .send({})
      ).status,
    ).toBe(404);
    expect((await bob.get("/api/tasks")).body.total).toBe(0);
    expect((await bob.get("/api/dashboard/stats")).body.total).toBe(0);
  });
  it("searches case-insensitively, filters and paginates", async () => {
    await post("/api/tasks", {
      title: "Research opportunities",
      status: "IN_PROGRESS",
      priority: "LOW",
    });
    await post("/api/tasks", {
      title: "Update resume",
      status: "COMPLETED",
      priority: "MEDIUM",
    });
    const res = await alice.get(
      "/api/tasks?search=SHIP&status=TODO&priority=HIGH",
    );
    expect(res.body.tasks).toHaveLength(1);
    expect(res.body.tasks[0].id).toBe(taskId);
    expect((await alice.get("/api/tasks?limit=1&page=2")).body).toMatchObject({
      page: 2,
      pageSize: 1,
      pages: 3,
      total: 3,
    });
    expect((await alice.get("/api/tasks?limit=999")).status).toBe(400);
  });
  it("computes dashboard counts from persisted records", async () => {
    expect((await alice.get("/api/dashboard/stats")).body).toEqual({
      total: 3,
      pending: 1,
      inProgress: 1,
      completed: 1,
    });
  });
  it("updates the task without resetting other fields", async () => {
    const res = await alice
      .patch(`/api/tasks/${taskId}`)
      .set("Origin", origin)
      .set("X-CSRF-Token", csrfA)
      .send({ status: "COMPLETED", dueDate: null });
    expect(res.status).toBe(200);
    expect(res.body.task).toMatchObject({
      title: "Ship application",
      priority: "HIGH",
      status: "COMPLETED",
      dueDate: null,
    });
    expect((await alice.get("/api/dashboard/stats")).body.completed).toBe(2);
  });
  it("rejects oversized JSON and malformed task IDs", async () => {
    expect(
      (await post("/api/tasks", { title: "x".repeat(20000) })).status,
    ).toBe(413);
    expect((await alice.get("/api/tasks/not-a-uuid")).status).toBe(400);
  });
  it("deletes only the owned task", async () => {
    expect(
      (
        await alice
          .delete(`/api/tasks/${taskId}`)
          .set("Origin", origin)
          .set("X-CSRF-Token", csrfA)
          .send({})
      ).status,
    ).toBe(204);
    expect((await alice.get(`/api/tasks/${taskId}`)).status).toBe(404);
    expect((await alice.get("/api/dashboard/stats")).body.total).toBe(2);
  });
  it("logs out, rejects the cleared session, and permits valid login", async () => {
    const login = await post("/api/auth/login", { email, password });
    const capturedCookie = login.headers["set-cookie"][0].split(";")[0];
    expect((await post("/api/auth/logout", {})).status).toBe(204);
    expect((await alice.get("/api/auth/me")).status).toBe(401);
    expect(
      (await request(app).get("/api/auth/me").set("Cookie", capturedCookie))
        .status,
    ).toBe(401);
    csrfA = (await alice.get("/api/auth/csrf")).body.csrfToken;
    expect((await post("/api/auth/login", { email, password })).status).toBe(
      200,
    );
  });
});

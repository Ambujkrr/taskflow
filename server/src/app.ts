import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { randomBytes, timingSafeEqual, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pino from "pino";
import { ZodError } from "zod";
import { db } from "./db.js";
import { env } from "./config.js";
import {
  filterSchema,
  idSchema,
  loginSchema,
  patchSchema,
  registerSchema,
  taskSchema,
} from "./contracts.js";
import { Prisma } from "./generated/prisma/client.js";

export const logger = pino({
  level: env.NODE_ENV === "test" ? "silent" : "info",
  redact: [
    "password",
    "passwordHash",
    "token",
    "cookie",
    "authorization",
    "DATABASE_URL",
  ],
});
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const cookieName =
  env.NODE_ENV === "production" ? "__Host-taskflow" : "taskflow";
const csrfName =
  env.NODE_ENV === "production" ? "__Host-taskflow-csrf" : "taskflow-csrf";
const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
const userSelect = { id: true, name: true, email: true, createdAt: true };
// A constant-work hash avoids making nonexistent accounts dramatically faster to check.
const dummyHash = bcrypt.hashSync(randomBytes(32).toString("hex"), 12);

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  if (env.NODE_ENV === "production") app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          ...(env.NODE_ENV !== "production"
            ? { upgradeInsecureRequests: null }
            : {}),
        },
      },
    }),
  );
  app.use((req, res, next) => {
    const requestId = randomUUID();
    res.setHeader("X-Request-ID", requestId);
    const started = Date.now();
    res.on("finish", () =>
      logger.info(
        {
          requestId,
          method: req.method,
          status: res.statusCode,
          durationMs: Date.now() - started,
        },
        "request",
      ),
    );
    next();
  });
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.get("/api/health", async (_req, res) => {
    try {
      await db.$queryRaw`SELECT 1`;
      res.json({ status: "ok", database: "connected" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 180,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Too many requests. Try again shortly." },
    }),
  );
  app.use(express.json({ limit: "16kb" }));
  app.use(cookieParser());
  // Same-origin-only API. No CORS headers are needed; Vite proxies /api during development.
  // Requiring both the exact Origin and JSON for mutations prevents cross-site form attacks.
  // A double-submit CSRF token adds a second check; the cookie is HttpOnly, token arrives via JSON.
  app.use("/api", (req, _res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    if (
      req.headers.origin !== env.APP_ORIGIN ||
      req.headers["sec-fetch-site"] === "cross-site"
    )
      return next(new HttpError(403, "Request origin is not allowed"));
    if (!req.is("application/json"))
      return next(new HttpError(415, "Use application/json"));
    const header = req.get("X-CSRF-Token");
    const cookie = req.cookies[csrfName] as unknown;
    if (
      typeof header !== "string" ||
      typeof cookie !== "string" ||
      !/^[a-f0-9]{64}$/.test(header) ||
      header.length !== cookie.length ||
      !timingSafeEqual(Buffer.from(header), Buffer.from(cookie))
    )
      return next(
        new HttpError(403, "Invalid CSRF token. Refresh and try again."),
      );
    next();
  });
  app.get("/api/auth/csrf", (_req, res) => {
    const csrfToken = randomBytes(32).toString("hex");
    res
      .cookie(csrfName, csrfToken, { ...cookieOptions, maxAge: 8 * 3600000 })
      .json({ csrfToken });
  });
  const authLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: "Too many authentication attempts. Try again in 15 minutes.",
    },
  });
  const issueSession = async (res: Response, id: string) => {
    const jti = randomUUID();
    await db.$transaction([
      db.session.deleteMany({
        where: { userId: id, expiresAt: { lte: new Date() } },
      }),
      db.session.create({
        data: {
          id: jti,
          userId: id,
          expiresAt: new Date(Date.now() + 8 * 3600000),
        },
      }),
    ]);
    const token = jwt.sign({}, env.JWT_SECRET, {
      subject: id,
      jwtid: jti,
      algorithm: "HS256",
      expiresIn: "8h",
      issuer: "taskflow",
      audience: "taskflow-web",
    });
    res.cookie(cookieName, token, { ...cookieOptions, maxAge: 8 * 3600000 });
  };
  const auth = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token: unknown = req.cookies[cookieName];
      if (typeof token !== "string") throw new Error();
      const claims = jwt.verify(token, env.JWT_SECRET, {
        algorithms: ["HS256"],
        issuer: "taskflow",
        audience: "taskflow-web",
      }) as JwtPayload;
      if (!claims.sub || !claims.jti) throw new Error();
      res.locals.userId = idSchema.parse(claims.sub);
      res.locals.sessionId = idSchema.parse(claims.jti);
    } catch {
      return next(new HttpError(401, "Please sign in to continue"));
    }
    try {
      const session = await db.session.findFirst({
        where: {
          id: res.locals.sessionId,
          userId: res.locals.userId,
          expiresAt: { gt: new Date() },
        },
        select: { user: { select: userSelect } },
      });
      if (!session)
        return next(new HttpError(401, "Please sign in to continue"));
      res.locals.user = session.user;
      next();
    } catch (error) {
      next(error);
    }
  };
  app.post("/api/auth/register", authLimit, async (req, res) => {
    const data = registerSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(data.password, 12);
    try {
      const user = await db.user.create({
        data: { name: data.name, email: data.email, passwordHash },
        select: userSelect,
      });
      await issueSession(res, user.id);
      res.status(201).json({ user });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new HttpError(
          409,
          "Unable to register with this email. Try signing in.",
        );
      throw error;
    }
  });
  app.post("/api/auth/login", authLimit, async (req, res) => {
    const data = loginSchema.parse(req.body);
    const user = await db.user.findUnique({ where: { email: data.email } });
    const valid = await bcrypt.compare(
      data.password,
      user?.passwordHash ?? dummyHash,
    );
    if (!user || !valid) throw new HttpError(401, "Invalid email or password");
    await issueSession(res, user.id);
    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      },
    });
  });
  app.post("/api/auth/logout", async (req, res) => {
    let sessionId: string | undefined;
    try {
      const claims = jwt.verify(req.cookies[cookieName], env.JWT_SECRET, {
        algorithms: ["HS256"],
        issuer: "taskflow",
        audience: "taskflow-web",
      }) as JwtPayload;
      sessionId = idSchema.parse(claims.jti);
    } catch {
      /* Already invalid or expired: clearing cookies is sufficient. */
    }
    if (sessionId) await db.session.deleteMany({ where: { id: sessionId } });
    res.clearCookie(cookieName, cookieOptions);
    res.clearCookie(csrfName, cookieOptions);
    res.status(204).end();
  });
  app.get("/api/auth/me", auth, (_req, res) => {
    res.json({ user: res.locals.user });
  });
  app.use("/api/tasks", auth);
  app.get("/api/tasks", async (req, res) => {
    const { search, status, priority, page, limit } = filterSchema.parse(
      req.query,
    );
    const where: Prisma.TaskWhereInput = {
      userId: res.locals.userId,
      ...(status && { status }),
      ...(priority && { priority }),
      ...(search && { title: { contains: search, mode: "insensitive" } }),
    };
    const [tasks, total] = await db.$transaction([
      db.task.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.task.count({ where }),
    ]);
    res.json({
      tasks,
      total,
      page,
      pageSize: limit,
      pages: Math.ceil(total / limit),
    });
  });
  app.post("/api/tasks", async (req, res) => {
    const input = taskSchema.parse(req.body);
    const task = await db.task.create({
      data: {
        ...input,
        dueDate: input.dueDate
          ? new Date(`${input.dueDate}T00:00:00.000Z`)
          : null,
        userId: res.locals.userId,
      },
    });
    res.status(201).json({ task });
  });
  app.get("/api/tasks/:id", async (req, res) => {
    const task = await db.task.findFirst({
      where: { id: idSchema.parse(req.params.id), userId: res.locals.userId },
    });
    if (!task) throw new HttpError(404, "Task not found");
    res.json({ task });
  });
  app.patch("/api/tasks/:id", async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const input = patchSchema.parse(req.body);
    const result = await db.task.updateMany({
      where: { id, userId: res.locals.userId },
      data: {
        ...input,
        ...(input.dueDate !== undefined && {
          dueDate: input.dueDate
            ? new Date(`${input.dueDate}T00:00:00.000Z`)
            : null,
        }),
      },
    });
    if (!result.count) throw new HttpError(404, "Task not found");
    const task = await db.task.findFirst({
      where: { id, userId: res.locals.userId },
    });
    if (!task) throw new HttpError(404, "Task not found");
    res.json({ task });
  });
  app.delete("/api/tasks/:id", async (req, res) => {
    const result = await db.task.deleteMany({
      where: { id: idSchema.parse(req.params.id), userId: res.locals.userId },
    });
    if (!result.count) throw new HttpError(404, "Task not found");
    res.status(204).end();
  });
  app.get("/api/dashboard/stats", auth, async (_req, res) => {
    const groups = await db.task.groupBy({
      by: ["status"],
      where: { userId: res.locals.userId },
      _count: { _all: true },
    });
    const count = (status: string) =>
      groups.find((g) => g.status === status)?._count._all ?? 0;
    const todo = count("TODO"),
      inProgress = count("IN_PROGRESS"),
      completed = count("COMPLETED");
    res.json({
      total: todo + inProgress + completed,
      pending: todo,
      inProgress,
      completed,
    });
  });
  app.use("/api", (_req, _res, next) =>
    next(new HttpError(404, "Endpoint not found")),
  );
  if (env.NODE_ENV === "production") {
    const client = resolve(
      fileURLToPath(new URL("../../client/dist", import.meta.url)),
    );
    app.use(express.static(client, { index: false, maxAge: "1h" }));
    app.get("/{*path}", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(resolve(client, "index.html"));
    });
  }
  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (error instanceof ZodError)
        return res.status(400).json({
          error: "Please check your input",
          issues: error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        });
      if (error instanceof HttpError)
        return res.status(error.status).json({ error: error.message });
      if (
        error &&
        typeof error === "object" &&
        "type" in error &&
        error.type === "entity.too.large"
      )
        return res.status(413).json({ error: "Request is too large" });
      if (error instanceof SyntaxError && "body" in error)
        return res.status(400).json({ error: "Invalid JSON" });
      logger.error(
        { errorType: error instanceof Error ? error.name : "UnknownError" },
        "Request failed",
      );
      return res
        .status(500)
        .json({ error: "Something went wrong. Please try again." });
    },
  );
  return app;
}

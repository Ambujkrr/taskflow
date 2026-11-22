import { createHash, createPublicKey, timingSafeEqual } from "node:crypto";

const MAX_WINDOW_SECONDS = 15 * 60;
const MAX_DUMP_BYTES_LIMIT = 512 * 1024 * 1024;

function integer(value, name, { min, max }) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new Error(`Invalid ${name}`);
  return parsed;
}

function decodePublicKey(value) {
  if (!value) throw new Error("Missing BACKUP_PUBLIC_KEY_B64");
  const key = createPublicKey(Buffer.from(value, "base64").toString("utf8"));
  if (key.asymmetricKeyType !== "rsa") throw new Error("Backup key must be RSA");
  if ((key.asymmetricKeyDetails?.modulusLength ?? 0) < 3072) {
    throw new Error("Backup RSA key must be at least 3072 bits");
  }
  return key;
}

function tokenDigest(value) {
  if (!/^[0-9a-f]{64}$/i.test(value ?? "")) {
    throw new Error("BACKUP_RETRIEVAL_TOKEN_SHA256 must be a SHA-256 hex digest");
  }
  return Buffer.from(value, "hex");
}

function activationId(value) {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(value ?? "")) {
    throw new Error("Invalid BACKUP_ACTIVATION_ID");
  }
  return value;
}

function parseDatabaseUrl(raw, expectedHost, expectedDatabase) {
  if (!raw) throw new Error("Missing DATABASE_URL");
  const url = new URL(raw);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Invalid database protocol");
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!expectedHost || url.hostname !== expectedHost) throw new Error("Unexpected database host");
  if (!expectedDatabase || database !== expectedDatabase) throw new Error("Unexpected database name");
  if (!url.username || !url.password) throw new Error("Database credentials are incomplete");
  return {
    host: url.hostname,
    port: url.port || "5432",
    database,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

export function loadConfig(env = process.env, now = Date.now()) {
  const expiresAt = Date.parse(env.BACKUP_EXPIRES_AT ?? "");
  if (!Number.isFinite(expiresAt) || expiresAt <= now) throw new Error("Invalid backup expiry");
  if (expiresAt - now > MAX_WINDOW_SECONDS * 1000) throw new Error("Backup window is too long");
  return {
    port: integer(env.PORT ?? "10000", "PORT", { min: 1, max: 65535 }),
    maxDumpBytes: integer(env.MAX_BACKUP_BYTES ?? String(64 * 1024 * 1024), "MAX_BACKUP_BYTES", {
      min: 1024,
      max: MAX_DUMP_BYTES_LIMIT,
    }),
    maxSeconds: integer(env.MAX_BACKUP_SECONDS ?? "600", "MAX_BACKUP_SECONDS", {
      min: 10,
      max: 900,
    }),
    tokenDigest: tokenDigest(env.BACKUP_RETRIEVAL_TOKEN_SHA256),
    activationId: activationId(env.BACKUP_ACTIVATION_ID),
    expiresAt,
    publicKey: decodePublicKey(env.BACKUP_PUBLIC_KEY_B64),
    database: parseDatabaseUrl(
      env.DATABASE_URL,
      env.EXPECTED_DATABASE_HOST,
      env.EXPECTED_DATABASE_NAME,
    ),
    pgDumpPath: env.PG_DUMP_PATH || "/usr/lib/postgresql/17/bin/pg_dump",
  };
}

export function loadStartupConfig(env = process.env, now = Date.now()) {
  if (!env.DATABASE_URL) {
    return {
      mode: "dormant",
      port: integer(env.PORT ?? "10000", "PORT", { min: 1, max: 65535 }),
    };
  }
  return { mode: "active", ...loadConfig(env, now) };
}

export function tokenMatches(config, authorization) {
  if (!authorization?.startsWith("Bearer ")) return false;
  const candidate = createHash("sha256").update(authorization.slice(7)).digest();
  return timingSafeEqual(candidate, config.tokenDigest);
}

export function activationMatches(config, candidate) {
  if (typeof candidate !== "string") return false;
  const expected = Buffer.from(config.activationId);
  const received = Buffer.from(candidate);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function childPostgresEnvironment(config) {
  return {
    HOME: "/tmp",
    LANG: "C.UTF-8",
    PATH: "/usr/lib/postgresql/17/bin:/usr/local/bin:/usr/bin:/bin",
    PGHOST: config.database.host,
    PGPORT: config.database.port,
    PGDATABASE: config.database.database,
    PGUSER: config.database.user,
    PGPASSWORD: config.database.password,
    PGSSLMODE: "prefer",
    PGAPPNAME: "taskflow_one_shot_backup",
    PGOPTIONS: "-c default_transaction_read_only=on -c statement_timeout=840000 -c lock_timeout=10000",
  };
}

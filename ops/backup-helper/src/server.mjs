import http from "node:http";
import { spawn } from "node:child_process";
import { activationMatches, childPostgresEnvironment, tokenMatches } from "./config.mjs";
import { encryptDump } from "./encrypt.mjs";

function productionDump(config, signal) {
  const child = spawn(config.pgDumpPath, [
    "--format=custom",
    "--compress=6",
    "--no-owner",
    "--no-acl",
    "--no-tablespaces",
    "--serializable-deferrable",
    "--lock-wait-timeout=10s",
  ], {
    env: childPostgresEnvironment(config),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderrBytes = 0;
  child.stderr.on("data", (chunk) => {
    stderrBytes += chunk.length;
    if (stderrBytes > 16 * 1024) child.stderr.pause();
  });
  const completion = new Promise((resolve, reject) => {
    child.once("error", () => reject(new Error("pg_dump could not start")));
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error("pg_dump failed")));
  });
  signal.addEventListener("abort", () => child.kill("SIGKILL"), { once: true });
  return { stdout: child.stdout, completion, cancel: () => child.kill("SIGKILL") };
}

function hidden(res) {
  res.writeHead(404, { "Cache-Control": "no-store" });
  res.end();
}

export function createDormantServer() {
  const server = http.createServer((req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (req.method === "GET" && req.url === "/healthz") {
      res.writeHead(204, { "Cache-Control": "no-store" });
      return res.end();
    }
    return hidden(res);
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  return server;
}

export function createBackupServer(config, { dumpFactory = productionDump, now = Date.now } = {}) {
  let consumed = false;
  let active = false;
  const server = http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (req.method === "GET" && req.url === "/healthz") {
      res.writeHead(now() < config.expiresAt ? 204 : 410, { "Cache-Control": "no-store" });
      return res.end();
    }
    if (req.method === "GET" && req.url === "/v1/readiness") {
      if (
        now() < config.expiresAt && !consumed && !active &&
        activationMatches(config, req.headers["x-backup-activation-id"])
      ) {
        res.writeHead(204, { "Cache-Control": "no-store" });
        return res.end();
      }
      return hidden(res);
    }
    if (req.method !== "POST" || req.url !== "/v1/backup") return hidden(res);
    if (
      now() >= config.expiresAt || consumed || active ||
      req.headers["x-forwarded-proto"] !== "https" ||
      !tokenMatches(config, req.headers.authorization)
    ) return hidden(res);
    if (req.headers["content-length"] && req.headers["content-length"] !== "0") return hidden(res);

    consumed = true;
    active = true;
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), config.maxSeconds * 1000);
    req.once("aborted", () => abort.abort());
    res.once("close", () => { if (!res.writableFinished) abort.abort(); });
    let dump;
    try {
      dump = dumpFactory(config, abort.signal);
      res.writeHead(200, {
        "Cache-Control": "no-store, private, max-age=0",
        "Content-Disposition": 'attachment; filename="taskflow-backup.tfbackup"',
        "Content-Type": "application/octet-stream",
        "Cross-Origin-Resource-Policy": "same-origin",
      });
      await Promise.all([
        encryptDump({
          input: dump.stdout,
          output: res,
          publicKey: config.publicKey,
          maxBytes: config.maxDumpBytes,
          signal: abort.signal,
        }),
        dump.completion,
      ]);
      res.end();
      console.log(JSON.stringify({ event: "backup_completed" }));
    } catch {
      abort.abort();
      dump?.cancel?.();
      if (!res.headersSent) res.writeHead(503, { "Cache-Control": "no-store" });
      res.destroy();
      console.error(JSON.stringify({ event: "backup_failed" }));
    } finally {
      clearTimeout(timeout);
      active = false;
    }
  });
  server.requestTimeout = 0;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  return server;
}

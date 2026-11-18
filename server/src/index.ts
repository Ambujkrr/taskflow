import { createApp, logger } from "./app.js";
import { db } from "./db.js";
import { env } from "./config.js";
try {
  await db.$connect();
} catch {
  logger.fatal("Database connection failed; check server configuration");
  process.exit(1);
}
const server = createApp().listen(env.PORT, "0.0.0.0", () =>
  logger.info({ port: env.PORT }, "TaskFlow is ready"),
);
server.on("error", () => {
  logger.fatal("HTTP server failed to start");
  void db.$disconnect().finally(() => process.exit(1));
});
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 10000);
  deadline.unref();
  server.close(() => {
    void db.$disconnect().finally(() => process.exit(0));
  });
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

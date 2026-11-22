import { loadStartupConfig } from "./config.mjs";
import { createBackupServer, createDormantServer } from "./server.mjs";

try {
  const config = loadStartupConfig();
  const server = config.mode === "dormant" ? createDormantServer() : createBackupServer(config);
  server.listen(config.port, "0.0.0.0", () => {
    console.log(JSON.stringify({ event: "ready", mode: config.mode }));
  });
} catch {
  console.error(JSON.stringify({ event: "configuration_rejected" }));
  process.exitCode = 1;
}

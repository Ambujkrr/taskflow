import { loadConfig } from "./config.mjs";
import { createBackupServer } from "./server.mjs";

try {
  const config = loadConfig();
  createBackupServer(config).listen(config.port, "0.0.0.0", () => {
    console.log(JSON.stringify({ event: "ready" }));
  });
} catch {
  console.error(JSON.stringify({ event: "configuration_rejected" }));
  process.exitCode = 1;
}

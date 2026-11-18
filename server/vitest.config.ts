import { defineConfig } from "vitest/config";
import { config } from "dotenv";
config({ path: "../.env", quiet: true });
const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  !new URL(url).pathname.endsWith("_test") ||
  url === process.env.DATABASE_URL
)
  throw new Error(
    "Set TEST_DATABASE_URL to a separate PostgreSQL database ending in _test. Tests never use DATABASE_URL.",
  );
export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
    env: {
      NODE_ENV: "test",
      APP_ORIGIN: "http://localhost:5173",
      DATABASE_URL: url,
      JWT_SECRET: "test-only-secret-not-for-deployment-".repeat(3),
    },
    globalSetup: ["./tests/global-setup.ts"],
  },
});

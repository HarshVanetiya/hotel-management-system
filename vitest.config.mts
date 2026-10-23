import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

config({ path: [".env.local", ".env"], quiet: true });

const root = path.dirname(fileURLToPath(import.meta.url));
const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? "";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(root),
      // `server-only` throws outside React Server Components; tests call services directly.
      "server-only": path.resolve(root, "tests/support/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/support/global-setup.ts"],
    // Integration tests share one database, so files run one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      DATABASE_URL: testDatabaseUrl,
      DATABASE_DRIVER: "pg",
    },
  },
});

import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45000,
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "PORT=4174 DEMO_DB_PATH=memory:// npm run dev",
    url: "http://127.0.0.1:4174/api/health",
    reuseExistingServer: false,
    timeout: 60000,
  },
});

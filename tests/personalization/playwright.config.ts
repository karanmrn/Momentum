import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "ui.e2e.ts",
  timeout: 30000,
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:4335",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "./node_modules/.bin/tsx tests/personalization/browser-harness.ts",
    cwd: "../..",
    url: "http://127.0.0.1:4335",
    reuseExistingServer: false,
    timeout: 30000,
  },
});

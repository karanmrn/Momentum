import { defineConfig } from "@playwright/test";
const basePort = Number(process.env.PLAYWRIGHT_BASE_PORT ?? 4174);
const mutationSpecs =
  /\/(report-editor|report-receipt|refresh-recovery|scenarios)\.spec\.ts$/;
const workspaceSpecs = /\/(remaining-work|analysis)\.spec\.ts$/;
const coreSpecs = /\/(demo|map-layers|client-recovery)\.spec\.ts$/;
const graphSpecs =
  /\/(graph-explorer|graph-datasets|graph-controls|graph-foundation|semantic)\.spec\.ts$/;
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45000,
  fullyParallel: false,
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "core",
      testMatch: coreSpecs,
      use: { baseURL: `http://127.0.0.1:${basePort}` },
    },
    {
      name: "features",
      testIgnore: [coreSpecs, mutationSpecs, workspaceSpecs, graphSpecs],
      use: { baseURL: `http://127.0.0.1:${basePort + 1}` },
    },
    {
      name: "graphs",
      testMatch: graphSpecs,
      use: { baseURL: `http://127.0.0.1:${basePort + 4}` },
    },
    {
      name: "workspaces",
      testMatch: workspaceSpecs,
      use: { baseURL: `http://127.0.0.1:${basePort + 3}` },
    },
    {
      name: "mutations",
      testMatch: mutationSpecs,
      use: { baseURL: `http://127.0.0.1:${basePort + 2}` },
    },
  ],
  // Separate fixtures prevent unrelated journeys sharing the demo request budget.
  webServer: [
    basePort,
    basePort + 1,
    basePort + 2,
    basePort + 3,
    basePort + 4,
  ].map((port) => ({
    command: `PORT=${port} DEMO_DB_PATH=memory:// VITE_PUBLIC_SITE_URL=https://streetwise-safety.vercel.app npm run dev`,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 60000,
  })),
});

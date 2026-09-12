import { expect, test, type Page } from "@playwright/test";

const userId = "8ca512ac-9071-4d97-b9aa-70e9b70a0983";
const user = {
  id: userId,
  aud: "authenticated",
  role: "authenticated",
  email: "member@example.test",
  email_confirmed_at: "2026-09-12T12:00:00Z",
  created_at: "2026-09-12T12:00:00Z",
  app_metadata: { provider: "email" },
  user_metadata: {},
  identities: [],
};
function envelope(data: unknown) {
  return { schemaVersion: "1.0", synthetic: false, data };
}
async function mockAccount(
  page: Page,
  options: {
    rejectLogin?: boolean;
    rejectVerification?: boolean;
    unavailable?: boolean;
  } = {},
) {
  await page.route("**/api/account/config", (route) =>
    route.fulfill({
      json: envelope(
        options.unavailable
          ? {
              configured: false,
              supabaseUrl: null,
              publishableKey: null,
            }
          : {
              configured: true,
              supabaseUrl: "https://streetwise-account-test.supabase.co",
              publishableKey: "sb_publishable_browser_test",
            },
      ),
    }),
  );
  await page.route("**/api/account/session", (route) =>
    route.fulfill({
      status: options.rejectVerification ? 403 : 200,
      json: envelope({ id: userId, emailConfirmed: true, role: "member" }),
    }),
  );
  await page.route(
    "https://streetwise-account-test.supabase.co/**",
    async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/signup")) {
        await route.fulfill({ json: { ...user, email_confirmed_at: null } });
      } else if (url.pathname.endsWith("/token")) {
        if (options.rejectLogin) {
          await route.fulfill({
            status: 400,
            json: {
              code: "invalid_credentials",
              msg: "Invalid login credentials",
            },
          });
        } else {
          const payload = Buffer.from(
            JSON.stringify({
              sub: userId,
              exp: Math.floor(Date.now() / 1000) + 3600,
            }),
          ).toString("base64url");
          await route.fulfill({
            json: {
              access_token: `e30.${payload}.test`,
              refresh_token: "test-refresh-token",
              token_type: "bearer",
              expires_in: 3600,
              user,
            },
          });
        }
      } else if (url.pathname.endsWith("/user")) {
        await route.fulfill({ json: user });
      } else if (url.pathname.endsWith("/logout")) {
        await route.fulfill({ status: 204 });
      } else {
        await route.fulfill({
          status: 404,
          json: { message: "Unexpected test request" },
        });
      }
    },
  );
}
async function openAccount(page: Page) {
  await page.goto("/?public=1");
  await page.getByRole("button", { name: "Account", exact: true }).click();
}
async function fillCredentials(page: Page) {
  await page.getByLabel("Email", { exact: true }).fill("member@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
}

async function dataRoutes(page: Page) {
  let follows = {
    pilotIds: ["camden_town"],
    categories: ["community"],
    paused: false,
  };
  const inbox = [
    {
      id: "84b2c637-5b82-4c08-a5df-648076132a59",
      pilotId: "camden_town",
      noticeId: "notice-demo-reference",
      createdAt: "2026-09-12T12:00:00Z",
      readAt: null as string | null,
    },
  ];
  const operations: string[] = [];
  await page.route("**/api/account/data{,/**}", async (route) => {
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    const path = new URL(route.request().url()).pathname.replace(
      "/api/account/data",
      "",
    );
    const method = route.request().method();
    operations.push(`${method} ${path}`);
    let data: unknown;
    if (path === "/follows") {
      if (method === "PUT") follows = route.request().postDataJSON();
      data = follows;
    } else if (path === "/inbox") data = inbox;
    else if (path.startsWith("/inbox/")) {
      inbox[0].readAt = "2026-09-12T13:00:00Z";
      data = inbox[0];
    } else if (path === "/scopes") data = [];
    else if (path === "/export")
      data = {
        reports: [
          {
            id: "32f9e026-87c9-4a38-8c5a-93ff2ae4d943",
            clientRequestId: "a8267ec4-8f8e-4a64-8b8f-627e09e0836e",
            pilotId: "camden_town",
            title: "Original fictional report",
            description: "A fictional original account used only by this test.",
            sourceBasis: "firsthand",
            createdAt: "2026-09-12T12:00:00Z",
          },
        ],
        follows,
        inbox,
        scopes: [
          {
            pilotId: "camden_town",
            role: "partner",
            expiresAt: "2026-09-11T12:00:00Z",
            revokedAt: "2026-09-10T12:00:00Z",
          },
        ],
      };
    else if (method === "DELETE") {
      expect(route.request().postDataJSON()).toEqual({
        confirmation: "DELETE MY ACCOUNT DATA",
      });
      data = { deleted: true };
    } else throw new Error("Unexpected private route");
    await route.fulfill({ json: envelope(data) });
  });
  return operations;
}
async function login(page: Page) {
  await openAccount(page);
  await fillCredentials(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Private account data" }),
  ).toBeVisible();
}
test("private follows persist and inbox read state updates at 320px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await mockAccount(page);
  await dataRoutes(page);
  await login(page);
  await expect(page.getByLabel("Camden Town", { exact: true })).toBeChecked();
  await page.getByLabel("West Croydon", { exact: true }).check();
  await page.getByLabel("Pause updates").check();
  await page.getByRole("button", { name: "Save account follows" }).click();
  await expect(page.getByText("Account follows saved.")).toBeVisible();
  await page.getByRole("button", { name: "Mark read", exact: true }).click();
  await expect(page.getByText("Read", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await expect(page.getByLabel("West Croydon", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Pause updates")).toBeChecked();
});
test("private export downloads JSON and deletion requires explicit confirmation", async ({
  page,
}) => {
  await mockAccount(page);
  const operations = await dataRoutes(page);
  await login(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export account data" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("streetwise-account-data.json");
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const exported = JSON.parse(Buffer.concat(chunks).toString());
  expect(exported.reports[0].clientRequestId).toBe(
    "a8267ec4-8f8e-4a64-8b8f-627e09e0836e",
  );
  expect(exported.scopes[0].revokedAt).toBe("2026-09-10T12:00:00Z");
  await expect(
    page.getByRole("button", { name: "Delete my application data" }),
  ).toBeDisabled();
  expect(operations).not.toContain("DELETE ");
  await page
    .getByLabel("Type DELETE MY ACCOUNT DATA")
    .fill("DELETE MY ACCOUNT DATA");
  await page
    .getByRole("button", { name: "Delete my application data" })
    .click();
  await expect(
    page.getByText("Your application data was deleted. You are logged out."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Private inbox" }),
  ).toHaveCount(0);
  expect(operations).toContain("DELETE ");
});
test("unavailable storage is not shown as an empty account", async ({
  page,
}) => {
  await mockAccount(page);
  await page.route("**/api/account/data{,/**}", (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: "storage_unavailable" } },
    }),
  );
  await login(page);
  await expect(
    page.getByRole("alert").filter({ hasText: "Account data is unavailable" }),
  ).toBeVisible();
  await expect(page.getByText("No account updates.")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Delete my application data" }),
  ).toHaveCount(0);
});

test("an export response after logout cannot download private data", async ({
  page,
}) => {
  await mockAccount(page);
  await dataRoutes(page);
  await login(page);
  await expect(
    page.getByRole("button", { name: "Export account data" }),
  ).toBeEnabled();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested!: () => void;
  const seen = new Promise<void>((resolve) => {
    requested = resolve;
  });
  await page.route("**/api/account/data/export", async (route) => {
    requested();
    await held;
    await route.fulfill({
      json: envelope({
        reports: [],
        follows: { pilotIds: [], categories: [], paused: false },
        inbox: [],
        scopes: [],
      }),
    });
  });
  const downloads: string[] = [];
  page.on("download", (download) =>
    downloads.push(download.suggestedFilename()),
  );
  await page.getByRole("button", { name: "Export account data" }).click();
  await seen;
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page.getByText("You are logged out.")).toBeVisible();
  const finished = page.waitForResponse("**/api/account/data/export");
  release();
  await finished;
  await expect(
    page.getByRole("heading", { name: "Private account data" }),
  ).toHaveCount(0);
  expect(downloads).toEqual([]);
});

test("deleted account data has an explicit unavailable state", async ({
  page,
}) => {
  await mockAccount(page);
  await page.route("**/api/account/data{,/**}", (route) =>
    route.fulfill({
      status: 410,
      json: { error: { code: "ACCOUNT_DELETED" } },
    }),
  );
  await login(page);
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "This account's application data was deleted." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save account follows" }),
  ).toHaveCount(0);
});

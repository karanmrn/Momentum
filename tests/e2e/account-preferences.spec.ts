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

test("advanced account preferences survive reload at 320px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await mockAccount(page);
  let saved: Record<string, unknown> = {
    pilotIds: ["camden_town"],
    categories: ["community"],
    paused: false,
    revision: 1,
    settings: null,
  };
  await page.route("**/api/account/data/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/follows")) {
      if (route.request().method() === "PUT") {
        const body = route.request().postDataJSON();
        expect(body.expectedRevision).toBe(saved.revision);
        saved = { ...body, revision: Number(saved.revision) + 1 };
      }
      await route.fulfill({ json: envelope(saved) });
    } else await route.fulfill({ json: envelope([]) });
  });
  await openAccount(page);
  await fillCredentials(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Content language").selectOption("fr");
  await page.getByLabel("lighting", { exact: true }).check();
  await page.getByLabel("Enable quiet hours").check();
  const muted = page.getByLabel("Muted notice IDs (one per line)");
  const secondNotice = "22222222-2222-4222-8222-222222222222";
  await muted.fill(userId);
  await muted.press("End");
  await muted.press("Enter");
  await muted.pressSequentially(secondNotice);
  await expect(muted).toHaveValue(`${userId}\n${secondNotice}`);

  await page
    .getByRole("button", { name: "Save personal preferences", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Personal preferences saved." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reload saved preferences" }).click();
  await expect(page.getByLabel("Content language")).toHaveValue("fr");
  await expect(page.getByLabel("lighting", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Enable quiet hours")).toBeChecked();
  await expect(muted).toHaveValue(`${userId}\n${secondNotice}`);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

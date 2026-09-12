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

test("account signup requires email confirmation and clears credentials", async ({
  page,
}) => {
  await mockAccount(page);
  await openAccount(page);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await fillCredentials(page);
  await page.getByRole("button", { name: "Create your account" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Check your email" }),
  ).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Log out", exact: true }),
  ).toHaveCount(0);
});

test("verified member can log in and log out on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockAccount(page);
  await openAccount(page);
  await fillCredentials(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByText("Logged in as member@example.test.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Community reports remain in the fictional demo."),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page.getByText("You are logged out.")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  expect(
    await page.evaluate(() => Object.values(localStorage).join(" ")),
  ).not.toContain("test-password-123");
});

for (const failure of ["password", "verification"] as const) {
  test(`account rejects failed ${failure} without claiming authentication`, async ({
    page,
  }) => {
    await mockAccount(page, {
      rejectLogin: failure === "password",
      rejectVerification: failure === "verification",
    });
    await openAccount(page);
    await fillCredentials(page);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Could not log in" }),
    ).toBeVisible();
    if (failure === "password") {
      await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
        "",
      );
    } else {
      await expect(
        page.getByRole("button", { name: "Retry account check" }),
      ).toBeVisible();
    }
    await expect(
      page.getByRole("button", { name: "Log out", exact: true }),
    ).toHaveCount(0);
  });
}

test("missing account configuration leaves public browsing available", async ({
  page,
}) => {
  await mockAccount(page, { unavailable: true });
  await openAccount(page);
  await expect(
    page.getByText(
      "Accounts are not available yet. You can still browse public information.",
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
});

test("account configuration failure can be retried", async ({ page }) => {
  await mockAccount(page);
  await page.route(
    "**/api/account/config",
    (route) => route.fulfill({ status: 503, json: {} }),
    { times: 1 },
  );
  await openAccount(page);
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Could not load account access" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry account access" }).click();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
});

test("closing the account dialog clears unfinished credentials", async ({
  page,
}) => {
  await mockAccount(page);
  await openAccount(page);
  await fillCredentials(page);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Account", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("");
});

test("restored account verification outage shows retry and recovers", async ({
  page,
}) => {
  const options = { rejectVerification: false };
  await mockAccount(page, options);
  await openAccount(page);
  await fillCredentials(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByText("Logged in as member@example.test.", { exact: true }),
  ).toBeVisible();
  options.rejectVerification = true;
  await page.reload();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Could not check your account" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Log out", exact: true }),
  ).toHaveCount(0);
  options.rejectVerification = false;
  await page.getByRole("button", { name: "Retry account check" }).click();
  await expect(
    page.getByText("Logged in as member@example.test.", { exact: true }),
  ).toBeVisible();
});

test("account signup fits narrow mobile screens", async ({
  page,
}, testInfo) => {
  await mockAccount(page);
  await openAccount(page);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const panel = page.getByRole("dialog", { name: "Account", exact: true });
    await expect(panel).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    for (const control of await panel.locator("button, input").all()) {
      const box = await control.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(48);
    }
    await page.screenshot({
      path: testInfo.outputPath(`account-${width}.png`),
      fullPage: false,
    });
  }
});

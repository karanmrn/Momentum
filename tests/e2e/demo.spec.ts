import { test, expect, type Page } from "@playwright/test";
// Automated checks use the accessible list. Do not repeatedly fetch public map tiles.
test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/[^/]*tile\.openstreetmap\.org\//, (route) =>
    route.abort(),
  );
});
async function open(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Hounslow", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Source and history" }).first(),
  ).toBeVisible();
}
async function persona(page: Page, value: string) {
  await page.getByLabel("Choose demo persona").selectOption(value);
  await expect(page.getByLabel("Choose demo persona")).toHaveValue(value);
  await expect(page.getByRole("alert")).toHaveCount(0);
}
async function nav(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).first().click();
}
test("report, review, inbox, correction, and latest notice work in the browser", async ({
  page,
}) => {
  const failures: string[] = [];
  page.on("pageerror", (e) => failures.push(e.message));
  await open(page);
  await page
    .getByRole("button", { name: "Share observation", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Short title")
    .fill("Fictional browser lighting check");
  await dialog
    .getByLabel("What you observed")
    .fill("Fictional reduced lighting for this demonstration.");
  await dialog.getByRole("button", { name: "Save for review" }).click();
  await expect(dialog.getByText("Saved for private review")).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await persona(page, "moderator");
  await nav(page, "Review queue");
  const card = page.locator("article").filter({
    has: page.getByRole("heading", {
      name: "Fictional browser lighting check",
      exact: true,
    }),
  });
  await card.getByRole("button", { name: "Review decision" }).click();
  await page
    .getByLabel("Public-safe review summary")
    .fill("Fictional lighting review approved for the demonstration.");
  await page
    .getByRole("button", { name: "Record decision", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    card.getByText("approved for summary", { exact: true }),
  ).toBeVisible();
  await persona(page, "alex");
  await nav(page, "Inbox");
  await page.getByRole("button", { name: "Check queued items" }).click();
  await expect(
    page.locator(".inbox-item").filter({ hasText: "delivered" }),
  ).toHaveCount(2);
  await persona(page, "moderator");
  await nav(page, "Review queue");
  await card.getByRole("button", { name: "Review decision" }).click();
  await page.getByLabel("Decision", { exact: true }).selectOption("retract");
  await page
    .getByLabel("Public-safe review summary")
    .fill("The fictional lighting notice was withdrawn.");
  await page
    .getByRole("button", { name: "Record decision", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await persona(page, "alex");
  await nav(page, "Inbox");
  await page.getByRole("button", { name: "Check queued items" }).click();
  const correction = page
    .locator(".inbox-item")
    .filter({ hasText: "correction" });
  await expect(correction).toHaveCount(1);
  await correction.getByRole("button").click();
  await expect(
    page.getByRole("dialog").getByText("retracted", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("revision 2", { exact: true }),
  ).toBeVisible();
  expect(failures).toEqual([]);
});
test("all pilot areas, help, history and preferences remain usable on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  for (const [id, title] of [
    ["camden_town", "Camden Town"],
    ["west_croydon", "West Croydon"],
    ["hounslow_town_centre", "Hounslow"],
  ]) {
    await page.getByLabel("Choose pilot area").selectOption(id!);
    await expect(
      page.getByRole("heading", { name: title!, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Source and history" }).first(),
    ).toBeVisible();
  }
  await page.getByRole("tab", { name: "Get help", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Help directory" }),
  ).toBeVisible();
  await page
    .getByRole("tab", { name: "Historical context", exact: true })
    .click();
  await expect(page.locator("body")).toContainText(
    /not.*enough|insufficient|comparable/i,
  );
  await nav(page, "Preferences");
  await page
    .getByRole("checkbox", { name: "Camden Town", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(page.getByText("revision 2", { exact: true })).toBeVisible();
  await persona(page, "sam");
  await nav(page, "Preferences");
  await expect(
    page.getByRole("checkbox", { name: "Camden Town", exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "West Croydon", exact: true }),
  ).toBeChecked();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/release/screenshots/mobile-preferences.png",
    fullPage: true,
  });
});
test("map failure keeps the list usable and keyboard focus stays in dialogs", async ({
  page,
}) => {
  await page.route("**/tile.openstreetmap.org/**", (r) => r.abort());
  await open(page);
  await expect(
    page.getByText("Map tiles are unavailable", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Share observation", exact: true })
    .click();
  for (let i = 0; i < 16; i++) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(
        () => !!document.activeElement?.closest('[role="dialog"]'),
      ),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Share observation", exact: true }),
  ).toBeFocused();
  await page.screenshot({
    path: "docs/release/screenshots/map-fallback.png",
    fullPage: true,
  });
});

test("fictional research consent and withdrawal work on mobile", async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const result = await promisify(execFile)(
    process.execPath,
    ["tests/recruitment/browser.mjs"],
    {
      env: { ...process.env, RESEARCH_TEST_URL: "http://127.0.0.1:4174" },
      timeout: 40000,
    },
  );
  expect(result.stdout).toContain("PASS: research submission");
});

test("narrow screens fit and persona transitions cannot overlap", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");
  const persona = page.getByLabel("Choose demo persona", { exact: true });
  await expect(persona).toBeEnabled();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await page.route("**/api/session", async (route) => {
    if (route.request().method() === "POST")
      await new Promise((resolve) => setTimeout(resolve, 200));
    await route.continue();
  });
  await persona.selectOption("moderator");
  await expect(persona).toBeDisabled();
  await expect(page.getByLabel("Choose pilot area")).toBeDisabled();
  await expect(persona).toBeEnabled();
  for (const next of ["alex", "moderator", "sam"]) {
    await persona.selectOption(next);
    await expect(persona).toBeEnabled();
    await expect(persona).toHaveValue(next);
  }
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
});

test("mobile uses four tabs and preserves area between list and map", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByLabel("Choose pilot area")).toBeEnabled();
  const navigation = page.getByRole("navigation", {
    name: "Mobile navigation",
    exact: true,
  });
  await expect(navigation.getByRole("button")).toHaveCount(4);
  await expect(
    page.getByRole("button", { name: "List view", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Choose pilot area").selectOption("camden_town");
  await expect(page.getByLabel("Choose pilot area")).toBeEnabled();
  await page.getByRole("button", { name: "Map view", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Map view", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Choose pilot area")).toHaveValue("camden_town");
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Camden Town", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Source and history" }).first(),
  ).toBeVisible();
  const blocked = await navigation.getByRole("button").evaluateAll((buttons) =>
    buttons.some((button) => {
      const box = button.getBoundingClientRect();
      return !button.contains(
        document.elementFromPoint(
          box.x + box.width / 2,
          box.y + box.height / 2,
        ),
      );
    }),
  );
  expect(blocked).toBe(false);
});

test("area enrichment reaches the website with source links and uncertainty", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByLabel("Choose pilot area")).toBeEnabled();
  await page.getByLabel("Choose pilot area").selectOption("camden_town");
  await expect(page.getByLabel("Choose pilot area")).toBeEnabled();
  await expect(
    page.getByText("Camden street lighting inventory", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Camden help directory", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("link")
      .filter({ hasText: /source/i })
      .first(),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Get help", exact: true }).click();
  await expect(
    page.getByText("Castlehaven Community Centre", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Hawley Wharf Security Office", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("body")).toContainText(/unconfirmed/i);
  await expect(page.locator("body")).toContainText("23 Castlehaven Road");
  await page
    .getByLabel("Choose pilot area")
    .selectOption("hounslow_town_centre");
  await expect(page.getByLabel("Choose pilot area")).toBeEnabled();
  await expect(
    page.getByText("Castlehaven Community Centre", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Urgent council support", { exact: true }),
  ).toBeVisible();
});

test("mobile map sizes correctly after list view and names help markers", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/tile\.openstreetmap\.org/, (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jV1kAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await page.goto("/");
  await expect(page.getByLabel("Choose pilot area")).toBeEnabled();
  await page.getByLabel("Choose pilot area").selectOption("camden_town");
  await expect(page.getByLabel("Choose pilot area")).toBeEnabled();
  await page.getByRole("button", { name: "Map view", exact: true }).click();
  const markers = page.locator(".leaflet-marker-icon[role=button]");
  await expect(markers).toHaveCount(5);
  await expect
    .poll(async () =>
      markers.evaluateAll((items) => {
        const map = document
          .querySelector(".leaflet-container")!
          .getBoundingClientRect();
        return items.every((item) => {
          const box = item.getBoundingClientRect();
          return (
            box.width >= 48 &&
            box.height >= 48 &&
            box.x >= map.x &&
            box.y >= map.y &&
            box.right <= map.right &&
            box.bottom <= map.bottom
          );
        });
      }),
    )
    .toBe(true);
  for (const marker of await markers.all())
    await expect(marker).toHaveAccessibleName(/.+/);
  await page
    .getByRole("button", { name: /Castlehaven Community Centre/ })
    .click();
  await expect(page.locator(".leaflet-popup")).toContainText("unconfirmed");
});

test("dataset acquisition is visible for every area and failures never become zero", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Choose pilot area")).toBeEnabled();
  await page
    .getByRole("tab", { name: "Historical context", exact: true })
    .click();
  for (const area of ["hounslow_town_centre", "camden_town", "west_croydon"]) {
    await page.getByLabel("Choose pilot area").selectOption(area);
    await expect(page.getByLabel("Choose pilot area")).toBeEnabled();
    await expect(page.locator(".dataset-record")).toHaveCount(6);
    await expect(page.locator(".dataset-coverage")).toContainText(
      "Not collected",
    );
    const police = page
      .locator(".dataset-record")
      .filter({ hasText: "Historical police records" });
    if ((await police.getAttribute("open")) === null)
      await police.locator("summary").click();
    await expect(police).toContainText("36 monthly source files");
    await expect(police).toContainText("2026-07");
    await expect(police).toContainText("Crime totals remain unpublished");
  }
  await page.route("**/api/datasets?area=hounslow_town_centre", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "Unavailable" } }),
    }),
  );
  await page
    .getByLabel("Choose pilot area")
    .selectOption("hounslow_town_centre");
  await expect(
    page.getByText("Dataset coverage is unavailable.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".dataset-record")).toHaveCount(0);
  await page.unroute("**/api/datasets?area=hounslow_town_centre");
  await page
    .getByRole("button", { name: "Retry coverage", exact: true })
    .click();
  await expect(page.locator(".dataset-record")).toHaveCount(6);
});

test("area tabs support keyboard navigation and failed resources stay explicit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const now = page.getByRole("tab", { name: "Now", exact: true });
  await now.focus();
  await page.keyboard.press("ArrowRight");
  const community = page.getByRole("tab", {
    name: "Community",
    exact: true,
  });
  await expect(community).toBeFocused();
  await expect(community).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Now", exact: true }).click();

  await page.route("**/api/help?area=camden_town", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: { message: "Help directory unavailable" },
      }),
    }),
  );
  await page.getByLabel("Choose pilot area").selectOption("camden_town");
  await expect(
    page.getByText("Camden street lighting inventory", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Get help", exact: true }).click();
  await expect(
    page.getByText("Help directory is unavailable", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No help locations returned", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Preferences", exact: true }),
  ).toHaveCSS("min-height", "48px");
});

test("public browsing uses public area data and no private member routes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const apiPaths: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) apiPaths.push(url.pathname);
  });
  await page.goto("/?public=1&area=unknown");
  await expect(
    page.getByRole("heading", { name: "Choose a pilot area", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Camden Town centre" }),
  ).toBeVisible();
  expect(apiPaths).toEqual([]);

  await page.getByRole("button", { name: "Camden Town centre" }).click();
  await expect(page).toHaveURL(/public=1&area=camden_town/);
  await expect(
    page.getByRole("heading", { name: "Camden Town", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Pilot information. Not an emergency service.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Choose demo persona")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Share observation", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Mobile navigation", exact: true }),
  ).toContainText("Historical context");
  expect(apiPaths.length).toBeGreaterThan(0);
  expect(apiPaths.every((path) => path.startsWith("/api/public/"))).toBe(true);
});

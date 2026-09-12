import { expect, test } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-12T16:00:00Z"));
});
const snapshot = {
  schemaVersion: "1.0",
  checkedAt: "2026-09-12T06:00:00.000Z",
  status: "current",
  sources: [
    {
      id: "bbc_london",
      name: "BBC News London",
      url: "https://feeds.bbci.co.uk/news/england/london/rss.xml",
      status: "success",
      lastCheckedAt: "2026-09-12T06:00:00.000Z",
      lastSuccessAt: "2026-09-12T06:00:00.000Z",
    },
  ],
  items: [
    {
      id: "fixture",
      sourceId: "bbc_london",
      sourceKind: "news",
      title: "Test coverage of Camden safety concerns",
      url: "https://www.bbc.co.uk/news/articles/example",
      publishedAt: "2026-09-11T10:00:00.000Z",
      occurredAt: null,
      areaIds: ["camden_town"],
      scope: "borough",
      scopeLabel: "Camden borough coverage",
    },
  ],
};
test("published coverage preserves provenance and supports source sharing", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "share", { value: undefined }),
  );
  await page.route("**/api/public/recent-updates", (route) =>
    route.fulfill({ json: { data: snapshot } }),
  );
  await page.goto("/recent-updates.html");
  await expect(
    page.getByRole("heading", { name: "Local updates", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Camden borough coverage · Incident date unknown"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Share source" }).first().click();
  await expect(
    page.getByText("Source link and publication date copied."),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "not a live warning",
  );
  await page.getByLabel("Area", { exact: true }).selectOption("west_croydon");
  await expect(
    page.getByText("No matching coverage was found in this feed.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Test coverage of Camden safety concerns" }),
  ).toHaveCount(0);
});
test("failed and stale feed states stay explicit at phone and desktop widths", async ({
  page,
}) => {
  let failed = true;
  await page.route("**/api/public/recent-updates", (route) =>
    failed
      ? route.fulfill({ status: 503, json: { error: "unavailable" } })
      : route.fulfill({ json: { data: { ...snapshot, status: "stale" } } }),
  );
  await page.goto("/recent-updates.html");
  await expect(page.getByText("Updates could not be loaded.")).toBeVisible();
  failed = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByText("The feed is out of date.", { exact: false }),
  ).toBeVisible();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Share source" }).first(),
    ).toHaveCSS("min-height", "48px");
    await page.screenshot({
      path: `test-results/recent-updates-${width}.png`,
      fullPage: true,
    });
  }
});

test("unavailable storage offers an explicit saved sample and keeps the selected area on exit", async ({
  page,
}) => {
  await page.route("**/api/public/recent-updates", (route) =>
    route.fulfill({
      json: {
        data: {
          ...snapshot,
          status: "unavailable",
          checkedAt: null,
          items: [],
          sources: [],
        },
      },
    }),
  );
  await page.goto("/?updates=1&area=camden_town&public=1");
  await expect(
    page.getByText("The feed is unavailable.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show fetched news sample" }).click();
  await expect(
    page.getByRole("heading", { name: "Saved feed sample" }),
  ).toBeVisible();
  await expect(
    page.getByText("It does not confirm that the daily job has run.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByLabel("Area", { exact: true }).selectOption("london");
  await expect(
    page.getByRole("button", { name: "Share source" }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Return to daily feed" }).click();
  await expect(
    page.getByText("The feed is unavailable.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to Momentum" }).click();
  await expect(page).toHaveURL(/area=camden_town/);
  expect(page.url()).not.toContain("updates=");
});

test("clipboard failure does not report a successful share", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { value: undefined });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.reject(new Error("denied")) },
    });
  });
  await page.route("**/api/public/recent-updates", (route) =>
    route.fulfill({ json: { data: snapshot } }),
  );
  await page.goto("/recent-updates.html");
  await page.getByRole("button", { name: "Share source" }).first().click();
  await expect(
    page.getByText("Could not share. Open the source and copy its link."),
  ).toBeVisible();
  await expect(
    page.getByText("Source link and publication date copied."),
  ).toHaveCount(0);
});

test("saved sample removes coverage outside the current 30-day window", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-12T12:00:00Z"));
  await page.route("**/api/public/recent-updates", (route) =>
    route.fulfill({
      json: {
        data: {
          ...snapshot,
          status: "unavailable",
          checkedAt: null,
          items: [],
          sources: [],
        },
      },
    }),
  );
  await page.goto("/recent-updates.html");
  await page.getByRole("button", { name: "Show fetched news sample" }).click();
  await expect(
    page.getByText("No matching coverage was found in this feed.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.locator(".ru-list li")).toHaveCount(0);
});

import { test, expect } from "@playwright/test";
test("ordinary report receipt remains successful when the report list refresh fails", async ({
  page,
}) => {
  await page.goto("/?demo=1&area=camden_town");
  await expect(page.getByLabel("Choose pilot area")).toBeEnabled();
  await page
    .getByRole("button", { name: "Share observation", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Short title").fill("Fictional receipt test");
  await dialog
    .getByLabel("What you observed")
    .fill("Fictional observation for a receipt recovery test.");
  await page.route("**/api/reports", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        json: {
          schemaVersion: "1.0",
          data: {
            id: "10000000-0000-4000-8000-000000000098",
            status: "submitted",
            revision: 1,
            createdAt: "2026-09-12T12:00:00Z",
            synthetic: true,
          },
        },
      });
    } else
      await route.fulfill({
        status: 503,
        json: { error: { message: "Refresh failed" } },
      });
  });
  await dialog
    .getByRole("button", { name: "Save for review", exact: true })
    .click();
  await expect(
    dialog.getByText("Saved for private review", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("10000000-0000-4000-8000-000000000098", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText(
    "Your observation was saved",
  );
  await expect(
    dialog.getByRole("button", { name: "Save for review", exact: true }),
  ).toHaveCount(0);
});

test("pending report save keeps its receipt open and freezes background controls", async ({
  page,
}) => {
  await page.goto("/?demo=1&area=camden_town");
  await expect(page.getByLabel("Choose pilot area")).toBeEnabled();
  await page
    .getByRole("button", { name: "Share observation", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Short title").fill("Fictional pending receipt");
  await dialog
    .getByLabel("What you observed")
    .fill("Fictional report used to verify delayed acknowledgement.");
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/reports", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await waiting;
    await route.fulfill({
      json: {
        schemaVersion: "1.0",
        data: {
          id: "10000000-0000-4000-8000-000000000097",
          status: "submitted",
          revision: 1,
          createdAt: "2026-09-12T12:00:00Z",
          synthetic: true,
        },
      },
    });
  });
  try {
    await dialog
      .getByRole("button", { name: "Save for review", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: "Close dialog", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await expect(page.locator("main.main")).toHaveAttribute("inert", "");
  } finally {
    release();
  }
  await expect(
    dialog.getByText("Saved for private review", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("main.main")).not.toHaveAttribute("inert");
});

test("owners can withdraw an approved report even when related refresh fails", async ({
  page,
}) => {
  await page.goto("/?demo=1&area=hounslow_town_centre&view=reports");
  await expect(page.getByLabel("Choose pilot area")).toBeEnabled();
  const report = page
    .getByRole("article")
    .filter({ hasText: "Lighting issue on the High Street approach" });
  await expect(
    report.getByText("approved for summary", { exact: true }),
  ).toBeVisible();
  await page.route("**/api/reports", async (route) => {
    if (route.request().method() === "GET")
      await route.fulfill({
        status: 503,
        json: { error: { message: "Read failed" } },
      });
    else await route.continue();
  });
  await report
    .getByRole("button", { name: "Withdraw this observation", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Withdrawn report", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "Observation withdrawn. Reload the page to refresh related updates.",
  );
  await expect(
    page
      .getByRole("article")
      .filter({ hasText: "Withdrawn report" })
      .getByRole("button", { name: "Withdraw this observation" }),
  ).toHaveCount(0);
});

test("retry after a lost report response reuses the original key and creates one report", async ({
  page,
}) => {
  await page.goto("/?demo=1&area=hounslow_town_centre");
  await expect(page.getByLabel("Choose pilot area")).toBeEnabled();
  await page
    .getByRole("button", { name: "Share observation", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Short title").fill("Fictional lost response test");
  await dialog
    .getByLabel("What you observed")
    .fill("Fictional description for an interrupted save.");
  const keys: string[] = [];
  await page.route("**/api/reports", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().headers()["idempotency-key"]);
    const response = await route.fetch();
    if (keys.length === 1)
      await route.fulfill({
        status: 503,
        json: { error: { message: "Response interrupted" } },
      });
    else await route.fulfill({ response });
  });
  await dialog
    .getByRole("button", { name: "Save for review", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Response interrupted");
  await dialog
    .getByRole("button", { name: "Save for review", exact: true })
    .click();
  await expect(
    dialog.getByText("Saved for private review", { exact: true }),
  ).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).toBe(keys[0]);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "My reports", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Fictional lost response test",
      exact: true,
    }),
  ).toHaveCount(1);
});

import { expect, test, type Page } from "@playwright/test";

async function open(page: Page) {
  await page.route(/https:\/\/[^/]*tile\.openstreetmap\.org\//, (route) =>
    route.abort(),
  );
  await page.route(/\/api\/public\/(transport|traffic-cameras)\?/, (route) =>
    route.abort(),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Hounslow", exact: true }),
  ).toBeVisible();
}

test("preserves a saved preference when its personal-feed refresh fails", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Camden Town", exact: true }),
  ).toBeVisible();

  let saves = 0;
  let feedReads = 0;
  await page.route("**/api/preferences", async (route) => {
    if (route.request().method() === "PUT") saves += 1;
    await route.continue();
  });
  await page.route("**/api/me/feed", async (route) => {
    feedReads += 1;
    if (feedReads === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { message: "Personal feed is unavailable." },
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.getByRole("checkbox", { name: "Camden Town", exact: true }).check();
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();

  await expect(page.getByText("Preferences saved.", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: "Personalised notices could not refresh" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry personal feed", exact: true }),
  ).toBeVisible();
  expect(saves).toBe(1);

  await page.getByRole("button", { name: "Retry personal feed", exact: true }).click();
  await expect(
    page.getByText(
      "Preferences saved. Personalised notices refreshed.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(saves).toBe(1);
  expect(feedReads).toBe(2);
});

test("preserves a recorded moderation decision when the queue refresh fails", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Share observation", exact: true }).click();
  const reportDialog = page.getByRole("dialog");
  await reportDialog.getByLabel("Short title").fill("Fictional refresh recovery report");
  await reportDialog
    .getByLabel("What you observed")
    .fill("Fictional report used to test a queue refresh failure.");
  await reportDialog.getByRole("button", { name: "Save for review", exact: true }).click();
  await expect(reportDialog.getByText("Saved for private review", { exact: true })).toBeVisible();
  await reportDialog.getByRole("button", { name: "Close", exact: true }).click();

  await page.getByLabel("Choose demo persona").selectOption("moderator");
  await page.getByRole("button", { name: "Review queue", exact: true }).click();
  const card = page.locator("article").filter({
    has: page.getByRole("heading", {
      name: "Fictional refresh recovery report",
      exact: true,
    }),
  });
  await card.getByRole("button", { name: "Review decision", exact: true }).click();

  let decisions = 0;
  let queueReads = 0;
  await page.route("**/api/moderation**", async (route) => {
    if (route.request().method() === "POST") {
      decisions += 1;
      await route.continue();
      return;
    }
    queueReads += 1;
    if (queueReads === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "Queue is unavailable." } }),
      });
      return;
    }
    await route.continue();
  });

  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Public-safe review summary")
    .fill("Fictional review recorded before the queue refresh failed.");
  await dialog.getByRole("button", { name: "Record decision", exact: true }).click();

  await expect(dialog.getByText("Decision recorded.", { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole("alert").filter({ hasText: "review queue could not refresh" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Retry queue refresh", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Record decision", exact: true }),
  ).toBeDisabled();
  expect(decisions).toBe(1);

  await dialog.getByRole("button", { name: "Retry queue refresh", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(decisions).toBe(1);
  expect(queueReads).toBe(2);
});

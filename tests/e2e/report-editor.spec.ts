import { test, expect } from "@playwright/test";

test("owner edits stay private and conflict keeps the draft", async ({
  page,
}) => {
  await page.route(/https:\/\/[^/]*tile\.openstreetmap\.org\//, (route) =>
    route.abort(),
  );
  await page.route(/\/api\/public\/(transport|traffic-cameras)\?/, (route) =>
    route.abort(),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Hounslow", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "My reports", exact: true })
    .first()
    .click();
  const submitted = page
    .locator("article")
    .filter({
      has: page.getByRole("heading", {
        name: "Fictional Camden observation for review",
        exact: true,
      }),
    });
  await submitted
    .getByRole("button", { name: "Edit observation", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Short title")).toHaveValue(
    "Fictional Camden observation for review",
  );
  await dialog
    .getByLabel("Short title")
    .fill("Fictional: Owner amended observation");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const edited = page
    .locator("article")
    .filter({
      has: page.getByRole("heading", {
        name: "Fictional: Owner amended observation",
        exact: true,
      }),
    });
  await expect(edited.getByText("submitted", { exact: true })).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "My reports", exact: true })
    .first()
    .click();
  await expect(edited).toBeVisible();
  const reviewed = page
    .locator("article")
    .filter({
      has: page.getByRole("heading", {
        name: "Lighting issue on the High Street approach",
        exact: true,
      }),
    });
  await expect(
    reviewed.getByRole("button", { name: "Edit observation" }),
  ).toHaveCount(0);
  await edited
    .getByRole("button", { name: "Edit observation", exact: true })
    .click();
  await dialog
    .getByLabel("What you observed")
    .fill("Fictional draft retained after a revision conflict.");
  await page.route("**/api/reports/*", async (route) => {
    if (route.request().method() === "PATCH")
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          error: "revision_conflict",
          message: "Report changed",
        }),
      });
    else await route.continue();
  });
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Your draft remains below",
  );
  await expect(dialog.getByLabel("What you observed")).toHaveValue(
    "Fictional draft retained after a revision conflict.",
  );
  await expect(
    dialog.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByText("Changes saved for private review.", { exact: true }),
  ).toHaveCount(0);
});

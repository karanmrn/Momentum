import { expect, test } from "@playwright/test";

test("private views retain their route after reload and browser navigation", async ({
  page,
}) => {
  await page.goto("/?demo=1&area=camden_town&view=inbox");
  await expect(
    page.getByRole("heading", { name: "Inbox", exact: true }),
  ).toBeVisible({ timeout: 5000 });
  await page
    .getByRole("button", { name: "My reports", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/view=reports/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "My reports", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Inbox", exact: true })
    .first()
    .click();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "My reports", exact: true }),
  ).toBeVisible();
});

test("a member cannot use a route to open moderator review", async ({
  page,
}) => {
  await page.goto("/?demo=1&area=camden_town&view=moderation");
  await expect(
    page.getByRole("heading", { name: "Camden Town", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/view=dashboard/);
  await expect(
    page.getByRole("heading", { name: "Review queue", exact: true }),
  ).toHaveCount(0);
});

test("public area links retain the selected tab", async ({ page }) => {
  await page.goto("/?public=1&area=camden_town&tab=help");
  await expect(
    page.getByRole("heading", { name: "Camden Town", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Get help", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "Get help", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});

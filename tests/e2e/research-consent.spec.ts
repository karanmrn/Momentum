import { test, expect } from "@playwright/test";
test("research consent survives reload and withdrawal removes persisted answers at 320px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/?demo=1");
  const open = async () => {
    await page
      .getByRole("button", { name: "Research", exact: true })
      .filter({ visible: true })
      .first()
      .click();
    await expect(
      page.getByRole("button", { name: "Save fictional observation" }),
    ).toBeEnabled();
  };
  await open();
  await page.getByRole("checkbox", { name: "lighting", exact: true }).check();
  await page
    .getByRole("checkbox", {
      name: "This observation is fictional.",
      exact: true,
    })
    .check();
  await page
    .getByRole("checkbox", {
      name: "I agree to this temporary research exercise.",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Save fictional observation" })
    .click();
  await expect(
    page.getByRole("button", { name: "Withdraw observation" }),
  ).toHaveCount(1);
  await page.reload();
  await open();
  await expect(
    page.getByRole("button", { name: "Withdraw observation" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Withdraw observation" }).click();
  await expect(
    page.getByRole("heading", { name: "Withdrawn observation" }),
  ).toBeVisible();
  await page.reload();
  await open();
  await expect(
    page.getByRole("heading", { name: "Withdrawn observation" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Withdraw observation" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("research storage failure cannot appear as a saved observation", async ({
  page,
}) => {
  await page.route("**/api/research-consent", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: { message: "Research storage is unavailable." },
      }),
    }),
  );
  await page.goto("/?demo=1");
  await page
    .getByRole("button", { name: "Research", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Research storage is unavailable." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save fictional observation" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Retry research storage" }),
  ).toBeVisible();
});
